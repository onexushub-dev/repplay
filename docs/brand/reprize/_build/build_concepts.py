"""Reprize logo concepts page: the R symbol from the Repplay kit + three wordmark directions."""
import io, json, subprocess, sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = Path(sys.argv[1])
G = json.loads(Path('/Users/marcus/Documents/lance/docs/brand/repplay/_build/geometry.json').read_text())['mark']
WM = json.loads((HERE / 'wm.json').read_text())
INK, PAPER, LIME, OLIVE, WHITE = '#0B0B09', '#F3EDE1', '#D6F23F', '#5F7D0B', '#FFFFFF'

def N(v): return ('%.1f' % v).rstrip('0').rstrip('.')

def bbox(inner, vb=(0, 0, 1700, 450)):
    x, y, w, h = vb
    p = subprocess.run(['rsvg-convert', '-w', str(w)], input=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}">{inner}</svg>'.encode(), capture_output=True, check=True)
    b = Image.open(io.BytesIO(p.stdout)).getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return x + b[0], y + b[1], x + b[2], y + b[3]

def mark(main, acc): return ''.join(f'<path fill="{acc if k == "G" else main}" d="{G[k]}"/>' for k in ['T1', 'G', 'T2', 'R'])
def word(key, main, acc): return f'<path fill="{main}" fill-rule="evenodd" d="{WM[key]["ink"]}"/><path fill="{acc}" fill-rule="evenodd" d="{WM[key]["accent"]}"/>'

def svg(inner, cls='', pad=6):
    x0, y0, x1, y1 = bbox(inner)
    return f'<svg class="{cls}" viewBox="{N(x0 - pad)} {N(y0 - pad)} {N(x1 - x0 + 2 * pad)} {N(y1 - y0 + 2 * pad)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reprize">{inner}</svg>'

def lockup(key, main=PAPER, acc=LIME): return svg(mark(main, acc) + word(key, main, acc), 'lk')
def wordonly(key, main=PAPER, acc=LIME): return svg(word(key, main, acc), 'wo')

def icon(size=1024):
    x0, y0, x1, y1 = bbox(mark('#000', '#000'), (0, 0, 500, 450))
    k = size * 0.62 / max(x1 - x0, y1 - y0)
    t = f'translate({N(size / 2 - (x0 + x1) / 2 * k)} {N(size / 2 - (y0 + y1) / 2 * k)}) scale({k:.4f})'
    return f'<svg viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg"><rect width="{size}" height="{size}" rx="{N(size * .2237)}" fill="{INK}"/><g transform="{t}">{mark(PAPER, LIME)}</g></svg>'

CONCEPTS = [
    ('z-diag', 'A', 'Z de volta', True,
     'A diagonal do z atravessa a letra em lima, de canto a canto. É o caminho de volta do lance, e é a letra que separa Reprize de “reprise”.',
     ['Resolve o maior risco do nome: o z em destaque ensina a escrita. Ninguém escreve com s depois de ver.',
      'Cria um segundo elemento de marca: o traço lima vira grafismo, selo e animação (o lance “cortando” a tela).',
      'Conversa com o símbolo: o R tem o play em lima, o nome tem o z em lima.'],
     'Duas áreas em lima na assinatura completa. Em tamanhos pequenos, usar o símbolo sozinho.'),
    ('z-arrows', 'B', 'Ida e volta', False,
     'O z começa apontando para trás (◀) e termina apontando para frente (▶): voltar e seguir, o mesmo movimento das setas do R.',
     ['A mais sóbria: uma cor só no nome, toda a cor fica no símbolo.',
      'Repete as pontas triangulares do R, então símbolo e nome parecem desenhados juntos.',
      'Funciona bem em gravação, bordado e uma cor.'],
     'O detalhe é sutil: em tamanho pequeno vira um z comum, e não ajuda a fixar a escrita.'),
    ('p', 'C', 'P de play', False,
     'O miolo do p vira um play em lima: “prize” começa com play. É o mesmo recurso do logotipo do Repplay, levado para o nome novo.',
     ['Continuidade total com o kit atual: quem já viu o Repplay reconhece.',
      'O play no meio do nome mostra o que o app faz.'],
     'O play é o clichê da categoria (YouTube, Google Play, concorrentes) e não destaca o z, que é o que diferencia o nome.'),
]

cards = ''
for key, letter, name, rec, idea, pros, risk in CONCEPTS:
    cards += f'''<article class="c{" rec" if rec else ""}">
<div class="ch"><span class="l">{letter}</span><h2>{name}</h2>{"<span class='tag'>Recomendada</span>" if rec else ""}</div>
<div class="tile dark">{lockup(key)}</div>
<div class="row"><div class="tile light">{lockup(key, INK, OLIVE)}</div><div class="tile light small">{wordonly(key, INK, OLIVE)}<small>palavra a 140 px</small></div></div>
<p class="idea">{idea}</p>
<ul>{"".join(f"<li>{p}</li>" for p in pros)}</ul>
<p class="risk"><b>Risco:</b> {risk}</p>
</article>'''

zoom = ''.join(f'<figure><div class="tile dark zoom"><svg viewBox="{'515 70 450 280' if k == 'p' else '1056 70 400 225'}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="detalhe do z">{word(k, PAPER, LIME)}</svg></div><figcaption>{l} · {n} ({'o p' if k == 'p' else 'o z'})</figcaption></figure>' for k, l, n, *_ in CONCEPTS)

store = f'''<div class="store"><div class="aicon">{icon()}</div><div><div class="t">Reprize: Replay Instantâneo</div><div class="st">A botoeira que vai com você</div><span class="get">Obter</span></div></div>'''

html = (HERE / 'concepts_template.html').read_text()
for k, v in {'%HERO%': lockup('z-diag'), '%CARDS%': cards, '%ZOOM%': zoom, '%STORE%': store, '%ICON%': icon()}.items():
    html = html.replace(k, v)
OUT.write_text(html)
print(OUT, len(html))
