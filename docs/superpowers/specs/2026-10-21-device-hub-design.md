# LANCE: device hub (design)

> Date: 2026-10-21. Status: awaiting review. Scope: iPhone only (Android is explicitly out of this cycle).
> Origin: the "Controle Bluetooth" tile on the setup screen is not tappable and only says "Aperte um botão para testar".
> Players do not know they must pair the remote in the iOS Bluetooth settings first. Pairing and disconnecting
> the three kinds of "other devices" (Bluetooth remote, watch, second phone) is also scattered over three places.

## 1. Goal

One place, the **Dispositivos sheet**, where a player connects, reconnects and disconnects any device that can save a lance,
with the same layout and the same vocabulary for every kind. Tapping a device tile on the setup screen opens the sheet
on that device's tab.

Success looks like:
- A player who has never used a Bluetooth remote reaches "Conectado" following only what the sheet says.
- The sheet never leaves the player wondering "what do I do now?": every state has exactly one next step.
- A paired second phone can be removed, and a phone remote forgotten, from the same sheet that connects them.

Non-goals: Android (no "open Bluetooth settings" button, no list of bonded controllers); a real list of Bluetooth remotes
on iOS (the OS does not expose it); changing the pairing protocol of the phone remote; unpairing an Apple Watch from the app.

## 2. Facts that shape the design

| Fact | Consequence |
|---|---|
| The Bluetooth remote is a volume-key remote (`useVolumeRemote`). iOS pairs it; the app only learns it exists when a press arrives. | The only honest proof is "a press was heard". Statuses reuse the phone remote vocabulary (Toque para conectar / Pareado / Conectado). No fake "paired devices" list for it. |
| iOS has no public deep link to the Bluetooth settings page. `App-Prefs:` is private API (App Store risk); `Linking.openSettings()` opens only the app's own settings. | No "Abrir Bluetooth" button. The guide spells out the path: **Ajustes > Bluetooth**. |
| `useVolumeRemote` is enabled only while the setup screen is focused and idle. A pushed route unfocuses it. | The sheet runs the hook itself while its Controle tab is visible. |
| Watch status already has three values: `unsupported`, `notInstalled`, `ready` (`getWatchStatus`, `onWatchStatus`). | Watch tab is driven by that; nothing new in the native module. |
| The phone remote already has full pairing (`/pairing`, QR + code), a peers list with remove, and `/remote` with forget. | Reuse those screens and calls; do not rewrite them. |

## 3. Design

### 3.1 Entry points

- Setup grid: tiles **Controle Bluetooth**, **Relógio**, **Celular** (the phone tile moves up from the "SEGUNDO CELULAR" section) are all
  tappable and call `router.push({ pathname: '/devices', params: { kind } })` with `kind` in `remote | watch | phone`.
- Voz and Acenar com os braços stay toggles (they are settings, not devices).
- The collapsed summary icons keep working; tapping them still expands the sheet.
- The blocks "SEGUNDO CELULAR", "Usar este celular como controle" / "Controle: nome" / "Desconectar" leave the setup screen (phase 2).

### 3.2 The sheet (`src/app/devices.tsx`)

A bottom sheet over the camera (same dark surface and tokens as the setup sheet, `radius.sheet`). Route registered in `_layout.tsx`
as a sheet presentation (to be confirmed against the Expo Router 58 docs; fallback: a plain modal with the same content).

Layout, top to bottom:
1. Handle and close button.
2. Segmented control: **Controle · Relógio · Celular**. A kind that the device cannot use (`isRemoteSupported() === false`) is not shown; with a single kind the control is hidden.
3. Header of the selected kind: icon, title, **status pill** (dot + text).
4. Body for the current state (section 3.3): numbered steps, then at most one primary button.
5. "Pareados" list when the kind has one (rows of at least 56 px, name, status, trailing action).

Visual rules: existing tokens only; accent colour for the primary action and the "connected" dot; muted grey for offline;
`PulseRing` for "waiting"; `CheckIcon` badge for success. No glass effects, no illustrations. Target size at least 44 pt.
Respect `useReduceMotion`. State changes are announced to VoiceOver.

### 3.3 One model, three adapters

```
DeviceKind  = 'remote' | 'watch' | 'phone'
DeviceState = 'unavailable' | 'setup' | 'waiting' | 'offline' | 'connected'
DeviceView  = { kind, state, statusText, steps: string[], primary?: { label, onPress },
                note?: string, peers: DevicePeer[] }
DevicePeer  = { id, name, status: 'connected' | 'offline', onForget: () => void }
```

Each kind has a hook returning a `DeviceView`: `useRemoteDevice`, `useWatchDevice`, `usePhoneDevice` (in `src/devices/`).
The sheet and the setup tiles read only `DeviceView`, so adding a kind later does not touch the layout.
The mapping from raw status to `DeviceView` is a pure function per kind (unit-tested without React).

