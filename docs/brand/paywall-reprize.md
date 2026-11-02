# Paywall Reprize: ficha para o painel do RevenueCat

São dois paywalls com o mesmo visual: o da assinatura, na oferta `default` (PRO, só Anual e Mensal), e o do Passe Avulso, na oferta `pass`. Valores da paleta Placar (guia de marca do Reprize, `docs/brand/reprize/`) e de `app/src/theme/tokens.ts`. Regras de cobrança: `docs/modelo-de-negocio-e-pagamentos.md`.

O app abre a oferta `default` pelos cadeados PRO (preparação, compilar, Apple Watch) e pelo "Liberar tudo com o PRO" do painel da exportação, e a oferta `pass` pelo "Liberar só esta gravação" do mesmo painel.

## O que muda em relação à versão publicada

| Hoje | Agora | Por quê |
|---|---|---|
| "Desbloqueie os recursos PRO" | **SEUS LANCES / COM QUALIDADE PRO** | Mesma expressão do painel da exportação ("Salve seus clipes com qualidade PRO") |
| Seis frases de benefício | Grade de 7 blocos, ícone e poucas palavras | Padrão do onboarding e do painel: menos texto, mais ícone |
| "Gravações ilimitadas, com todos os recursos" | removido | As gravações são ilimitadas nos dois planos |
| "… som e controle de velocidade" | sem a velocidade | A velocidade é grátis |
| "Relógio (Apple Watch) como gatilho" | **Apple Watch** | Sem jargão |
| Faltavam Full HD, som no clipe e 4K | entram na grade | São o que o PRO mais vende |
| Selo "ECONOMIZE 19%" | **ECONOMIZE 44%** (calculado pelo painel contra o mensal) | 99,90 contra 12 × 14,90 dá 44%; o selo usava outra base |
| Passe avulso como terceira linha da assinatura | oferta própria (`pass`) | Não libera 4K, 60 s nem Apple Watch; quem chega pelo cadeado do 4K compraria algo que não resolve |
| Teste de 7 dias não aparecia | "Grátis por 7 dias, depois PREÇO/ano." embaixo do botão | A Apple exige o valor cobrado depois do teste |
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

## Imagem de fundo

A mesma foto de quadra à noite nos dois paywalls, como fundo da tela inteira: começa na borda de cima (atrás da barra de status e do X) e não tem nada sobreposto (sem moldura, selo ou ícone; os benefícios ficam só na grade). O jogador aparece inteiro, centralizado, ocupando cerca de 40% da altura da tela, entre a barra de status e o título.

Todo o conteúdo, do título ao rodapé, fica preso à parte de baixo e é desenhado por cima da foto. Um degradê garante a leitura: transparente até uns 60 px acima do título, `#0A0A0A` a 85% atrás do título e do subtítulo, e `#0A0A0A` sólido da grade para baixo. Não há faixa vazia nem borda reta entre a foto e o título. O X fica sobre a foto, num círculo escuro translúcido.

Conferido no iPhone 15 (393 × 852 pt), no 16 Pro (402 × 874 pt) e no 16 Pro Max (440 × 956 pt): o rodapé aparece sem rolar nos três.

## Texto

Em pt-BR. Termos do app: "gravação" é a sessão, "clipe" é o vídeo salvo e "lance" é a jogada, usado na copy de emoção.

### Oferta `default` (assinatura)

| Local | Texto |
|---|---|
| Título | SEUS LANCES (branco) / COM QUALIDADE PRO (Âmbar) |
| Subtítulo | Todos os recursos para gravar, editar e compartilhar. |
| Grade | Gravação em Full HD ou 4K (linha inteira) · Som no clipe · Modo Foco · Sem marca d’água · Clipes de até 60s · Compilar clipes · Apple Watch |
| Anual (em cima, pré-selecionado) | Anual + selo ECONOMIZE N% · Melhor custo-benefício · preço/ano, com o preço/mês embaixo |
| Mensal | Mensal · O mais escolhido · preço/mês |
| Botão | Assinar o PRO (nos dois planos; o teste aparece só na linha embaixo do botão) |
| Linha 1 embaixo do botão | Com direito ao teste (anual ou mensal): Grátis por 7 dias, depois PREÇO/ano (ou /mês). · Sem direito: PREÇO/ano (ou /mês), renovação automática. |
| Linha 2 | Cancele quando quiser. |
| Rodapé | Restaurar · Termos · Privacidade |

