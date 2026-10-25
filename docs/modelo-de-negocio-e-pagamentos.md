# Modelo de negócio e pagamentos

> **Fonte da verdade** das regras de plano. Se um spec ou plano antigo em `docs/superpowers/` disser outra coisa (5 gravações grátis, 720p no grátis, controle Bluetooth e celular controle pagos), vale este documento. Atualizado em 2026-10-24.

## Planos

| Recurso | Grátis | Pro |
|---|---|---|
| Gravações | **3 por mês** (mês civil local) | Ilimitadas, com todos os recursos |
| Exportação | **Full HD (1080×1920)** | Full HD (1080×1920) |
| Duração do clipe | Só **15 s** | Acima de 15 s |
| Som | Toca no editor, mas **não vai no vídeo salvo/enviado** | Vai no vídeo |
| Marca d'água | Sim, em todo clipe | **Removida** |
| Modo Foco | Funciona no editor (para experimentar), mas **não vai no vídeo salvo/enviado** | Liberado, vai no vídeo |
| Velocidade | Funciona no editor, mas o vídeo sai sempre em **1x** | Vai no vídeo |
| Compilar clipes | Bloqueado (abre o paywall) | Liberado |
| Gatilhos | Voz, gesto, toque na tela, controle Bluetooth e celular controle | Todos, **incluindo o relógio** |

Só o **relógio** (Apple Watch) é um gatilho pago. Os demais estão liberados no grátis.

Continuam livres nos dois planos: zoom, girar, cortar, salvar e enviar (um clipe ou em lote). No grátis, salvar e enviar mostram antes o aviso do que o vídeo não terá.

## Como se paga

- **Pro** (assinatura, entitlement `pro`): `pro_monthly` R$ 14,90/mês e `pro_annual` R$ 99,90/ano.
- **Passe Avulso** (consumível, `single_pass`, R$ 4,90): libera **uma** gravação com tudo do plano pago, inclusive sem marca d'água. Não conta nas 3 grátis.
- Tudo passa pelo RevenueCat (oferta `default`). Detalhes de produtos e lojas: `docs/superpowers/specs/2026-10-20-payments-revenuecat-design.md`.

## Como o app decide

**Ao começar uma gravação** (`startPlan`, `app/src/payments/rules.ts`), nesta ordem:

1. Pro ativo → gravação paga (nenhum passe é gasto).
2. Há Passe Avulso não usado → o mais antigo é consumido; gravação paga.
3. Ainda há grátis no mês (`freeUsed < 3`) → gravação grátis; o contador sobe.
4. Senão → bloqueado (paywall).

O plano da gravação fica **fixado no início** (`Session.paid`). Uma gravação grátis já feita pode ser liberada depois (Pro ou Passe, `payments/unlock.ts`); com Pro ativo, todas as gravações se comportam como pagas enquanto durar (`useViewPlan`).

**O que cada plano muda, e onde:**

| Regra | Onde fica |
|---|---|
| Limite mensal (`FREE_RECORDINGS_PER_MONTH = 3`) | `payments/rules.ts` |
| 15 s no grátis (`FREE_MAX_SECONDS`), aplicado na captura | `payments/limits.ts` (`captureConfig`) e seletor de duração em `app/setup.tsx` |
| Gatilho pago (`PAID_TRIGGERS = ['watch']`) | `payments/limits.ts` (`triggerAllowed`), usado em `app/setup.tsx` e `session/SessionContext.tsx` |
| Aviso antes de exportar no grátis (salvar, enviar, compilar) | `components/FreeExportSheet.tsx` + `components/useFreeExportGate.tsx`; usado em `run()` de `app/clip/[id].tsx`. Lista só o que o clipe tinha e o vídeo não terá (`freeLosses` em `share/exportOptions.ts`: som, velocidade, Foco) e sempre a marca d'água e oferece Liberar com o Pro / Continuar no plano grátis / Cancelar. A compilação deve chamar o mesmo `ask` |
| Compilar pago | `share/useBatchActions.ts` (`compile`: no grátis abre o paywall) e `canCompile` em `payments/limits.ts`. Salvar/enviar em lote no grátis passam pelo mesmo aviso de exportação em `app/session/[id].tsx` |
| Resolução, som, velocidade, Foco e marca d'água na exportação | `share/exportOptions.ts` (`exportOptions`); a marca é desenhada por `share/ShareOverlay.tsx` |

Quem decide o plano na tela: `usePlan` (antes de gravar e durante a gravação) e `useViewPlan` (clipe já gravado), em `share/entitlement.ts`.

## Textos que mencionam as regras

`app/src/i18n/locales/pt-BR.ts` e `en.ts`: `summary.freeNote`, `games.proMessage`, `unlock.message`, `clip.focusPro`, `clip.speedFree`, `clip.soundFree`, `freeExport.*`, `setup.watchProOnly`, `setup.proOnly`.

Fora do código (a atualizar nas lojas e no RevenueCat quando publicar): descrição do paywall, textos da App Store / Google Play e o paywall publicado no painel do RevenueCat, que devem listar as regras da tabela acima.

## Ao mudar uma regra

1. Altere a constante ou função no arquivo da tabela acima.
2. Rode `npx jest`, `npx tsc --noEmit` e `npx expo lint` em `app/`.
3. Revise os textos acima nos dois idiomas.
4. Atualize este documento.
