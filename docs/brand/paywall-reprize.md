# Paywall Reprize: ficha para o painel do RevenueCat

Aplicar nas ofertas `default` (PRO) e `pass` (Passe Avulso), em Paywalls, no painel. Valores da paleta Placar (guia de marca do Reprize, `docs/brand/reprize/`) e de `app/src/theme/tokens.ts`.

## O que muda em relação à versão atual

| Elemento | Hoje | Reprize |
|---|---|---|
| Fundo da página | azul-marinho `#0F1226`-ish | **Ink `#0A0A0A`** |
| Cartões e planos (fundo) | azul acinzentado | **Surface `#141414`** |
| Plano selecionado (borda e fundo) | borda ciano, fundo azul | borda **Âmbar `#FFB000`** 2 px, fundo Surface |
| Selo de economia | ciano com texto escuro | fundo **Âmbar**, texto **Ink** |
| Ícones dos benefícios | ciano sobre azul | **Âmbar** sobre Surface |
| Botão "Go PRO" | **vermelho coral** | fundo **Âmbar**, texto **Ink** |
| Texto principal | branco | **Branco `#FFFFFF`** |
| Texto secundário | cinza azulado | **Muted `#B3B3B3`** |
| Links (Restore, Terms, Privacy) | cinza | **Muted** |
| Título | sans arredondada | **Barlow Condensed 700/800**, caixa alta, entrelinha 1.05 |
| Corpo, preços, rótulos | sans | **Manrope** 400/600/700 |

Por que o botão não pode ser vermelho: no app, o vermelho-laranja (`rec`, `#FF453A`) significa só "gravando". Um botão de compra nessa cor lê como alerta e quebra a regra do guia de usar um único acento.

## Cores (paleta Placar)

| Papel | Nome | HEX |
|---|---|---|
| Fundo | Ink | `#0A0A0A` |
| Cartão / plano | Surface | `#141414` |
| Contorno em repouso | Border | `#2E2E2E` |
| Texto | Branco | `#FFFFFF` |
| Texto secundário | Muted | `#B3B3B3` |
| Acento (botão, selo, ícones, plano selecionado) | Âmbar | `#FFB000` |
| Texto sobre o acento | Ink | `#0A0A0A` |

Nunca usar Âmbar sobre fundo branco ou claro (regra do guia; no claro, o acento é o Âmbar escuro `#946200`).

## Contraste (WCAG, calculado)

| Par | Razão |
|---|---|
| Branco sobre Ink | 19,8:1 |
| Branco sobre Surface | 18,4:1 |
| Âmbar sobre Ink | 10,8:1 |
| Ink sobre Âmbar (botão e selo) | 10,8:1 |
| Muted sobre Ink | 9,4:1 |
| Muted sobre Surface | 8,8:1 |
| Border sobre Ink | 1,5:1, só decorativo: o plano selecionado se distingue pelo Âmbar, não pela borda cinza |

Todos os textos passam de 7:1.

## Forma

Raios do app: plano e cartão 14, botão 16, chip e selo 20, folha 24. Espaçamento de 4, 8, 12, 16, 20, 24. Botão com altura mínima de 52 e largura total.

## Hero (imagem do topo)

Manter a foto escura de quadra, mas escurecer a base até Ink `#0A0A0A` na emenda com o conteúdo, sem o recorte azulado. A foto atual é de skate; o app é de esportes de quadra e areia (beach tennis, futevôlei, vôlei de praia), então troque por uma foto desses esportes, com câmera no tripé, aspecto cru de celular e sem acabamento de banco de imagens (direção do brief).

## Texto

Em pt-BR. Termos do app: "gravação" é a sessão, "clipe" é o vídeo salvo e "lance" é a jogada, usado na copy de emoção ("melhores lances").

### Oferta `default` (PRO)

