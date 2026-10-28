# Backlog técnico

Itens adiados nas revisões finais. Nada aqui bloqueia o uso, mas vale resolver antes do piloto.

## Plano 1 — ReplayCamera
- Capacidade do buffer por número de segmentos; preferir descarte por tempo.
- iOS: start/stopRunning na mesma fila das amostras.
- Android: qualquer pausa da activity (bloqueio de tela, diálogos) zera o buffer.
- Android: ultra-wide acessível só por zoom < 1 em câmera lógica não é usada.
- Android: prévia esticada (TextureView sem transformação).
- Remover o evento de diagnóstico `onGestureDebug` e a rota `/spike` antes da loja.

## Plano 2 — telas e gatilhos
- Erros nativos que não são de calor aparecem todos como "erro na câmera" (LOW_STORAGE no meio do jogo deveria dizer pouco espaço).
- Toque duplo em "Desfazer" pode descontar dois lances; toque duplo em "Começar jogo" pode iniciar duas vezes.
- Voltar (Android) na tela de erro ou durante o encerramento pergunta de novo se quer encerrar.
- `onError` fora da gravação marca a sessão como encerrada na tela de posicionar.
- Ícones de gatilho na gravação aparecem ativos mesmo com o gesto desligado.
- CAMERA_PERMISSION na tela de posicionar não tem botão "Abrir Ajustes".
- `SavedOverlay` sem `accessibilityViewIsModal`.
- Miniatura: player vaza se a geração nunca terminar; cache guarda clipes apagados.
- Loop do player para se a mídia for mais curta que `durationMs`.
- Repositório: `endSession` com id desconhecido, JSON corrompido, dependência de `this`.
- Promessas sem tratamento (onboarding, háptico).
- Debounce do barramento atravessa jogos.
- Android: abrir a câmera antes da superfície da prévia estar pronta pode deixar a prévia preta — verificar no aparelho.

## Gesto, voz e avisos (revisão de 2026-10-18)
- Miniatura usa sempre o quadro do primeiro corte; depois de editar o corte ela não acompanha (aceitável).
- Voz: ~1–2s de fala se perdem a cada reinício de 50s; um comando bem na virada pode passar.
- Gesto: com muita gente no quadro, os 4 maiores são analisados; jogadores do lado de lá podem ficar de fora.
- Android: a ultra-wide geralmente não tem flash e não há alternativa (sem piscada na 0.5x).
- Android: `applyTorch` reconstrói a requisição de captura à mão; compartilhar um único construtor com `open()`.
- iOS: a troca de saída para o alto-falante a cada som pode mudar o microfone usado quando há fone Bluetooth.
- Bloco "Voz" não detecta permissão de fala revogada nos Ajustes.

## Editor, Story e Meus jogos (revisão de 2026-10-18)
- Erros de salvar na galeria/compartilhar (depois de exportar) aparecem como "Não foi possível preparar o vídeo".
- Alças do corte se sobrepõem no mínimo de 3s; a do fim fica por cima e a do início é difícil de pegar.
- `renameSession` com id desconhecido lança erro (a interface já evita).
- Android: overlay some em silêncio se o PNG não decodificar; sem redimensionar em proporções fracionárias; `durationMs` pode vir indefinido do Transformer.
- Android: FileProvider genérico pode conflitar com outra biblioteca no futuro (usar uma subclasse própria).
- iOS: corte que começa depois do fim real da mídia vira erro genérico.
- Jogos não encerrados aparecem em "Meus jogos" com 0 min gravados.

## Plano 4 (modos de uso) — minors adiados
- Template do Story é global: escolher Treino num Story de academia faz o próximo Story de quadra voltar para Placar (guardar por grupo de modo).
- Trocar Quadra ↔ Academia sempre cai no primeiro modo do grupo (lembrar o último modo de cada grupo).
- Dois modos com o rótulo "Outro" (quadra e academia) — diferenciar nas listas e no Story.
- `TEMPLATES` (só quadra) em `story/templates.ts` não é mais usado — remover.
- Android `ReplayEngine.kt`: `ring`/`windowSeconds` trocados na thread do engine e lidos no `saveExecutor` sem `@Volatile`.
- Story de academia pode ter até 120 s: confirmar no aparelho se o Instagram aceita ou divide.
- Clipes de academia ficam com ~90 MB (120 s inteiros) e o espaço livre só é checado no início do jogo.

## Plano 5 (Apple Watch) — adiados
- Web: `ReplayCameraModule.web.ts` não tem `watchSync`; o `SessionProvider` quebra no web (antes só a tela de preparação). Só importa se o web virar alvo.
- Acessibilidade do relógio: o alvo de toque em tela cheia anuncia só "Salvar" no VoiceOver.
- Medir no aparelho: calor do iPhone e quadros descartados com a câmera do relógio ligada por 5 min (o `CIImage` segura um buffer de captura enquanto codifica o JPEG).
- Build: `@bacons/apple-targets` 5.0.0 exige CocoaPods ≥ 1.17 (máquinas de build/EAS também); `deploymentTarget` 11.0 deixa de fora Series 4/5.
- Rodar o app do relógio pelo Xcode reinstala o app do iPhone em Debug: colocar a configuração Run do esquema "LANCE Watch" em Release.
- Quando o iPhone mata o app com o relógio em alcance, um toque no relógio ainda tenta abrir o app em segundo plano (a mensagem pode chegar antes do módulo estar pronto); hoje a tela do relógio vira "Sem conexão" em até 12 s.
- Câmera ocupada por outro app (ligação de vídeo no Meet/FaceTime): o iOS devolve -11800 e a tela só diz "A gravação parou: erro na câmera". Mostrar "A câmera está em uso por outro app. Encerre a ligação e tente de novo." quando o erro vier logo ao abrir.

