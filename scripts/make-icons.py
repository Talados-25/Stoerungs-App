# Erzeugt die App-Symbole (hell, dunkel, getönt) als 1024x1024 PNG.
# Aufruf: python3 scripts/make-icons.py assets   (braucht Pillow)
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
S = 4096            # in hoher Auflösung zeichnen, dann verkleinern (Kantenglättung)
F = 1024

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def gradient(c1, c2):
    # diagonaler Verlauf oben links -> unten rechts, ohne Drehung (keine Ecken-Artefakte)
    from PIL import ImageChops
    v = Image.linear_gradient('L').resize((S, S))
    h = v.transpose(Image.Transpose.ROTATE_90)
    diag = ImageChops.add(h, v, scale=2)
    return Image.composite(Image.new('RGB', (S, S), c2), Image.new('RGB', (S, S), c1), diag)

PTS = [(0.13, 0.58), (0.33, 0.58), (0.41, 0.40), (0.51, 0.78), (0.60, 0.48), (0.66, 0.58), (0.87, 0.58)]

def pulse(draw, color, width):
    pts = [(x * S, y * S) for x, y in PTS]
    draw.line(pts, fill=color, width=width, joint='curve')
    r = width / 2
    for x, y in (pts[0], pts[-1]):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=color)

def badge(draw, fill, ring=None):
    cx, cy, r = 0.74 * S, 0.27 * S, 0.105 * S
    if ring:
        rr = r + 0.03 * S
        draw.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=ring)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill)

W = int(0.075 * S)

# Hell: blauer Verlauf, weiße Linie, roter Punkt mit weißem Rand
light = gradient((77, 166, 255), (10, 102, 216)).convert('RGBA')
d = ImageDraw.Draw(light)
pulse(d, (255, 255, 255, 255), W)
badge(d, (255, 69, 58, 255), ring=(255, 255, 255, 255))
light.convert('RGB').resize((F, F), Image.LANCZOS).save(f'{OUT}/icon.png')

# Dunkel: transparenter Hintergrund (iOS legt den dunklen Hintergrund selbst dahinter)
dark = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(dark)
pulse(d, (100, 180, 255, 255), W)
badge(d, (255, 69, 58, 255))
dark.resize((F, F), Image.LANCZOS).save(f'{OUT}/icon-dark.png')

# Getönt: Graustufen auf transparent, iOS färbt selbst ein
tinted = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(tinted)
pulse(d, (255, 255, 255, 255), W)
badge(d, (200, 200, 200, 255))
tinted.resize((F, F), Image.LANCZOS).save(f'{OUT}/icon-tinted.png')

print('Symbole erzeugt')
