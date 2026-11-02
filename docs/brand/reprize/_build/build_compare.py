"""Reprize: A (z de volta) vs C (p de play), both with the 'sobreposto' rewind, in the Placar palette
(Ink #0A0A0A, Branco #FFFFFF, Âmbar #FFB000, Âmbar escuro #946200)."""
import io, json, subprocess, sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = Path(sys.argv[1])
G = json.loads(Path('/Users/marcus/Documents/lance/docs/brand/repplay/_build/geometry.json').read_text())['mark']
WM = json.loads((HERE / 'wm.json').read_text())
RW = json.loads((HERE / 'rewind.json').read_text())['sobreposto']
INK, WHITE, AMBER, AMBER_D, SURFACE = '#0A0A0A', '#FFFFFF', '#FFB000', '#946200', '#141414'

def N(v): return ('%.1f' % v).rstrip('0').rstrip('.')
def bbox(inner, vb=(-100, 0, 1800, 450)):
    x, y, w, h = vb
    p = subprocess.run(['rsvg-convert', '-w', str(w)], input=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}">{inner}</svg>'.encode(), capture_output=True, check=True)
    b = Image.open(io.BytesIO(p.stdout)).getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return x + b[0], y + b[1], x + b[2], y + b[3]
def mark(m, a): return f'<path fill="{m}" fill-rule="evenodd" d="{RW}"/><path fill="{a}" d="{G["G"]}"/><path fill="{m}" d="{G["T2"]}"/><path fill="{m}" d="{G["R"]}"/>'
def word(k, m, a): return f'<path fill="{m}" fill-rule="evenodd" d="{WM[k]["ink"]}"/><path fill="{a}" fill-rule="evenodd" d="{WM[k]["accent"]}"/>'
def svg(inner, cls, pad=6, label='Reprize'):
    x0, y0, x1, y1 = bbox(inner)
    return f'<svg class="{cls}" viewBox="{N(x0 - pad)} {N(y0 - pad)} {N(x1 - x0 + 2 * pad)} {N(y1 - y0 + 2 * pad)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="{label}">{inner}</svg>'
def icon(bg=INK, m=WHITE, a=AMBER, size=1024):
    x0, y0, x1, y1 = bbox(mark('#000', '#000'), (-100, 0, 600, 450))
    s = size * 0.64 / max(x1 - x0, y1 - y0)
    t = f'translate({N(size / 2 - (x0 + x1) / 2 * s)} {N(size / 2 - (y0 + y1) / 2 * s)}) scale({s:.4f})'
    return f'<svg class="ic" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg"><rect width="{size}" height="{size}" rx="{N(size * .2237)}" fill="{bg}"/><g transform="{t}">{mark(m, a)}</g></svg>'

VERS = [(INK, WHITE, AMBER, 'Fundo escuro · branco e âmbar', 'd'), (WHITE, INK, AMBER_D, 'Fundo claro · ink e âmbar escuro', 'l'),
        (AMBER, INK, INK, 'Preto · sobre âmbar ou foto clara', 'a'), ('#3B3B3B', WHITE, WHITE, 'Branco · sobre foto ou cor escura', 'g')]

def column(k, letter, name, idea):
    hero = svg(mark(WHITE, AMBER) + word(k, WHITE, AMBER), 'lk')
    vers = ''.join(f'<figure class="v {c}" style="background:{bg}">{svg(mark(m, a) + word(k, m, a), "lk")}<figcaption>{t}</figcaption></figure>' for bg, m, a, t, c in VERS)
    small = ''.join(f'<div class="sm">{svg(word(k, WHITE, AMBER), "wo")}<small>{w} px</small></div>'.replace('class="wo"', f'class="wo" style="width:{w}px"') for w in (200, 120, 80))
    zoom_vb = '515 70 438 280' if k == 'p' else '1062 70 394 225'
    zoom = f'<svg class="zm" viewBox="{zoom_vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="detalhe">{word(k, WHITE, AMBER)}</svg>'
    return f'''<section class="col"><div class="ch"><span class="l">{letter}</span><h2>{name}</h2></div><p class="idea">{idea}</p>
<div class="tile hero">{hero}</div><div class="vers">{vers}</div>
<div class="pair"><div class="tile dk">{zoom}</div><div class="tile dk smalls">{small}</div></div></section>'''

A = column('z-diag', 'A', 'Z de volta', 'A diagonal do z em âmbar, de canto a canto: o caminho de volta, na letra que separa Reprize de “reprise”.')
C = column('p', 'C', 'P de play', 'O miolo do p vira um play em âmbar: “prize” começa com play, o mesmo recurso do logotipo do Repplay.')

ROWS = [
    ('Cor na assinatura', 'Dois elementos em âmbar: o play do símbolo e o z.', 'Dois elementos em âmbar: o play do símbolo e o play do p. Os dois são o mesmo desenho, então parecem um sistema só.'),
    ('Regra do guia Placar', 'O guia diz que o play é o único elemento colorido. O z em âmbar abre uma exceção, só no logotipo.', 'Segue a regra: a cor está sempre no play, no símbolo e no nome.'),
    ('Escrita do nome', 'Ensina o z: quem vê, escreve Reprize, não “reprise”.', 'Não ajuda: o p em destaque não diz nada sobre o z.'),
    ('Peso visual', 'O z em âmbar é grande e chama mais atenção que o símbolo. O olho vai para o fim do nome.', 'O play do p é pequeno e fica no meio do nome. O símbolo continua sendo o destaque.'),
    ('Tamanho pequeno', 'Até 80 px o z âmbar continua visível.', 'Abaixo de 120 px o play do p vira um ponto.'),
    ('Elemento extra de marca', 'A diagonal âmbar vira grafismo, selo e animação (o lance “cortando” a tela).', 'O play já existe no símbolo, então não cria nada novo.'),
    ('Continuidade com o Repplay', 'Novo.', 'Total: é o recurso do logotipo antigo.'),
]
table = ''.join(f'<tr><th>{a}</th><td>{b}</td><td>{c}</td></tr>' for a, b, c in ROWS)

icons = ''.join(f'<figure>{icon(*c)}<figcaption>{t}</figcaption></figure>' for c, t in [((INK, WHITE, AMBER), 'iOS / Android'), ((AMBER, INK, INK), 'Variação âmbar'), (('#000', WHITE, '#8E8E93'), 'iOS tinted')])
px = ''.join(f'<img width="{p}" height="{p}" alt="" src="data:image/svg+xml;utf8,{icon(size=256).replace(chr(35), "%23").replace(chr(34), chr(39))}">' for p in (64, 48, 32, 24))

html = (HERE / 'compare_template.html').read_text()
for k, v in {'%A%': A, '%C%': C, '%TABLE%': table, '%ICONS%': icons, '%PX%': px, '%SYMBOL%': svg(mark(WHITE, AMBER), 'sy')}.items():
    html = html.replace(k, v)
OUT.write_text(html); print(OUT, len(html))
