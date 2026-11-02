# Phone remote over Bluetooth LE — design

Date: 2026-10-23 · Status: implemented and field-tested (2026-10-23) · Supersedes the transport part of `2026-10-19-phone-remote-design.md`

## 1. Why

The phone remote runs on Multipeer Connectivity (MPC). In the field the first connection works, but once the link drops the remote does not come back, even with the camera phone recording. Known causes and context:

- MPC is unreliable on iOS 26 when Wi-Fi is on but not joined to a network (the normal case at a court): invitations go `connecting → notConnected`, sometimes for ~20 tries (Apple forums thread 803339, DTS).
- MPC is deprecated (Xcode 27, TN3213). No fix is promised.
- Our code reuses one `MCSession` after a drop, and the remote side does not restart when the app returns to the foreground.

The Bluetooth remote (volume-button HID) has been very stable in tests. Two iPhones can't use that HID path, but Bluetooth LE between our two apps has the same radio, the same short range (4–5 m is ideal) and a connection model the system keeps alive.

## 2. Goals / non-goals

Goals
- A paired remote reconnects by itself, at any time, including in the middle of a recording, with no action on either phone.
- The link survives the remote's screen locking or the app going to the background for a while.
- Works on every supported iPhone (the XR included; Wi-Fi Aware needs iPhone 12+, so it is out).
- Same JS API and events as today, so screens change only in their texts.
- Existing pairings keep working (same trusted keys in the Keychain).

Non-goals (this spec)
- Multi-camera recording (section 11 only reserves room for it).
- Remote without the app (web link, App Clip): later.
- Android.

## 3. Roles and transport

| | Camera phone | Remote phone |
|---|---|---|
| BLE role | Peripheral (`CBPeripheralManager`) | Central (`CBCentralManager`) |
| Advertises | Service UUID only (no device name, no ids) | — |
| Max links | 4 remotes (`TrustedPeers.limit`) | 1 camera now (list-shaped for later) |

GATT service `LANCE Remote` (128-bit UUID, fixed):
- `rx` — write with response, remote → camera. Ordered and acknowledged.
- `tx` — notify, camera → remote.
- `psm` — read: the L2CAP PSM for the preview channel (section 8).

No BLE link-layer pairing: requiring encryption on a characteristic shows the iOS system "Bluetooth Pairing Request" dialog. Security is done in the app (section 5), like today.

## 4. Framing

Messages stay the JSON of `RemoteMessage` / `RemoteHello` (unchanged, tested). Some exceed one ATT packet (`paired` with names), so a small frame layer sits under them: `[version:1][msgId:2][index:1][count:1][payload…]`, chunk size from `maximumWriteValueLength` / the notify MTU. The receiver reassembles, drops incomplete messages after 2 s, and caps a message at 4 KB. Lives in Core (`BleFrames`), unit-tested.

## 5. Security

Today the pair key travels inside an MPC session encrypted by MPC. BLE without link encryption can be sniffed, so:

Pairing (QR secret or 6-digit code)
1. Both sides make an ephemeral Curve25519 key pair and exchange public keys.
2. Each side sends `HMAC(secret, "pair" | transcript)` where the transcript is both public keys, both ids, both nonces. The camera checks it with the existing `PairingOffer` rules (2 min, 5 attempts, reservation, release on drop).
3. Shared key = HKDF(ECDH, salt: transcript). The camera sends `paired` sealed with it (ChaChaPoly). A passive sniffer learns nothing; an active attacker must guess the code online, limited to 5 tries.

Reconnect (replaces the timestamped proof, so clock differences no longer matter)
1. Camera sends a random 16-byte challenge on `tx` when a central subscribes.
2. Remote answers `HMAC(pairKey, "reconnect" | challenge | remoteId | hostId)`.
3. Session key = HKDF(pairKey, challenge | remote nonce). Every later message is sealed (ChaChaPoly, counter nonce per direction, so replays are refused).

Unknown remote → `unpaired` as today. Wrong proof → silent refusal, never "forget".
Crypto and handshake states live in Core (`BleHandshake`), unit-tested with fixed vectors.

## 6. Reconnection

Remote (central), the part that fixes the field bug:
- The camera's peripheral identifier is remembered after the first link. On any drop the remote calls `connect(peripheral)` again at once. A pending connect never times out in CoreBluetooth and completes as soon as the camera is in range and advertising. It does not when the camera phone comes back under a new Bluetooth identity (remote opened first, camera after): if the scan sees a camera advertising the service while the pending connect is still open after 2 s, the remote drops it and connects to the phone it saw.
- In parallel it scans for the service UUID (a camera that reinstalled or rebooted gets a new identifier). The first match that passes the handshake wins; the other attempt is cancelled.
- `UIBackgroundModes: bluetooth-central` plus state restoration (`CBCentralManagerOptionRestoreIdentifierKey`) keep the link and the pending connect alive while the remote is locked or in the background.
- When the app comes back to the front: if not connected, restart the scan (the pending connect stays).
- No retry timers that create new sessions: CoreBluetooth owns the link, so there is no "stale session" problem.

