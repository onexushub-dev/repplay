# Pagamentos com RevenueCat: 5 gravações grátis por mês, Passe Avulso e Premium (mensal e anual)

> Revisão final de 2026-10-23: o plano grátis passa a ter **5 gravações por mês calendário**, cada uma com os limites de clipe; esgotadas as 5, "Começar gravação" abre o paywall. Entra o **Pro Anual**. Substitui a versão anterior do mesmo dia (gravações grátis ilimitadas, só com limites de clipe) e a de 2026-10-22 (primeira gravação grátis, pagar antes da segunda). Plano de implementação: `docs/superpowers/plans/2026-10-23-payments-free-limits.md`.

## Objetivo
Ligar a cobrança do spec principal (`2026-10-17-lance-design.md`, seção 6) ao app:
- **Plano grátis:** **5 gravações por mês calendário** neste aparelho. Uma gravação é uma sessão, do "Começar gravação" ao "Encerrar", com quantos clipes o jogador quiser. Cada gravação grátis tem limites: clipe de no máximo **15 s** (buffer de 15 s na captura), **exportação em HD (720p) e sem som**, e só três gatilhos. (Revisão de 2026-10-24: a câmera grava na qualidade e com o áudio que o jogador escolheu, e o Full HD e o som ficam travados na **exportação**, para o Passe poder liberar uma gravação já feita. Só os 15 s não voltam depois, porque dependem do buffer.): **toque na tela, gesto e voz**.
- **Plano pago** (Pro ativo, mensal ou anual, ou um Passe Avulso consumido no início): **gravações ilimitadas** e tudo o que o grátis limita liberado — duração do clipe acima de 15 s (as opções de corte/buffer de cada modo), som, **Full HD (1080p)** na captura e na exportação, e os gatilhos **Apple Watch, controle Bluetooth e celular controle**. Gravações pagas **não contam** nas 5.
- Todo o resto vale para os dois planos: câmera lenta, edição (corte, velocidade, zoom, giro), exportação, compartilhamento, todas as lentes.

Princípio: **a experiência do usuário vem primeiro. Uma gravação em andamento nunca é interrompida nem perde um lance por causa de pagamento.** A cobrança só aparece **fora da gravação**: nos cadeados da preparação e no "Começar gravação" quando as 5 gravações grátis do mês acabaram. Nada pago é pedido durante a gravação.

## Decisões

**Marcus, 2026-10-20 (continuam valendo):**
- **Só RevenueCat** sobre Apple IAP e Google Play Billing. Sem Stripe e sem arquitetura híbrida por ora.
- **Sem backend e sem login na v1.** Usuário anônimo (ID do RevenueCat). Login pode vir depois, como convite opcional após a compra do Pro (`Purchases.logIn()` junta o histórico anônimo).
- **Moeda e preço vêm sempre da loja.** O país da conta da Apple/Google decide a moeda, independente do idioma do aparelho; o app mostra só o texto de preço da loja/RevenueCat e nunca converte nem fixa símbolo. Nenhum valor nem símbolo de moeda em código ou catálogo. Os valores em R$ deste spec são os preços do Brasil.
- **Paywall do RevenueCat**, hospedado e montado no painel, exibido com `RevenueCatUI.presentPaywall()`. O app não chama `purchasePackage`.
- **O Passe é validado no aparelho** (resultado da compra + `nonSubscriptionTransactions`), sem servidor.

**Marcus, 2026-10-23 (continuam valendo):**
- **Uma oferta só:** `default` atende todos os pontos de entrada. Sem `pro_only`/`showProPaywall`.
- **`Session.paid: boolean`**, decidido no **início** da sessão (Pro ativo, ou um crédito consumido) e nunca recalculado. O plano de uma sessão é `session.paid ? 'paid' : 'free'`. Se o Pro acabar depois, as sessões gravadas no Pro continuam pagas (os clipes já nasceram em Full HD com som). `passTransactionId` continua na sessão como registro do crédito gasto.
- **O Passe é um crédito** consumido automaticamente no próximo início sem Pro. (Revisão de 2026-10-24: também pode ser gasto numa gravação grátis já feita, ver "Liberar uma gravação já feita".)
- **Invariantes da store mantidos** (custaram caro): o crédito (`availableCredit`), o livro-razão `lance:v1:spentPasses` (só cresce; apagar a gravação não devolve o Passe), a compra pendente única (uma compra não explicada pelo snapshot ocupa o único lugar de pendência e nenhum outro paywall vende enquanto ela não se explica), a restauração que nunca cria crédito e a leitura antes da restauração.
- **Opções pagas na preparação** (som, Full HD, duração acima de 15 s, relógio, controle Bluetooth, celular controle) têm cadeado e selo "Premium" no grátis e abrem o paywall `default`. Depois de comprar, a opção fica disponível; nada começa sozinho por causa de um cadeado.
- **Trava o ligar de um gatilho pago, nunca um toque:** um toque de gatilho pago que chega durante a gravação vira lance.
- **Cartão no resumo de uma gravação grátis** (revisão de 2026-10-24), com contorno lima, selo "Pro" e a ação "Liberar": ver "Liberar uma gravação já feita". Sem trava de 0.5x (câmera lenta é grátis).