Ícones da grade: tela HD, alto-falante, cantos de enquadramento, olho cortado, cronômetro, câmera de vídeo, vídeos empilhados, relógio.

### Oferta `pass` (Passe Avulso)

| Local | Texto |
|---|---|
| Título | LIBERAR (branco) / ESTA GRAVAÇÃO (Âmbar) |
| Subtítulo | Recursos PRO em todos os clipes desta gravação, sem assinatura. |
| Grade | Full HD · Som no clipe · Modo Foco · Sem marca d’água · Compilar os clipes dela (linha inteira) |
| Produto (pré-selecionado) | Passe avulso · Vale só para esta gravação · preço |
| Botão | Liberar esta gravação |
| Embaixo do botão | Pagamento único, sem renovação automática. |
| Rodapé | Restaurar · Termos · Privacidade |

### Regras atrás do texto

- Gravações são ilimitadas nos dois planos: o paywall não fala em limite de gravações.
- O grátis grava em Full HD e mostra som e Modo Foco no app; o PRO vende o clipe exportado (resolução, som, Modo Foco, sem marca), a gravação em 4K, as durações acima de 15 s, compilar e o Apple Watch.
- Não prometer velocidade, controle Bluetooth nem celular controle: são grátis.
- O Passe libera só a exportação e o compilar da gravação escolhida; não libera 4K, durações acima de 15 s nem o Apple Watch.
- Preço, moeda e percentual de economia vêm sempre da loja; não escrever valores no painel.

## Prompt para o editor do RevenueCat · oferta `default`

As instruções estão em inglês; os textos do paywall, em pt-BR, devem sair exatamente como estão. Anexar a imagem de referência da assinatura.

```text
Update the paywall of the "default" offering to match the attached image exactly. The photo in the image is a placeholder: keep the current hero photo. Language: Brazilian Portuguese; use the copy exactly as written and do not invent claims, numbers or testimonials.

STYLE
- Background #0A0A0A. Tiles and plan rows #141414; resting border 1 px #2E2E2E. Text #FFFFFF; secondary text #B3B3B3.
- Single accent: amber #FFB000, with #0A0A0A text on amber. No red, blue, purple or gradients other than the photo fade.
- Title: Barlow Condensed 800, uppercase, line height 1.0, about 40 px. Everything else: Manrope 600/700/800.
- Radii: tile 10, plan row 14, button 16, badge 20. Spacing on a 4/8 grid. Full-width button, at least 52 px tall.

LAYOUT, TOP TO BOTTOM
1. Close button top left: 32 px dark translucent circle with a white X.
2. Hero: the current night-court photo, clean, with no overlays (no frames, labels or icons), fading into #0A0A0A at the bottom. All content below (title to footer) is anchored to the bottom of the screen and the photo fills the space above it.
3. Title, two lines: "SEUS LANCES" (white) / "COM QUALIDADE PRO" (amber).
4. Subtitle, #B3B3B3: "Todos os recursos para gravar, editar e compartilhar."
5. Benefit grid, 7 tiles, each with an amber line icon and a bold white label on one line, no descriptions:
   - First row, spanning both columns: "Gravação em Full HD ou 4K" (video camera icon)
   - "Som no clipe" (speaker with sound waves) | "Modo Foco" (four corner brackets with a dot in the center)
   - "Sem marca d’água" (eye with a slash) | "Clipes de até 60s" (stopwatch)
   - "Compilar clipes" (two stacked video frames with a play triangle) | "Apple Watch" (smartwatch, not a pulse line)
6. Two full-width plan rows stacked vertically, name and second line on the left, price on the right:
   - Top, Annual, PRESELECTED, 2 px amber border: "Anual" followed by an amber pill badge "ECONOMIZE {{ product.relative_discount }}"; second line "Melhor custo-benefício"; on the right "{{ product.price_per_period_abbreviated }}" in bold and, under it in small #B3B3B3, "{{ product.price_per_month }}/mês".
   - Bottom, Monthly, 1 px #2E2E2E border: "Mensal"; second line "O mais escolhido"; on the right "{{ product.price_per_period_abbreviated }}".
7. Primary button, amber with #0A0A0A text, one line: always "Assinar o PRO", for both packages. The free trial is told only in the text under the button.
8. Text under the button: one text component of two lines, centered, #B3B3B3, 13 px, never blank. It reads the selected package.
   - Default text (always shown): "{{ product.price_per_period_abbreviated }}, renovação automática." / "Cancele quando quiser."
   - Override with the condition "eligible for introductory offer" (any selected package, Annual or Monthly, when the user is eligible): "Grátis por 7 dias, depois {{ product.price_per_period_abbreviated }}." / "Cancele quando quiser."
9. Footer: "Restaurar · Termos · Privacidade", #B3B3B3, 13 px. Respect the bottom safe area and add 16 px of bottom padding so it sits above the home indicator, with 12 px between it and the text above.

RULES
- Both Annual and Monthly have a 7-day free trial; the store charges on day 8. Do not add any other trial text.
- Only the Annual and Monthly packages; no Single Pass (it has its own offering). The savings badge is computed against the Monthly package, so the offering must contain only these two.
- Prices, currency and the savings percentage always come from store variables; never type a number.
- Write the plan name as "PRO", in capitals.
- The footer must be visible without scrolling on a 6.1" iPhone.
```