Camera (peripheral):
- Advertises while the app is open (any screen), as the MPC host does today. It is in the foreground while recording, so advertising is full rate.
- Heartbeat: `state` every 5 s to each linked remote, as today, so the remote's `STALE_AFTER` logic keeps working. A drop is also seen through the subscription ending.
- `bluetooth-peripheral` background mode: not needed (recording stops when the camera app leaves the front).

Expected reconnect time after the phones come back in range: about 1–3 s (to be measured in the spike).

## 7. JS surface

Unchanged function names and events (`remoteHost*`, `remoteController*`, `onRemoteStatus`, `onRemotePairing`, `onRemoteCheck`, `onRemoteState`, `onRemoteResult`, preview frames). Changes:
- `link: 'denied'` also covers "Bluetooth off" and "Bluetooth permission refused", with a new `reason` field (`off | unauthorized`) so the screens can say which.
- `RequirementsChecklist`: "Bluetooth ligado nos dois celulares" and "LANCE aberto nos dois celulares, perto um do outro (até ~5 m)". Wi-Fi and Local Network lines go away.
- Info.plist: `NSBluetoothAlwaysUsageDescription`; `NSLocalNetworkUsageDescription`/`NSBonjourServices` removed once MPC is gone.

## 8. Camera preview on the remote

Today: 480 px JPEG, quality 0.5, 4 fps (≈ 80–120 KB/s) over MPC. Plan: an L2CAP channel (`CBL2CAPChannel`, PSM published in `psm`), opened only while the preview is visible, carrying sealed, length-prefixed frames. The spike measures throughput between the 16 Pro Max and the XR at 5 m:
- ≥ 120 KB/s steady: keep 480 px / 4 fps.
- 40–120 KB/s: 360 px / 3 fps (the watch preview settings).
- Less: preview falls back to Wi-Fi peer-to-peer (Network framework, `includePeerToPeer`), only while the preview is on. Separate decision, not in this plan.
Commands never wait behind frames (they use GATT, the frames use L2CAP).

## 9. Plan

0. Spike (device only, throwaway screen): advertise, connect, write/notify, drop and reconnect (walk away, lock the remote, start a recording), L2CAP throughput. Victor runs it; go/no-go on the numbers.
1. Core: `BleFrames`, `BleHandshake` (pair + reconnect + sealing), reconnect policy as a pure state machine. `swift test`.
2. iOS glue: `BleRemoteHost` (peripheral) and `BleRemoteController` (central) with the same public API as `RemoteHost` / `RemoteController`; the module switches to them. Logs in both (subsystem `LANCE`).
3. Preview over L2CAP (per the spike result).
4. JS: status reasons, checklist texts, tests.
5. Remove MPC code, Bonjour keys and the Local Network text.

## 10. Field checklist

1. Pair by QR and by code; existing pairing still works after the update (no new pairing).
2. Start recording, walk the remote out of range and back: reconnects within a few seconds, Save works, recording never stopped.
3. Lock the remote for 1 min, unlock: already connected.
4. Switch to another app on the remote and back: connected.
5. Turn Bluetooth off/on on each phone: clear message, then reconnects.
6. Two to four remotes on one camera at the same time.
7. Preview: smooth enough, and Save still instant while it runs.
8. 2-hour recording with a remote linked: no drop; note battery on both phones.

## 11. Room for multi-camera (future)

Not built now, but v1 of the protocol keeps it possible:
- `save` carries a `triggerId` (UUID) and the remote's timestamp, so several cameras can save "the same" moment and the clips can be grouped later.
- `ping`/`pong` carry timestamps, so each side can estimate the clock offset (NTP-style); cameras can then cut on a shared timeline.
- The remote's host store is a list; the "one camera" rule is a limit, not a data shape.
Video files never travel over BLE: joining angles needs Wi-Fi peer-to-peer or the cloud, decided in that feature's own spec.

## 12. Risks

- Swift/CoreBluetooth cannot be compiled or tested in the assistant's environment: every native step needs a device build by Victor.
- L2CAP throughput may not carry the preview (section 8 fallback).
- iOS may still end a background central link after a long time; the pending connect brings it back when the app returns.

## 13. Step 0 results (2026-10-23, iPhone 16 Pro Max camera ↔ iPhone XR remote)

- Round trip (write with response + notify): ~55–70 ms average, peaks 100–250 ms, no lost pings while still. MTU 512.
- Link lost walking away ("connection timed out unexpectedly"): came back by itself in 4.2 s, twice, no user action.
- Remote app reopened: connected to the remembered camera in ~1 s (pending connect).
- Remote Bluetooth off for 7 s, then on: connected ~1 s after it came back. Turning Bluetooth off does not call
  `didDisconnect`; the glue must treat `poweredOff` as a drop (clear the link, emit status) and look again on `poweredOn`.