### Liberar uma gravação já feita (revisão de 2026-10-24)
O jogador com muitos lances bons numa gravação grátis pode liberar **Full HD e som** dessa gravação.
- **Pontos de entrada:** o cartão "Gravada no plano grátis" no resumo e o botão de som do editor (travado numa gravação grátis). Os dois chamam `unlockRecording(sessionId)`.
- **Pro ativo:** todas as gravações já feitas ganham Full HD e som enquanto o Pro durar (`useViewPlan`), sem gastar nada nem perguntar; se o Pro acabar, as gravações grátis voltam a ficar travadas.
- **Galeria "Minhas gravações":** enquanto houver gravação grátis com clipes e o Pro não estiver ativo, um cartão no topo diz que o Pro, mensal ou anual, dá Full HD, som e Modo Foco em todas as gravações, as já feitas e as próximas, e abre o paywall.
- **Passe disponível:** pergunta "Usar o passe nesta gravação?" ("Guardar para a próxima" ou "Usar nesta gravação"). Ao usar, `repo.upgradeSession` marca a gravação como paga, grava o `passTransactionId` e gasta o Passe no livro-razão.
- **Nada disponível:** abre o paywall; o que for comprado nele é oferecido do mesmo jeito (Pro libera sem perguntar).
- **O que muda:** o plano da gravação passa a `paid`; a exportação sai em 1080p, com o som e com o Modo Foco; o clipe passa a tocar com som.
- **Modo Foco:** funciona no app em todos os planos (preview e edição), para despertar interesse. Só a exportação grátis (salvar e compartilhar) o deixa de fora; antes de exportar com o Foco ligado, uma pergunta avisa e oferece "Continuar sem o Foco", "Liberar" ou "Cancelar". O contador de gravações grátis do mês não volta.
- **O que não muda:** o corte e o buffer de 15 s, porque foram gravados assim.
- **Preço desse custo:** o plano grátis grava em 1080p e com áudio, com mais calor, bateria e armazenamento.
- **A marca "feito com LANCE" fica em todo vídeo exportado, nos dois planos**, desenhada num só componente (`MadeWithMark.tsx`); o Marcus vai redesenhá-la depois.
- **Story sai do app.** Ver "Fim do Story".

**Marcus, 2026-10-23, revisão final (este spec):**
- **Produtos:**
  - `single_pass` — **Passe Avulso**, consumível, **R$ 4,90**: uma gravação paga.
  - `pro_monthly` — **Pro Mensal**, **R$ 14,90**/mês, entitlement `pro`.
  - `pro_annual` — **Pro Anual**, **R$ 99,90**/ano (≈ R$ 8,33/mês, 44% abaixo de 12 mensalidades), entitlement `pro`. **Novo.**
  - **7 dias grátis nas duas assinaturas**, configurados nas lojas; o paywall informa o teste.
  - Oferta `default` com três pacotes: **Anual**, **Mensal** e o pacote personalizado `single_pass`.
- **Grátis = 5 gravações por mês calendário** (contador local), cada uma com os limites de clipe. A 6ª tentativa do mês fica bloqueada no "Começar gravação" e abre o paywall.
- **`startDecision` ganha `{ kind: 'blocked' }`**: sem Pro, sem crédito e com 5 ou mais gravações grátis no mês. É a única decisão que não começa.
- **Nova tentativa automática, uma vez:** depois de uma compra/restauração no paywall do início bloqueado, o início é tentado de novo uma vez (como no design de 2026-10-22).
- **Início remoto bloqueado** (relógio, celular controle) não começa, não abre paywall, traz a preparação para frente e avisa no próprio aparelho remoto.
- **Pergunta em aberto (padrão escolhido):** a exportação continua no quadro vertical 9:16 com faixas, como hoje, até o Marcus decidir.

**Histórico:** 2026-10-20 — 10 lances liberados por jogo, do 11º em diante bloqueados. 2026-10-22 — primeira gravação grátis e sem limite, pagamento antes da segunda. 2026-10-23 (primeira versão) — gravações grátis ilimitadas com limites de clipe, nenhum bloqueio no início, só Pro mensal. 2026-10-23 (revisão final, este spec) — 5 gravações grátis por mês com limites de clipe, bloqueio no início com paywall, Pro Anual. Nenhuma versão foi publicada; dados antigos só existem em aparelhos de desenvolvimento.

## Fora do escopo
Login e contas, backend e webhooks, contador grátis no servidor ou por conta, pagamento web (Stripe), link externo, paywall próprio, Customer Center, testes A/B, promoções e cupons, pacotes de Passes, redesenho da marca d'água, mudança do quadro 9:16 da exportação, Wear OS.

## Regras de plano

