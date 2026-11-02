"""Variants of the R symbol's rewind (T1): from one triangle to the double-triangle player sign. Writes rewind.json."""
import json
from pathlib import Path
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely import affinity

G = json.loads(Path('/Users/marcus/Documents/lance/docs/brand/repplay/_build/geometry.json').read_text())['mark']
BACK, TIP, CY, HH = 154.7, 69.8, 220.5, 62.6     # T1: back edge x, tip x, centre y, half height
GAP = 12

def N(v): return ('%.2f' % v).rstrip('0').rstrip('.')
def tri(back, w, hh=HH, cy=CY): return Polygon([(back, cy - hh), (back, cy + hh), (back - w, cy)])
def soft(g, r=7): return g.buffer(-r, join_style='round').buffer(r, join_style='round')
def path(geom):
    d = ''
    for p in getattr(geom, 'geoms', [geom]):
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)[:-1]
            d += 'M' + 'L'.join(f'{N(x)} {N(y)}' for x, y in c) + 'Z'
    return d

W = BACK - TIP
V = {'atual': G['T1']}

# 1 · Encaixado: the player sign, two narrower triangles, the right one's tip at the left one's back edge
w = 60
V['encaixado'] = path(soft(unary_union([tri(BACK, w), tri(BACK - w - 6, w)])))

# 2 · Dois inteiros: two copies of the current triangle, same gap as the rest of the symbol
V['inteiros'] = path(soft(unary_union([tri(BACK, W), tri(TIP - GAP, W)])))

# 3 · Rastro: a smaller triangle trailing behind, the rewind in motion
V['rastro'] = path(soft(unary_union([tri(BACK, W), tri(TIP - GAP, W * 0.7, HH * 0.7)])))

# 4 · Compacto: the double sign inside the current footprint, so the symbol keeps its width
w = (W - 6) / 2
V['compacto'] = path(soft(unary_union([tri(BACK, w), tri(BACK - w - 6, w)])))

# Round 2: the encaixado pair, pulled back toward the play (the user found it reaching too far left)
# 5 · Estreito: full height, narrower triangles
w = 50
V['estreito'] = path(soft(unary_union([tri(BACK, w), tri(BACK - w - 5, w)])))

# 6 · Menor: same proportions as the current triangle, scaled down and centred on the play
k = 0.62
w = W * k
V['menor'] = path(soft(unary_union([tri(BACK, w, HH * k), tri(BACK - w - 5, w, HH * k)])))

# 7 · Sobreposto: the left triangle tucks behind the right one, separated by a knockout gap
w = 60
right = tri(BACK, w); left = tri(BACK - w + 18, w)
V['sobreposto'] = path(soft(unary_union([right, left.difference(right.buffer(8))])))

Path(Path(__file__).parent / 'rewind.json').write_text(json.dumps(V))
print(list(V))