- L2CAP throughput: 24 KB/s average, and while streaming the command round trip went up to ~4 s with 8 lost pings.

Decisions
- Go: commands, state and pairing over BLE as designed.
- Preview: not over BLE (needs ~100 KB/s and would delay Save). It moves to Wi-Fi peer-to-peer (Network framework,
  `includePeerToPeer`, Bonjour), started only while the preview is visible, keyed and sealed with the BLE session key.
  Step 3 becomes that. Commands never share that channel.
- Accepted risk: pairing by 6-digit code is open to an offline guess only by an active attacker impersonating the
  camera during the 2-minute window; QR pairing (128-bit secret) is not. Same exposure as the MPC design.
- `unpaired` is only believed from the camera's remembered Bluetooth identity (or inside the sealed session, when the
  camera removes the remote); from any other phone it just means "not our camera" and that phone is left alone for 30 s.
  Worst case of a spoof is a lost pairing (denial of service), never a wrong camera.

## 14. Step 2 implementation notes (2026-10-23)

- `RemoteHost.swift` / `RemoteController.swift` rewritten on CoreBluetooth with the same public API, so the module and
  the JS calls are unchanged. Service `6E3F1001-…`, `rx` (write) `6E3F1002-…`, `tx` (notify) `6E3F1003-…`.
- The camera advertises the local name `LANCE` (paired remotes) or `LANCE+` (pairing open); a pairing remote only
  connects to `LANCE+`, so a nearby camera that is not pairing never gets its attempts used up.
- A peripheral cannot drop a central: refusals and removals are sent as messages and the remote disconnects.
- Remote: pending connect to the remembered camera ("hostId|peripheral uuid" in UserDefaults) + scan; Bluetooth off is
  handled as a drop; coming back to the foreground looks again; state restoration id `lance.remote.central`.
- Preview: `PreviewLink.swift` (Network framework, `_lance-remote._tcp`, peer-to-peer on). The camera grants each remote
  a token + key over the sealed BLE session (`RemoteMessage.previewLink`) and stops the service 10 s after the last ask.
- JS: `onRemoteStatus.reason` (`off | unauthorized`), Bluetooth texts, checklist, "Tentar agora" primary with a
  6-second busy state.
- Step 5 done: `BleSpike.swift`, `ble-spike.tsx`, `RemoteHello` and `RemoteProof` removed; `PairingOffer.check` takes a
  `proves` closure only; Bonjour keeps only `_lance-remote._tcp` (preview) and the Local Network text speaks of the preview.

### 14.1 Field fixes (2026-10-23 afternoon)

- Remote showed "Reconectando" after the app came back from the background although the link was up (saves still
  reached it). The link survives in the background; the screen missed the status event. The remote now re-sends its
  status when the app comes to the front, and whenever a sealed message arrives while the last status told to the screen
  was not `connected`.
- Real cause of the "Reconectando" after background (the fix above was not enough): the same app runs both sides, and
  `_layout` starts the camera side (`RemoteHost`) on every return to the front, also on the remote phone. Its
  `onRemoteStatus` (`searching`, no remotes) was read by the remote screen as its own link. Both natives now send
  `side: 'camera' | 'remote'`; the remote screen reads only `remote`, the camera screens ignore `remote`.
- The retry button on the remote is "Tentar reconexão" ("Reconectando…" while it works, 6 s lock). With the `side` fix
  it should rarely be needed; kept as a manual fallback.

## 15. One remote per camera phone (2026-10-23)

Decision (Victor): the camera phone has one remote at a time, like the remote has one camera. Reason: a phone paired on an
earlier day, near the court, could otherwise save or end someone else's game. It also keeps the roles clear for the
multi-camera feature (`2026-10-23-multi-camera-design.md`), where secondary cameras are a separate role, not remotes.

- `RemoteHost.maxRemotes = 1`: `beginPairing()` returns nil while a remote is paired (the existing guard, new limit).
  `TrustedPeers.limit` (4, storage) is unchanged.
- Migration: on `start()` the camera keeps only the most recently paired remote (`TrustedPeers.keepNewest`); the dropped
  ones are told `unpaired` if connected, or hear it on their next reconnect, and forget this camera. `TrustedPeers.add`
  now moves a re-paired peer to the end, so "most recent" is right.
- Screen (`pairing.tsx`): "Celular de controle" (singular), the remote's card unchanged (Verificar / Remover), and
  "Esquecer e parear outro" with a confirmation ("Esquecer {nome}?") that removes it and opens the QR/code at once.
  With nobody paired: "Parear um celular".
- Not touched: BLE link, handshake, reconnection, commands, preview, the remote phone's code.
