# Analytics (PostHog, anonymous) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anonymous, low-volume usage analytics (usage and retention, onboarding-to-paywall funnel, feature usage) behind a typed `track()` wrapper, with PostHog as the only vendor.

**Architecture:** A new `app/src/analytics/` module holds a typed event map, a core (`createAnalytics`) that owns opt-out, the per-session cap, the install ID and error swallowing, a session aggregator for `session_summary`, and one adapter file that is the only importer of `posthog-react-native`. Call sites import `track` from `src/analytics`. Tests use a fake adapter, the same pattern as `src/payments/fakeClient.ts` and `createPaymentsStore`.

**Tech Stack:** Expo 58 dev client, React Native 0.88, `posthog-react-native`, `react-native-mmkv` (via `src/data/mmkv.ts` `kv`), `expo-crypto`, Jest (`jest-expo`).

**Spec:** `docs/superpowers/specs/2026-10-28-analytics-design.md`

**Deviation from the spec:** `purchase_started` is dropped (21 events, not 22). The RevenueCat paywall performs the purchase itself (`PaymentsClient.showPaywall(): Promise<PaywallOutcome>` in `src/payments/client.ts`), so a "started" moment is not observable apart from `paywall_viewed`. The spec is updated in Task 1.

## Global Constraints

- Work on a new branch `feat/analytics` off `main`. The working tree has unrelated untracked and modified files (`.agents/`, `.claude/`, `docs/brand/*`, `skills-lock.json`, `targets/watch-widget/Localizable.xcstrings`): stage only the files each task names.
- PostHog host `https://eu.i.posthog.com`. Project key from env `REPPLAY_POSTHOG_KEY`, read in `app/app.config.js` into `extra.posthog` (`{ key, host }`), same style as `extra.revenueCat`. No key means a no-op adapter.
- Anonymous only: `personProfiles: 'never'`, IP/GeoIP capture off, autocapture off, session replay off, automatic lifecycle and screen events off. Confirm each option name against the installed `posthog-react-native` types before using it.
- Install ID: `randomUUID()` from `expo-crypto`, persisted under the kv key `analytics.installId`. Opt-out flag under `analytics.enabled`.
- Properties are enumerated strings, booleans or bucketed numbers. Never file names, device names, free text or error messages.
- Per-session cap: 20 sends of the same event name; `clip_saved` and `trigger_failed` capped at 50 each. Over the cap the call is dropped silently.
- Analytics must never throw into the app and never await the network.
- UI strings go in both `app/src/i18n/locales/pt-BR.ts` and `en.ts`; tone is neutral and works for any sport.
- Tests live in a `__tests__` folder next to the code, named `*.test.ts(x)`; run with `npm test -- <path>` from `app/`. Code comments explain why, in English, matching the surrounding files.

## Review Focus

- Opting out in the middle of a session: nothing more is sent, nothing is queued, and the pending `session_summary` is not sent.
- Storage failure (`kv` throws on read or write): `track` keeps working with an in-memory install ID and does not throw.
- Adapter throws on `capture`: swallowed, later events still go out.
- App goes to background twice in a row, or with no activity: `session_summary` is sent once per session and never empty.
- No PostHog key (dev builds, Jest, CI): the no-op adapter is used and no network call happens.

---

### Task 1: Event map and analytics core

**Files:**
- Create: `app/src/analytics/events.ts`, `app/src/analytics/core.ts`, `app/src/analytics/fakeAdapter.ts`
- Test: `app/src/analytics/__tests__/core.test.ts`
- Modify: `docs/superpowers/specs/2026-10-28-analytics-design.md` (remove `purchase_started`, count 21, add the reason in one line)

**Interfaces:**
- Produces:
  - `events.ts`: `type AnalyticsEvents` mapping each of the 21 spec event names to its property shape (events without properties map to `undefined`); `type EventName = keyof AnalyticsEvents`.
  - `core.ts`: `interface AnalyticsAdapter { capture(name: string, props?: Record<string, string | number | boolean>): void }`; `createAnalytics(o: { adapter: AnalyticsAdapter; kv: KV; newId: () => string }): Analytics`; `interface Analytics { track<E extends EventName>(name: E, ...props: AnalyticsEvents[E] extends undefined ? [] : [AnalyticsEvents[E]]): void; setEnabled(on: boolean): void; isEnabled(): boolean; installId(): string; startSession(): void }`. `KV` is imported from `src/data/repo`.
  - `fakeAdapter.ts`: `createFakeAdapter(): AnalyticsAdapter & { calls: { name: string; props?: Record<string, unknown> }[] }`.