| | Grátis | Pago (Pro ou Passe) |
|---|---|---|
| Gravações | **5 por mês calendário** | ilimitadas (Passe: a gravação em que foi consumido) |
| Clipes por gravação | ilimitados | ilimitados |
| Duração do clipe (corte e buffer) | no máximo 15 s | a do modo (hoje: corte 30 s, buffer 60 s) |
| Som no clipe | não (sem trilha de áudio) | sim (desligável na preparação) |
| Captura e exportação | HD 720p | Full HD 1080p |
| Gatilhos | tela, gesto, voz | + Apple Watch, controle Bluetooth, celular controle |
| Câmera lenta, edição, compartilhar, lentes, zoom | sim | sim |
| Marca "feito com LANCE" na exportação | sim | sim |

### Decisão do início
No "Começar gravação" (e no início remoto), nesta ordem:
1. Pro ativo → `{ kind: 'pro' }`: sessão paga, nenhum crédito gasto, não conta nas 5;
2. senão, existe crédito → `{ kind: 'credit', passTransactionId }` (o mais antigo): sessão paga, crédito gasto, não conta nas 5;
3. senão, gravações grátis do mês `< 5` → `{ kind: 'free' }`: sessão grátis; o contador do mês sobe **quando a sessão realmente começa**;
4. senão → `{ kind: 'blocked' }`: não começa.

- `startPlan({ proActive, credit, freeUsed })` é pura; `FREE_RECORDINGS_PER_MONTH = 5`.
- `planOf(decision)`: `'paid'` para `pro` e `credit`; `'free'` para `free` e `blocked` (bloqueado, a preparação continua mostrando a câmera e as travas do grátis). É um `switch` exaustivo (o TypeScript falha se um tipo novo de decisão ficar sem caso), então `blocked` nunca vira `'paid'` em `nextPlan`, `usePlan` ou na trava do relógio.
- **Plano do próximo início** (`nextPlan`) = `planOf(peekStart())`. Usado pela preparação (câmera, travas) e pelos gatilhos fora de gravação.
- **Plano de uma sessão** = `session.paid`. Sessões gravadas antes desta mudança (sem o campo) leem `paid = passTransactionId !== undefined`; nada é regravado.
- **Falhas (abre para o grátis):** se a leitura do repo (ledger ou contador) ou qualquer passo da decisão lançar, a decisão é `{ kind: 'free' }` — um erro de armazenamento nunca impede o jogador de gravar. Consequência aceita: com o armazenamento falhando, o limite mensal pode ser ultrapassado. Os comentários e testes dizem "falha decide grátis", não mais "nunca bloqueia". Se a gravação do contador lançar em `repo.startSession`, o início falha sem sessão e sem crédito gasto. Sem snapshot da loja (sem rede e sem cache), Pro e créditos são desconhecidos: decide pelo contador (grátis abaixo de 5, bloqueado a partir de 5).

### Contador mensal de gravações grátis
- Chave MMKV `lance:v1:freeCount:YYYY-MM`, o mês do **horário local do aparelho** no momento do início. Só a chave do mês corrente é lida; chaves de meses passados ficam no MMKV, ignoradas.
- Sobe **uma vez por sessão grátis**, dentro de `repo.startSession` (mesma escrita da sessão, um único `changed()`). Sessões pagas não sobem.
- **Apagar uma gravação nunca diminui o contador.** Um início que falha antes de criar a sessão (erro de câmera, pouco espaço, bloqueio) não consome.
- **É um registro próprio, que só cresce no mês**, e não é calculado a partir das sessões gravadas: apagar jogos não devolve vaga.
- **Virada do mês:** à meia-noite do dia 1, no horário local; a próxima leitura já usa a chave nova (zero). Como `useStartPreview`/`usePlan` só re-renderizam quando a store ou o repo notificam, a store guarda o `monthKey` da última decisão e **confere de novo quando o app volta ao primeiro plano (`AppState` `active`) e quando a preparação ganha foco**; se o mês mudou, notifica, e um "bloqueado" velho some. O toque em "Começar gravação" sempre decide com o relógio da hora. Sem timer.
- **Relógio e fuso:** o mês vem sempre da data local atual do aparelho. Mudar o fuso ou o relógio pode mudar o mês lido (adiantar o relógio "abre" um mês novo; voltar lê o contador antigo). Sem proteção na v1.
- **Riscos aceitos na v1:** o contador é local, sem login; reinstalar o app ou limpar os dados zera o mês; mudar o relógio burla o limite; dois aparelhos têm 5 cada um. O valor pago (som, Full HD, duração, gatilhos) continua só pela loja.

### Limites de captura e exportação
- **Limites de captura** (`captureConfig(settings, plan)`, função pura), aplicados ao abrir a câmera:
  - grátis: qualidade HD na mesma taxa do modo (`1080p60 → 720p60`, `1080p30 → 720p30`), `cutSeconds = min(corte do modo, 15)`, `bufferSeconds = min(buffer do modo, 15)`, `audio = false`;
  - pago: o que o modo e as escolhas do jogador dizem (`effectiveSettings`), com `audio = settings.audio` (padrão ligado).
  - 720p60 mantém a câmera lenta (grátis) suave. Superaquecido, o nativo continua caindo para 720p30 nos dois planos.