Estrutura inspirada em paywalls de comparação: uma tabela **Grátis × PRO**, uma linha por benefício (2 a 4 palavras, com ícone), visto Âmbar no PRO e traço Muted no grátis. O grátis aparece como ponto de partida, nunca como lista de proibições: a primeira linha mostra o que ele já dá (gravações e clipes ilimitados).

| Local | Texto |
|---|---|
| Título | SEUS MELHORES LANCES, COMO VOCÊ VIU |
| Subtítulo | No app você vê tudo. Com o PRO, o vídeo salvo também tem. |
| Colunas | GRÁTIS · PRO (PRO em Âmbar) |

Tabela de benefícios (ordem de cima para baixo; ícones sugeridos entre parênteses):

| Benefício | Grátis | PRO |
|---|---|---|
| Gravações e clipes (infinito) | ∞ | ∞ |
| Exportação (filme) | HD | Full HD |
| Som no vídeo salvo (alto-falante) | – | ✓ |
| Modo Foco no vídeo salvo (mira) | – | ✓ |
| Sem marca d'água (olho cortado) | – | ✓ |
| Duração do clipe (cronômetro) | 15 s | até 60 s |
| Gravação em 4K (câmera) | – | ✓ |
| Compilar clipes (clapperboard) | – | ✓ |
| Apple Watch (relógio) | – | ✓ |

| Local | Texto |
|---|---|
| Prova social (opcional) | Avatares + "+N assinantes", logo acima dos planos. **Só com o número real**; sem número, não usar. |
| Chamada | **Comece agora** (acima dos planos) |
| Plano anual (pré-selecionado) | Anual · SEU PREÇO LOCAL/ano · preço mensal equivalente · selo de economia (Âmbar, colado no canto do plano) · "7 dias grátis" |
| Plano mensal | Mensal · cancele quando quiser (sem teste grátis) |
| Botão | Anual: Começar 7 dias grátis · Mensal: Assinar |
| Rodapé | Renova sozinho. Cancele quando quiser. Restaurar · Termos · Privacidade |

Se o editor de paywall do RevenueCat não montar a tabela com os componentes padrão, usar esta versão em lista (4 benefícios, sem coluna do grátis):

| Benefício | Texto |
|---|---|
| 1 | **Full HD com som, e gravação em 4K**: o vídeo salvo sai como você viu no app. |
| 2 | **Modo Foco e sem marca d'água**: enquadramento automático e nenhum logo nos seus lances. |
| 3 | **Clipes de até 60 s e compilações**: o ponto inteiro e seus melhores lances num vídeo só. |
| 4 | **Apple Watch**: salve o lance pelo pulso. |

### Oferta `pass` (Passe Avulso)

| Local | Texto |
|---|---|
| Título | LIBERAR RECURSOS PRO NESSA GRAVAÇÃO |
| Subtítulo | Os clipes desta gravação saem em Full HD, com som, com Modo Foco e sem marca d'água. |
| Produto | Passe Avulso · SEU PREÇO LOCAL · uma gravação, sem assinatura |
| Nota | A duração e a qualidade gravadas não mudam (15 s, Full HD). |
| Botão | Liberar recursos PRO nessa gravação |

### Regras atrás do texto

Fonte da verdade: `docs/modelo-de-negocio-e-pagamentos.md`.

- Gravações são ilimitadas nos dois planos: o paywall não fala em limite de gravações.
- O grátis grava em Full HD e mostra som e Modo Foco no app; o PRO vende o que sai do app (resolução, som, Modo Foco, sem marca), a gravação em 4K, as durações acima de 15 s, compilar e o Apple Watch.
- Não prometer controle Bluetooth, celular controle nem velocidade: são grátis.
- A oferta `default` tem só Anual e Mensal. O Passe fica na oferta `pass`, aberta por "Liberar recursos PRO nessa gravação".
- Preço e moeda vêm sempre da loja; não escrever valores no painel. O selo de economia só aparece se o painel calcular a diferença sozinho (o anual de R$ 99,90 contra 12 mensalidades de R$ 14,90 dá 44%).