- [ ] **Step 1: Write failing tests in `core.test.ts`**: `track` forwards name and props to the adapter; the install ID is created once, persisted in `kv`, and reused by a second `createAnalytics` on the same `kv`; `setEnabled(false)` makes `track` a no-op, persists, and is read back by a new instance; the 21st call of one event in a session is dropped while `startSession()` resets the count; `clip_saved` allows 50; a throwing `kv` and a throwing adapter do not make `track` throw and later calls still reach a working adapter; a type-level check that `track('clip_saved')` without props and `track('app_open', { nope: 1 })` fail to compile (`// @ts-expect-error`).
- [ ] **Step 2: Run** `npm test -- src/analytics/__tests__/core.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement `events.ts`** with the 21 events and properties from the spec table. Property types are string-literal unions (for example `trigger: 'watch' | 'volume' | 'remote' | 'screen'`), taken from the real values the app uses at the call sites in Tasks 4 to 7; widen the union in the task that wires the event if a real value is missing.
- [ ] **Step 4: Implement `core.ts` and `fakeAdapter.ts`**. Wrap every `kv` access and every `adapter.capture` in try/catch; keep the install ID and enabled flag in memory as the fallback.
- [ ] **Step 5: Edit the spec** as described above.
- [ ] **Step 6: Run** the test file. Expected: PASS; also run `npx tsc --noEmit` from `app/`, expected clean.
- [ ] **Step 7: Commit** the five files: `feat(analytics): typed event map and core with opt-out, cap and install id`.

### Task 2: Session summary

**Files:**
- Create: `app/src/analytics/session.ts`
- Test: `app/src/analytics/__tests__/session.test.ts`

**Interfaces:**
- Consumes: `Analytics` from Task 1.
- Produces: `createSessionSummary(a: Pick<Analytics, 'track' | 'isEnabled'>, now?: () => number): { note(kind: SummaryCounter, detail?: string): void; flush(): void; start(): void }` where `SummaryCounter` is `'clip_saved' | 'export' | 'zoom' | 'guide' | 'economy'`; `note('clip_saved', trigger)` also tracks which trigger was used most. `flush()` sends `session_summary` once and clears the counters.

- [ ] **Step 1: Write failing tests**: counters aggregate into one `session_summary` with bucketed duration (`<1m`, `1-5m`, `5-30m`, `>30m`) and bucketed zoom count; the most used trigger is the one noted most; `flush()` twice sends once; `flush()` with no notes sends nothing; `flush()` after `isEnabled()` turned false sends nothing; `start()` resets counters and the clock.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement `createSessionSummary`** with the signature above; add the `session_summary` property shape to `events.ts` (counts as bucket strings, `top_trigger`, `duration`).
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(analytics): session summary aggregation`.

### Task 3: PostHog adapter, config and root wiring