## Prompt para o editor do RevenueCat · oferta `pass`

Anexar a imagem de referência do Passe.

```text
Create the paywall of the "pass" offering with exactly the same look as the paywall of the "default" offering (copy its components and styles), matching the attached image. The photo in the image is a placeholder: use the same hero photo as the "default" paywall. Language: Brazilian Portuguese; use the copy exactly as written and do not invent claims or numbers.

LAYOUT, TOP TO BOTTOM
1. Close button top left, same as the "default" paywall.
2. Hero: the same night-court photo, clean, with no overlays, fading into #0A0A0A. Content anchored to the bottom; the photo fills the space above it.
3. Title, Barlow Condensed 800, uppercase, two lines: "LIBERAR" (white) / "ESTA GRAVAÇÃO" (amber #FFB000).
4. Subtitle, #B3B3B3: "Recursos PRO em todos os clipes desta gravação, sem assinatura."
5. Benefit grid, same tiles and icons as the "default" paywall, each label on one line:
   - "Full HD" (rounded rectangle with "HD" inside) | "Som no clipe" (speaker with sound waves)
   - "Modo Foco" (four corner brackets with a dot) | "Sem marca d’água" (eye with a slash)
   - Spanning both columns: "Compilar os clipes dela" (two stacked video frames with a play triangle)
6. One full-width product row, preselected, 2 px amber border, same style as the plan rows: "Passe avulso"; second line "Vale só para esta gravação"; "{{ product.price }}" on the right.
7. Primary button, amber with #0A0A0A text: "Liberar esta gravação".
8. Under the button, centered, #B3B3B3, 13 px: "Pagamento único, sem renovação automática."
9. Footer: "Restaurar · Termos · Privacidade", same as the "default" paywall.

RULES
- Only the single_pass package. No subscription plans, no savings badge and no trial text.
- The price always comes from the store variable; never type a number.
- The footer must be visible without scrolling on a 6.1" iPhone.
```

## Depois de publicar

1. Preços: Brasil, Anual R$ 99,90, Mensal R$ 14,90 e Passe R$ 4,90; EUA, Anual $49.90, Mensal $6.90 e Passe $2.49. Conferir nas lojas antes de publicar. Selo esperado: 44% no Brasil e 40% (ou 39%) nos EUA.
2. Criar o teste de 7 dias no `pro_annual` e no `pro_monthly` nas duas lojas (App Store Connect: oferta introdutória gratuita de 1 semana; Play Console: oferta de teste grátis de 7 dias em cada plano base). A cobrança acontece no oitavo dia.
3. Abrir os dois paywalls no aparelho (`presentPaywall`), não só no preview do painel: fonte, selo de economia (44% no Brasil, 40% nos EUA), texto do teste com e sem direito a ele, botão trocando entre anual e mensal e rodapé visível num iPhone de 6,1".
