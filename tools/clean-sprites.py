#!/usr/bin/env python3
"""Remove the near-invisible alpha haze (alpha 1-30) that fills every frame of the pack,
and any green spill on semi-transparent edges. Artwork pixels are not touched.
Usage: clean-sprites.py <folder-with-shime*.png>"""
import sys, glob, os
try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow missing: run  sudo dnf install python3-pillow  (or install with RYUK_RAW=1 to skip cleaning)")

folder = sys.argv[1]
files = sorted(glob.glob(os.path.join(folder, "shime*.png")))
if not files:
    sys.exit(f"no shime*.png in {folder}")
THRESH = 30
for f in files:
    im = Image.open(f).convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= THRESH:
                px[x, y] = (0, 0, 0, 0)
            elif a < 255 and g > max(r, b):          # despill green on soft edges
                px[x, y] = (r, max(r, b), b, a)
    im.save(f)
print(f"cleaned {len(files)} sprites")