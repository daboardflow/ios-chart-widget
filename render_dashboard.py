"""Render the two chart panels consumed by the large Scriptable widget."""

import argparse
import csv
import io
import json
import math
from pathlib import Path
from urllib.request import urlopen

from render import DIRECTIONS, GRID, MUTED, TEXT, WIND_SERIES, Figure, patheffects, revision

import numpy as np
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import Rectangle

MT_BRUNO_URL = "https://raw.githubusercontent.com/plotly/datasets/master/api_docs/mt_bruno_elevation.csv"
PANEL_W, PANEL_H, SCALE = 116, 168, 3
PALETTE = [color for _, color, _ in WIND_SERIES]
TERRAIN = LinearSegmentedColormap.from_list("wind-terrain", PALETTE)
PLOT_BG = "#242436"


def new_panel():
    fig = Figure(figsize=(PANEL_W / 72, PANEL_H / 72), dpi=72 * SCALE)
    fig.patch.set_alpha(0)
    return fig


def render_wind(fig):
    ax = fig.add_axes([0.064, 0.292, 0.872, 0.603], projection="polar")
    ax.set_facecolor(PLOT_BG)
    ax.set_theta_zero_location("N")
    ax.set_theta_direction(-1)
    ax.set_axisbelow(False)
    theta = [i * math.pi / 4 for i in range(len(DIRECTIONS))]
    for _, color, radii in WIND_SERIES:
        ax.bar(theta, radii, width=math.pi / 4, bottom=0, color=color, linewidth=0)
    ax.set_ylim(0, 80)
    ax.set_xticks(theta, ["N", "NE", "E", "SE", "S", "SW", "W", "NW"])
    ax.set_yticks([20, 40, 60, 80], ["20%", "40%", "60%", "80%"])
    ax.set_rlabel_position(37)
    ax.tick_params(axis="x", pad=-10, labelsize=6.8, colors=TEXT)
    ax.tick_params(axis="y", length=0, labelsize=5.8, colors=TEXT)
    ax.grid(color=GRID, linewidth=0.45, alpha=0.78)
    ax.spines["polar"].set_color(GRID)
    ax.spines["polar"].set_linewidth(0.55)
    for label in ax.get_yticklabels():
        label.set_path_effects([patheffects.withStroke(linewidth=1.35, foreground=PLOT_BG)])

    fig.text(0.025, 0.195, "Speed (m/s)", fontsize=7.2, color=MUTED, weight="bold")
    for i, (name, color, _) in enumerate(WIND_SERIES):
        x = 0.025 + (i % 2) * 0.52
        y = 0.118 - (i // 2) * 0.071
        fig.add_artist(Rectangle(
            (x, y - 0.015), 0.046, 0.032, transform=fig.transFigure,
            facecolor=color, linewidth=0,
        ))
        fig.text(x + 0.078, y, name.removesuffix(" m/s"), va="center", color=TEXT, fontsize=8.4)
    return {"source": "Provided wind rose sample", "mode": "overlay"}


def load_elevation():
    with urlopen(MT_BRUNO_URL, timeout=15) as response:
        rows = list(csv.reader(io.StringIO(response.read().decode("utf-8-sig"))))
    # The leading column contains row indices, not elevation samples.
    if not rows or len(rows[0]) < 3 or rows[0][0] != "":
        raise ValueError("Mt. Bruno CSV is missing its index header")
    width = len(rows[0])
    samples = [row[1:] for row in rows[1:] if row]
    if len(samples) < 2 or any(len(row) != width - 1 for row in samples):
        raise ValueError("Mt. Bruno CSV does not contain a rectangular elevation grid")
    z = np.asarray(samples, dtype=float)
    if not np.isfinite(z).all() or np.ptp(z) == 0:
        raise ValueError("Mt. Bruno CSV has invalid elevation values")
    return z


def render_bruno(fig):
    z = load_elevation()
    y, x = np.indices(z.shape)
    lo, hi = float(z.min()), float(z.max())
    floor = lo - (hi - lo) * 0.17
    ax = fig.add_axes([-0.02, 0.262, 1.04, 0.71], projection="3d", computed_zorder=False)
    ax.patch.set_alpha(0)
    ax.set_axis_off()
    ax.set_xlim(0, z.shape[1] - 1)
    ax.set_ylim(0, z.shape[0] - 1)
    ax.set_zlim(floor, hi)
    ax.set_box_aspect((1, 1, 0.68), zoom=1)
    ax.view_init(elev=25, azim=-53)
    ax.contour(x, y, z, levels=8, zdir="z", offset=floor, cmap=TERRAIN,
               linewidths=0.52, alpha=0.7, zorder=1)
    ax.plot_surface(x, y, z, cmap=TERRAIN, vmin=lo, vmax=hi, rstride=1, cstride=1,
                    edgecolor=(0.14, 0.12, 0.24, 0.35), linewidth=0.17,
                    antialiased=True, zorder=2)

    fig.text(0.025, 0.195, "Relative elevation", fontsize=7.2, color=MUTED, weight="bold")
    scale = fig.add_axes([0.025, 0.107, 0.95, 0.034])
    scale.imshow(np.linspace(0, 1, 256)[None, :], cmap=TERRAIN, aspect="auto")
    scale.set_axis_off()
    fig.text(0.025, 0.047, "Low", fontsize=8.4, color=TEXT, va="center")
    fig.text(0.975, 0.047, "High", fontsize=8.4, color=TEXT, va="center", ha="right")
    return {"source": MT_BRUNO_URL, "grid": list(z.shape)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "public/dashboard")
    args = parser.parse_args()
    panels = []
    outputs = {}
    for panel_id, title, draw in (
        ("wind-rose", "Wind rose", render_wind),
        ("mt-bruno", "Mt. Bruno", render_bruno),
    ):
        fig = new_panel()
        metadata = draw(fig)
        image = io.BytesIO()
        fig.savefig(image, format="png")
        png = image.getvalue()
        filename = f"{panel_id}.png"
        outputs[filename] = png
        panels.append({
            "id": panel_id, "title": title, "image": filename,
            "revision": revision(png), **metadata,
        })

    # Finish both renders before touching any published output.
    args.out.mkdir(parents=True, exist_ok=True)
    for filename, png in outputs.items():
        (args.out / filename).write_bytes(png)
    data = {"schema": 1, "layout": "dashboard", "data": "sample", "panels": panels}
    (args.out / "data.json").write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Rendered wind rose and Mt. Bruno → {args.out}")


if __name__ == "__main__":
    main()
