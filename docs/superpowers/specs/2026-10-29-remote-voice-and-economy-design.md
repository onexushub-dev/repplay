# Remote phone: battery saving and voice — design

Date: 2026-10-29 · Status: implemented, waiting for the field test

## 1. Why

At the court the camera phone stands far away and the remote phone stays close to the players. Two things make the
remote better there:

- Saying "salvar" / "gravar" near the remote, instead of walking to the camera phone or touching the remote.
- The remote screen stays on for the whole game (keep-awake), so it needs the camera's battery saving too.

Both work only while the remote screen is in front. Background listening (audio background mode, the orange
microphone dot with the screen locked, a stricter App Review) is out on purpose.

## 2. Battery saving

- The camera's mechanism (`useScreenEconomy`), with its own values: dim after **60 s** without a touch (the camera
  waits 20 s, 5 s when warm), brightness **15%** (25% in the first test; lowered to save more, check it in the sun) (`ScreenEconomy.remoteBrightness`), never brighter than the player's
  own setting. The interface stays visible: no black cover, only a "Tela em economia. Toque para acender." pill.
- Active only on the recording screen. Any other screen (a lost link, a silent camera, the end of the recording)
  lights the screen up by itself.
- The touch that lights the screen up does nothing else: a transparent layer over everything takes it, so it neither
  saves nor starts "segure para encerrar".
- "Ver câmera" closes while dim (the camera phone stops sending pictures) and opens again with the screen. Touches on
  the picture count as activity.
- When a recording starts (from the remote or from the camera phone) with battery saving on, a notice says so for 5 s.
- Native: `setRemoteScreenDim(on)` → `ScreenEconomy.set(on, brightness: remoteBrightness, pausePreview: false)`.
- Pref `remoteEconomy`, on by default, separate from the camera's `screenEconomy` (one phone can play both roles).

## 3. Voice

- `RemoteVoice` (iOS): an `AVAudioEngine` microphone tap feeding the same `VoiceTrigger` as the camera phone (same
  words, offline only, same 2 s cooldown). Buffers are copied before they leave the tap. Audio session
  `.playAndRecord` with `.mixWithOthers`; interruptions (calls, Siri) and route changes (headphones) stop and restart
  the engine.
- Listens only while the camera records, with both permissions and the player's choice. A dim screen keeps listening.
- A heard command emits `onRemoteVoice`; the screen runs the same save as a tap on SALVAR (3 s gap, haptics,
  "Enviando…", the green/red flash). The screen stays dim; the flash and the vibration are the answer.
- Pref `remoteVoice`, on by default. The first time the remote is connected and waiting, an alert explains it before
  iOS asks for the microphone and speech recognition ("Agora não" turns it off; `remoteVoiceAsked` keeps it from
  coming back). A denied permission turns the tile into a link to Settings. No tile where the on-device model is
  missing (`isVoiceSupported`).
- The camera phone needs no change: the command arrives as the usual `.save` (`onTrigger('phone')`), and the trigger
  bus already drops any second save within 3 s whatever its source, so the same "salvar" heard by both phones saves
  one clip. The remote still gets the result of that one save.

## 4. Ending from the remote at a distance

Field report: "Segure para encerrar" took a few seconds farther from the camera phone. At a distance the BLE link
retries, and the remote showed nothing between the end of the hold and the camera's new state.

- The remote shows "Encerrando…" as soon as the hold completes, and sends `stop` again every 1.5 s until the camera
  phone reports it is no longer recording (the camera ends a recording once, so repeats are harmless). After 8 s it
  says the recording did not end and the hold comes back.
- The camera phone asks for the shortest BLE connection interval for each subscribed remote
  (`setDesiredConnectionLatency(.low)`): commands and answers cross faster, and a weak link retries sooner, at a small
  battery cost on both phones.

## 5. Field test checklist

- Dim after 1 min, 15% readable in the sun, first touch only lights up.
- "salvar" at 1–3 m from the remote with court noise; false triggers from court talk.
- Both phones with voice on: one clip per command.
- Battery drop on the remote over a 1–2 h game.
- "Segure para encerrar" at 2, 5 and 10 m: time from the end of the hold to "Controle conectado.".
