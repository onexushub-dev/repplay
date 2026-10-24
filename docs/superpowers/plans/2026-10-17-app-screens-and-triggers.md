# App Screens + Trigger Bus (Plano 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the spike screen with the real first-run → setup → recording → end-of-game flow from the mockups, with one trigger bus fed by screen, Bluetooth remote and gesture, and sessions/clips stored on the phone.

**Architecture:** Pure TypeScript cores (trigger bus, session reducer, repository over a key-value port) carry all logic and are unit-tested. They are wired to the `ReplayCamera` module, MMKV and the volume-button listener through thin hooks. Screens are Expo Router routes styled from one token file taken from the mockups.

**Tech Stack:** Expo SDK 58, Expo Router, React 19.3, `react-native-mmkv`, `react-native-volume-manager`, `expo-video`, `expo-haptics`, `expo-crypto`, `react-native-svg`, `@expo-google-fonts/barlow-condensed`, `@expo-google-fonts/manrope`, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-10-17-lance-design.md` (sections 3.1–3.4, 3.7, 3.10, 3.11, 4.4, 5, 7). Mockups: https://claude.ai/artifact/2Cj7DeSydAkeWGADELpFKw (screens 1, 2, 3, 4, 7).

## Global Constraints

- **Out of scope:** paywall and free limits (Plan 4), editor/export/Story/gallery (Plan 3), watch apps and pairing (Plan 5). Where a mockup shows those, render the placeholder named in the task, nothing more.
- **Tokens (from the brand kit, docs/brand/repplay):** ground `#0B0B09`, recording ground `#070806`, surface `#1B1D18`, border `#3A3D34`, text `#F3EDE1`, muted `#A9A79C`, soft `#CFCBBF`, accent `#D6F23F`, on-accent `#0B0B09`, rec `#FF5A36`, warning `#FF8A3D`, warning ground `#3A1D10`. Display font Barlow Condensed 700/800, body Manrope 400/600/700. The UI is always dark.
- Touch targets ≥ 44 pt; primary buttons 58 pt tall, radius 16.
- All UI copy in pt-BR, **exactly as written in each task**.
- Trigger debounce: **3000 ms** between accepted triggers, all sources together (spec 4.4).
- Default clip trim = last **30 s** of the saved clip (`trim = { startMs: max(0, durationMs - 30000), endMs: durationMs }`).
- IDs are `expo-crypto` `randomUUID()` (spec 5). Storage keys are prefixed `lance:v1:`.
- `ReplayCameraView` must be mounted **before** `startSession` (Android ruling, Plan 1).
- Device builds: Release configuration, signed with team `2J67Z98LDX`, installed with `xcrun devicectl` (no Metro).
- Keep the Etapa 0 spike screen reachable at route `/spike` for the field test.
- Before using any Expo/third-party API in a task, read its SDK 58 / current docs page (the app's `AGENTS.md` rule); record any API that differs from this plan as a ledger ruling.

## Review Focus

1. **Trigger arrives while a save is in flight** (gesture right after a screen tap) → the bus debounce drops it; the user sees no second "Lance salvo", no error. → Task 3 `drops a trigger inside the debounce window` + Task 5 `ignores trigger while saving`.
2. **Native `onError` mid-game** (thermal critical, camera lost) → recording screen leaves "gravando", shows the error copy and offers "Voltar", and the clips saved so far are on the end-of-game screen. → Task 5 `native error ends the session keeping clips`.
3. **App to background and back** (`onInterrupted` / `onResumed`) → banner "Gravação pausada" while interrupted, cleared on resume; counter and saved clips unchanged. → Task 5 `interruption sets and clears paused`.
4. **Clip file missing on disk** (deleted by the OS or "Desfazer" racing a render) → end-of-game grid skips it and the stats don't count it; no crash. → Task 2 `listClips drops clips whose file is gone`.
5. **Start refused** (`LOW_STORAGE`, `CAMERA_PERMISSION`) → setup screen stays, shows the task's copy for that code, and the start button is usable again. → Task 5 `start failure returns to idle with the error code`.

---

### Task 1: Theme, fonts, base components, app shell

**Files:**
- Create: `app/src/theme/tokens.ts`, `app/src/components/Button.tsx`, `app/src/components/Chip.tsx`, `app/src/components/__tests__/Button.test.tsx`
- Modify: `app/src/app/_layout.tsx` (load fonts, dark Stack, no headers), `app/app.json` (`userInterfaceStyle: "dark"`)
- Move: `app/src/app/index.tsx` → `app/src/app/spike.tsx` (unchanged content)
- Create: `app/src/app/index.tsx` (temporary: `<Redirect href="/onboarding" />`, replaced in Task 6)

**Interfaces:**
- Produces: `tokens` (`colors`, `fonts: { display, displayBold, body, bodySemi, bodyBold }`, `radius`, `space`); `<Button label onPress variant?: 'primary'|'secondary' disabled? icon? />`; `<Chip label selected? onPress? />`.

- [ ] **Step 1:** `npx expo install react-native-svg @expo-google-fonts/barlow-condensed @expo-google-fonts/manrope expo-font` and `npm i -D @testing-library/react-native`.
- [ ] **Step 2: Write the failing test** `Button.test.tsx`: renders the label; `fireEvent.press` calls `onPress`; with `disabled`, pressing does not call it and the element has `accessibilityState.disabled === true`.
- [ ] **Step 3:** `npx jest src/components` → FAIL (module not found).
- [ ] **Step 4:** Implement `tokens.ts` with the Global Constraints values, then `Button` (`Pressable`, `accessibilityRole="button"`, primary = accent fill + on-accent text 17/700; secondary = surface fill + border) and `Chip` (40 pt tall pill; selected = accent fill). In `_layout.tsx`, keep the splash up until fonts load, then render `<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }} />`.
- [ ] **Step 5:** `npx jest` → PASS; `npx tsc --noEmit` and `npx expo lint` clean.
- [ ] **Step 6: Commit** `feat(app): theme tokens, fonts and base components`

---

### Task 2: Local data — schema, repository, MMKV adapter

**Files:**
- Create: `app/src/data/schema.ts`, `app/src/data/repo.ts`, `app/src/data/mmkv.ts`, `app/src/data/__tests__/repo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Sport = 'beachTennis' | 'futevolei' | 'voleiPraia' | 'outro';
  type TriggerSource = 'screen' | 'gesture' | 'remote' | 'watch'; // re-export from replay-camera
  type Session = { id: string; sport: Sport; startedAt: number; endedAt?: number };
  type Clip = { id: string; sessionId: string; createdAt: number; source: TriggerSource;
                path: string; durationMs: number; trim: { startMs: number; endMs: number } };
  type Prefs = { onboardingDone: boolean; sport: Sport; lens: 'ultraWide' | 'wide'; gestureEnabled: boolean };
  interface KV { getString(k: string): string | undefined; set(k: string, v: string): void; delete(k: string): void }
  interface FileProbe { exists(path: string): boolean; sizeBytes(path: string): number }
  createRepo(kv: KV, files: FileProbe, newId: () => string): {
    getPrefs(): Prefs; setPrefs(p: Partial<Prefs>): Prefs;
    startSession(sport: Sport, now: number): Session; endSession(id: string, now: number): Session;
    addClip(c: Omit<Clip, 'id' | 'trim'>): Clip; deleteClip(id: string): void;
    listClips(sessionId: string): Clip[];            // oldest first, only files that exist
    sessionStats(sessionId: string): { clips: number; bytes: number; recordedMs: number };
  }
  ```
- `mmkv.ts` exports `kv: KV` (an `MMKV` instance, id `lance`) and `files: FileProbe` (via `expo-file-system` `File`).

- [ ] **Step 1:** `npx expo install react-native-mmkv expo-crypto` (read the react-native-mmkv README for the version that matches RN 0.88 / New Architecture).
- [ ] **Step 2: Write the failing tests** with an in-memory `KV` and a fake `FileProbe`:
  - `prefs default to onboarding not done, beach tennis, ultra-wide, gesture on`
  - `addClip sets the default trim to the last 30s` (durationMs 60000 → `{ startMs: 30000, endMs: 60000 }`; durationMs 12000 → `{ 0, 12000 }`)
  - `listClips returns clips of one session oldest first`
  - `listClips drops clips whose file is gone` (Review Focus 4)
  - `deleteClip removes it from the list`
  - `sessionStats sums sizes of existing clips and the recorded time` (`recordedMs = endedAt - startedAt`; 0 while the session has no `endedAt`)
- [ ] **Step 3:** `npx jest src/data` → FAIL.
- [ ] **Step 4:** Implement `repo.ts`: one JSON value per record (`lance:v1:session:<id>`, `lance:v1:clip:<id>`), plus index lists `lance:v1:clips-of:<sessionId>` and `lance:v1:prefs`. Implement `mmkv.ts`.
- [ ] **Step 5:** `npx jest` → PASS.
- [ ] **Step 6: Commit** `feat(app): local sessions and clips repository`

---

### Task 3: Trigger bus

**Files:**
- Create: `app/src/triggers/bus.ts`, `app/src/triggers/__tests__/bus.test.ts`

**Interfaces:**
- Produces: `createTriggerBus({ debounceMs = 3000, now = Date.now }): { fire(source: TriggerSource): boolean; subscribe(fn: (source: TriggerSource, at: number) => void): () => void }`. `fire` returns true and notifies subscribers when accepted, false when inside the debounce window of the last accepted trigger.

- [ ] **Step 1: Write the failing tests** (inject `now`):
  - `accepts the first trigger and notifies with source and time`
  - `drops a trigger inside the debounce window` (fire at 0 → true, at 2999 → false, at 3000 → true)
  - `debounce is shared across sources` (screen at 0, gesture at 1000 → false)
  - `unsubscribe stops notifications`
- [ ] **Step 2:** `npx jest src/triggers` → FAIL.
- [ ] **Step 3:** Implement `bus.ts`.
- [ ] **Step 4:** `npx jest` → PASS.
- [ ] **Step 5: Commit** `feat(app): trigger bus with shared 3s debounce`

---

### Task 4: Bluetooth remote via volume buttons

**Files:**
- Create: `app/src/triggers/useVolumeRemote.ts`, `app/src/triggers/__tests__/useVolumeRemote.test.tsx`

**Interfaces:**
- Consumes: `bus.fire` (Task 3).
- Produces: `useVolumeRemote(enabled: boolean, onPress: () => void): void`. While enabled: hides the system volume HUD, fires `onPress` on each volume-up change, and sets the volume back to the level it had when enabled so the next press is detected again; restores the HUD and stops listening when disabled or unmounted.

- [ ] **Step 1:** `npx expo install react-native-volume-manager`; read its README for: the listener API, hiding the native volume UI, and setting the volume. Note in the ledger the exact function names you use.
- [ ] **Step 2: Write the failing test** with the library mocked: rendering with `enabled=true` registers one listener and hides the HUD; a volume change event calls `onPress` once and calls the set-volume function with the starting level; the change caused by that reset does **not** call `onPress` again; unmounting removes the listener and shows the HUD.
- [ ] **Step 3:** `npx jest src/triggers` → FAIL.
- [ ] **Step 4:** Implement the hook. Ignore the change event produced by its own reset (compare against the level it just set, with a 0.01 tolerance).
- [ ] **Step 5:** `npx jest` → PASS.
- [ ] **Step 6: Commit** `feat(app): bluetooth remote trigger through volume buttons`

---

### Task 5: Session controller (reducer + hook)

**Files:**
- Create: `app/src/session/reducer.ts`, `app/src/session/__tests__/reducer.test.ts`, `app/src/session/useReplaySession.ts`, `app/src/session/__tests__/useReplaySession.test.tsx`

**Interfaces:**
- Consumes: `startSession/stopSession/saveClip/addReplayListener/setGestureEnabled` (replay-camera), `createTriggerBus` (Task 3), `useVolumeRemote` (Task 4), `createRepo` (Task 2).
- Produces:
  ```ts
  type Phase = 'idle' | 'starting' | 'recording' | 'stopping' | 'ended';
  type SessionState = { phase: Phase; sessionId?: string; startedAt?: number; clipCount: number;
    lastSaved?: { clipId: string; number: number; source: TriggerSource; at: number };
    saving: boolean; paused: boolean; thermal: { level: ThermalLevel; degraded: boolean };
    error?: ReplayErrorCode };
  reducer(state, action): SessionState   // actions: startRequested, started, startFailed(code), saveStarted,
                                          // saved(clip, number), saveFailed, undone(clipId), interrupted, resumed,
                                          // thermal(level, degraded), nativeError(code), stopRequested, stopped
  useReplaySession(): { state; start(sport: Sport): Promise<void>; stop(): Promise<string | undefined>; // ended session id
    trigger(source: TriggerSource): void; undoLast(): void }
  ```

- [ ] **Step 1: Write the failing reducer tests:**
  - `start happy path: idle → starting → recording`
  - `start failure returns to idle with the error code` (Review Focus 5)
  - `saved increments the count and sets lastSaved`
  - `undone decrements the count and clears lastSaved`
  - `interruption sets and clears paused` (Review Focus 3)
  - `native error ends the session keeping clips` (phase `ended`, `error` set, `clipCount` unchanged — Review Focus 2)
  - `thermal stores level and degraded`
- [ ] **Step 2: Write the failing hook tests** (replay-camera, repo and volume hook mocked; bus real with fake `now`):
  - `trigger saves a clip and records it in the repo` (saveClip resolves → `repo.addClip` called with the source and duration)
  - `ignores trigger while saving` (second trigger before saveClip resolves → saveClip called once; Review Focus 1)
  - `native onTrigger goes through the bus` (gesture event → saved with source `gesture`)
  - `undoLast deletes the clip file and the record`
  - `stop ends the repo session and returns its id`
- [ ] **Step 3:** `npx jest src/session` → FAIL.
- [ ] **Step 4:** Implement. The hook owns one bus per mounted session screen; screen taps call `trigger('screen')`; the volume hook is enabled only while `phase === 'recording'`. `undoLast` deletes the file with `expo-file-system` and calls `repo.deleteClip`. Haptic `notificationAsync(Success)` on each save (`expo-haptics`).
- [ ] **Step 5:** `npx jest` → PASS.
- [ ] **Step 6: Commit** `feat(app): session controller wiring camera, triggers and storage`

---

### Task 6: First run (Boas-vindas) and entry routing

**Files:**
- Create: `app/src/app/onboarding.tsx`, `app/src/app/__tests__/index.test.tsx`
- Modify: `app/src/app/index.tsx` → redirect to `/onboarding` when `prefs.onboardingDone` is false, else `/setup`

**Copy (mockup 1):** title `GRAVE O JOGO INTEIRO.` / `GUARDE SÓ O LANCE.` (second line in accent); steps `Prenda o celular na grade ou na areia, atrás da linha de fundo.` · `Fez um lance bom? Braços em X, toque no relógio ou no controle.` · `Poste direto no Story do Instagram.`; note `Só os lances que você salvar ficam no seu celular. O resto é apagado automaticamente.`; button `Permitir câmera e começar`; caption `Sem cadastro. Grátis para começar.`

- [ ] **Step 1: Write the failing test:** with prefs `onboardingDone: false` the index redirects to `/onboarding`; with `true`, to `/setup` (mock the repo).
- [ ] **Step 2:** `npx jest src/app` → FAIL.
- [ ] **Step 3:** Implement. The button calls `requestPermissions()`; on true → `setPrefs({ onboardingDone: true })` and `router.replace('/setup')`; on false → stay and show `Sem câmera não dá para gravar os lances. Libere em Ajustes.` with a secondary button `Abrir Ajustes` (`Linking.openSettings()`).
- [ ] **Step 4:** `npx jest` → PASS.
- [ ] **Step 5: Commit** `feat(app): first-run screen and entry routing`

---

### Task 7: Posicionar câmera (setup)

**Files:**
- Create: `app/src/app/setup.tsx`, `app/src/components/CourtGuide.tsx`, `app/src/components/TriggerStatus.tsx`, `app/src/app/__tests__/setup.test.tsx`

**Copy (mockup 2):** header `Posicionar câmera`; tip `Atrás da linha de fundo, na altura do ombro`; lens toggle `0.5x` / `1x`; section `ESPORTE` with chips `Beach tennis` `Futevôlei` `Vôlei de praia` `Outro`; section `COMO SALVAR O LANCE` with tiles `Tela` / `Sempre ativa`, `Gesto X` / `Ativo` or `Desligado` (tap toggles), `Controle` / `Aperte para testar` → `Funcionando` after one volume press, `Relógio` / `Em breve` (disabled, Plan 5); button `Começar jogo`. Start errors: `LOW_STORAGE` → `Pouco espaço no celular. Libere pelo menos 500 MB para gravar.`; `CAMERA_PERMISSION` → `Sem câmera não dá para gravar os lances. Libere em Ajustes.`; other → `Não foi possível abrir a câmera. Tente de novo.`

- [ ] **Step 1: Write the failing tests:** chip press stores the sport in prefs; gesture tile toggles `prefs.gestureEnabled`; `Começar jogo` calls `start(sport)` and navigates to `/recording` on success; on `startFailed('LOW_STORAGE')` the low-storage copy is shown and the button is enabled again.
- [ ] **Step 2:** `npx jest src/app` → FAIL.
- [ ] **Step 3:** Implement. Full-screen `ReplayCameraView` behind the sheet (mounted before start). `CourtGuide` = dashed accent trapezoid in `react-native-svg` over the preview. Lens choice is stored in prefs and passed to `start`. The "Controle" tile listens with `useVolumeRemote` while on this screen.
- [ ] **Step 4:** `npx jest` → PASS.
- [ ] **Step 5: Commit** `feat(app): camera setup screen`

---

### Task 8: Gravando + Lance salvo

**Files:**
- Create: `app/src/app/recording.tsx`, `app/src/components/SavedOverlay.tsx`, `app/src/app/__tests__/recording.test.tsx`

**Copy (mockups 3–4):** pill `Gravando` + elapsed `HH:MM:SS`; centre `N` / `lances salvos` and `Toque em qualquer lugar` / `para salvar o lance`; bar labels `Últimos 60s prontos` · `o resto é apagado`; trigger pills `Gesto X`, `Controle`, `Relógio` (relógio greyed); footer `Segure para encerrar o jogo` (1 s long-press). Heat banner when degraded: **Celular quente.** `Passamos para 720p/30 para não parar a gravação. Coloque na sombra se puder.` Paused banner: `Gravação pausada. Volte para o app para continuar.` Overlay (2 s, accent border): `LANCE #N SALVO`, `via <Tela|Gesto X|Controle|Relógio> · últimos 30s`, `Dá para ajustar o corte depois, dentro dos 60s guardados.`, button `Desfazer`. Native error: `A gravação parou: <motivo>` with button `Ver lances` (thermal → `celular muito quente`; other → `erro na câmera`).

- [ ] **Step 1: Write the failing tests:** tapping the screen calls `trigger('screen')`; a `saved` state shows the overlay with `LANCE #3 SALVO` and `via Gesto X`; `Desfazer` calls `undoLast`; long-press 1 s on the footer calls `stop` and navigates to `/session/<id>`; degraded thermal shows the heat banner; `nativeError` shows `A gravação parou` and `Ver lances`.
- [ ] **Step 2:** `npx jest src/app` → FAIL.
- [ ] **Step 3:** Implement. Dim the preview (opacity 0.16 over `#070806`). Overlay auto-hides after 2000 ms. Android back button = same as long-press stop, behind a confirm dialog `Encerrar o jogo?` / `Encerrar` / `Continuar`.
- [ ] **Step 4:** `npx jest` → PASS.
- [ ] **Step 5: Commit** `feat(app): recording screen with saved feedback`

---

### Task 9: Fim de jogo + clip player

**Files:**
- Create: `app/src/app/session/[id].tsx`, `app/src/app/clip/[id].tsx`, `app/src/components/ClipCard.tsx`, `app/src/app/__tests__/session.test.tsx`

**Copy (mockup 7):** subtitle `<Esporte> · <hoje|DD/MM>, HH:MM`; title `FIM DE JOGO`; stats `<Hh MM> gravadas` · `<N> lances` · `<X> MB guardados`; note `O restante do jogo já foi apagado do celular.`; card footer `HH:MM` · `<Tela|Gesto X|Controle|Relógio>`; buttons `Novo jogo` and `Postar um lance` (disabled with caption `Editor e Story chegam na próxima versão.` until Plan 3); empty state `Nenhum lance salvo neste jogo.` Clip screen: back button, player, `Apagar lance` (confirm `Apagar este lance?` / `Apagar` / `Cancelar`).

- [ ] **Step 1: Write the failing tests:** stats render from `sessionStats` (e.g. 2h14 / 4 / 92 MB); tapping a card navigates to `/clip/<id>`; empty state when no clips; `Novo jogo` replaces to `/setup`.
- [ ] **Step 2:** `npx jest src/app` → FAIL.
- [ ] **Step 3:** Implement. Thumbnails: read the SDK 58 `expo-video` docs for thumbnail generation; generate one at `trim.startMs` per card, lazily, and cache the image URI in memory. Grid = 2 columns. Clip player = `expo-video` `VideoView` looping the trim range.
- [ ] **Step 4:** `npx jest` → PASS; `npx tsc --noEmit`, `npx expo lint` clean.
- [ ] **Step 5: Commit** `feat(app): end-of-game screen and clip player`

---

### Task 10: On-device walk-through (iPhone)

**Files:**
- Modify: `docs/superpowers/field-test-etapa0.md` (one line under Status: Plan 2 flow verified on device, date)

- [ ] **Step 1:** `cd app && npx expo prebuild --platform ios --clean` then the Release build + `xcrun devicectl device install app` (see Global Constraints).
- [ ] **Step 2:** On the iPhone, walk: fresh install → Boas-vindas → permitir → Posicionar (choose Futevôlei, toggle gesture off/on, press the Bluetooth remote once → `Funcionando`) → Começar jogo → save by tap, by X gesture, by remote; tap twice within 3 s → one save only; Desfazer the last one → hold to end → Fim de jogo shows the right count and MB → open a clip, it plays the last 30 s → Novo jogo.
- [ ] **Step 3:** Background the app for 5 s mid-game → `Gravação pausada` banner, then it clears.
- [ ] **Step 4:** Record the result in the status section and commit `docs: Plan 2 flow verified on iPhone`.
