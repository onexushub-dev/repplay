# Paywall Reprize: ficha para o painel do RevenueCat

São dois paywalls com o mesmo visual: o da assinatura, na oferta `default` (PRO, só Anual e Mensal), e o do Passe Avulso, na oferta `pass`. Valores da paleta Placar (guia de marca do Reprize, `docs/brand/reprize/`) e de `app/src/theme/tokens.ts`. Regras de cobrança: `docs/modelo-de-negocio-e-pagamentos.md`.

O app abre a oferta `default` pelos cadeados PRO (preparação, compilar, Apple Watch) e pelo "Liberar tudo com o PRO" do painel da exportação, e a oferta `pass` pelo "Liberar só esta gravação" do mesmo painel.

## O que muda em relação à versão publicada

| Hoje | Agora | Por quê |
|---|---|---|
| "Desbloqueie os recursos PRO" | **SEUS LANCES / COM QUALIDADE PRO** | Mesma expressão do painel da exportação ("Salve seus clipes com qualidade PRO") |
| Seis frases de benefício | Grade de 8 blocos, ícone e 2 ou 3 palavras | Padrão do onboarding e do painel: menos texto, mais ícone |
| "Gravações ilimitadas, com todos os recursos" | removido | As gravações são ilimitadas nos dois planos |
| "… som e controle de velocidade" | sem a velocidade | A velocidade é grátis |
| "Relógio (Apple Watch) como gatilho" | **Apple Watch** | Sem jargão |
| Faltavam Full HD, som no vídeo e 4K | entram na grade | São o que o PRO mais vende |
| Selo "ECONOMIZE 19%" | **ECONOMIZE 44%** (calculado pelo painel contra o mensal) | 99,90 contra 12 × 14,90 dá 44%; o selo usava outra base |
| Passe avulso como terceira linha da assinatura | oferta própria (`pass`) | Não libera 4K, 60 s nem Apple Watch; quem chega pelo cadeado do 4K compraria algo que não resolve |
| Teste de 7 dias não aparecia | Botão "Começar 7 dias grátis" e as condições embaixo | A Apple exige o valor cobrado depois do teste |
| "Assinar o Pro" | "Assinar o PRO" | Mesmo nome dos cadeados |
| Foto pequena no topo | Conteúdo preso embaixo, foto ocupa o resto | A foto cresce em telas mais altas |

Continuam: as linhas de plano empilhadas (Anual em cima, pré-selecionado; Mensal embaixo), "Melhor custo-benefício" no anual, "O mais escolhido" no mensal, a foto escura de quadra e o rodapé Restaurar · Termos · Privacidade.

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

## Imagem do topo

A foto escura de quadra à noite, escurecendo até Ink `#0A0A0A` na emenda com o conteúdo. Por cima, o visual da prévia PRO do painel da exportação:

- moldura âmbar do Modo Foco (2 px, raio 14) em volta do jogador;
- selo **FULL HD** em Âmbar sobre `rgba(10,10,10,0.75)`, no canto superior direito;
- ícone de som em Âmbar, numa bolinha escura, logo abaixo do selo.

Se o editor não sobrepuser elementos, usar uma imagem só com tudo desenhado. Todo o conteúdo, do título ao rodapé, fica preso à parte de baixo da tela, e a foto preenche o espaço que sobra em cima. Conferido no iPhone 15 (393 × 852 pt), no 16 Pro (402 × 874 pt) e no 16 Pro Max (440 × 956 pt): o rodapé aparece sem rolar nos três.

## Texto

Em pt-BR. Termos do app: "gravação" é a sessão, "clipe" é o vídeo salvo e "lance" é a jogada, usado na copy de emoção.

### Oferta `default` (assinatura)

| Local | Texto |
|---|---|
| Título | SEUS LANCES (branco) / COM QUALIDADE PRO (Âmbar) |
| Subtítulo | Todos os recursos para gravar, editar e compartilhar. |
| Grade (2 × 4) | Full HD · Som no vídeo · Modo Foco · Sem marca d’água · Clipes de 60 s · Gravação em 4K · Compilar clipes · Apple Watch |
| Anual (em cima, pré-selecionado) | Anual + selo ECONOMIZE N% · Melhor custo-benefício · preço/ano, com o preço/mês embaixo |
| Mensal | Mensal · O mais escolhido · preço/mês |
| Botão | Anual com direito ao teste: Começar 7 dias grátis · nos outros casos: Assinar o PRO |
| Linha 1 embaixo do botão | Anual com teste: Grátis por 7 dias, depois PREÇO/ano. · Anual sem teste: PREÇO/ano, renovação automática. · Mensal: PREÇO/mês, renovação automática. |
| Linha 2 | Cancele quando quiser. |
| Rodapé | Restaurar · Termos · Privacidade |

