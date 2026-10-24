# LANCE — Design (v1)

> Nome provisório. Data: 2026-10-17. Status: aguardando revisão.
> Mockups: https://claude.ai/artifact/2Cj7DeSydAkeWGADELpFKw

## 1. Objetivo

Levar para o celular do praticante o sistema de "replay" que algumas quadras oferecem com câmera fixa e botão físico. O celular, preso na grade ou na areia, grava o jogo inteiro, mas guarda só os lances que o jogador escolher. O lance vai para a galeria ou para qualquer app pela folha de compartilhar em dois toques.

- **Público inicial:** praticantes de esportes de areia (beach tennis, futevôlei, vôlei de praia). O app funciona em qualquer esporte de quadra (opção "Outro").
- **Princípios:** sem cadastro, abre direto na câmera, "dois toques até compartilhar", app leve e rápido.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Plataforma | React Native + Expo (New Architecture, Hermes), iOS e Android |
| Gatilhos v1 | Botão na tela, controle Bluetooth, gesto corporal (braços em X), smartwatch (Apple Watch + Wear OS) |
| Buffer | Janela móvel de 60s. O que sai da janela é apagado na hora. Só os lances salvos ficam no celular |
| Corte padrão | Últimos 30s até o gatilho, ajustável depois dentro dos 60s |
| Dados | Só no celular, sem login. Modelo preparado para login futuro |
| Receita | Grátis: 5 gravações por mês, cada uma com limites (clipe de até 15 s, sem som, HD 720p, gatilhos tela/gesto/voz). Passe Avulso (R$4,90, uma gravação) ou Pro (R$14,90/mês ou R$99,90/ano, 7 dias grátis nos dois) liberam gravações ilimitadas e os limites. Kit físico de fixação opcional, vendido fora do app |
| Câmera | Módulo nativo próprio `ReplayCamera` (Expo Modules), sem VisionCamera |

## 3. Experiência do usuário

Fluxo: **Boas-vindas → Posicionar câmera → Gravando → Lance salvo (repete) → Fim de jogo → Editor → Salvar/Compartilhar.** O paywall só aparece fora da gravação: quando o jogador toca numa opção paga travada na preparação, ou em "Começar gravação" depois das 5 gravações grátis do mês.

### 3.1 Boas-vindas (só na primeira vez)
- Promessa: "Grave o jogo inteiro. Guarde só o lance."
- Os 3 passos: prender o celular → fazer o gatilho → postar.
- Aviso de privacidade e memória: "Só os lances que você salvar ficam no seu celular. O resto é apagado automaticamente."
- Um botão: "Permitir câmera e começar". Sem cadastro.

### 3.2 Posicionar câmera
- Preview em tela cheia com o contorno da quadra como guia e o nível do horizonte.
- Seletor de lente 0.5x / 1x (ultra-wide como padrão quando houver).
- Dica: "Atrás da linha de fundo, na altura do ombro".
- Esporte: Beach tennis, Futevôlei, Vôlei de praia, Outro.
- Status dos gatilhos: Tela (sempre ativa), Gesto X (ativo/inativo), Controle (conectado/não), Relógio (pareado/"Toque para parear").
- Seção "Clipe": duração (15 s / do modo), qualidade (HD / Full HD) e som do clipe; no plano grátis as opções pagas têm cadeado e selo "Premium" (seção 3.5).
- Linha de status acima do botão: "Restam N gravações grátis este mês", "Seu Passe Avulso será usado nesta gravação" ou, esgotado o mês, "Suas 5 gravações grátis deste mês acabaram. Escolha um plano ou o Passe Avulso." (com Pro, nenhuma).
- Botão "Começar gravação". Bloqueado se houver menos de ~500 MB livres. Esgotadas as 5 gravações grátis do mês (sem Pro nem Passe), abre o paywall em vez de começar; comprar começa a gravação uma vez, sozinha.

### 3.3 Gravando
- A tela escurece para economizar bateria, mas a gravação continua.
- Topo: indicador REC, tempo de jogo, temperatura.
- Centro: contador de lances. Tocar em qualquer lugar salva o lance.
- Barra "Últimos 60s prontos · o resto é apagado".
- Indicadores dos gatilhos remotos.
- "Segure para encerrar o jogo" (toque longo, para evitar encerrar por engano).
- Calor: o app reduz sozinho para 720p/30 e mostra o aviso "Celular quente… coloque na sombra".

### 3.4 Lance salvo (feedback de ~2s)
- Borda e flash na cor de destaque, som curto, vibração no relógio.
- "Lance #N salvo · via <origem> · últimos 30s".
- Botão "Desfazer".

