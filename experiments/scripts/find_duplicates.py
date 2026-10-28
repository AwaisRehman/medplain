#!/usr/bin/env python3
"""
find_duplicates.py -- lists near-duplicate images (same picture saved twice, e.g. 61.jpg and 94.jpg)
so they are counted once in Table 4. Uses a 16x16 average hash; images whose hashes differ in
<= 12 of 256 bits are treated as the same picture. The FIRST file of each group is kept; the others
are written to the output list (one file name per line), which score_results.py excludes.

usage (from repo root):
  python experiments/scripts/find_duplicates.py C:\\path\\to\\handwritten_folder experiments/results/ocr_duplicates.txt
"""
import re
import sys
from pathlib import Path

from PIL import Image

IMG = re.compile(r"\.(jpe?g|png|bmp|tiff?|webp)$", re.I)


def ahash(p, n=16):
    im = Image.open(p).convert("L").resize((n, n))
    px = list(im.getdata())
    m = sum(px) / len(px)
    return int("".join("1" if v > m else "0" for v in px), 2)


def natural(name):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", name)]


def main():
    folder, out = Path(sys.argv[1]), Path(sys.argv[2])
    files = sorted([f for f in folder.iterdir() if IMG.search(f.name)], key=lambda f: natural(f.name))
    hashes = {f: ahash(f) for f in files}
    groups = []
    for f in files:
        for g in groups:
            if bin(hashes[f] ^ hashes[g[0]]).count("1") <= 12:
                g.append(f)
                break
        else:
            groups.append([f])
    dups = [f.name for g in groups for f in g[1:]]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(dups) + ("\n" if dups else ""), encoding="utf-8")
    print(f"{len(files)} images, {len(groups)} unique, {len(dups)} duplicates written to {out}")
    for g in groups:
        if len(g) > 1:
            print("  same picture:", ", ".join(f.name for f in g), "-> keeping", g[0].name)


if __name__ == "__main__":
    main()
