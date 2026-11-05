# Handoff: a more "broadcast" Modo Foco without the ball tracker (2026-11-04)

Continuação do laboratório do Modo Foco (app Lance/Repplay, iPhone). Sou o Victor; fale comigo em português do Brasil.

## Regras (valem para toda a sessão)
- Não rode comandos git de escrita (commit, pull, push, checkout -b…); leituras (status, diff, log) podem. Eu rodo o git;
  sugira os comandos.
- Não use optional chaining (`?.`) em código; use checagens explícitas.
- Specs e documentos técnicos em inglês, inclusive o nome do arquivo.
- Só recursos gratuitos; nada AGPL/GPL (nada de Ultralytics/YOLO da Ultralytics).
- **Não altere o código do app** (`app/`) até eu aprovar: isto é teste. Tudo fica em `docs/focus-refs/tools/` e
  `docs/focus-refs/tools/lab/`.
- `app/src/payments/fieldTest.ts` é mudança minha não commitada: fica fora de commits.

## Por que este trabalho
O Modo Foco atual (só jogadores) vai para produção: é o mais estável e o mais leve. No iPhone 16 Pro Max (FocusBench,
teste de 30 min), analisa um clipe de 30 s em ~15 s e não esquenta. O Foco na Bola (EdgeTAM, um toque na bola) dá o
movimento de câmera que eu quero, mas custa caro: 1 passada ~27 s por clipe e esquenta em uso contínuo
(`serious` após ~11 min); 2 passadas 52 s. Quero o **ar profissional** do modo bola — câmera mais rápida acompanhando
a jogada, mais movimento e zoom — **com o custo de hoje** (perto de 15 s por clipe, sem esquentar). Não precisa ser
igual ao modo bola; precisa ficar mais "transmissão de TV" que o atual.

## Onde está tudo (no meu Mac, pasta conectada `~/Documents/Projetos/Nexus/Lance`)
- Leia primeiro:
  - `docs/superpowers/specs/2026-10-23-focus-mode-design.md` (Modo Foco atual: §4.1 análise, §4.2 regras do caminho
    e as emendas v13/v15).
  - `docs/superpowers/specs/2026-11-04-focus-mode-ball-design.md` (§4.5: regras de enquadramento da bola que aprovei
    nos vídeos — rampas, câmera vertical sem "balançar" em quiques, zoom 2,0x).
  - `docs/focus-refs/tools/lab/README.md` (testes 1–12 e o soak do teste 11).
- O pipeline de hoje: `app/modules/replay-camera/ios/FocusAnalyzer.swift` (Vision, pessoas no quadro inteiro + 9
  regiões, 10 fps) → `ReplayCore/FocusPath.swift` com `FocusTuning.action` (v15 "acao") → `<clip>.focus.json`.
- Porta em Python, igual ao Swift: `docs/focus-refs/tools/focus_variant.py` (`--preset acao`, `--set nome=valor`,
  `--check` compara com o arquivo do app). Pessoas vêm de `tools/vision-probe.swift` (binário `lab/vision-probe`,
  arquivos `renders/<clip>.people.json`); `tools/lab/new-clip.sh` mostra como.
- Enquadramento de hoje por clipe do lab: `lab/tests/framing/<clip>.current.focus.json`. Medidas e vídeos:
  `tools/lab/hybrid.py` (`scores`: bola dentro do recorte, distância do centro, zoom, jerk p95, viradas verticais;
  `--render` faz o vídeo comparativo) e `tools/lab/compare_runs.py`.
- Gabarito da bola quadro a quadro: `labels/` (basket-v-01, bt-0AE39B33, bt-E5003B6B, yt-basket-04); os outros clipes
  (bt-wa-1028, yt-bt-06, volei-app-1102, basket-app-1031-a/b) só têm o clique inicial: avaliação por vídeo.
- Custo no iPhone: o FocusBench (`tools/lab/ios-bench/`, `Soak.swift`, modo "Modo Foco atual (pessoas)") mede tempo,
  bateria e calor por clipe; `tools/lab/ios_bench.py results` monta a tabela.

## A tarefa (item 2 da minha conversa anterior)
Testar, no lab, três ideias que mantêm o custo de hoje:
1. **Regras de câmera mais rápidas e mais próximas**: menos suavização em x (hoje σ 0,6 s), pan mais rápido (hoje
   35% da largura por segundo), mais zoom quando o grupo está compacto (hoje até 1,5x; aceitei 2,0x no modo bola), e as
   lições da bola para o vertical (subir rápido, descer devagar, sem balançar). Tudo com `focus_variant.py --set …` ou
   novas opções nele, sem mexer no app.
2. **Antecipar a jogada**: o caminho é calculado depois da gravação, então dá para mirar onde os jogadores vão estar
   (~0,5 s à frente), puxado por quem corre mais rápido.
3. **Movimento da imagem como sinal**: fluxo óptico do Vision (`VNGenerateOpticalFlowRequest`, gratuito) a 10 fps
   (em resolução reduzida), num novo probe Swift como o `vision-probe.swift`; a região de movimento rápido puxa a câmera.
   Medir também o custo dele no iPhone (um modo novo no soak do FocusBench), porque o critério é ficar perto de 15 s
   por clipe e frio.

Para cada variante: a tabela de `hybrid.scores` nos clipes marcados, lado a lado com o atual (`current`) e com o
Foco na Bola v6 (referência de "bola dentro do recorte"); depois vídeos comparativos (atual | variante) dos melhores
para eu avaliar. Registre como teste 13 no README. Se alguma variante ganhar, proponha a mudança de `FocusTuning` como
emenda na spec de 2026-10-23 — sem mexer no app até eu aprovar.

Comece lendo as duas specs e o README e me diga o plano em poucas linhas antes de rodar.
