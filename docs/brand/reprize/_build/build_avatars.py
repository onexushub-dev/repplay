"""Reprize: profile avatars (Instagram / TikTok) with the compact symbol (R only), Placar palette.
Square opaque PNGs at 1080 and 320, symbol sized for the platforms' circular crop, plus a preview sheet.
Usage: python build_avatars.py  (writes to ../social/)"""
import io, json, math, subprocess
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'social'
G = json.loads(Path('/Users/marcus/Documents/lance/docs/brand/repplay/_build/geometry.json').read_text())['mark']
RW = json.loads((HERE / 'rewind.json').read_text())['sobreposto']
INK, WHITE, AMBER, AMBER_D = '#0A0A0A', '#FFFFFF', '#FFB000', '#946200'

SIZE_RATIO = 0.58          # symbol's larger side / canvas
NUDGE = (-0.02, 0.0)        # optical-centre nudge, fraction of canvas (x, y)
MIN_EDGE = 0.08            # minimum gap to the circle edge, fraction of canvas

VARIANTS = [('escuro', INK, WHITE, AMBER), ('ambar', AMBER, INK, INK), ('claro', WHITE, INK, AMBER_D)]

def N(v): return ('%.3f' % v).rstrip('0').rstrip('.')
def mark(m, a): return f'<path fill="{m}" fill-rule="evenodd" d="{RW}"/><path fill="{a}" d="{G["G"]}"/><path fill="{m}" d="{G["T2"]}"/><path fill="{m}" d="{G["R"]}"/>'
def render(svg, w):
    p = subprocess.run(['rsvg-convert', '-w', str(w)], input=svg.encode(), capture_output=True, check=True)
    return Image.open(io.BytesIO(p.stdout))
def bbox(inner, vb=(-100, 0, 600, 450), k=4):
    x, y, w, h = vb
    im = render(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}">{inner}</svg>', w * k)
    b = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return x + b[0] / k, y + b[1] / k, x + b[2] / k, y + b[3] / k

X0, Y0, X1, Y1 = bbox(mark('#000', '#000'))

def avatar_svg(bg, m, a, size):
    s = size * SIZE_RATIO / max(X1 - X0, Y1 - Y0)
    tx = size / 2 - (X0 + X1) / 2 * s + NUDGE[0] * size
    ty = size / 2 - (Y0 + Y1) / 2 * s + NUDGE[1] * size
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'<rect width="{size}" height="{size}" fill="{bg}"/><g transform="translate({N(tx)} {N(ty)}) scale({s:.5f})">{mark(m, a)}</g></svg>')

def png(bg, m, a, size):
    return render(avatar_svg(bg, m, a, size), size).convert('RGB')

def check(size=1080):
    """Measure the symbol on a transparent canvas: bbox, ink centroid and closest approach to the circle edge."""
    im = render(avatar_svg('none', '#000', '#000', size).replace('fill="none"', 'fill-opacity="0"'), size)
    al = im.getchannel('A')
    b = al.point(lambda v: 255 if v > 8 else 0).getbbox()
    c = size / 2
    px = al.load(); maxr = 0; sx = sy = n = 0
    for yy in range(b[1], b[3]):
        for xx in range(b[0], b[2]):
            v = px[xx, yy]
            if v > 8:
                maxr = max(maxr, math.hypot(xx + .5 - c, yy + .5 - c))
                sx += xx * v; sy += yy * v; n += v
    gap = (c - maxr) / size
    print(f'bbox {b}  w={b[2]-b[0]} h={b[3]-b[1]} ({max(b[2]-b[0], b[3]-b[1])/size:.1%})  '
          f'bbox centre ({(b[0]+b[2])/2:.0f},{(b[1]+b[3])/2:.0f})  ink centroid ({sx/n:.0f},{sy/n:.0f})  '
          f'closest to circle edge {c-maxr:.0f}px = {gap:.1%}')
    assert gap >= MIN_EDGE, 'symbol too close to the circle edge'

def circ(im, d, scale=4):
    big = im.resize((d * scale, d * scale), Image.LANCZOS)
    mask = Image.new('L', big.size, 0); ImageDraw.Draw(mask).ellipse((0, 0, *big.size), fill=255)
    big.putalpha(mask)
    return big.resize((d, d), Image.LANCZOS)

def preview(srcs):
    sizes, pad, gap = (160, 110, 40), 40, 28
    colw = sum(sizes) + gap * (len(sizes) - 1)
    roww = 160 + pad
    W = 2 * (pad * 4 + colw); H = len(srcs) * roww + pad
    sheet = Image.new('RGB', (W, H), WHITE)
    ImageDraw.Draw(sheet).rectangle((W // 2, 0, W, H), fill='#000000')
    for half in (0, 1):
        for r, im in enumerate(srcs):
            x = half * W // 2 + pad * 2
            for d in sizes:
                c = circ(im, d)
                sheet.paste(c, (x, r * roww + pad + (160 - d) // 2 + pad // 2), c)
                x += d + gap
    return sheet

if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    check()
    big = []
    for name, bg, m, a in VARIANTS:
        for size in (1080, 320):
            im = png(bg, m, a, size)
            p = OUT / f'reprize-avatar-{size}-{name}.png'
            im.save(p, optimize=True); print(p, im.size, im.mode)
            if size == 1080: big.append(im)
    p = OUT / 'reprize-avatar-preview.png'; preview(big).save(p, optimize=True); print(p)