**Controle (remote)**
- `setup` (never tested): steps 1) "Ligue o controle e deixe em modo de pareamento." 2) "No Iphone abra Ajustes > Bluetooth e toque no nome dele." 3) "Volte ao LANCE e aperte um botão do controle." The sheet starts listening on open, so the state is already `waiting`; `setup` only means "no press heard yet".
- `waiting`: `PulseRing` and "Aperte um botão do controle…". After 15 s without a press, add a note: "Nada ainda? Confira se o controle aparece como Conectado em Ajustes > Bluetooth. Funciona com controles de selfie (tecla de volume)."
- `connected` (a press was heard): check badge, "Controle conectado", primary "Pronto" (closes).
- `offline` (used in a previous launch, no press yet): status "Pareado · aperte um botão", same listening as `waiting`, the note replaces the steps.
- Forget: a row "Controle pareado" with "Esquecer". It clears the local mark and shows: "Para desconectar de vez: Ajustes > Bluetooth > ⓘ ao lado do controle > Ignorar este dispositivo."
- While the tab is open the volume buttons belong to the remote (the hook parks the volume and restores it on close).

**Relógio (watch)**
- `unsupported`: status "Sem relógio pareado"; steps "Pareie o Apple Watch com este iPhone no app Watch." State is `setup`, informative only.
- `notInstalled`: steps "Abra o app Watch no iPhone > LANCE > Instalar." State `setup`.
- `ready`: "Pronto"; note "Toque no botão do relógio para salvar um lance."
- No peers list and no disconnect (the watch pairing belongs to iOS). Live updates from `onWatchStatus`.

**Celular (phone)**
- Section "Este iPhone é a câmera": peers from `remoteHostPeers()` with live `connected/offline` from `onRemoteStatus`; each row has "Remover" (`remoteHostRemove`). Primary "Parear outro celular" pushes the existing `/pairing` (limit of 4 stays; when full the button is replaced by the existing warning).
- Section "Este iPhone é o controle": if `remoteControllerHost()` is null, a button "Usar este celular como controle" pushes `/remote`; otherwise a row "Controle: nome" with "Abrir" (`/remote`) and "Esquecer" (existing confirmation Alert and `remoteControllerForget`).
- State: `connected` if any controller is linked, `offline` if peers exist but none linked, `setup` otherwise.

### 3.4 Remote test state

- New `Prefs.remoteTestedAt?: number` (epoch ms), written the first time a press is heard in a launch.
- New tiny in-memory store (`src/devices/remoteTest.ts`): `lastPressAt` for the current launch, with subscribe, so the setup tile and the sheet agree even though the setup screen is unfocused while the sheet is open.
- Setup tile status, same logic as the phone tile: pressed this launch → "Conectado" (active); `remoteTestedAt` set but no press this launch → "Pareado · aperte um botão"; never → "Toque para conectar". Setup keeps its own `useVolumeRemote` and now also feeds the store.

### 3.5 Copy and language

All UI text in pt-BR, verb-first buttons ("Parear outro celular", "Esquecer", "Pronto"), errors never blame the player and always offer a way out.

## 4. Files

New: `src/app/devices.tsx`, `src/devices/{kinds.ts, remoteDevice.ts, watchDevice.ts, phoneDevice.ts, remoteTest.ts}`,
`src/components/{StatusPill.tsx, StepList.tsx, PairedRow.tsx, DeviceTabs.tsx}`.
Changed: `src/app/setup.tsx` (tiles tappable, remove old blocks in phase 2), `src/app/_layout.tsx` (route), `src/data/schema.ts` (`remoteTestedAt`),
`src/app/pairing.tsx` and `src/app/remote.tsx` (use the shared `StepList` instead of their own `Step`).

## 5. Phases

1. **Controle guide.** Tile tappable, `/devices` with the Controle tab only (no segmented control), remote test store, tile copy.
2. **Hub.** Relógio and Celular adapters, segmented control, peers list, removal of the old blocks from the setup sheet.

Each phase ships on its own.

## 6. Errors and edge cases

- Volume already at the top or bottom: handled by the existing hook (parks in the middle).
- Sheet closed while waiting: the hook cleans up and restores the volume.
- Local Network denied (phone tab): keep the existing message and its "Abrir Ajustes" button.
- Watch status changes while the sheet is open: the view updates live.
- A press heard while the sheet is on another tab does not count (the hook runs only on the Controle tab).

## 7. Testing

- Pure mappers (`remoteDevice`, `watchDevice`, `phoneDevice`): table-driven Jest tests for every state and the 15 s note.
- `devices.test.tsx` (React Native Testing Library, same mocks as `pairing.test.tsx`): opens on the tab from the param; Controle shows the 3 steps, then "Controle conectado" after a simulated press; Relógio shows the right steps per status; Celular lists peers, removes one, forgets the host.
- `setup.test.tsx`: each tile navigates with the right `kind`; status texts for the three Controle states.
- `npx expo lint` and `npx tsc --noEmit` before finishing. Optional-chaining syntax is not used in the code.
- Manual on a device: pair a selfie remote from scratch following only the sheet; confirm the volume is restored after closing.

## 8. Open points

- Confirm sheet presentation options in Expo Router 58 docs (versioned) before coding.
- Confirm no public way to open the iOS Bluetooth page (the spec assumes none).