- **Exportação** (`exportOptions(plan, edit, trim)`): grátis 720x1280, sem som, e o trecho nunca passa de 15 s (se passar, mantém os 15 s finais); pago 1080x1920. Marca sempre. Quadro vertical 9:16 com faixas nos dois planos (pergunta em aberto; ver Decisões).

### Gatilhos pagos
`PAID_TRIGGERS = watch, remote, phone`; `triggerAllowed(source, plan)`. A trava é sobre **ligar** o gatilho, nunca sobre um toque: durante uma gravação vale `session.paid` (fixo); fora dela, `nextPlan`. Um toque de gatilho pago que chega durante a gravação sempre vira lance. Na prática:
- **Relógio:** o celular diz ao relógio se o Salvar funciona (`watchSetSaveAllowed`, já existe); sem permissão o botão dá lugar a "Disponível no Premium"; tempo, contagem, Começar/Parar e o widget continuam.
- **Celular controle:** o mesmo, por uma mensagem nova (`saveAllowed` no estado enviado ao controle; ausente = permitido). Parear, Começar/Parar e a imagem da câmera continuam em todos os planos.
- **Controle Bluetooth:** o app só escuta as teclas de volume numa sessão paga; numa grátis, as teclas voltam a ser volume.

### Início remoto (relógio e celular controle)
- Começar pelo relógio ou pelo celular controle funciona em todos os planos (começar não é gatilho de lance) e segue a mesma decisão do início.
- **Bloqueado:** não começa e **não abre paywall**; o celular da câmera traz a preparação para frente (a linha de status mostra o motivo).
- **Aviso no remoto:** o estado que o celular envia ganha `startAllowed` (relógio: `WatchMessage.state`; celular controle: `RemoteMessage.state`; ausente = permitido). Fora de gravação, `startAllowed = peekStart().kind !== 'blocked'`. Com `startAllowed = false`:
  - relógio: no lugar de "Começar gravação", a nota "Gravações grátis do mês acabaram" / "Escolha um plano no iPhone." (en: "Free recordings used up this month" / "Choose a plan on your iPhone."); nunca "Abra o LANCE no iPhone";
  - celular controle: no lugar de Começar, "As gravações grátis deste mês acabaram. Escolha um plano no celular da câmera.";
  - um Começar enviado com estado antigo: o celular responde reenviando o estado na hora (`startAllowed = false`); o relógio/controle encerra o "Começando…" e mostra a nota, sem o aviso de falha. Isso corrige o tempo esgotado que hoje termina em "Abra o LANCE no iPhone".

## Experiência

**Preparação:**
- Linha de status acima do botão (estilo `startNote`), pela decisão do próximo início:
  - `pro`: nenhuma linha;
  - `credit`: "Seu Passe Avulso será usado nesta gravação.";
  - `free`: "Restam N gravações grátis este mês" (singular "Resta 1 gravação grátis este mês");
  - `blocked`: "Suas 5 gravações grátis deste mês acabaram. Escolha um plano ou o Passe Avulso."
- **"Começar gravação":**
  - `pro`, `credit` ou `free` → começa (o crédito é gasto, ou o contador sobe, só quando a sessão é criada);
  - `blocked` → abre o paywall `default` (`openPaywall(t)`) e não começa. Depois de uma compra ou restauração (`'purchased'`/`'restored'`), o início é tentado **uma vez** automaticamente (relê o snapshot); se a loja ainda não mostrou a compra, continua bloqueado sem novo paywall e a linha de status muda quando a compra aparecer (o próximo toque começa). Cancelar: fica na preparação, sem alerta. Erro: o aviso curto de sempre (`payments.paywallError`).
- Seção **"Clipe"** nas configurações (sheet aberto), com três escolhas em chips:
  - **Duração:** "15 s" e "<corte do modo> s" (hoje 30 s);
  - **Qualidade:** "HD" e "Full HD";
  - **Som do clipe:** "Sem som" e "Com som".
  No grátis o valor grátis aparece selecionado e o valor pago tem cadeado e o selo "Premium"; tocar nele abre o paywall `default`. No pago as duas opções de cada linha são escolhas do jogador, salvas por modo (`cutSeconds`, `quality`, `audio`).
- Blocos de gatilho **Controle Bluetooth, Relógio, Conectar um celular controle e Usar este celular como controle** (revisão de 2026-10-24): no grátis ficam dentro de um grupo com contorno e um só selo "Pro", dizem "Disponível no Pro" ao leitor de tela, e tocar em qualquer um abre o paywall `default` em vez da tela do gatilho. (Antes, "Usar este celular como controle" ficava livre, porque o plano que vale é o do celular da câmera.)
- Depois de comprar por um cadeado, a opção fica disponível e nada começa sozinho. A câmera reabre com a configuração paga quando o plano do próximo início muda (e volta para a grátis se o Pro acabar antes de começar).

**Durante a gravação:** nada de pagamento, sem notas de plano, sem contador. A barra "Últimos Ns prontos" mostra o buffer da sessão (15 no grátis). Um Pro que vence no meio não muda nada nessa sessão. A câmera nunca é reaberta durante a gravação por mudança de plano.

