"""Render the selected widget chart and its manifest without a browser."""

import argparse
import base64
import csv
import io
import json
import math
from collections import Counter
from pathlib import Path
from urllib.request import urlopen

import matplotlib

matplotlib.use("Agg")

from matplotlib import patheffects
from matplotlib.figure import Figure
from matplotlib.patches import Rectangle

IRIS_URL = "https://raw.githubusercontent.com/plotly/datasets/master/iris-data.csv"
DIMS = [
    ("sepal length", "Sepal L"),
    ("sepal width", "Sepal W"),
    ("petal length", "Petal L"),
    ("petal width", "Petal W"),
]
IRIS_COLORS = {
    "Iris-setosa": "#19d3f3",
    "Iris-versicolor": "#e763fa",
    "Iris-virginica": "#636efa",
}
DIRECTIONS = ("North", "N-E", "East", "S-E", "South", "S-W", "West", "N-W")
WIND_SERIES = (
    ("11–14 m/s", "#6A51A3", [77.5, 72.5, 70, 45, 22.5, 42.5, 40, 62.5]),
    ("8–11 m/s", "#9E9AC8", [57.5, 50, 45, 35, 20, 22.5, 37.5, 55]),
    ("5–8 m/s", "#CBC9E2", [40, 30, 30, 35, 7.5, 7.5, 32.5, 40]),
    ("< 5 m/s", "#F2F0F7", [20, 7.5, 15, 22.5, 2.5, 2.5, 12.5, 22.5]),
)
TEXT, MUTED, GRID = "#F3F1FC", "#BCB9CC", "#68697C"
WIDTH, HEIGHT, SCALE = 268, 100, 3


def legend(fig, heading, entries, x, y, step):
    fig.text(x, y, heading, color=MUTED, fontsize=7, weight="bold", va="center")
    for i, (label, color) in enumerate(entries, start=1):
        line_y = y - step * i
        fig.add_artist(Rectangle(
            (x, line_y - 0.023), 4.6 / WIDTH, 0.046,
            facecolor=color, transform=fig.transFigure, linewidth=0,
        ))
        fig.text(x + 10 / WIDTH, line_y, label, color=TEXT, fontsize=8.5, va="center")


def wind_rose(fig):
    # The small labels get their own inset; the legend stays out of the plot.
    ax = fig.add_axes([0.33 - 41 / WIDTH, 0.09, 82 / WIDTH, 0.82], projection="polar")
    ax.set_facecolor("#242436")
    ax.set_theta_zero_location("N")
    ax.set_theta_direction(-1)
    theta = [i * math.pi / 4 for i in range(len(DIRECTIONS))]
    ax.set_axisbelow(False)
    for _, color, radii in WIND_SERIES:
        # Start each series at zero. Later, smaller bars cover the larger bars.
        ax.bar(theta, radii, width=math.pi / 4, bottom=0, color=color, linewidth=0)
    ax.set_ylim(0, 80)
    ax.set_xticks(theta, ["N", "NE", "E", "SE", "S", "SW", "W", "NW"])
    ax.set_yticks([20, 40, 60, 80], ["20%", "40%", "60%", "80%"])
    ax.set_rlabel_position(59)
    ax.tick_params(axis="x", pad=-9, labelsize=6.4, colors=TEXT)
    ax.tick_params(axis="y", length=0, labelsize=5.4, colors=TEXT)
    ax.grid(color=GRID, linewidth=0.38, alpha=0.75)
    ax.spines["polar"].set_color(GRID)
    ax.spines["polar"].set_linewidth(0.45)
    for text in ax.get_yticklabels():
        text.set_path_effects([patheffects.withStroke(linewidth=1.35, foreground="#262638")])
    legend(fig, "WIND SPEED", [(name, color) for name, color, _ in WIND_SERIES], 0.65, 0.82, 0.158)
    return {
        "title": "Wind speed distribution",
        "caption": "Laurel, NE · Sample",
        "summary": {
            "source": "Provided test fixture",
            "mode": "overlay",
            "unit": "percent",
            "directions": list(DIRECTIONS),
            "series": [{"name": name, "r": values} for name, _, values in WIND_SERIES],
        },
    }