### 3.5 Plano grátis e paywall (revisão final de 2026-10-23)
- Grátis: **5 gravações por mês calendário** (contador no aparelho, sem login; virada no dia 1, no horário local; apagar gravações não devolve vagas; reinstalar zera — risco aceito na v1). Lances ilimitados em cada gravação; clipe de até 15 s, sem som, HD 720p (captura e exportação); gatilhos tela, gesto e voz.
- Pago (Pro Mensal R$14,90 ou Pro Anual R$99,90, os dois com 7 dias grátis; ou Passe Avulso R$4,90 para uma gravação): gravações ilimitadas (não contam nas 5), duração do modo, som, Full HD 1080p, e os gatilhos relógio, controle Bluetooth e celular controle.
- O Passe é um crédito comprado antes: é consumido no início da próxima gravação sem Pro ("Seu Passe Avulso será usado nesta gravação."). O plano de cada gravação é fixado no início.
- O paywall abre pelos cadeados da preparação (comprar destrava a opção; nada começa sozinho) e pelo "Começar gravação" com as 5 do mês esgotadas (comprar começa a gravação uma vez). Começar pelo relógio ou celular controle com o mês esgotado não começa nem abre paywall; o remoto avisa. Nenhum paywall durante a gravação; a gravação nunca para por causa do plano.
- Câmera lenta, edição, compartilhar e lentes valem para todos. A marca "feito com LANCE" vai em toda exportação.
- Pagamento pela App Store / Google Play. Detalhes em `2026-10-20-payments-revenuecat-design.md`.

### 3.6 Relógio (watchOS e Wear OS)
- Uma tela só: tempo + número de lances e um botão grande "Salvar lance".
- O relógio como gatilho é do plano pago (Pro ou gravação com Passe). No grátis o botão dá lugar a "Disponível no Premium" e o resto continua. Com as 5 gravações grátis do mês esgotadas, "Começar gravação" no relógio dá lugar a uma nota ("Gravações grátis do mês acabaram · Escolha um plano no iPhone"). Detalhes em `2026-10-20-payments-revenuecat-design.md`.
- Vibração quando o lance é confirmado.

### 3.7 Fim de jogo
- Resumo: tempo gravado, número de lances, espaço realmente usado, e a mensagem "o restante do jogo já foi apagado".
- Grade de lances (miniatura, duração, horário, origem do gatilho).
- Botões "Novo jogo" e "Postar um lance".

### 3.8 Editor do lance
- Preview com play.
- Linha do tempo de 60s com a janela de corte ajustável (padrão: últimos 30s).
- Ferramentas: Corte, Velocidade (inclui câmera lenta, todos os planos), Som (gravação grátis: sem som), Zoom e giro.
- Botões "Salvar na galeria" e "Compartilhar".

### 3.9 Exportar e compartilhar (revisado em 2026-10-23: o Story saiu)
- Prévia do quadro vertical 9:16 exportado, com faixas e a marca "feito com LANCE" (todos os planos). O quadro 9:16 fica até o Marcus decidir (pergunta em aberto no spec de pagamentos).
- Grátis: 720p, sem som, até 15 s. Pago: 1080p.
- "Salvar na galeria" e "Compartilhar" (folha de compartilhar do sistema). Sem templates e sem "Postar no Story".

### 3.10 Gesto
- Braços cruzados em X acima da cabeça, mantidos por ~1s. É um gesto deliberado, para não confundir com comemoração.
- Funciona para qualquer pessoa enquadrada.