**Depois da gravação:** resumo com o cartão de plano numa gravação grátis. Editor igual para os dois planos (corte, 0.5x/1.5x/2x, zoom, giro, salvar na galeria, compartilhar). Numa sessão grátis o botão de som fica travado em "Sem som" (o clipe tem áudio, mas ele não toca nem sai na exportação) e, ao tocar, libera a gravação; a janela de corte é de 15 s. "Restaurar compras" continua em "Minhas gravações".

## Fim do Story
O Story (templates Placar/Minimal/Arena/Treino/Recorde pessoal, o fluxo "Postar no Story" e suas telas) sai do produto. No código de hoje sobra:
- Nativo: `InstagramStory.swift`, `InstagramStory.kt`, a função `shareToInstagramStory` (iOS, Android, `ReplayCameraModule.ts`, `ReplayCamera.ts`), o `<queries>` do Instagram e o `FileProvider` + `replay_file_paths.xml` do Android (só o Instagram usava), `LSApplicationQueriesSchemes: instagram-stories` e `extra.metaAppId` no `app.json`.
- JS: `ShareOverlay` (nome, comentários e `SAFE_BOTTOM` justificados pelo Instagram), testes que procuram `story-*`.
- O registro de modos e os catálogos já não têm templates nem textos de Story (removidos antes); nada a fazer lá além da varredura.

Fica: o editor, a exportação no quadro vertical 9:16 com faixas (como hoje, até o Marcus decidir), "Salvar na galeria" e a folha de compartilhar do sistema (`expo-sharing`).

**Marca d'água depois do Story:** um caminho só. `src/share/ExportOverlay.tsx` (o antigo `ShareOverlay`, sem a prop `watermark`) desenha faixas e degradê e sempre inclui `src/share/MadeWithMark.tsx`, o único lugar que desenha a marca. O mesmo componente faz a prévia do editor e, capturado em PNG, a camada da exportação. Redesenhar a marca = mexer só em `MadeWithMark.tsx`. `ExportOptions.watermark` sai.

## Arquitetura (`app/src/payments/`)

| Unidade | Função |
|---|---|
| `client.ts` | `PaymentsClient`: `configure`, `getSnapshot`, `onSnapshot`, `restore`, `showPaywall()` (sempre a oferta `default`). |
| `revenuecatClient.ts` | Implementação com `react-native-purchases` e `-ui`. Único arquivo que importa o SDK. Não conhece produtos: o Pro é o entitlement `pro` (mensal ou anual), o Passe é `single_pass`. |
| `fakeClient.ts` | Cliente falso para Jest e desenvolvimento sem loja. |
| `snapshot.ts` | `customerInfo` → `Snapshot { proActive, passTransactions[{id, productId, purchasedAt}] }`. |
| `rules.ts` | Puras: `availableCredit`, `creditCount`, `FREE_RECORDINGS_PER_MONTH`, `monthKey(now)`, `startPlan({ proActive, credit, freeUsed })` → `StartDecision`, `planOf(decision)`, `freeLeft(freeUsed)`, `sessionPlan(session)`, `detectPurchase`. |
| `limits.ts` | Puras: `FREE_MAX_SECONDS = 15`, `hdQuality(q)`, `captureConfig(settings, plan)`, `PAID_TRIGGERS`, `triggerAllowed(source, plan)`. |
| `store.ts` | `payments`: snapshot, `peekStart()`/`startDecision()` (podem dar `blocked`), `nextPlan()`, `credits()`, `freeLeft()`, `showPaywall()`, `restore()`. |
| `feedback.ts` | `openPaywall(t)`, `restorePurchases(t)`. |
| `useStartPreview.ts` | `{ decision, credits, freeLeft }` para a linha de status. |

- `type Plan = 'free' | 'paid'`; `type StartDecision = { kind: 'pro' } | { kind: 'credit'; passTransactionId } | { kind: 'free' } | { kind: 'blocked' }`.
- `createPaymentsStore(client, repo, now = Date.now)`; o repo entra com `getSession`, `spentPasses`, `spendPasses` e `freeCount(now)`. `payments.recheckMonth()` notifica se `monthKey(now())` mudou desde a última decisão (chamado por um listener de `AppState` e pelo foco da preparação).
- `StartResult` usa `'blocked'` para o início bloqueado; `'needsPayment'` não volta (nem no tipo, nem no catálogo `setup.needsPayment`).
- `usePlan(sessionId?)` (em `src/share/entitlement.ts`): com sessão, `sessionPlan`; sem sessão, `nextPlan()`. Re-renderiza com a store e com o repo.
- `useReplaySession`: `start(mode)` devolve `'started' | 'blocked' | 'failed' | 'busy'`. Decide antes de abrir a câmera (`blocked` → devolve na hora, sem tocar na câmera nem no estado), abre a câmera com `captureConfig`, decide de novo logo antes de criar a sessão e, se o plano mudou, reabre a câmera com o novo antes de criar a sessão (a sessão nunca fica com `paid` diferente da câmera). Se a segunda decisão for `blocked` (o Pro venceu enquanto a câmera abria), volta a `idle` (ação `startBlocked`) com a câmera aberta e devolve `'blocked'`. O crédito é gasto e o contador sobe só em `repo.startSession`.
- `prepare(mode, plan)`: a chave da câmera aberta inclui qualidade, buffer e som; não faz nada fora de `idle`/`ended` (nunca reabre durante a gravação).
- Nativo `startSession({ lens, zoom, maxQuality, bufferSeconds, audio })` — `audio` novo, padrão `true`; `Quality` ganha `'720p60'`.
- Chaves públicas por variável de ambiente (`.env.local`), lidas em `app.config.js`: `appl_…`, `goog_…`, `test_…` (só debug). Nunca chave secreta.