**Files:**
- Create: `app/src/analytics/posthogAdapter.ts`, `app/src/analytics/index.ts`
- Modify: `app/package.json` (add `posthog-react-native` and any peer dependencies its README lists for Expo, using `npx expo install`), `app/app.config.js` (extra.posthog and the header comment documenting `REPPLAY_POSTHOG_KEY`), `app/src/app/_layout.tsx`, `app/jest.setup.js` or `app/__mocks__/posthog-react-native.ts` (stand-in so Jest never loads native code, in the style of `__mocks__/react-native-purchases.ts`)
- Test: `app/src/analytics/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `createAnalytics`, `createSessionSummary`.
- Produces: `index.ts` exports `analytics: Analytics`, `track` (bound to it), `sessionSummary` (the instance from Task 2), and `initAnalytics(): void` (reads `Constants.expoConfig?.extra?.posthog`; with a key builds the PostHog adapter with the Global Constraints options and `flushAt`/`flushInterval` left at SDK defaults, without a key uses a no-op adapter; calls `analytics.startSession()` and tracks `app_open` with `cold_start: true`).

- [ ] **Step 1: Write failing test**: with no `extra.posthog`, `initAnalytics()` sends nothing to the mocked SDK and `track` does not throw; with a key, the SDK is constructed once with `personProfiles: 'never'` and the EU host, and autocapture, replay and lifecycle events off.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Install the dependency and implement the adapter and `index.ts`.** `posthogAdapter.ts` is the only importer of `posthog-react-native`.
- [ ] **Step 4: Wire `_layout.tsx`**: call `initAnalytics()` once at module load next to `clearExportsFolder()`, and in the existing `AppState` listener call `sessionSummary.flush()` on `'background'` and `analytics.startSession()` plus `track('app_open', { cold_start: false })` on return to `'active'` from background.
- [ ] **Step 5: Run** `npm test` (whole suite) and `npx tsc --noEmit`. Expected: PASS, clean.
- [ ] **Step 6: Commit**: `feat(analytics): PostHog adapter, config and root wiring`. Note in the message that a new dev client build is required.

### Task 4: Onboarding events

**Files:**
- Modify: `app/src/app/onboarding.tsx`, `app/src/onboarding/useStories.ts` (only if the step change is not observable from the screen)
- Test: `app/src/onboarding/__tests__/` (extend the existing onboarding tests, or add `analytics.test.tsx` there)

**Interfaces:**
- Consumes: `track` from `src/analytics`; `SLIDES` and the step of each slide from `src/onboarding/slides.ts`.
- Produces: `onboarding_step_viewed { step: 1 | 2 | 3 | 4 }` once per step per run (not per slide, not on every card rotation), `onboarding_completed`, `onboarding_skipped { step }`, `permission_result { kind: 'camera', granted: boolean }` from the existing `allow` handler around `requestPermissions()`.

- [ ] **Step 1: Write failing tests** with the fake adapter injected through `src/analytics` (export a `__setAnalyticsForTests(a: Analytics)` from `index.ts` if no seam exists): moving through the slides sends each step once even when going back and forward; Skip sends `onboarding_skipped` with the current step; a granted `requestPermissions()` sends `permission_result` then `onboarding_completed`; a denied one sends `permission_result` with `granted: false` and no completion.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Add the `track` calls** at the points above, deduplicating step views with a `Set` held in a ref.
- [ ] **Step 4: Run** the onboarding tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(analytics): onboarding funnel events`.

### Task 5: Recording and trigger events

**Files:**
- Modify: the single place where a saved clip is stored after a trigger (locate with `grep -rn "addClip" app/src`, expected in `src/session/`), and where a trigger fails or is rejected (`src/triggers/bus.ts`, `src/session/useWatchTriggerGate.ts`, `src/session/useReplaySession.ts`)
- Test: `app/src/session/__tests__/`

**Interfaces:**
- Consumes: `track`, `sessionSummary.note`.
- Produces: `clip_saved { trigger, mode }` and `sessionSummary.note('clip_saved', trigger)`; `trigger_failed { trigger, reason }` with `reason` a closed union taken from the existing rejection causes; `sessionSummary.note('zoom' | 'guide' | 'economy')` at the existing handlers in `src/modes/zoom.ts`, the guide toggles and `src/session/useScreenEconomy.ts` (summary only, no standalone events).

- [ ] **Step 1: Write failing tests** next to the existing session tests: saving a clip from each trigger source sends one `clip_saved` with that trigger and the active mode; a rejected trigger sends `trigger_failed` with the cause; zoom, guide and economy changes send no event of their own but show up in the next `session_summary`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Add the calls.** Replace the placeholder unions in `events.ts` with the real trigger and reason values found here.
- [ ] **Step 4: Run** the session tests and `tsc`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(analytics): recording and trigger events`.

### Task 6: Edit, export and share events

**Files:**
- Modify: `app/src/app/clip/[id].tsx` (edit tools via the tool catalog in `src/clip/tools.tsx`, export near `exportClip` at line ~587, cut suggestion at `suggestionKey`), `app/src/share/useBatchActions.ts` and `app/src/share/batchExport.ts` (batch exports and share), the Modo Foco entry (`src/focus/`, `useFocusFraming.ts`)
- Test: `app/src/app/__tests__/clip.test.tsx`, `app/src/share/__tests__/`

**Interfaces:**
- Produces: `clip_edit_tool_used { tool }` (once per tool per opened clip), `cut_suggestion_applied`, `focus_mode_used`, `export_completed { quality }`, `export_failed { reason }`, `clip_shared { destination }`, plus `sessionSummary.note('export')` on each completed export.

- [ ] **Step 1: Write failing tests** in the existing clip and share tests: a completed export sends `export_completed` with its quality, a thrown `exportClip` sends `export_failed` with a closed `reason` (never `error.message`); selecting the same tool twice on one clip sends once; applying the suggested cut sends `cut_suggestion_applied`; batch export counts as exports in the summary without one event per clip.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Add the calls.**
- [ ] **Step 4: Run** the two test folders and `tsc`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(analytics): edit, export and share events`.

