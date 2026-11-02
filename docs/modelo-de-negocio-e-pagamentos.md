# Modelo de negócio e pagamentos

> **Fonte da verdade** das regras de plano. Detalhes técnicos da cobrança: `docs/superpowers/specs/2026-10-20-payments-revenuecat-design.md`. Textos e visual do paywall: `docs/brand/paywall-reprize.md`.
>
> **Status:** implementado no app (branch `feat/freemium-pro-billing`); faltam a configuração do RevenueCat e das lojas e desligar o teste de campo antes de publicar ([Implementação](#implementação)).

## Resumo

Gravações **ilimitadas** no grátis. Dentro do app, todo jogador vê e usa tudo na qualidade gravada, com som, Modo Foco e velocidade. O plano muda só estas coisas:

1. a **duração do clipe** e a **gravação em 4K**, escolhidas antes de começar a gravação (grátis: 15 s e Full HD);
2. **o que sai do app** ao salvar ou enviar (grátis: HD, sem som, sem Modo Foco e com marca d'água);
3. **compilar clipes**;
4. o gatilho **Apple Watch**.

Antes de exportar no grátis, o jogador sempre vê o que o PRO coloca no vídeo (Full HD, som, Modo Foco, sem marca d'água): um painel destacado na primeira exportação de cada gravação e um aviso discreto nas seguintes. A copy destaca o que o PRO entrega e diz com clareza, numa frase, o que o vídeo grátis daquele clipe não leva. Nenhuma trava aparece de surpresa.

## Planos

| Recurso | Grátis | PRO |
|---|---|---|
| Gravações | **Ilimitadas** | Ilimitadas |
| Clipes por gravação | Ilimitados | Ilimitados |
| Qualidade da gravação | **Full HD** (4K com cadeado "PRO") | Full HD ou 4K, a que o jogador escolher |
| Áudio na gravação | Gravado | Gravado |
| Duração do clipe | **15 s** (as outras opções com cadeado "PRO") | 15, 30, 45 ou 60 s, a que o jogador escolher |
| Prévia e editor no app | Tudo funciona: som, Modo Foco, velocidade, zoom, girar, cortar | Igual |
| Exportação (salvar, enviar, em lote) | **HD** (720×1280; 1280×720 deitado), **sem som**, **sem Modo Foco**, **com marca d'água discreta**; a velocidade escolhida vai no vídeo | Full HD (4K ou 2K num clipe gravado em 4K), som, Modo Foco, velocidade, sem marca |
| Compilar clipes | Bloqueado (abre o paywall) | Liberado |
| Gatilhos | Tela, voz, gesto, controle Bluetooth, celular controle | Todos, **incluindo o Apple Watch** |

Livres nos dois planos, inclusive no vídeo exportado: velocidade (câmera lenta e acelerada), zoom, girar, cortar, salvar e enviar (um clipe ou em lote).

**Nome do gatilho:** o gatilho do relógio se chama **Apple Watch** em todos os textos do iPhone.

**Termos:** **gravação** é a sessão, do "Começar gravação" ao "Encerrar"; **clipe** é o vídeo salvo (duração do clipe, editor, exportar, compilar clipes); **lance** é a jogada e entra na copy de emoção, como "melhores lances" e "salvar o lance".

### Duração e janela de gravação

- O jogador escolhe a duração do clipe na preparação: **15, 30, 45 ou 60 s** (padrão 15 s; no grátis só 15 s).
- Durante a gravação, o app guarda só uma janela recente na memória e apaga o resto na hora: **60 s no PRO, 15 s no grátis**.
- Cada clipe salvo guarda no arquivo **a duração escolhida mais 2 s de margem** (`KEEP_MARGIN_MS`, em `session/cut.ts`), para o editor ter folga no começo. O corte nunca volta antes do fim do clipe anterior e tem no mínimo 3 s.

## Transparência das travas

O jogador vê o que é PRO antes de exportar, em três lugares:

- **Preparação:** a duração acima de 15 s, a qualidade 4K e o Apple Watch têm cadeado e selo "PRO"; tocar abre o paywall. Nada começa sozinho depois de uma compra.
- **Editor (gravação grátis):** Som e Modo Foco funcionam, com selo "PRO" e a dica "O som toca aqui no app, mas só vai no clipe salvo ou enviado com o PRO" (o mesmo para o Modo Foco). A prévia mostra a marca d'água.
- **Aviso antes de exportar** (salvar ou enviar, um clipe ou em lote), contado **por gravação**:
  - **Painel destacado na primeira exportação de cada gravação:** título único conforme o botão tocado (Salvar: "Salve seus clipes com qualidade PRO"; Enviar: "Envie seus clipes com qualidade PRO"). Logo abaixo, um selo diz o que o clipe tem e o vídeo grátis deixa de fora: "Seu clipe tem som", "Seu clipe tem Modo Foco" ou "Seu clipe tem som e Modo Foco" ("Seus clipes têm…" no lote); sem selo quando o clipe não tem nenhum dos dois. Em seguida, **duas prévias do próprio clipe**, lado a lado:
    - **GRÁTIS:** imagem escurecida, selo HD, som cortado e marca d'água; lista "Sem som", "Sem Modo Foco", "HD", "Com marca d'água".
    - **PRO:** borda âmbar, selo Full HD, som e o quadro do Modo Foco quando o clipe usa; lista "Com som", "Modo Foco", "Full HD", "Sem marca d'água".
    - O que o clipe usa vem primeiro nas duas listas e, no grátis, em vermelho.
    - Ações: **Liberar tudo com o PRO** (botão principal, sem legenda; planos e teste ficam no paywall) · **Liberar só esta gravação**, com a linha "Passe Avulso · vale para os N clipes dela" (o Passe; abre "Liberar recursos PRO nessa gravação") · **Continuar no plano grátis** (link) · **X** para cancelar.
  - **Aviso discreto nas exportações seguintes da mesma gravação:** uma linha curta que não interrompe ("Salvo em HD, sem som, sem Modo Foco e com marca d'água." ou "Enviado em…"; sem som só quando o clipe tem som) com a ação **Liberar**; a exportação segue sem toque extra.
  - Exemplo: 5 gravações numa manhã de basquete. O primeiro clipe exportado de cada uma das 5 mostra o painel destacado; do segundo clipe em diante, cada gravação mostra o aviso discreto. Uma exportação em lote conta como uma exportação daquela gravação.

Compilar no grátis abre o paywall direto.

## Como se paga

- **PRO** (assinatura, entitlement `pro`): `pro_monthly` **R$ 14,90/mês** e `pro_annual` **R$ 99,90/ano** (≈ R$ 8,33/mês, 44% abaixo de 12 mensalidades). **Teste grátis de 7 dias só no anual.**
- **Passe Avulso** (consumível, `single_pass`, **R$ 4,90**), apresentado como **"Liberar recursos PRO nessa gravação"**:
  - é usado **só quando o jogador escolhe**, numa gravação grátis já feita; nunca é gasto sozinho ao começar uma gravação;
  - libera nessa gravação a exportação em Full HD, com som, com Modo Foco, sem marca, e compilar os clipes dela;
  - não libera duração acima de 15 s nem 4K, porque a gravação foi feita em 15 s e Full HD;
  - um Passe comprado e ainda não usado fica guardado para a próxima vez que o jogador escolher liberar uma gravação.
- **Paywall** (RevenueCat): a oferta `default` tem só Anual (pré-selecionado, com preço mensal equivalente e selo de economia calculado pelo painel) e Mensal. O Passe fica numa oferta própria (`pass`), aberta por "Liberar recursos PRO nessa gravação".
- Preço e moeda vêm sempre da loja; nenhum valor no código.

## Como o app decide

- **Ao começar uma gravação** (`startPlan`): PRO ativo → gravação paga; senão → gravação grátis. O plano nunca impede de começar.
- O plano da gravação fica **fixado no início** (`Session.paid`). Com PRO ativo, todas as gravações exportam como pagas enquanto ele durar (`useViewPlan`); uma gravação grátis liberada com o Passe passa a ser paga.
- Nada de cobrança durante a gravação.

## Depois de publicar

Tudo é teste até a publicação. Depois de publicar, os números (conversão por ponto de venda, uso do aviso de exportação, compras de Passe) decidem os ajustes. Se for preciso limitar o grátis, o limite de gravações vale só para quem instalar a partir dali; quem já usa fica como está.

## Implementação

- [x] `payments/rules.ts` e `payments/types.ts`: `startPlan` só com PRO → grátis; sair o teto mensal (`FREE_RECORDINGS_PER_MONTH`, `monthKey`, `freeLeft`), o kind `blocked` e o kind `credit` (o Passe não é mais gasto no início).
- [x] `data/repo.ts` e `payments/store.ts`: sair o contador `freeCount` e a reconferência do mês.
- [x] `session/useReplaySession.ts`, `app/setup.tsx` e `session/RemoteStartListener.tsx`: sair o início bloqueado, a linha "Restam N gravações grátis" e a linha "Seu Passe Avulso será usado nesta gravação".
- [x] Apple Watch e celular controle: sem aviso de limite mensal (não havia `startAllowed` no código).
- [x] `payments/limits.ts`: `captureConfig` e `qualityAllowed` continuam (grátis em Full HD, 4K só no pago, 15 s); `PAID_TRIGGERS = ['watch']`. Conferir os cadeados "PRO" do 4K e das durações acima de 15 s na preparação.
- [x] Exportação grátis em HD: 720 incluído em `share/exportSize.ts` (`ShortSide`, `FREE_SIDE`, estimativa de tamanho); o grátis não oferece escolha de tamanho em `app/clip/[id].tsx`.
- [x] `share/exportOptions.ts`: grátis em 720, com a velocidade escolhida (sai o `speed = 1` do grátis), sem som, sem Modo Foco, com marca; pago em Full HD ou 4K/2K; `freeLosses` inclui a resolução e tira a velocidade.
- [x] `components/FreeExportSheet.tsx` e `components/useFreeExportGate.tsx`: painel destacado na primeira exportação de cada gravação e aviso discreto, sem interromper, nas seguintes; o mesmo no salvar e enviar em lote; ação "Liberar recursos PRO nessa gravação".
- [x] Guardar por gravação que o painel já apareceu (`Session.freeNoticeShown`, em `data/schema.ts` e `data/repo.ts`).
- [x] `payments/unlock.ts`: Passe guardado ou compra pela oferta `pass`; o Passe comprado nesse fluxo é usado na gravação.
- [x] Editor: selo "PRO" em Som e Modo Foco numa gravação grátis; Velocidade sem selo.
- [x] Marca d'água discreta no grátis (redesenho em `share/ShareOverlay.tsx`).
- [x] Textos pt-BR e en (`src/i18n/locales/*.ts`, `locales/*.json`): conferir a regra de termos (clipe = vídeo salvo; lance = jogada e copy, como "melhores lances"); "Relógio" → "Apple Watch"; sair os textos de teto mensal e de Passe no início; revisar `summary.freeNote`, `games.proMessage`, `unlock.message`, `clip.focusPro`, `clip.speedFree` (sai), `clip.soundFree`, `freeExport.*`, `setup.watchProOnly`, `setup.proOnly`.
- [x] Testes: `rules`, `store`, `snapshot`, `unlock`, `setup`, `session`, `useFreeExportGate`, `exportOptions`.
- [ ] RevenueCat e lojas: oferta `default` com Anual (pré-selecionado) e Mensal; oferta `pass` com o `single_pass`; teste de 7 dias só no `pro_annual`; paywall e descrições conforme `docs/brand/paywall-reprize.md`.
- [ ] `FIELD_TEST_UNLOCK_ALL` em `false` antes de publicar.
- [x] Rodar `npx jest`, `npx tsc --noEmit` e `npx expo lint` em `app/`.

## Onde fica cada regra

| Regra | Onde fica |
|---|---|
| Decisão do início (PRO → grátis) | `payments/rules.ts` (`startPlan`) |
| 15 s no grátis (`FREE_MAX_SECONDS`) e Full HD no grátis, aplicados na captura | `payments/limits.ts` (`captureConfig`, `qualityAllowed`) e preparação em `app/setup.tsx` |
| Durações oferecidas e janela de gravação | `data/schema.ts` (`CLIP_SECONDS_OPTIONS`, `BUFFER_SECONDS`) e `modes/registry.ts` |
| Margem de 2 s por clipe salvo | `session/cut.ts` (`KEEP_MARGIN_MS`, `keepMsFor`) |
| Gatilho pago (`PAID_TRIGGERS = ['watch']`) | `payments/limits.ts` (`triggerAllowed`), usado em `app/setup.tsx` e `session/SessionContext.tsx` |
| Resolução, som, Modo Foco e marca d'água na exportação | `share/exportOptions.ts` e `share/exportSize.ts`; a marca é desenhada por `share/ShareOverlay.tsx` |
| Aviso antes de exportar no grátis | `components/FreeExportSheet.tsx` + `components/useFreeExportGate.tsx`, chamados por `app/clip/[id].tsx` e pelas ações em lote em `app/session/[id].tsx` |
| Compilar pago | `share/useBatchActions.ts` (`compile`) e `canCompile` em `payments/limits.ts` |
| Liberar recursos PRO numa gravação (Passe) | `payments/unlock.ts` |
| Plano na tela | `usePlan` e `useViewPlan`, em `share/entitlement.ts` |

## Ao mudar uma regra

1. Altere a constante ou função no arquivo da tabela acima.
2. Rode `npx jest`, `npx tsc --noEmit` e `npx expo lint` em `app/`.
3. Revise os textos nos dois idiomas.
4. Atualize este documento, a ficha do paywall, o spec de pagamentos e a seção de monetização de `docs/superpowers/specs/2026-10-17-lance-design.md`.