Ícones da grade: tela HD, alto-falante, cantos de enquadramento, olho cortado, cronômetro, câmera de vídeo, vídeos empilhados, relógio.

### Oferta `pass` (Passe Avulso)

| Local | Texto |
|---|---|
| Título | LIBERAR (branco) / ESTA GRAVAÇÃO (Âmbar) |
| Subtítulo | Recursos PRO em todos os clipes desta gravação, sem assinatura. |
| Grade | Full HD · Som no vídeo · Modo Foco · Sem marca d’água · Compilar os clipes dela (linha inteira) |
| Produto (pré-selecionado) | Passe avulso · Vale só para esta gravação · preço |
| Botão | Liberar esta gravação |
| Embaixo do botão | Pagamento único, sem renovação automática. |
| Rodapé | Restaurar · Termos · Privacidade |

### Regras atrás do texto

- Gravações são ilimitadas nos dois planos: o paywall não fala em limite de gravações.
- O grátis grava em Full HD e mostra som e Modo Foco no app; o PRO vende o vídeo exportado (resolução, som, Modo Foco, sem marca), a gravação em 4K, as durações acima de 15 s, compilar e o Apple Watch.
- Não prometer velocidade, controle Bluetooth nem celular controle: são grátis.
- O Passe libera só a exportação e o compilar da gravação escolhida; não libera 4K, durações acima de 15 s nem o Apple Watch.
- Preço, moeda e percentual de economia vêm sempre da loja; não escrever valores no painel.

## Prompt para o editor do RevenueCat · oferta `default`

As instruções estão em inglês; os textos do paywall, em pt-BR, devem sair exatamente como estão.

```text
Create a dark, full-screen paywall for "Reprize PRO", a sports video app (beach tennis, futevôlei, beach volleyball). Language: Brazilian Portuguese. Use the copy below exactly; do not invent claims, numbers or testimonials beyond the copy below.

STYLE
- Background #0A0A0A. Cards and plan tiles #141414; resting border 1 px #2E2E2E. Text #FFFFFF; secondary text #B3B3B3.
- Single accent: amber #FFB000, with #0A0A0A text on amber. Never use red, blue, purple or gradients other than the photo fade.
- Headings: Barlow Condensed 800, uppercase, line height 1.0. Everything else: Manrope 600/700/800.
- Radii: tile 10, plan 14, button 16, badge 20. Spacing on a 4/8 grid. Full-width button, at least 52 px tall.

LAYOUT, TOP TO BOTTOM
1. Close button (X) top left, over the photo.
2. Hero: the current dark night-court photo, fading into #0A0A0A at the bottom. Anchor all the content below (title to footer) to the bottom of the screen and let the photo fill all the remaining space above it, so it grows on taller phones instead of leaving empty space. Over the photo: a 2 px amber rounded rectangle (radius 14) framing the player (the Focus Mode frame), a small badge "FULL HD" (amber text on rgba(10,10,10,0.75)) in the top right corner and, below it, a round speaker icon in amber on the same dark chip. If overlays are not possible, use one image with these elements drawn in.
3. Title, two lines: "SEUS LANCES" in white and "COM QUALIDADE PRO" in amber.
4. Subtitle in #B3B3B3: "Todos os recursos para gravar, editar e compartilhar."
5. Benefit grid, 2 columns × 4 rows. Each cell is a #141414 tile (radius 10) with an amber line icon on the left and a bold white label. No descriptions under the labels.
   - "Full HD" (HD/screen icon) | "Som no vídeo" (speaker icon)
   - "Modo Foco" (corner brackets / scan icon) | "Sem marca d’água" (eye-off icon)
   - "Clipes de 60 s" (timer icon) | "Gravação em 4K" (video camera icon)
   - "Compilar clipes" (stacked videos icon) | "Apple Watch" (watch icon)
6. Two full-width plan rows stacked vertically (keep the current layout), each a #141414 card (radius 14) with the plan name and a second line on the left and the store price on the right.
   - Top, Annual, PRESELECTED: 2 px amber border. Name "Anual" with an amber pill badge right after it showing the savings computed by RevenueCat against the monthly package, format "ECONOMIZE {percent}". Second line in #B3B3B3: "Melhor custo-benefício". On the right: "{annual price}/ano" in bold and, under it in small #B3B3B3, "{price per month}/mês".
   - Bottom, Monthly: 1 px #2E2E2E border. Name "Mensal". Second line in #B3B3B3: "O mais escolhido". Price on the right: "{monthly price}/mês".
7. Primary button (amber, #0A0A0A text), one line. Annual selected and trial eligible: "Começar 7 dias grátis". Otherwise: "Assinar o PRO".
8. Two short lines under the button, centered, #B3B3B3, small; the second line is always "Cancele quando quiser.". First line, annual with trial: "Grátis por 7 dias, depois {annual price}/ano." Annual without trial: "{annual price}/ano, renovação automática." Monthly: "{monthly price}/mês, renovação automática."
9. Footer links in #B3B3B3: "Restaurar · Termos · Privacidade".

RULES
- Only two packages: Annual and Monthly. Do not show the Single Pass here; it has its own offering.
- Prices, currency and the savings percentage always come from store variables; never type a price.
- Do not mention recording limits: recordings are unlimited on both plans.
- Do not list playback speed, the Bluetooth remote or the phone remote: they are free.
- Write the plan name as "PRO", in capitals, everywhere.
- Keep the footer "Restaurar · Termos · Privacidade" visible without scrolling on small phones.
```

