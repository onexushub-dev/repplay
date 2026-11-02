# Paywall Reprize: ficha para o painel do RevenueCat

Aplicar nas ofertas `default` (Pro) e `pass` (Passe Avulso), em Paywalls, no painel. Valores da paleta Placar (guia de marca do Reprize, `docs/brand/reprize/`) e de `app/src/theme/tokens.ts`.

## O que muda em relação à versão atual

| Elemento | Hoje | Reprize |
|---|---|---|
| Fundo da página | azul-marinho `#0F1226`-ish | **Ink `#0A0A0A`** |
| Cartões e planos (fundo) | azul acinzentado | **Surface `#141414`** |
| Plano selecionado (borda e fundo) | borda ciano, fundo azul | borda **Âmbar `#FFB000`** 2 px, fundo Surface |
| Selo de economia | ciano com texto escuro | fundo **Âmbar**, texto **Ink** |
| Ícones dos benefícios | ciano sobre azul | **Âmbar** sobre Surface |
| Botão "Go Pro" | **vermelho coral** | fundo **Âmbar**, texto **Ink** |
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

### Oferta `default` (Pro)

| Local | Texto |
|---|---|
| Título | SEUS MELHORES LANCES, COMO VOCÊ VIU |
| Subtítulo | No app você vê tudo. Com o Pro, o vídeo salvo também tem. |
| Benefício 1 | **Full HD com som, e gravação em 4K**: o vídeo salvo sai como você viu no app. |
| Benefício 2 | **Modo Foco e sem marca d'água**: enquadramento automático e nenhum logo nos seus lances. |
| Benefício 3 | **Clipes de até 60 s e compilações**: o ponto inteiro e seus melhores lances num vídeo só. |
| Benefício 4 | **Apple Watch**: salve o lance pelo pulso. |
| Plano anual (pré-selecionado) | Anual · SEU PREÇO LOCAL/ano · preço mensal equivalente · selo de economia · "7 dias grátis" |
| Plano mensal | Mensal · cancele quando quiser (sem teste grátis) |
| Botão | Anual: Começar 7 dias grátis · Mensal: Assinar |
| Rodapé | Renova sozinho. Cancele quando quiser. Restaurar · Termos · Privacidade |

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
- O grátis grava em Full HD e mostra som e Modo Foco no app; o Pro vende o que sai do app (resolução, som, Modo Foco, sem marca), a gravação em 4K, as durações acima de 15 s, compilar e o Apple Watch.
- Não prometer controle Bluetooth, celular controle nem velocidade: são grátis.
- A oferta `default` tem só Anual e Mensal. O Passe fica na oferta `pass`, aberta por "Liberar recursos PRO nessa gravação".
- Preço e moeda vêm sempre da loja; não escrever valores no painel. O selo de economia só aparece se o painel calcular a diferença sozinho (o anual de R$ 99,90 contra 12 mensalidades de R$ 14,90 dá 44%).

## Observações

1. Preços do Brasil: Anual R$ 99,90, Mensal R$ 14,90 e Passe R$ 4,90. Confira se as lojas têm os preços certos antes de publicar.
2. O texto "Go Pro" e "Pro" devem seguir o nome do plano no app. Os cadeados do app já usam "Pro".
3. Depois de publicar, abrir o paywall no aparelho (`presentPaywall`) e conferir o botão, o selo e os ícones, porque o preview do painel nem sempre mostra a fonte real.
