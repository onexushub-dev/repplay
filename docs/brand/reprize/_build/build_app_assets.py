"""Writes the Reprize app assets (logo A, 'z de volta', with the 'sobreposto' rewind, Placar palette) into the Expo app.
Run with the scratchpad venv python (PIL); rsvg-convert must be on PATH."""
import io, json, subprocess
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
APP = Path('/Users/marcus/Documents/lance/app')
G = json.loads(Path('/Users/marcus/Documents/lance/docs/brand/repplay/_build/geometry.json').read_text())['mark']
WM = json.loads((HERE / 'wm.json').read_text())['z-diag']
RW = json.loads((HERE / 'rewind.json').read_text())['sobreposto']
INK, WHITE, AMBER = '#0A0A0A', '#FFFFFF', '#FFB000'

def N(v): return ('%.2f' % v).rstrip('0').rstrip('.')
def mark(m, a): return f'<path fill="{m}" fill-rule="evenodd" d="{RW}"/><path fill="{a}" d="{G["G"]}"/><path fill="{m}" d="{G["T2"]}"/><path fill="{m}" d="{G["R"]}"/>'
def word(m, a): return f'<path fill="{m}" fill-rule="evenodd" d="{WM["ink"]}"/><path fill="{a}" fill-rule="evenodd" d="{WM["accent"]}"/>'

def render(svg, w):
    return Image.open(io.BytesIO(subprocess.run(['rsvg-convert', '-w', str(w)], input=svg.encode(), capture_output=True, check=True).stdout)).convert('RGBA')

def bbox(inner, vb=(-100, 0, 1800, 450)):
    x, y, w, h = vb
    b = render(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}">{inner}</svg>', w).getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return x + b[0], y + b[1], x + b[2], y + b[3]

SYM = bbox(mark('#000', '#000'), (-100, 0, 600, 450))

def square(size, frac, m=WHITE, a=AMBER, bg=None, title='Reprize'):
    x0, y0, x1, y1 = SYM
    s = size * frac / max(x1 - x0, y1 - y0)
    t = f'translate({N(size / 2 - (x0 + x1) / 2 * s)} {N(size / 2 - (y0 + y1) / 2 * s)}) scale({s:.5f})'
    back = f'<rect width="{size}" height="{size}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}"><title>{title}</title>{back}<g transform="{t}">{mark(m, a)}</g></svg>'

def save(svg, path, w, opaque=None):
    im = render(svg, w)
    if opaque:  # App Store icons must not have an alpha channel
        bg = Image.new('RGBA', im.size, opaque); bg.alpha_composite(im); im = bg.convert('RGB')
    path.parent.mkdir(parents=True, exist_ok=True); im.save(path); print(path.relative_to(APP), im.size)

IMG = APP / 'assets/images'
# Horizontal lockup, white + amber, for the onboarding header and the export watermark (both sit on dark video).
lock = mark(WHITE, AMBER) + word(WHITE, AMBER)
x0, y0, x1, y1 = bbox(lock)
save(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{N(x0)} {N(y0)} {N(x1 - x0)} {N(y1 - y0)}">{lock}</svg>', IMG / 'brand/reprize-logo.png', 1024)
# Icons: the app is always dark, so every icon is the ink tile with the white symbol and the amber play.
save(square(1024, .70, bg=INK), IMG / 'icon.png', 1024, opaque=INK)
save(square(1024, .70, bg=INK), APP / 'targets/watch/Assets.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png', 1024, opaque=INK)
save(square(1024, .52), IMG / 'android-icon-foreground.png', 1024)  # adaptive: keep inside the central 66 %
save(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="{INK}"/></svg>', IMG / 'android-icon-background.png', 1024)
save(square(1024, .52, WHITE, WHITE), IMG / 'android-icon-monochrome.png', 1024)
save(square(1024, .72), IMG / 'splash-icon.png', 1024)
save(square(48, .84, bg=INK), IMG / 'favicon.png', 48, opaque=INK)
# iOS 26 layered icon (Icon Composer): the symbol on a transparent canvas; the fill colour lives in icon.json.
ic = APP / 'assets/expo.icon'
(ic / 'Assets/reprize-symbol.svg').write_text(square(1024, .70))
for old in (ic / 'Assets').glob('repplay-*'): old.unlink()
spec = json.loads((ic / 'icon.json').read_text())
spec['fill'] = {'solid': 'extended-srgb:0.03922,0.03922,0.03922,1.00000'}
spec['groups'][0]['layers'][0].update({'image-name': 'reprize-symbol.svg', 'name': 'reprize-symbol'})
(ic / 'icon.json').write_text(json.dumps(spec, indent=2, separators=(',', ' : ')) + '\n')