### 3.11 Identidade visual (proposta dos mockups)
- Fundo escuro (Ink #0B0B09), texto Paper (#F3EDE1).
- Destaque lima "bola de tênis" (#D6F23F); vermelho/laranja para REC e alertas.
- Títulos em Barlow Condensed (estilo placar), texto em Manrope.
- Alvos de toque ≥44px e alto contraste para uso sob sol forte.

## 4. Arquitetura

```
┌──────────── JS (Expo Router + React) ─────────────┐
│ Telas · estado do jogo · paywall · editor · share │
└──────────────▲───────────────────┬────────────────┘
          eventos                   comandos
┌──────────────┴───────────────────▼────────────────┐
│ ReplayCamera (Expo Module nativo, Swift/Kotlin)   │
│ • Captura + preview + lente                       │
│ • Codificador → pedaços de 2s → anel de 30 (60s)  │
│ • Detector de gesto X (Apple Vision / ML Kit)     │
│ • Controle Bluetooth (tecla de volume)            │
│ • Ponte com o relógio (WatchConnectivity / Wear   │
│   Data Layer)                                     │
│ • Temperatura → reduz qualidade                   │
│ • Exportação (AVFoundation / Media3 Transformer)  │
└───────────────────────────────────────────────────┘
Apps de relógio: watchOS (SwiftUI, via expo-apple-targets) · Wear OS (Compose)
```

### 4.1 Stack
- Expo (SDK mais recente), New Architecture, Hermes, Expo Router.
- Reanimated (feedback e editor de corte), MMKV (metadados), RevenueCat (compras).
- Folha de compartilhar do sistema (`expo-sharing`) e galeria (`expo-media-library`). Sem integração com o Instagram.
- Analytics de eventos anônimos (ferramenta a definir no plano).
- EAS Build / EAS Update.

### 4.2 Interface do `ReplayCamera` (JS ↔ nativo)
- **Comandos:**
  - `startSession({ lens, zoom, maxQuality, bufferSeconds, audio })` (`audio: false` = clipe sem trilha de áudio; o microfone continua para a voz)
  - `stopSession()`
  - `saveClip({ source, at })` → `{ clipPath, durationMs }`
  - `exportClip({ clipPath, startMs, endMs, speed, muted, crop, rotation, width, height, overlayPngPath })` → `{ path }` (a camada PNG traz faixas e marca)
  - `setGestureEnabled(bool)`
- **Eventos:**
  - `onTrigger({ source, at })`: vindo de gesto, controle ou relógio
  - `onThermalChange({ level, degraded })`
  - `onInterrupted()` / `onResumed()`
  - `onError({ code })`

### 4.3 Buffer
- Gravação contínua em pedaços de ~2s (MP4 fragmentado) numa pasta temporária. É mantido um anel de 30 pedaços (60s).
- O pedaço que sai da janela é apagado imediatamente. O espaço em uso fica fixo em ~75 MB (1080p60).
- Salvar um lance = juntar os pedaços da janela atual num MP4, sem recodificar.
- Encerrar o jogo, ou abrir o app depois de ele ter fechado inesperadamente, limpa a pasta temporária.

### 4.4 Barramento de gatilhos
- Toda origem (tela, gesto, controle, relógio) chama `salvarLance(origem, momento)`.
- Trava de 3s entre salvamentos, para que dois gatilhos quase juntos não salvem o lance em dobro.

### 4.5 Exportação
- Recodifica aplicando corte, velocidade, zoom, giro, resolução e a camada com a marca.
- O plano da gravação, fixado no início, limita a captura e a exportação: grátis 720p, sem som, buffer e corte de até 15 s; pago a qualidade e o buffer do modo, com som.

## 5. Dados (no celular)

```
UsuárioAnônimo { id: uuid, criadoEm, revenueCatId }
Sessão         { id: uuid, esporte, início, fim, pago, passeTransaçãoId? }
Lance          { id: uuid, sessãoId, criadoEm, origem: tela|gesto|controle|relógio,
                 arquivo, corte: { início, fim } }
Pagamentos     { passesUsados: [transaçãoId], gravaçõesGrátisDoMês: { 'AAAA-MM': n } }
Preferências   { lente, duraçãoPadrão: 30, gestoAtivo, relógioPareado }
```

- Os IDs são UUIDs gerados no aparelho, para facilitar o login futuro. O RevenueCat junta o histórico anônimo com a conta quando ela existir.
- Os vídeos ficam na pasta do app. A galeria recebe sempre uma cópia exportada.

## 6. Monetização

| Regra | Grátis | Passe Avulso (R$4,90) | Pro (R$14,90/mês ou R$99,90/ano) |
|---|---|---|---|
| Gravações | 5 por mês calendário | Uma gravação paga por Passe (não conta nas 5) | Ilimitadas (não contam nas 5) |
| Lances por gravação | Ilimitados | Ilimitados | Ilimitados |
| Duração do clipe | Até 15 s | A do modo | A do modo |
| Som no clipe | Não | Sim | Sim |
| Captura e exportação | 720p | 1080p | 1080p |
| Gatilhos | Tela, gesto, voz | + relógio, controle Bluetooth, celular controle | + relógio, controle Bluetooth, celular controle |
| Câmera lenta, edição, compartilhar | Sim | Sim | Sim |
| Marca "feito com LANCE" | Sim | Sim | Sim |
| Validade | Renova no dia 1 de cada mês | A gravação em que foi consumido | Mensal ou anual (7 dias grátis nos dois, para quem tem direito) |

- O Passe é uma compra avulsa (consumível) e funciona como crédito comprado antes de gravar: é consumido no início da próxima gravação sem Pro. Os clipes nascem com o plano da gravação; um Passe não melhora uma gravação já feita. Um Passe usado nunca volta a ser crédito, mesmo apagando a gravação.
- O plano de cada gravação (`pago`) é fixado no início e não muda depois.
- O contador mensal do grátis fica no aparelho (`freeCount` do mês), só cresce dentro do mês e não desce ao apagar gravações. Reinstalar ou mudar o relógio pode zerá-lo: risco aceito na v1, sem login.
- Anual: R$99,90 ≈ R$8,33/mês, 44% abaixo de 12 mensalidades. Preços e moeda vêm sempre da loja.
- Conteúdo digital é vendido só pelas compras da loja (Apple/Google). O kit físico é vendido fora do app (link externo, Pix).
- Hipótese a verificar: decisões regulatórias no Brasil (CADE vs. Apple) que permitam pagamento externo.

## 7. Erros e situações-limite

| Situação | Comportamento |
|---|---|
| Ligação / app em segundo plano | A gravação pausa, os lances salvos são mantidos e o buffer recomeça ao voltar |
| Superaquecimento | Reduz para 720p/30 e avisa. Em nível crítico, encerra com segurança e mantém os lances |
| Pouco espaço | Bloqueia "Começar jogo" abaixo de ~500 MB e avisa durante o jogo |
| Permissão negada | A tela explica o motivo e leva aos ajustes |
| Relógio/controle desconectado | O indicador fica cinza e os outros gatilhos continuam funcionando |
| App fechado inesperadamente | Limpa a pasta temporária ao abrir e mantém os lances já salvos |

## 8. Testes

- **JS (unitários):** trava de gatilhos, regras do Passe e do Pro, contador mensal e bloqueio da 6ª gravação grátis, plano fixado no início e limites do plano grátis, estado da sessão.
- **Nativo:** testes do anel de pedaços (descarte e junção), em aparelho real.
- **Campo:** sessões de 2h ao sol, num iPhone e num Android intermediário.

## 9. Etapas

- **Etapa 0, spike (~1 semana):** buffer de 60s + gesto X por 2h ao sol em 2 aparelhos. Critério para seguir: sem queda da gravação, gesto com poucos falsos positivos, aquecimento sob controle.
- **Etapa 1, MVP:** tudo das seções 3 a 8.
- **Fora da v1:**
  - login, nuvem, compartilhar com parceiros e convite de amigos;
  - multi-ângulo, resumo automático do jogo, ranking "Lance da Semana";
  - arenas (B2B) e patrocínio na exportação;
  - loja do kit dentro do app.

### Ordem de entrega (atualizada em 2026-10-18)

Decisão do Marcus: entregar todas as funcionalidades antes de cobrar.

1. Plano 1: motor de câmera (feito)
2. Plano 2: telas, gatilhos e armazenamento (feito)
3. Plano 3: editor, Story (removido em 2026-10-23), nome do jogo e "Meus jogos"
4. Plano 4: modos de uso baseados em predefinições. "Esporte" vira "Modo", agrupado em **Quadra** (beach tennis, futevôlei, vôlei de praia, outro) e **Academia** (musculação, crossfit, funcional, outro). Cada modo é uma entrada de um único registro de predefinições, que o resto do app só lê:
   - guia de posicionamento desenhado sobre a câmera (quadra em perspectiva, silhueta de pessoa, nenhum) e a dica em texto;
   - lente padrão (0.5x quadra, 1x academia);
   - gatilhos ligados por padrão (academia: voz, controle e tela; gesto "braços para cima" desligado, pois exercícios acima da cabeça o disparariam);
   - buffer e corte padrão (quadra 60s / 30s; academia 2 min / 60s);
   - ~~templates e textos do Story~~ (removido em 2026-10-23: o Story saiu do app).
   Ajustes que o usuário fizer ficam salvos por modo. Novos modos (skate, corrida, dança, família) = nova entrada no registro.
5. Plano 5: apps de relógio
6. Android no aparelho e teste de campo
7. Último: pagamento e assinatura (seção 6). `usePlan()` e `session.paid` decidem o que é pago (spec de pagamentos).

## 10. Métricas de sucesso (metas iniciais são hipóteses)

| Métrica | Meta |
|---|---|
| % de jogos com ≥1 lance salvo | > 70% |
| Lances postados / salvos | > 30% |
| Uso por gatilho | descobrir |
| Conversão do paywall (por ponto de entrada) | > 5% |
| Volta em 30 dias | > 25% |

## 11. Lançamento

- 2–3 arenas de beach tennis da região como piloto.
- Kit de presente para os primeiros jogadores, em troca de feedback e de Stories marcando o app.

## 12. Questões em aberto

- Nome definitivo do app.
- Ferramenta de analytics.
- Fornecedor e design do kit físico (clipe para alambrado + haste para areia, com quebra-sol).
- Quadro da exportação: manter o 9:16 com faixas (padrão atual) ou mudar.