## Editor unificado (zoom e velocidades)
- Android: a exportação ignora `crop` (zoom da prévia não vai para o arquivo). Fazer com `Crop` do Media3 na etapa do Android.
- Android: a exportação também ignora `rotation` (botão Girar do editor). Usar `ScaleAndRotateTransformation` do Media3.

## Modo Foco (2026-10-23)
- Medir no iPhone XR: tempo de análise e de exportação (meta: clipe de 30 s analisado em até ~30 s).
- Exportar um clipe horizontal com Modo Foco e conferir a marca d'água no canto em todos os quadros.
- Checklist de campo da spec (§8): contra-ataque, jogada parada, público perto da quadra, jogo inteiro com calor e bateria.
- Story a partir de clipe horizontal com o enquadramento vertical (decisão própria: muda o "nunca cortar a quadra").
- Bola por esporte (Create ML ou modelo Apache 2.0; nunca Ultralytics/AGPL no app).
- Modo Foco pago: entra no `entitlement` antes da loja.
- (revisão) Espelhar o zoom manual nos valores animados em `onChange`, não em `useEffect` (1 quadro de atraso na pinça e possível piscada do quadro inteiro ao assumir o enquadramento).
- (revisão) `focusQueue.ensure` deve pôr o clipe aberto na frente da fila (hoje espera atrás do acúmulo de um jogo quente).
- (revisão) Testar o filtro de pessoas paradas diretamente (o teste da arquibancada distingue 0,46 de 0,50 só).
- (revisão) Segurar para ver o original: limpar o timer ao desmontar e soltar o `peek` se o acompanhamento mudar durante o toque.
- (revisão) Vídeo quadrado: analisador usa largura >= altura, editor usa largura > altura.
- (revisão) Teste do layout do overlay (retrato e paisagem) prometido na spec §4.5.

## Tela do clipe: assistir + editar (revisão de 2026-10-23)
- Cancelar sem mudança não deveria regravar nem voltar o vídeo ao início do corte; também sincronizar o Modo Foco com o corte restaurado quando pausado.
- Se o início útil do clipe (`findContentStart`) chegar depois de abrir o modo edição, o Cancelar regrava o corte antigo: ajustar o instantâneo ao novo início.
- Tocar no selo do Modo Foco deveria contar como "última ferramenta usada".
- Altura fixa para o painel das ferramentas (hoje o vídeo muda de tamanho ao trocar de ferramenta).
- Trocar de modo remonta o vídeo: a entrada suave do Modo Foco se repete e pode piscar no Android. Conferir no aparelho.
- Barra de progresso: a bolinha deveria seguir o dedo enquanto arrasta, e falta acessibilidade (ajustável no VoiceOver/TalkBack).
- Alvos de toque abaixo de 44 pt: play da barra (40), selo do Modo Foco (36), botões redondos (42).
- Acessibilidade: selo "preparando" sem estado ocupado; barra de ferramentas sem papel de lista de abas; título EDITAR sem papel de cabeçalho.
- Segurar para 2x com o vídeo pausado mostra o selo 2x mas não toca (o Reels toca enquanto segura).
- Se o clipe sumir no modo edição, o primeiro "voltar" do Android é engolido.

## Feature futura: sugestão de corte e melhores momentos (protótipo de 2026-10-27)
- Ideia: achar sozinho o lance dentro de um clipe "puro" e sugerir o corte no editor (a pessoa aceita ou ajusta); com os cortes, "Compilar" junta todos os clipes no estado atual num vídeo só.
- Protótipo fora do app em `docs/highlights/` (só local, ignorado pelo git): scripts em Python, `relatorio.html` e os vídeos em `out/`. Como rodar: `docs/highlights/LEIAME.md`.
- Regra testada: movimento só dos jogadores na quadra (quem passa perto da câmera é ignorado) + sons secos de batida, a cada 100 ms; o trecho de atividade mais perto do gatilho vira o corte (6–15 s, termina no gatilho).
- Resultado com os 7 clipes da gravação de 26/10 (beach tennis): coincidência média de 73% com a referência marcada a olho, 5 de 7 acima de 88%.
- Pendências antes do app: testar com basquete e outros ângulos de câmera; gatilho falso do gesto (saque com braços para cima) gera clipe sem lance no fim.
- No app (2026-10-27, só iOS): a análise do Modo Foco grava o movimento da quadra (`CourtMotion.swift`) e `src/cutSuggestion/` aplica o corte sugerido quando o clipe ainda está com o corte original. Chave: `CUT_SUGGESTION_ENABLED`. Para remover: a pasta `src/cutSuggestion/`, `CourtMotion.swift` (+ testes), o `motion` em `FocusAnalyzer.swift`, `analyzed` na fila do Modo Foco, `cutSuggestion` no schema/repo e o bloco da sugestão em `app/clip/[id].tsx`.
- Ainda não feito: "Compilar melhores momentos" automático; Android.
