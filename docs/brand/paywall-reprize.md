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
| Faltavam Full HD, som no clipe e 4K | entram na grade | São o que o PRO mais vende |
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

A foto escura de quadra à noite, escurecendo até Ink `#0A0A0A` na emenda com o conteúdo, sem nada sobreposto: sem moldura, selo ou ícone. Os benefícios ficam só na grade. Todo o conteúdo, do título ao rodapé, fica preso à parte de baixo da tela, e a foto preenche o espaço que sobra em cima. Conferido no iPhone 15 (393 × 852 pt), no 16 Pro (402 × 874 pt) e no 16 Pro Max (440 × 956 pt): o rodapé aparece sem rolar nos três.

## Texto

Em pt-BR. Termos do app: "gravação" é a sessão, "clipe" é o vídeo salvo e "lance" é a jogada, usado na copy de emoção.

### Oferta `default` (assinatura)

| Local | Texto |
|---|---|
| Título | SEUS LANCES (branco) / COM QUALIDADE PRO (Âmbar) |
| Subtítulo | Todos os recursos para gravar, editar e compartilhar. |
| Grade (2 × 4) | Full HD · Som no clipe · Modo Foco · Sem marca d’água · Clipes de até 60s · Gravação em Full HD ou 4K · Compilar clipes · Apple Watch |
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
Update the current paywall. Use the attached image as the layout reference. Keep everything that already matches it and fix only the points below. Language: Brazilian Portuguese; use the copy exactly as written.

1. HERO PHOTO: remove every overlay from the photo: the amber rectangle, the "FULL HD" label and the speaker icon. The photo stays clean and fades into #0A0A0A at the bottom. All content (title to footer) stays anchored to the bottom of the screen and the photo fills the space above it.

2. TEXT UNDER THE BUTTON: always two lines, centered, #B3B3B3, 13 px, so it never looks empty.
   - Line 1, depends on the selected package and must never be blank:
     - Annual, eligible for the introductory offer: "Grátis por 7 dias, depois {{ product.price_per_period_abbreviated }}."
     - Annual, not eligible: "{{ product.price_per_period_abbreviated }}, renovação automática."
     - Monthly: "{{ product.price_per_period_abbreviated }}, renovação automática."
   - Line 2, always: "Cancele quando quiser."

3. BUTTON: when the Annual package is selected and the user is eligible for the introductory offer, the label is "Começar 7 dias grátis". In every other case: "Assinar o PRO".

4. SAVINGS BADGE on the Annual row: "ECONOMIZE {{ product.relative_discount }}", computed against the Monthly package (the most expensive per period, so the offering must contain only Annual and Monthly). Never type the number.

5. ICONS in the benefit grid, amber line icons:
   - "Full HD": a rounded rectangle with "HD" inside (not a camera)
   - "Som no clipe": speaker with sound waves
   - "Modo Foco": four corner brackets with a dot in the center
   - "Sem marca d’água": eye with a slash
   - "Clipes de até 60s": stopwatch
   - "Gravação em Full HD ou 4K": video camera. This is the only label on two lines: break it as "Gravação em" / "Full HD ou 4K", and the tile next to it ("Clipes de até 60s") gets the same height
   - "Compilar clipes": two stacked video frames with a play triangle
   - "Apple Watch": a smartwatch (not a pulse line)

6. TYPE: title "SEUS LANCES" (white) / "COM QUALIDADE PRO" (amber #FFB000) in Barlow Condensed 800, uppercase, line height 1.0, about 40 px. Everything else in Manrope.

7. CLOSE BUTTON: top left, 32 px, dark translucent circle with a white X.

8. FOOTER: keep "Restaurar · Termos · Privacidade" in #B3B3B3, 13 px, above the home indicator, with at least 12 px between it and the text under the button.

Keep unchanged: subtitle "Todos os recursos para gravar, editar e compartilhar.", the 2 × 4 grid, the two stacked plan rows ("Anual" preselected with "Melhor custo-benefício" and the monthly price under the annual price; "Mensal" with "O mais escolhido"), colors #0A0A0A, #141414, #2E2E2E, #FFFFFF, #B3B3B3 and the single amber accent. Only the Annual and Monthly packages; no Single Pass. Prices always come from store variables.
```

## Prompt para o editor do RevenueCat · oferta `pass`

Anexar a imagem de referência do Passe.

```text
Create a paywall for the "pass" offering with exactly the same look as the PRO paywall in the "default" offering (copy its components and styles). Use the attached image as the layout reference. Language: Brazilian Portuguese; use the copy exactly as written.

- Same hero photo, clean, with no overlays (no frames, labels or icons), fading into #0A0A0A. Content anchored to the bottom; the photo fills the space above it.
- Close button top left, same as the PRO paywall.
- Title in Barlow Condensed 800, uppercase: "LIBERAR" (white) / "ESTA GRAVAÇÃO" (amber #FFB000).
- Subtitle, #B3B3B3: "Recursos PRO em todos os clipes desta gravação, sem assinatura."
- Benefit grid, same tiles and icons as the PRO paywall, 2 columns: "Full HD" | "Som no clipe"; "Modo Foco" | "Sem marca d’água"; "Compilar os clipes dela" spanning both columns.
- One product row, preselected (2 px amber border), same style as the PRO plan rows: "Passe avulso", second line "Vale só para esta gravação", price {{ product.price }} on the right.
- Primary button, amber with #0A0A0A text: "Liberar esta gravação".
- Under the button, centered, #B3B3B3, 13 px: "Pagamento único, sem renovação automática."
- Footer: "Restaurar · Termos · Privacidade", same as the PRO paywall.

Only the single_pass package. No subscription plans and no trial text. The price always comes from the store variable.
```

## Depois de publicar

1. Preços do Brasil: Anual R$ 99,90, Mensal R$ 14,90 e Passe R$ 4,90. Conferir nas lojas antes de publicar.
2. Conferir se o teste de 7 dias está ativo no `pro_annual` nas duas lojas. Sem ele, o botão mostra "Assinar o PRO".
3. Abrir os dois paywalls no aparelho (`presentPaywall`), não só no preview do painel: fonte, selo de economia (44% no Brasil), texto do teste com e sem direito a ele, botão trocando entre anual e mensal e rodapé visível num iPhone de 6,1".