## Prompt para o editor do RevenueCat · oferta `pass`

```text
Create a dark, full-screen paywall for the "Passe Avulso", a one-time purchase in Reprize, a sports video app. It unlocks PRO export quality for one recording (session) the player already made. Language: Brazilian Portuguese. Use the copy below exactly; do not invent claims or numbers.

STYLE
Identical to the PRO paywall: background #0A0A0A, cards #141414, text #FFFFFF and #B3B3B3, single accent amber #FFB000 with #0A0A0A text on it, Barlow Condensed 800 uppercase headings, Manrope for everything else, radii 10/14/16.

LAYOUT, TOP TO BOTTOM
1. Close button (X) top left.
2. Hero, same as the PRO paywall: content anchored to the bottom and the photo filling all the remaining space above it. The night-court photo with the amber Focus Mode frame, the "FULL HD" badge and the amber speaker chip, fading into #0A0A0A.
3. Title, two lines: "LIBERAR" in white and "ESTA GRAVAÇÃO" in amber.
4. Subtitle in #B3B3B3: "Recursos PRO em todos os clipes desta gravação, sem assinatura."
5. Benefit grid, same tiles as the PRO paywall (#141414, radius 10, amber line icon, bold white label), 2 columns:
   - "Full HD" (HD/screen icon) | "Som no vídeo" (speaker icon)
   - "Modo Foco" (corner brackets / scan icon) | "Sem marca d’água" (eye-off icon)
   - "Compilar os clipes dela" (stacked videos icon), spanning both columns
6. One full-width product row, same style as the PRO plan rows and preselected (2 px amber border): name "Passe avulso", second line in #B3B3B3 "Vale só para esta gravação", the store price on the right.
7. Primary button (amber, #0A0A0A text): "Liberar esta gravação".
8. Under the button, centered, #B3B3B3, small: "Pagamento único, sem renovação automática."
9. Footer links in #B3B3B3: "Restaurar · Termos · Privacidade".

RULES
- Only the single_pass package. No subscription plans and no trial text.
- The price always comes from the store variable; never type a price.
- Keep the footer "Restaurar · Termos · Privacidade" visible without scrolling on small phones.
```

## Depois de publicar

1. Preços do Brasil: Anual R$ 99,90, Mensal R$ 14,90 e Passe R$ 4,90. Conferir nas lojas antes de publicar.
2. Conferir se o teste de 7 dias está ativo no `pro_annual` nas duas lojas. Sem ele, o botão mostra "Assinar o PRO".
3. Abrir os dois paywalls no aparelho (`presentPaywall`), não só no preview do painel: fonte, selo de economia (44% no Brasil), texto do teste com e sem direito a ele, botão trocando entre anual e mensal e rodapé visível num iPhone de 6,1".