## Prompt para o editor do RevenueCat

Para colar no gerador de paywall do RevenueCat (oferta `default`). As instruções estão em inglês; os textos do paywall, em pt-BR, devem sair exatamente como estão.

```text
Create a dark, full-screen paywall for "Reprize PRO", a sports video app (beach tennis, futevôlei, beach volleyball). Language: Brazilian Portuguese. Use the copy below exactly; do not invent claims, numbers or testimonials.

STYLE
- Background #0A0A0A. Cards and plan tiles #141414 with a 1 px #2E2E2E border. Text #FFFFFF; secondary text #B3B3B3.
- Single accent: amber #FFB000, with #0A0A0A text on amber. Never use red, blue or gradients.
- Headings: Barlow Condensed, weight 800, uppercase, line height 1.05. Everything else: Manrope 400/600/700.
- Radii: plan tile 14, button 16, badge 20. Spacing on a 4/8 grid. Full-width button, at least 52 px tall.

LAYOUT, TOP TO BOTTOM
1. Close button (X) top left. Centered wordmark "REPRIZE" in white followed by "PRO" in amber.
2. Title: "SEUS MELHORES LANCES, COMO VOCÊ VIU". Subtitle: "No app você vê tudo. Com o PRO, o vídeo salvo também tem."
3. Comparison table with two right-aligned columns, headers "GRÁTIS" (#B3B3B3) and "PRO" (amber). One row per benefit: a thin line icon, a short label, the free value, the PRO value. A free value of "–" is a muted dash; a PRO value of "✓" is an amber check; "∞" is an amber infinity sign. Hairline #2E2E2E dividers between rows.
   - Gravações e clipes (infinity icon) | ∞ | ∞
   - Exportação (film icon) | HD | Full HD
   - Som no vídeo salvo (speaker icon) | – | ✓
   - Modo Foco no vídeo salvo (crosshair icon) | – | ✓
   - Sem marca d'água (eye-off icon) | – | ✓
   - Duração do clipe (timer icon) | 15 s | até 60 s
   - Gravação em 4K (camera icon) | – | ✓
   - Compilar clipes (clapperboard icon) | – | ✓
   - Apple Watch (watch icon) | – | ✓
4. Hero strip: three slightly overlapping, slightly rotated photo cards with white borders (the center one in front), showing amateur beach and court sports filmed from a phone on a tripod. Raw phone look, no stock-photo polish. Leave out any social proof line or subscriber count.
5. Heading: "COMECE AGORA".
6. Two plan tiles side by side. Annual tile on the right, preselected: amber 2 px border, an amber badge pinned to its top edge with the savings percentage computed by RevenueCat (format "ECONOMIZE {percent}"), label "ANUAL", the store price per year, the monthly equivalent in muted text, and "7 dias grátis". Monthly tile on the left: label "MENSAL", the store price per month, "Cancele quando quiser". The monthly plan has no free trial.
7. Primary button (amber, #0A0A0A text): "Começar 7 dias grátis" when Annual is selected, "Assinar" when Monthly is selected.
8. Footer in #B3B3B3: "Renova sozinho. Cancele quando quiser." and the links "Restaurar · Termos · Privacidade".

RULES
- Prices and currency always come from the store variables; never type a price.
- Do not mention recording limits: recordings are unlimited on both plans.
- Do not list the Bluetooth remote, the phone remote or playback speed as PRO benefits; they are free.
- Do not add the Single Pass here; it has its own offering.
```

## Observações

1. Preços do Brasil: Anual R$ 99,90, Mensal R$ 14,90 e Passe R$ 4,90. Confira se as lojas têm os preços certos antes de publicar.
2. O texto "Go PRO" e "PRO" devem seguir o nome do plano no app. Os cadeados do app já usam "PRO".
3. Depois de publicar, abrir o paywall no aparelho (`presentPaywall`) e conferir o botão, o selo e os ícones, porque o preview do painel nem sempre mostra a fonte real.