def iris_matrix(fig):
    with urlopen(IRIS_URL, timeout=15) as response:
        source = response.read().decode("utf-8-sig")
    rows = []
    for record in csv.DictReader(io.StringIO(source)):
        try:
            values = tuple(float(record[key]) for key, _ in DIMS)
            species = record["class"].strip()
        except (KeyError, TypeError, ValueError):
            continue
        if species in IRIS_COLORS and all(math.isfinite(v) for v in values):
            rows.append((values, species))
    counts = Counter(species for _, species in rows)
    if set(counts) != set(IRIS_COLORS):
        raise ValueError("Iris CSV did not include all three expected species")

    groups = {
        name: list(zip(*(values for values, species in rows if species == name)))
        for name in IRIS_COLORS
    }
    ranges = []
    for i in range(len(DIMS)):
        values = [row[0][i] for row in rows]
        lo, hi = min(values), max(values)
        padding = (hi - lo) * 0.085 or 0.5
        ranges.append((lo - padding, hi + padding))

    for r, (_, label) in enumerate(DIMS):
        for c in range(len(DIMS)):
            ax = fig.add_axes([
                (2 + c * 46) / WIDTH, (2 + (3 - r) * 24) / HEIGHT, 44 / WIDTH, 22 / HEIGHT
            ])
            ax.set_facecolor("#353548" if r == c else "#262637")
            ax.set_xticks([])
            ax.set_yticks([])
            for spine in ax.spines.values():
                spine.set_visible(False)
            if r == c:
                ax.text(0.5, 0.5, label, transform=ax.transAxes, ha="center", va="center",
                        color=TEXT, fontsize=7, weight="bold")
            else:
                ax.set_xlim(*ranges[c])
                ax.set_ylim(*ranges[r])
                for species, coordinates in groups.items():
                    ax.scatter(coordinates[c], coordinates[r], s=2.8, color=IRIS_COLORS[species],
                               linewidths=0, alpha=0.85)

    legend(fig, "SPECIES", [(name.removeprefix("Iris-"), color)
                            for name, color in IRIS_COLORS.items()], 0.74, 0.78, 0.175)
    return {
        "title": "Iris dataset",
        "caption": f"{len(rows)} flowers",
        "summary": {"rows": len(rows), "species": dict(counts), "source": IRIS_URL},
    }


def revision(png):
    # FNV-1a over the Base64 text. Detects mismatched CDN objects; not a signature.
    value = 0x811C9DC5
    for byte in base64.b64encode(png):
        value = ((value ^ byte) * 0x01000193) & 0xFFFFFFFF
    return f"{value:08x}"


RENDERERS = {"wind-rose": wind_rose, "iris": iris_matrix}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chart", choices=["current", *RENDERERS], default="current")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "public")
    args = parser.parse_args()
    manifest = args.out / "data.json"
    name = args.chart
    if name == "current":
        name = json.loads(manifest.read_text(encoding="utf-8"))["chart"] if manifest.exists() else "wind-rose"
    if name not in RENDERERS:
        parser.error(f"Unknown published chart: {name}. Select a chart explicitly to recover.")

    fig = Figure(figsize=(WIDTH / 72, HEIGHT / 72), dpi=72 * SCALE)
    metadata = RENDERERS[name](fig)
    image = io.BytesIO()
    fig.patch.set_alpha(0)
    fig.savefig(image, format="png", transparent=False)
    png = image.getvalue()
    data = {"schema": 1, "chart": name, "revision": revision(png), **metadata}
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "chart.png").write_bytes(png)
    manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Rendered {name}: {data['revision']} → {args.out}")


if __name__ == "__main__":
    main()