## Áudio e voz (nativo)
- **iOS hoje:** `CaptureController` liga o microfone na sessão de captura (se autorizado) e entrega as amostras a dois lugares: o `SegmentWriter` (trilha de áudio do clipe) e o `VoiceTrigger` (reconhecimento offline de "salvar"/"gravar"). A voz **depende do microfone da captura**, não da trilha do clipe.
- **Plano:** o microfone continua na captura nos dois planos (a voz é grátis); só o `SegmentWriter` deixa de ter trilha de áudio quando `audio = false` (`withAudio: capture.hasAudio && clipAudio`). A regra fica pura no Core (`CapturePlan`, testada com `swift test`), junto com o alvo de formato (`720p60 → 1280@60`).
- **Android hoje:** `SegmentEncoder` sempre grava áudio (`AudioRecord`) e o muxer espera o formato de áudio antes de começar cada pedaço; voz não existe no Android. **Plano:** `withAudio = false` não cria `AudioRecord` nem trilha de áudio, e o muxer começa só com o vídeo. 720p60 onde a câmera oferecer, senão 30. Só o aparelho confirma.
- **Riscos:** (1) no iOS o indicador de microfone continua aceso no grátis (já acontece hoje); (2) uma reconfiguração térmica recria o writer e precisa manter `clipAudio`; (3) o pedaço de 2 s faz o arquivo salvo ter até ~16 s com buffer de 15 s — o limite de 15 s é garantido pelo corte e pela exportação; (4) só um aparelho confirma: clipe grátis sem trilha de áudio, voz funcionando no grátis, 720p60 real, muxer Android sem áudio, exportação de clipe sem áudio. O Swift Core roda com `swift test`; os módulos iOS/Android não compilam neste ambiente.

## Dados
- `Session.paid?: boolean` (gravado por `repo.startSession`; ausente só em sessões antigas). `Session.passTransactionId?` gravado quando um crédito é consumido.
- `repo.startSession(sport, now, { paid, passTransactionId? })`: grava a sessão; com `passTransactionId`, o põe em `spentPasses`; com `paid: false`, soma 1 em `lance:v1:freeCount:<monthKey(now)>`. Tudo num único `changed()`.
- `repo.freeCount(now): number` — gravações grátis do mês de `now` (0 se a chave não existe ou está ilegível).
- MMKV `lance:v1:spentPasses`: só cresce; `deleteSession` não mexe. A migração dos `passTransactionId` existentes continua.
- MMKV `lance:v1:freeCount:YYYY-MM`: só cresce dentro do mês; `deleteSession` não mexe; meses antigos ignorados. Sem migração: sessões grátis gravadas antes desta mudança não contam.
- `lance:v1:firstSessionUsed` deixou de ser lida e escrita (o valor velho fica no MMKV, ignorado).
- `ModeSettings` tem `audio: boolean` (padrão `true`) e `quality` aceita `'720p60' | '720p30'` (escolha "HD" do pago).

## Fluxo de compra
1. Pontos de entrada, sempre fora da gravação: os cadeados da preparação e o "Começar gravação" bloqueado → `openPaywall(t)` → `payments.showPaywall()` abre a oferta `default` (Anual, Mensal, Passe).
2. `purchased`: a store lê o snapshot novo; o Pro muda o plano; o Passe vira crédito. Se o snapshot atrasar, a compra fica pendente (sem sessão) e se explica no próximo `onSnapshot`; `startDecision()` relê antes de decidir enquanto há pendência.
3. `restored` / "Restaurar compras": volta o Pro; Passes que aparecem por restauração vão para `spentPasses`, nunca viram crédito.
4. O listener `onCustomerInfo` atualiza; `nextPlan` e a linha de status mudam; a preparação destrava e a câmera reabre. Nada é liberado dentro do callback da compra. A única ação automática é a nova tentativa única do início bloqueado.

## Erros e situações-limite

