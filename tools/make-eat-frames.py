
import io, math, os, sys, zipfile
import numpy as np
from PIL import Image, ImageDraw

def load_base(src):
    if os.path.isdir(src):
        return Image.open(os.path.join(src, 'shime11a.png')).convert('RGBA')
    with zipfile.ZipFile(src) as z:
        name = next(n for n in z.namelist() if n.endswith('/Slushi/shime11a.png'))
        return Image.open(io.BytesIO(z.read(name))).convert('RGBA')

P1, E, H = (40.0, 50.0), (40.0, 68.0), (44.0, 85.5)     # shoulder, elbow, hand (apple centre) in 11a
L1, L2 = math.dist(P1, E), math.dist(E, H)
UPPER, FORE = (32, 50, 48, 68), (30, 68, 48, 95)        # cut boxes; x stops before the leg

def region(img, box):
    out = Image.new('RGBA', img.size, (0, 0, 0, 0)); out.paste(img.crop(box), box[:2]); return out
def erase(img, box):
    img = img.copy(); ImageDraw.Draw(img).rectangle([box[0], box[1], box[2] - 1, box[3] - 1], fill=(0, 0, 0, 0)); return img
def ang(a, b): return math.atan2(b[1] - a[1], b[0] - a[0])
def rot(layer, c, rad): return layer.rotate(-math.degrees(rad), center=c, resample=Image.BICUBIC)

def apple(bites, sz=10, S=8):
    U = sz * S / 8.0                                    # drawing unit, so shapes scale with sz
    im = Image.new('RGBA', (sz * S, sz * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if bites >= 3:                                       # just the core
        d.rounded_rectangle([3.2 * U, 2.2 * U, 4.8 * U, 6.6 * U], radius=U * 0.7, fill=(228, 208, 150, 255))
        d.ellipse([3.2 * U, 1.8 * U, 4.8 * U, 2.8 * U], fill=(228, 208, 150, 255))
    else:
        d.ellipse([0.6 * U, 1.6 * U, 7.4 * U, 7.7 * U], fill=(196, 20, 30, 255))
        d.ellipse([1.6 * U, 2.3 * U, 3.2 * U, 3.7 * U], fill=(236, 96, 96, 255))
        for (cx, cy, r) in [(0.80, 0.42, 2.0), (0.76, 0.70, 2.3)][:bites]:
            cx, cy, r = cx * sz * S, cy * sz * S, r * U
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0, 0))
    d.line([(sz * S / 2, 1.8 * U), (sz * S / 2 + U * 0.5, 0.2 * U)], fill=(80, 52, 28, 255), width=max(1, int(U // 2)))
    return im.resize((sz, sz), Image.LANCZOS)

def build(base):
    a = np.array(base).astype(int)                       # remove the apple painted into the hand
    m = (a[..., 3] > 0) & (a[..., 0] > 60) & (a[..., 0] > 1.5 * a[..., 1]) & (a[..., 0] > 1.3 * a[..., 2])
    box = np.zeros_like(m); box[74:96, 34:54] = True          # only the hand area
    m &= box
    a[m, 0], a[m, 1], a[m, 2] = 28, 26, 34                  # keep each pixel's own alpha
    clean = Image.fromarray(a.astype('uint8'), 'RGBA')
    upper, fore = region(clean, UPPER), region(clean, FORE)
    body = erase(erase(clean, UPPER), FORE)

    def pt(p, c, rad):                                   # rotate a point like rot() rotates pixels
        dx, dy = p[0] - c[0], p[1] - c[1]
        return (c[0] + dx * math.cos(rad) - dy * math.sin(rad), c[1] + dx * math.sin(rad) + dy * math.cos(rad))

    def solve(target):
        d = min(math.dist(P1, target), L1 + L2 - 0.5)
        k = (L1 * L1 - L2 * L2 + d * d) / (2 * d); h = math.sqrt(max(L1 * L1 - k * k, 0))
        ux, uy = (target[0] - P1[0]) / d, (target[1] - P1[1]) / d
        Ep = (P1[0] + k * ux - h * uy, P1[1] + k * uy + h * ux)       # elbow folds in front of the body
        th1 = ang(P1, Ep) - ang(P1, E)
        return th1, ang(Ep, target) - ang(E, H) - th1

    MOUTH = (56, 31)
    FINAL = solve(MOUTH)

    def pose(t, bites, mouth=MOUTH):
        """t = 0 arm down ... 1 hand at mouth (joint angles are blended, so the arm swings naturally)."""
        th1, phi = solve(mouth) if t >= 1 else (FINAL[0] * t, FINAL[1] * t)
        out = body.copy()
        out.alpha_composite(rot(rot(fore, E, phi), P1, th1)); out.alpha_composite(rot(upper, P1, th1))
        tx, ty = pt(pt(H, E, phi), P1, th1)
        if bites is not None:
            out.alpha_composite(apple(bites), (int(round(tx - 5)), int(round(ty - 5))))
        return out

    f = {
        'E0': pose(0, 0),            # holding the apple, arm down
        'E1': pose(0.4, 0),        # arm coming up
        'E2': pose(0.75, 0),
        'E3': pose(1, 0),           # apple at his mouth
        'E7': pose(0, 3),            # arm down, holding the core
        'E8': pose(0, None),         # empty hand
    }
    f['Apple'] = apple(0, sz=22, S=6)                       # the apple lying on the floor
    f['E1c'], f['E2c'] = pose(0.4, 3), pose(0.75, 3)         # lowering the core
    for b in (1, 2, 3):
        f[f'E{3 + b}a'] = pose(1, b)                          # biting
        f[f'E{3 + b}b'] = pose(1, b, (MOUTH[0], MOUTH[1] + 1.5))     # chewing (apple dips 1.5 px)
    return f

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    frames = build(load_base(src))
    for k, im in frames.items():
        im.save(os.path.join(out, f'shime{k}.png'))
    print(f'wrote {len(frames)} eating frames to {out}')