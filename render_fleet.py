"""Build the sample fleet widget map, manifest, and one-page PDF."""

import argparse
import hashlib
import io
import json
from pathlib import Path
from urllib.request import urlopen

from PIL import Image, ImageOps
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

from render import revision

ROOT = Path(__file__).resolve().parent
FONT_ROOT = "https://fonts.gstatic.com/s/inter/v19/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVu"
FLEET = [
    dict(id="101", status="Busy", area="N. Phoenix", next="On site"),
    dict(id="102", status="Shift Start", area="Tempe", next="8 min"),
    dict(id="103", status="En Route", area="Scottsdale", next="12 min"),
    dict(id="104", status="Available", area="Mesa", next="Not assigned"),
]
STATUS = {
    "Busy": "#176234", "Shift Start": "#8D430C",
    "En Route": "#1D50A1", "Available": "#495872",
}


def widget_map(source):
    # Keep all three illustrated truck pins. The full reference is in the PDF.
    w, h = source.size
    detail = source.crop((0, round(h * 0.066), w, round(h * 0.742)))
    frame = Image.new("RGB", (816, 450), "#191C32")
    detail = ImageOps.contain(detail, frame.size, Image.Resampling.LANCZOS)
    frame.paste(detail, ((frame.width - detail.width) // 2, 0))
    output = io.BytesIO()
    frame.save(output, format="PNG", optimize=True)
    return output.getvalue()


def write_report(source):
    for name, tail in (("Inter", "LyfAZ9hjQ.ttf"), ("InterBold", "FuYAZ9hjQ.ttf")):
        with urlopen(FONT_ROOT + tail, timeout=15) as response:
            pdfmetrics.registerFont(TTFont(name, io.BytesIO(response.read())))

    output = io.BytesIO()
    page = Canvas(output, pagesize=letter, invariant=1, pageCompression=1)
    page.setTitle("Field Service Fleet Report | Sample")
    page.setAuthor("Perplexity Computer")

    def text(x, y, value, size=11, color="#201C32", strong=False):
        page.setFillColor(HexColor(color))
        page.setFont("InterBold" if strong else "Inter", size)
        page.drawString(x, y, value)

    def box(x, y, w, h, color):
        page.setFillColor(HexColor(color))
        page.roundRect(x, y, w, h, 7, fill=1, stroke=0)

    text(42, 745, "FIELD SERVICE / SAMPLE SNAPSHOT", 10, "#56417D", True)
    text(42, 710, "Fleet status report", 30, strong=True)
    text(42, 686, "Phoenix-area dispatch demo  |  4 sample trucks", 11, "#534D64")

    text(42, 653, "Fleet at a glance", 14, strong=True)
    for i, label in enumerate(("Truck", "Status", "Area", "ETA / Next stop")):
        text((54, 126, 270, 425)[i], 629, label, 10, "#534D64", True)
    for i, item in enumerate(FLEET):
        y = 607 - 27 * i
        box(42, y - 7, 528, 24, "#F1EDF8")
        text(54, y, "#" + item["id"], strong=True)
        text(126, y, item["status"], 11, STATUS[item["status"]], True)
        text(270, y, item["area"])
        text(425, y, item["next"])

    text(42, 489, "Service area map", 14, strong=True)
    scale = min(528 / source.width, 390 / source.height)
    w, h = source.width * scale, source.height * scale
    page.drawImage(ImageReader(source), 42 + (528 - w) / 2, 470 - h, w, h)
    text(42, 57, "Source: supplied service-area map and fleet-status sample.", 10, "#534D64")
    text(42, 41, "Illustrative only. Not live dispatch or driving directions.", 10, "#534D64")
    page.showPage()
    page.save()
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map", type=Path, default=ROOT / "samples/service-map.jpg")
    parser.add_argument("--out", type=Path, default=ROOT / "public/fleet")
    args = parser.parse_args()
    with Image.open(args.map) as original:
        source = ImageOps.exif_transpose(original).convert("RGB")
    png = widget_map(source)
    pdf = write_report(source)
    pdf_name = f"fleet-report-{hashlib.sha256(pdf).hexdigest()[:12]}.pdf"
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "service-map.png").write_bytes(png)
    (args.out / pdf_name).write_bytes(pdf)
    manifest = {
        "schema": 1, "layout": "fleet", "type": "sample",
        "map": {"file": "service-map.png", "revision": revision(png)},
        "report": {"file": pdf_name}, "fleet": FLEET,
    }
    (args.out / "data.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Rendered sample fleet snapshot and {pdf_name}")


if __name__ == "__main__":
    main()
