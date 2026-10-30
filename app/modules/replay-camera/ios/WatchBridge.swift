import Foundation
import WatchConnectivity

/// iPhone side of the Apple Watch link: a tap on the watch becomes `onTrigger('watch')`, and the recording
/// state and save results go back to the watch. The message format is `WatchMessage` (Core).
final class WatchBridge: NSObject, WCSessionDelegate {
  static let shared = WatchBridge()

  /// Same shape as ReplayEngine.emit: (event name, body).
  var emit: ((String, [String: Any]) -> Void)?
  private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

  /// "unsupported": no paired watch · "notInstalled": paired but without the Revi app · "ready".
  var status: String {
    guard let session, session.isPaired else { return "unsupported" }
    return session.isWatchAppInstalled ? "ready" : "notInstalled"
  }

  /// The picture stream for the watch's camera view; the watch asks for it with `preview` messages.
  var preview: WatchPreview? {
    didSet {
      preview?.onFrame = { [weak self] data in
        guard let session = self?.session, session.isReachable else { return }
        session.sendMessageData(data, replyHandler: nil, errorHandler: nil)
      }
    }
  }

  // The last state JS reported, kept so it can be sent again whenever the link (re)appears, and repeated as a
  // heartbeat while recording: if the app dies the beats stop and the watch notices (WatchModel.staleAfter).
  private let stateLock = NSLock()
  private var lastState: WatchMessage = .state(recording: false, clipCount: 0, startedAt: nil, saveAllowed: true)
  /// Whether the watch may save clips (the watch trigger is paid). JS sets it on launch and whenever the tier changes;
  /// allowed until then, so a slow start never hides Save from a paying player.
  private var saveAllowed = true
  private var heartbeat: DispatchSourceTimer?

  func activate() {
    guard let session, session.delegate == nil else { return }
    session.delegate = self
    session.activate()
  }

  /// The latest state is also kept as application context, so a watch app opened later still reads it.
  func sync(recording: Bool, clipCount: Int, startedAt: Double?) {
    stateLock.withLock {
      lastState = .state(recording: recording, clipCount: clipCount, startedAt: startedAt, saveAllowed: saveAllowed)
      heartbeat?.cancel()
      heartbeat = nil
      guard recording else { return }
      let timer = DispatchSource.makeTimerSource(queue: .main)
      timer.schedule(deadline: .now() + 5, repeating: 5)
      timer.setEventHandler { [weak self] in self?.pushState() }
      timer.resume()
      heartbeat = timer
    }
    pushState()
  }

  /// The watch trigger is locked (false) or open (true): travels with the state, so a watch opened later reads it too.
  func setSaveAllowed(_ allowed: Bool) {
    stateLock.withLock {
      saveAllowed = allowed
      if case let .state(recording, clipCount, startedAt, _) = lastState {
        lastState = .state(recording: recording, clipCount: clipCount, startedAt: startedAt, saveAllowed: allowed)
      }
    }
    pushState()
  }

  /// Sends the cached state. Dropped quietly while the session is not ready; it is pushed again when it is.
  private func pushState() {
    guard let session, session.activationState == .activated, session.isWatchAppInstalled else { return }
    let payload = stateLock.withLock { lastState }.payload
    try? session.updateApplicationContext(payload)
    if session.isReachable { session.sendMessage(payload, replyHandler: nil, errorHandler: nil) }
  }

  /// Only when the watch is reachable now: a vibration for an old save would just be noise.
  func signal(saved: Bool) {
    guard let session, session.activationState == .activated, session.isReachable else { return }
    session.sendMessage(WatchMessage.result(saved: saved).payload, replyHandler: nil, errorHandler: nil)
  }

  private func emitStatus() { emit?("onWatchStatus", ["status": status]) }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    emitStatus()
    pushState()
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    emitStatus()
    pushState()
  }

  /// The watch app came to the front (or went away): tell it where the recording stands right now.
  func sessionReachabilityDidChange(_ session: WCSession) { pushState() }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    switch WatchMessage.decode(message) {
    case .save?: emit?("onTrigger", ["source": "watch", "at": Date().timeIntervalSince1970 * 1000])
    // Same events as the phone remote: JS ignores a start while recording and a stop while idle.
    case .start?: emit?("onRemoteStart", [:])
    case .stop?: emit?("onRemoteStop", [:])
    case let .preview(on)?: preview?.ask(on)
    default: break
    }
  }
}