| Situação | Comportamento |
|---|---|
| Cancela ou fecha o paywall | Nada muda, sem alerta; fica na preparação. |
| Compra falha | Aviso curto, nada muda. |
| Compra conclui mas o snapshot atrasa | Pendência única; o início relê; se o crédito ainda não apareceu, a decisão segue sem ele (grátis abaixo de 5, bloqueado a partir de 5, sem novo paywall na nova tentativa) e o Passe continua crédito para a próxima. Nunca cobra duas vezes. |
| 6ª gravação do mês sem Pro nem crédito | Bloqueada; paywall; comprar/restaurar → uma nova tentativa automática. |
| Início remoto bloqueado | Não começa, sem paywall; preparação à frente; relógio/controle mostram a nota do limite mensal. |
| Duplo toque em "Começar gravação" | Só um início (`'busy'`); no máximo um crédito gasto ou uma gravação grátis contada. |
| Dois créditos | Cada início pago gasta só o mais antigo. |
| Pro ativo e crédito | Pro: o crédito não é gasto. |
| Pro vence entre a preparação e o início | O início decide `free` (reabre a câmera em HD sem som e começa grátis) ou `blocked` (volta a `idle`, sem sessão). |
| Pro vence no meio da gravação | Nada muda nessa sessão (paga até "Encerrar"). |
| Plano muda durante a gravação (Pro vence, crédito chega) | A câmera não reabre; vale para a próxima. |
| Sem rede e sem snapshot | Decide pelo contador; créditos e Pro só valem com snapshot (o SDK costuma ter cache). |
| Falha ao ler o repo/store na decisão | Começa grátis; nenhum crédito gasto. |
| Câmera falha ao começar (`LOW_STORAGE` etc.) | Nenhuma sessão, nenhum crédito gasto, contador não sobe. |
| Apagar uma gravação (grátis ou paga com Passe) | O contador do mês não desce; o Passe continua em `spentPasses`. |
| Virada do mês com a preparação aberta | A próxima leitura (abrir a preparação, mudança da store/repo, o toque em Começar) usa o mês novo. |
| Relógio ou fuso alterado | Lê o mês da data local atual (risco aceito). |
| Reinstalação | Contador zerado (risco aceito); Pro volta por "Restaurar compras"; Passes não voltam como crédito. |
| Toque de gatilho pago numa sessão grátis (relógio/celular controle com estado antigo) | Vira lance. |
| Sessão antiga sem `paid` | `paid = !!passTransactionId`. |

## Testes
- **Jest:** `availableCredit`, `monthKey` (horário local, mês com dois dígitos, virada de mês e de ano), `startPlan` (Pro sem gastar e ignorando o contador; crédito com 5 usadas; grátis com 0 e 4; bloqueado com 5 e 6), `freeLeft`, `sessionPlan`, `captureConfig` (grátis: 720p na taxa do modo, `min` 15/15, sem som; pago: o modo + `audio`), `triggerAllowed`, `exportOptions` (720x1280 sem som e ≤ 15 s; 1080x1920; sem `watermark`), repo (`paid` gravado, crédito no ledger, contador sobe só no grátis e no mês certo, apagar não devolve crédito nem desce contador), store (bloqueado a partir de 5, Pro e crédito ignoram o contador, falha decide grátis, restauração não cria crédito, pendente sem sessão), `useReplaySession` (bloqueado não toca na câmera; segunda decisão bloqueada volta a `idle`; câmera falhando não conta; grátis com corte/buffer em 15 s e sem som; pago com Pro ou crédito gasto uma vez; mudança de plano antes do início reabre a câmera; durante a gravação não reabre; Bluetooth só em sessão paga), preparação (linha de status nos quatro casos e plural, paywall no início bloqueado com uma nova tentativa, cancelar fica, travas e paywall nas travas, destrava após compra sem começar), início remoto bloqueado (sem paywall, sem sessão), celular controle com `startAllowed`/`saveAllowed`, editor e `ExportOverlay` (marca em todos os planos), varredura de Story.
- **Swift Core (`swift test`):** `CapturePlan` (720p60, áudio do writer vs. microfone), `RemoteMessage.state` e `WatchMessage.state` com `saveAllowed` e `startAllowed`, `BufferPlan` com 15 s.
- **Aparelho:** sandbox da Apple e license tester do Google; checklist do plano (última tarefa).

## Critérios de aceite
1. Instalação nova: 5 gravações seguidas sem paywall, cada uma com clipes de no máximo 15 s, 720p, sem trilha de áudio; a linha de status conta "Restam 4… 1"; voz, gesto e tela salvam; relógio, controle Bluetooth e celular controle não salvam (Salvar trocado por "Disponível no Premium"; volume é volume).
2. 6ª gravação no mesmo mês: a linha diz que as 5 acabaram; "Começar gravação" abre o paywall (Anual, Mensal e Passe, tabela Grátis × Premium, teste de 7 dias nas assinaturas) e não começa; cancelar fica na preparação; comprar começa a gravação uma vez, sozinha. Pelo relógio ou celular controle: não começa, sem paywall, o remoto mostra a nota do limite mensal.
3. Apagar gravações grátis não devolve gravações ao mês; no mês seguinte (data do aparelho) volta a 5.
4. Comprar o Passe: a linha "Seu Passe Avulso será usado nesta gravação." aparece, a câmera reabre em Full HD com som; a próxima gravação sai paga, consome o crédito e não conta nas 5.
5. Assinar o Pro (mensal ou anual): todas as gravações saem pagas sem gastar créditos e sem contar; se o Pro acabar, a próxima segue o contador e a em andamento não muda.
6. Os cadeados da preparação abrem o paywall; comprar destrava a opção sem começar.
7. "Restaurar compras" em instalação limpa devolve o Pro e não cria crédito.
8. Toda exportação tem a marca "feito com LANCE"; grátis em 720p, pago em 1080p; quadro 9:16.
9. Nenhum resto de Story no app (varredura do plano).
10. `npm test`, `npx tsc --noEmit`, `npx expo lint` e `swift test` (Core) passam.

