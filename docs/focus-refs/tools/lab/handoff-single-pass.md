# Handoff: Foco na Bola with ONE pass instead of two (2026-11-04)

Continuação do laboratório do Modo Foco (app Lance/Repplay, iPhone). Sou o Victor; fale comigo em português do Brasil.

## Regras (valem para toda a sessão)
- Não rode comandos git de escrita (commit, pull, push, checkout -b…); leituras (status, diff, log) podem. Eu rodo o git; sugira os comandos.
- Não use optional chaining (`?.`) em código; use checagens explícitas.
- Specs e documentos técnicos em inglês, inclusive o nome do arquivo.
- Só recursos gratuitos; nada AGPL/GPL (nada de Ultralytics/YOLO).
- **Não altere o código do app** (`app/`): isto é teste. Tudo fica em `docs/focus-refs/tools/lab/`.
- `app/src/payments/fieldTest.ts` é mudança minha não commitada: fica fora de commits.

## Onde está tudo (no meu Mac, pasta conectada `~/Documents/Projetos/Nexus/Lance`)
- Leia primeiro: `docs/focus-refs/tools/lab/README.md` (testes 1–11, resultados) e a spec
  `docs/superpowers/specs/2026-11-04-focus-mode-ball-design.md` (seção 3 = fatos, 4.4 = ROI, 4.5 = regras de enquadramento,
  10 item 5 = este trabalho).
- Scripts (`docs/focus-refs/tools/lab/`): `oneclick.py` (EdgeTAM/SAM 2 a partir de um clique; `--model edgetam`,
  `--variant roi40b`), `roi.py` (recortes; `--guide b` = guiado pela 1ª passada, `--guide p` = só pelos jogadores),
  `hybrid.py` (enquadramento rodada 6, `--render` gera o vídeo comparativo), `coreml_export.py` (modelos Core ML, o laço
  `track` em PyTorch/Core ML e `judge` = % do clipe em modo bola + acertos nos clipes marcados), `evaluate.py`, `loop.py`.
- Ambientes: `lab/.venv-edgetam` (EdgeTAM + coremltools; roda no Mac, MPS/CPU). O contêiner da nuvem não baixa os pesos;
  rode no Mac (eu executo os comandos que você passar) ou leve `lab/models/edgetam.pt` para o contêiner.
- Dados: `lab/frames/<clip>/` (10 fps, lado maior 1280), `lab/frames/<clip>@roi40b/` (recortes + `roi.json`),
  `lab/tests/oneclick/<clip>.ball.<tag>.json` (rastros), `lab/tests/framing/` (enquadramentos e vídeos),
  `labels/<clip>.ball.json` (gabarito; só basket-v-01, bt-0AE39B33, bt-E5003B6B e yt-basket-04 têm marcação quadro a
  quadro, os outros só o clique inicial).

## O que já está decidido e medido
- Pipeline atual (referência a bater): EdgeTAM em **duas passadas** a 10 fps: (1) quadro inteiro reduzido a 1024×1024;
  (2) recorte quadrado de 40% do lado maior, cortado do vídeo em resolução cheia, centrado na bola confiável da passada 1
  (filtros da rodada 6, lacunas até 1 s preenchidas), senão no centro do enquadramento dos jogadores; σ 0,3 s. O
  enquadramento final usa a passada 2 com `hybrid.py` (rodada 6).
- Resultados da referência (modo bola, rodada 6; EdgeTAM roi40b): bt-wa-1028 74% (Core ML no Neural Engine 79%);
  yt-basket-04 100% e 98% de acertos no gabarito; yt-bt-06 84%; volei-app-1102 65%; basket-v-01 100% da bola dentro do
  recorte; bt-E5003B6B 94% da bola dentro do recorte (modo bola baixo, clipe difícil). Os vídeos de referência que aprovei:
  SAM 2 v4 (yt-basket-04, yt-bt-06) e SAM 2 v5 (bt-wa-1028).
- Custo: iPhone 16 Pro Max ~66 ms por quadro **por passada** nos modelos (tudo no Neural Engine); duas passadas ≈ 45 s
  por clipe de 30 s (estimativa). O teste de bateria/calor (soak) do FocusBench está rodando.
- Foco na Bola só em A14+ (iPhone 12 ou mais novo); disparado por um toque na bola no editor; zoom 2,0x no modo bola.

## A tarefa: testar uma passada só, sem perder qualidade
1. **(a) Recorte guiado só pelos jogadores**: `roi.py <clip> --size 0.4 --guide p` → `@roi40p`; EdgeTAM uma passada nesses
   recortes (`oneclick.py --model edgetam --variant roi40p`); enquadramento com `hybrid.py`.
2. **(b) Recorte que segue a bola do quadro anterior** (causal, durante o rastreamento): a partir do clique, cada quadro é
   recortado em volta da última posição confiável da bola (com previsão simples de velocidade, se ajudar) e volta ao
   centro dos jogadores quando ela se perde; para frente a partir do clique e depois para trás. Precisa de um laço próprio:
   use o laço de `coreml_export.py` (`track` com `TorchRunner`, que reproduz o EdgeTAM oficial: banco fixo, vagas vazias
   desligadas) com um provedor de quadros que corta o vídeo em resolução cheia na hora (como `roi.py` faz com ffmpeg).
3. Para cada estratégia e clipe: `judge` (modo bola e acertos) e o resumo de `hybrid.py` (bola dentro do recorte etc.),
   lado a lado com a referência de duas passadas. Depois, os vídeos `--render` dos melhores para eu avaliar.
4. Se alguma empatar com as duas passadas, registre no README (novo teste) e proponha a mudança na spec (seção 4.4 e
   tempo na seção 5); senão, registre por que não serviu.

Comece lendo o README e a spec e me diga o plano em poucas linhas antes de rodar.
