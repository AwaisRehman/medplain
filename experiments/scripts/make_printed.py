#!/usr/bin/env python3
"""
make_printed.py -- Table 4 printed controls: renders each test document as
  (a) a clean printed page   -> <out>/clean/<id>.png
  (b) a degraded, scan-like copy (rotation, blur, noise, downscale, JPEG) -> <out>/scan/<id>.jpg
Works on Windows, macOS and Linux (uses Times New Roman / Liberation Serif / DejaVu Serif if present).

usage (from repo root):
  python experiments/scripts/make_printed.py eval/dataset.json experiments/results/printed
"""
import json
import random
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = [
    r"C:\Windows\Fonts\times.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    "/Library/Fonts/Times New Roman.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
]


def load_font(size=30):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size), f
    return ImageFont.load_default(), "PIL default (install Times New Roman for realistic print)"


def main():
    ds, outdir = Path(sys.argv[1]), Path(sys.argv[2])
    (outdir / "clean").mkdir(parents=True, exist_ok=True)
    (outdir / "scan").mkdir(parents=True, exist_ok=True)
    font, fname = load_font()
    random.seed(0)  # same degradation every time -> reproducible
    cases = json.loads(ds.read_text(encoding="utf-8"))["cases"]
    for c in cases:
        lines = []
        for para in c["original"].split("\n"):
            lines += textwrap.wrap(para, 70) or [""]
        lines = lines[:60]
        img = Image.new("L", (1400, max(120 + 42 * len(lines), 600)), 255)
        d = ImageDraw.Draw(img)
        for i, ln in enumerate(lines):
            d.text((80, 60 + 42 * i), ln, font=font, fill=0)
        img.save(outdir / "clean" / f"{c['id']}.png")
        deg = img.rotate(random.uniform(-1.5, 1.5), expand=True, fillcolor=255).filter(ImageFilter.GaussianBlur(1.0))
        px = deg.load()
        for _ in range(deg.width * deg.height // 60):
            px[random.randrange(deg.width), random.randrange(deg.height)] = random.choice([0, 255])
        deg = deg.resize((deg.width * 2 // 3, deg.height * 2 // 3))
        deg.convert("RGB").save(outdir / "scan" / f"{c['id']}.jpg", quality=60)
    print(f"Rendered {len(cases)} clean + {len(cases)} scan-like pages with font: {fname}")
    print(f"  {outdir / 'clean'}\n  {outdir / 'scan'}")


if __name__ == "__main__":
    main()
