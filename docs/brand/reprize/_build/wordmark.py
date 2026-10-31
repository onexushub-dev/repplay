"""Reprize wordmark concepts: r, e, p reused from the approved Repplay wordmark (docs/brand/repplay/_build/geometry.json),
i and z drawn to match. Writes wm.json with ink/accent paths per variant, in the same coordinate space as the R symbol."""
import json, re
from pathlib import Path
from shapely.geometry import Polygon, box, Point
from shapely.ops import unary_union
from shapely import affinity

HERE = Path(__file__).resolve().parent
GEO = json.loads(Path('/Users/marcus/Documents/lance/docs/brand/repplay/_build/geometry.json').read_text())
W = GEO['word']
SUB = [s for s in re.split(r'(?=M)', W['ink']) if s.strip()]
# subpath order in the traced art: l, a, a-counter, p(play), p, p-counter, e, e-counter, r, y
L_, P_PLAY, P1, P1C, E, EC, R_ = SUB[0], SUB[3], SUB[4], SUB[5], SUB[6], SUB[7], SUB[8]
PLAY = W['green']

def N(v): return ('%.2f' % v).rstrip('0').rstrip('.')

def shift(d, dx):
    """translate an absolute-coordinate path horizontally"""
    out, toks = [], re.findall(r'[A-Za-z]|-?\d+\.?\d*', d)
    cmd, i = None, 0
    xy = 0
    for t in toks:
        if t.isalpha():
            cmd = t; xy = 0; out.append(t); continue
        v = float(t)
        if cmd in 'H': v += dx
        elif cmd in 'V': pass
        elif cmd in 'A':
            # rx ry rot large sweep x y
            if xy % 7 == 5: v += dx
            xy += 1; out.append(N(v)); continue
        else:
            if xy % 2 == 0: v += dx
        xy += 1; out.append(N(v))
    return ' '.join(out).replace(' M', 'M')

def path(geom):
    """shapely geometry → SVG path (evenodd-safe)"""
    polys = getattr(geom, 'geoms', [geom])
    d = ''
    for p in polys:
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)
            d += 'M' + 'L'.join(f'{N(x)} {N(y)}' for x, y in c[:-1]) + 'Z'
    return d

def soft(g, r=6):
    """round convex and concave corners, like the traced letters"""
    return g.buffer(-r, join_style='round').buffer(r * 2, join_style='round').buffer(-r, join_style='round')

TOP, BASE, STEM = 140, 281, 46

def z_shape(x0, w=132, bar=40, diag=46):
    # diagonal band from the top bar's right end to the bottom bar's left end, perpendicular width = diag
    import math
    dy = (BASE - bar) - (TOP + bar)
    for hw in range(30, 120):
        dx = w - hw
        if hw * dy / math.hypot(dx, dy) >= diag: break
    top = box(x0, TOP, x0 + w, TOP + bar)
    bot = box(x0, BASE - bar, x0 + w, BASE)
    band = Polygon([(x0 + w - hw, TOP + bar), (x0 + w, TOP + bar), (x0 + hw, BASE - bar), (x0, BASE - bar)])
    return top, band, bot, hw

def i_shape(x0):
    return soft(box(x0, TOP, x0 + STEM, BASE)), Point(x0 + STEM / 2, 107).buffer(23, 64)

X = {'r': 0, 'e': 0, 'p': 0}           # r, e, p keep their original positions (525..953)
P_END = 953
R2_DX = (P_END + 9) - 525              # second r right after the p
I_X = 623 + R2_DX + 8
Z_X = I_X + STEM + 14
E2_DX = (Z_X + 132 + 10) - 624

def build(variant):
    ink = R_ + E + EC
    acc = ''
    if variant == 'p':
        ink += shift(P_PLAY, 788 - 964); acc += shift(PLAY, 788 - 964)
    else:
        ink += P1 + P1C
    ink += shift(R_, R2_DX)
    stem, dot = i_shape(I_X)
    ink += path(stem) + path(dot)
    top, band, bot, hw = z_shape(Z_X)
    if variant == 'z-diag':
        # the diagonal runs corner to corner in lime, cutting through both bars: the way back
        import math
        w, t, g = 132, 50, 9
        L = math.hypot(w, BASE - TOP); nx, ny = (BASE - TOP) / L * t / 2, w / L * t / 2
        a, b = (Z_X + w, TOP), (Z_X, BASE)
        diag = Polygon([(a[0] - nx, a[1] - ny), (a[0] + nx, a[1] + ny), (b[0] + nx, b[1] + ny), (b[0] - nx, b[1] - ny)])
        frame = box(Z_X, TOP, Z_X + w, BASE)
        diag = diag.intersection(frame)
        bars = unary_union([top, bot]).difference(diag.buffer(g))
        ink += path(soft(bars, 5)); acc += path(soft(diag, 5))
    elif variant == 'z-arrows':
        # ida e volta: the top bar leaves pointing back (◀), the bottom bar arrives pointing forward (▶)
        tip = 34
        top_p = Polygon([(Z_X - 6, TOP + 20), (Z_X + tip - 6, TOP), (Z_X + 132, TOP), (Z_X + 132, TOP + 40), (Z_X + tip - 6, TOP + 40)])
        bot_p = Polygon([(Z_X, BASE - 40), (Z_X + 132 - tip + 6, BASE - 40), (Z_X + 132 + 6, BASE - 20), (Z_X + 132 - tip + 6, BASE), (Z_X, BASE)])
        z = soft(unary_union([top_p, band, bot_p]), 4)
        ink += path(z)
    else:
        ink += path(soft(unary_union([top, band, bot])))
    ink += shift(E, E2_DX) + shift(EC, E2_DX)
    return {'ink': ink, 'accent': acc, 'x0': 525, 'x1': Z_X + 132 + 10 + 155}

out = {v: build(v) for v in ('z-diag', 'z-arrows', 'p', 'plain')}
(HERE / 'wm.json').write_text(json.dumps(out))
print({k: (round(v['x1'])) for k, v in out.items()})
