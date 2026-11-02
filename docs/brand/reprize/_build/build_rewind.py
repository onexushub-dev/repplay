"""Reprize: page comparing rewind variants of the R symbol, with the chosen wordmark (C, p as play)."""
import io, json, subprocess, sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = Path(sys.argv[1])
G = json.loads(Path('/Users/marcus/Documents/lance/docs/brand/repplay/_build/geometry.json').read_text())['mark']
WM = json.loads((HERE / 'wm.json').read_text())['p']
RW = json.loads((HERE / 'rewind.json').read_text())
INK, PAPER, LIME, OLIVE = '#0B0B09', '#F3EDE1', '#D6F23F', '#5F7D0B'

def N(v): return ('%.1f' % v).rstrip('0').rstrip('.')
def bbox(inner, vb=(-100, 0, 1800, 450)):
    x, y, w, h = vb
    p = subprocess.run(['rsvg-convert', '-w', str(w)], input=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}">{inner}</svg>'.encode(), capture_output=True, check=True)
    b = Image.open(io.BytesIO(p.stdout)).getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    return x + b[0], y + b[1], x + b[2], y + b[3]
def mark(k, m, a): return f'<path fill="{m}" fill-rule="evenodd" d="{RW[k]}"/><path fill="{a}" d="{G["G"]}"/><path fill="{m}" d="{G["T2"]}"/><path fill="{m}" d="{G["R"]}"/>'
def word(m, a): return f'<path fill="{m}" fill-rule="evenodd" d="{WM["ink"]}"/><path fill="{a}" d="{WM["accent"]}"/>'
def svg(inner, cls, pad=6):
    x0, y0, x1, y1 = bbox(inner)
    return f'<svg class="{cls}" viewBox="{N(x0 - pad)} {N(y0 - pad)} {N(x1 - x0 + 2 * pad)} {N(y1 - y0 + 2 * pad)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reprize">{inner}</svg>'
def icon(k, size=1024):
    x0, y0, x1, y1 = bbox(mark(k, '#000', '#000'), (-100, 0, 600, 450))
    s = size * 0.64 / max(x1 - x0, y1 - y0)
    t = f'translate({N(size / 2 - (x0 + x1) / 2 * s)} {N(size / 2 - (y0 + y1) / 2 * s)}) scale({s:.4f})'
    return f'<svg class="ic" viewBox="0 0 {size} {size}" xmlns="http://www.w3.org/2000/svg"><rect width="{size}" height="{size}" rx="{N(size * .2237)}" fill="{INK}"/><g transform="{t}">{mark(k, PAPER, LIME)}</g></svg>'

VARIANTS = [
    ('atual', 'Atual', False, 'Um triângulo para trás. Limpo, mas sozinho lê como “voltar” ou “anterior”, não como retroceder.', 'Referência.'),
    ('encaixado', 'Duplo encaixado', True, 'O sinal de retroceder dos players: dois triângulos, a ponta de um encostada na base do outro. Reconhecível na hora e mantém o peso do símbolo.', 'O símbolo fica cerca de 12% mais largo.'),
    ('inteiros', 'Duplo inteiro', False, 'Duas cópias do triângulo atual, no mesmo espaçamento do resto do símbolo. O retroceder mais forte e mais legível.', 'O símbolo fica cerca de 28% mais largo e o retroceder passa a pesar mais que o R.'),
    ('rastro', 'Rastro', False, 'Um triângulo menor atrás do principal, como um rastro: o lance voltando em movimento.', 'Lê menos como o sinal de retroceder; o triângulo pequeno some em tamanhos pequenos.'),
    ('compacto', 'Duplo compacto', False, 'O sinal duplo dentro da largura atual: o símbolo não cresce.', 'Os triângulos ficam estreitos e pontudos, mais agressivos que o resto da marca.'),
]

ROUND2 = [
    ('atual', 'Atual (referência)', False, 'Um triângulo só. A linha pontilhada em todas as opções marca onde ele termina hoje.', 'Referência.'),
    ('encaixado', 'Duplo encaixado (rodada anterior)', False, 'Dois triângulos de 60 de largura.', 'Passa da ponta atual em cerca de 11% da largura do símbolo.'),
    ('estreito', 'Estreito', False, 'Mesma altura, triângulos mais finos.', 'Passa cerca de 5%. Os triângulos ficam mais pontudos que o play.'),
    ('menor', 'Menor', True, 'O par mantém a proporção do triângulo atual, só que menor (62%) e centralizado no play. O retroceder fica como apoio, e o play continua sendo o destaque.', 'Passa cerca de 6%. Em tamanhos muito pequenos, o par perde força antes do play.'),
    ('sobreposto', 'Sobreposto', False, 'O triângulo da esquerda entra por trás do da direita, separado por um respiro. É o mais compacto.', 'Passa cerca de 4%, o mais curto. O recorte cria uma ponta fina, que exige cuidado em tamanhos pequenos.'),
]
if len(sys.argv) > 2: VARIANTS = ROUND2
cards = ''
for k, name, rec, idea, risk in VARIANTS:
    cards += f'''<article class="c{" rec" if rec else ""}"><div class="ch"><h2>{name}</h2>{"<span class='tag'>Recomendada</span>" if rec else ""}</div>
<div class="tile dark">{svg(mark(k, PAPER, LIME) + word(PAPER, LIME), 'lk')}</div>
<div class="row"><div class="tile light">{svg(mark(k, INK, OLIVE) + '<path d="M69.8 90V350" stroke="#C0392B" stroke-width="2.5" stroke-dasharray="7 6"/>', 'sy')}</div><div class="tile light sizes">{icon(k)}<div class="px">{"".join(f'<img width="{p}" height="{p}" alt="" src="data:image/svg+xml;utf8,{icon(k, 256).replace(chr(35), "%23").replace(chr(34), chr(39))}">' for p in (48, 32, 16))}<small>48 · 32 · 16 px</small></div></div></div>
<p class="idea">{idea}</p><p class="risk"><b>{"Ponto de atenção" if k != "atual" else "Status"}:</b> {risk}</p></article>'''

html = (HERE / 'rewind_template.html').read_text().replace('%HERO%', svg(mark('menor' if len(sys.argv) > 2 else 'encaixado', PAPER, LIME) + word(PAPER, LIME), 'lk')).replace('%CARDS%', cards).replace('%ROUND%', 'rodada 2' if len(sys.argv) > 2 else 'rodada 1').replace('%LEAD%', 'Rodada 2: o duplo encaixado ia longe demais para a esquerda. Três jeitos de trazer o par para perto do play. A linha pontilhada vermelha marca onde o triângulo termina hoje.' if len(sys.argv) > 2 else 'Nos players, retroceder é sempre o sinal duplo. Com ele, o símbolo conta a história inteira do app: volta o lance e dá play. Abaixo, o símbolo atual e quatro jeitos de duplicar o retroceder, com o nome no caminho C (o p com play).')
OUT.write_text(html); print(OUT, len(html))