### Task 7: Paywall and purchase events

**Files:**
- Modify: `app/src/payments/store.ts` (the `showPaywall` method at line ~183), `app/src/components/useFreeExportGate.tsx`, `app/src/components/UpgradeCard.tsx`, `app/src/payments/unlock.ts`
- Test: `app/src/payments/__tests__/`, `app/src/components/__tests__/useFreeExportGate.test.tsx`

**Interfaces:**
- Produces: `paywall_viewed { source: 'onboarding' | 'export_limit' | 'upgrade_card' | 'start_limit' | 'other' }` before `client.showPaywall()`, `purchase_completed` when the outcome is `'purchased'`, `purchase_failed { reason: 'error' }` when `'error'`, `pro_feature_blocked { feature }` where a Pro-only action is refused, `free_export_limit_hit` where the free export gate blocks. The `source` reaches `showPaywall` as an optional argument; the store keeps working when it is omitted.

- [ ] **Step 1: Write failing tests**: with the fake client, a paywall opened from the export gate sends `paywall_viewed` with `export_limit` then `purchase_completed` on `'purchased'`; `'restored'` and `'cancelled'` send no purchase event; `'error'` sends `purchase_failed`; the store test file still passes without any analytics seam (the store imports `track`, which is a no-op in tests).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Add the calls and the optional `source` parameter** to `showPaywall`; update the callers found with `grep -rn "showPaywall" app/src`.
- [ ] **Step 4: Run** `npm test -- src/payments src/components` and `tsc`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(analytics): paywall and purchase funnel events`.

### Task 8: Pairing events

**Files:**
- Modify: `app/src/app/pair.tsx`, `app/src/app/pairing.tsx`, `app/src/app/devices.tsx`
- Test: `app/src/app/__tests__/devices.test.tsx` and the pair screen tests

**Interfaces:**
- Produces: `pairing_completed { method: 'qr' | 'link', kind: 'remote' | 'watch' }`, `pairing_failed { reason }` with a closed `reason` (invalid link, timeout, denied, other).

- [ ] **Step 1: Write failing tests**: a valid `parsePairLink` result that finishes pairing sends `pairing_completed`; an invalid link and a connection failure send `pairing_failed` with distinct reasons.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Add the calls.**
- [ ] **Step 4: Run** the two test files and `tsc`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(analytics): pairing events`.

### Task 9: Opt-out control and privacy copy

**Files:**
- Modify: one existing screen chosen with the user (see handoff question), `app/src/i18n/locales/pt-BR.ts`, `app/src/i18n/locales/en.ts`
- Test: that screen's existing test file

**Interfaces:**
- Consumes: `analytics.isEnabled()`, `analytics.setEnabled(on)`.
- Produces: a labelled switch "Métricas de uso anônimas" / "Anonymous usage metrics" with a one-line explanation (no personal data, nothing about clips). Turning it off calls `setEnabled(false)`.

- [ ] **Step 1: Write failing test**: the switch reflects `isEnabled()`; toggling it off calls `setEnabled(false)` and a following `track` reaches no adapter.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the row** following the screen's existing row components and add both locale entries under a new `analytics.*` key.
- [ ] **Step 4: Run** the screen tests, the locale parity test if one exists, and `tsc`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(analytics): opt-out switch and copy`.

### Task 10: Verification and release notes

**Files:**
- Modify: `docs/` backlog or release notes file the repo already keeps (follow the recent `docs(backlog)` commits)

- [ ] **Step 1: Run** `npm test`, `npm run lint` and `npx tsc --noEmit` from `app/`. Expected: all clean.
- [ ] **Step 2: Build a dev client** with `REPPLAY_POSTHOG_KEY` set and walk the flows (onboarding, one clip from each trigger, edit, export, paywall, pairing, background the app); confirm in PostHog Live Events that each event appears once with only the documented properties and that no person profile is created.
- [ ] **Step 3: Confirm the off paths**: opt-out on sends nothing; a build without the key sends nothing.
- [ ] **Step 4: Record the follow-ups** (privacy policy line, App Store privacy label "data not linked to you", PostHog dashboards for retention, onboarding funnel and feature usage) in the backlog doc.
- [ ] **Step 5: Commit**: `docs(backlog): analytics rollout checklist`.