## Passos fora do código (Marcus)
1. App Store Connect e Play Console: contratos de apps pagos, dados bancários e fiscais.
2. **Produtos nas duas lojas:**
   - `single_pass` (consumível), R$ 4,90;
   - `pro_monthly` (assinatura mensal), **mudar para R$ 14,90**;
   - **criar `pro_annual`** (assinatura anual), **R$ 99,90**, no mesmo grupo de assinatura do mensal (Apple) / como assinatura com plano base anual (Google);
   - **teste grátis de 7 dias nas duas assinaturas** (Apple: oferta introdutória "Teste grátis", 1 semana; Google: oferta de teste de 7 dias no plano base, "novos clientes"; RevenueCat Test Store: "Free trial" 7 dias). Quem tem direito ao teste é decidido pela loja. Revisar os preços dos outros países.
3. **RevenueCat:** entitlement `pro` com `pro_monthly` e `pro_annual`; oferta `default` com os pacotes **Anual** (`pro_annual`), **Mensal** (`pro_monthly`) e o personalizado `single_pass`; paywall publicado. A oferta `pro_only` não é necessária (pode ser arquivada).
4. **Paywall pelo prompt gerado** (builder, pt-BR e en):
   - Tabela **Grátis × Premium**: Gravações por mês "5" × "Ilimitadas"; Duração do clipe "15 s" × "Mais longos"; Som "Sem som" × "Com som"; Qualidade "HD" × "Full HD"; Gatilhos "Toque, gesto e voz" × "+ Apple Watch, controle Bluetooth e celular controle".
   - **Pro Anual** (destacado): preço da loja por ano e o equivalente mensal pela variável do builder; selo de economia ("44% off") só se o builder calcular pelo preço da loja, nunca um número fixo que mude por país.
   - **Pro Mensal:** "7 dias grátis, depois {{ product.price_per_period }}" / "7 days free, then {{ product.price_per_period }}", só para quem tem direito (texto condicional de oferta introdutória; conferir os nomes das variáveis no builder). O mesmo para o Anual.
   - **Passe Avulso:** "Uma gravação" / "One recording", com o preço da variável da loja.
   - Sem preço fixo no texto; nenhuma promessa de reembolso.
5. **Regras da Apple:** conferir as diretrizes (3.1.1, 3.1.2 e a apresentação de teste grátis) para um limite mensal no grátis com paywall no início e para o texto do teste (preço depois do teste, renovação automática, como cancelar), antes de enviar para revisão.
6. **Reembolso:** antes de publicar, conferir as regras da Apple (o usuário pede à Apple) e do Google (pelo Play, e pelo desenvolvedor em até 48h); decidir só depois se algum texto de suporte vai para a página do app.
7. Meta App ID / Instagram: nada a configurar (o Story saiu).
8. Chaves públicas em `app/.env.local`; build de desenvolvimento novo (módulos nativos e o app do relógio mudaram).
9. Decidir o quadro da exportação (9:16 com faixas hoje).

## Riscos
- **Contador local:** reinstalar, limpar dados ou mudar o relógio zera ou burla o limite mensal; aparelhos diferentes têm 5 cada; uma falha de armazenamento decide grátis (abre para o jogador) e também deixa passar do limite. Aceito na v1 (sem login); o pago continua protegido pela loja.
- **Bloqueio no início frustra:** o jogador chega à quadra e não grava. Mitigação: a linha de status avisa antes ("Restam N"), o Passe resolve uma gravação na hora e a nova tentativa começa sozinha após a compra. Medir a conversão do paywall por ponto de entrada (início bloqueado, cadeado de som, Full HD, duração, gatilho) e a volta em 30 dias.
- **Revisão da Apple** do limite mensal e do texto do teste grátis (Passos fora do código, 5).
- **Crédito validado no aparelho:** aparelho adulterado pode forjar créditos. Aceito na v1. Créditos não passam para outro aparelho.
- **Instalação nova recebendo Passes antigos sem restauração:** conferir no sandbox; se acontecer, marcar como usados os Passes do primeiro snapshot da instalação.
- **Compra com atraso + início imediato** (sobretudo pelo relógio): a decisão segue sem o Passe (grátis ou bloqueada) e ele fica para a próxima. Aceito; a linha de status mostra quando ele está pronto.
- **Áudio nativo** (ver "Áudio e voz"): só o aparelho confirma.
- O paywall hospedado tem o layout que o builder permite. Comissões das lojas (~15%) e do RevenueCat reduzem a margem; não afetam o design.
