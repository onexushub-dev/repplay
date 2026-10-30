import Foundation
import WatchConnectivity
import UIKit
import WatchKit
import WidgetKit

/// The watch's side of the link to the iPhone app (messages are `WatchMessage`, shared with the phone).
final class WatchLink: NSObject, ObservableObject, WCSessionDelegate {
  @Published private(set) var screen: WatchScreen = .idle
  /// The camera view: the last picture the phone sent, while the view is open.
  @Published private(set) var picture: UIImage?
  @Published private(set) var previewOn = false
  /// A short confirmation drawn over the screen when the phone says a save ended (true = saved).
  @Published private(set) var confirmation: Bool?
  /// Whether the phone can be reached right now (Começar gravação and Parar need it).
  @Published private(set) var reachable = false
  /// "Começar gravação" was tapped and the phone has not answered yet.
  @Published private(set) var starting = false
  /// The phone did not answer a start: the Revi app is not open on it. Shown as a message, then cleared.
  @Published private(set) var startFailed = false
  /// The phone's word on the watch trigger (paid): false hides Save. Allowed until the phone says otherwise.
  @Published private(set) var saveAllowed = true

  private var confirmationReset: DispatchWorkItem?

  private var keepAlive: Timer?

  // All of this is read and written on the main thread (WatchConnectivity callbacks hop to it first).
  private var recording = false
  private var clipCount = 0
  private var startedAtMs: Double?
  private var lastStateAt = Date.distantPast
  private var lastSaveAt: Double?
  private var unreachableSince: Date?
  /// When the app last came to the front: what it holds right then may be old (see `WatchModel.connectGrace`).
  private var activeSince = Date()
  private var startAskedAt: Double?
  private var startFailedReset: DispatchWorkItem?
  /// What the widget was last given, so it is only reloaded when the game changes.
  private var lastShared: WatchSharedState?
  private var aging: Timer?

  override init() {
    super.init()
    // The phone repeats its state while recording; a state that stops being repeated means the phone app
    // is gone even though the link still says reachable, so the screen is re-evaluated as it ages.
    aging = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.refresh() }
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  /// The phone does the saving; the watch only asks. A send that fails buzzes the failure pattern.
  func sendSave() {
    // Full-screen target: a sleeve or a ball must not save a clip every few seconds.
    let now = Date().timeIntervalSince1970
    guard WatchModel.canSave(now: now, lastSave: lastSaveAt, allowed: saveAllowed) else { return }
    lastSaveAt = now
    WKInterfaceDevice.current().play(.click)
    let session = WCSession.default
    guard session.isReachable else { return WKInterfaceDevice.current().play(.failure) }
    session.sendMessage(WatchMessage.save.payload, replyHandler: nil) { _ in
      WKInterfaceDevice.current().play(.failure)
    }
  }

  /// Starts a new recording on the phone (which ignores it while one is running). The phone answers by reporting a
  /// recording; if it never does, or cannot be reached, the app is not open there and the screen says so.
  func sendStart() {
    guard !recording, !starting else { return }
    guard WCSession.default.isReachable else { return markStartFailed() }
    startAskedAt = Date().timeIntervalSince1970
    starting = true
    startFailed = false
    sendCommand(.start) { [weak self] in DispatchQueue.main.async { self?.markStartFailed() } }
  }

  /// A tap on the message puts the Começar gravação button back.
  func dismissStartFailed() {
    startFailedReset?.cancel()
    startFailed = false
  }

  private func markStartFailed() {
    WKInterfaceDevice.current().play(.failure)
    starting = false
    startAskedAt = nil
    startFailed = true
    startFailedReset?.cancel()
    let reset = DispatchWorkItem { [weak self] in self?.startFailed = false }
    startFailedReset = reset
    DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: reset)
  }

  /// Ends the current recording on the phone. The UI asks for a press-and-hold first.
  func sendStop() {
    guard WatchModel.canStop(recording: recording, reachable: WCSession.default.isReachable) else {
      return WKInterfaceDevice.current().play(.failure)
    }
    sendCommand(.stop)
  }

  private func sendCommand(_ message: WatchMessage, onFailure: (() -> Void)? = nil) {
    WKInterfaceDevice.current().play(.click)
    WCSession.default.sendMessage(message.payload, replyHandler: nil) { _ in
      WKInterfaceDevice.current().play(.failure)
      onFailure?()
    }
  }

  /// The app came to the front: fill the screen with the last state the phone left, but as a guess. Until the phone
  /// speaks again the screen says it is connecting, rather than showing a recording that may be long over.
  func showCachedState() {
    guard WCSession.isSupported() else { return }
    DispatchQueue.main.async {
      self.activeSince = Date()
      self.refresh()
      self.apply(WCSession.default.receivedApplicationContext, fresh: false)
    }
  }

  /// Opens or closes the camera view. While it is open the watch asks again every second, so the phone
  /// stops on its own if the watch screen goes to sleep before it can say so.
  func setPreview(_ on: Bool) {
    guard on != previewOn else { return }
    previewOn = on
    if !on { picture = nil }
    keepAlive?.invalidate()
    keepAlive = nil
    guard on else { return sendPreview(false) }
    sendPreview(true)
    keepAlive = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      guard let self else { return }
      var recordingShown = false
      if case .recording = self.screen { recordingShown = true }
      let wanted = WatchModel.previewWanted(
        viewOn: self.previewOn, reachable: WCSession.default.isReachable, recording: recordingShown)
      if wanted { self.sendPreview(true) }
    }
  }

  private func sendPreview(_ on: Bool) {
    let session = WCSession.default
    guard session.isReachable else { return }
    session.sendMessage(WatchMessage.preview(on: on).payload, replyHandler: nil, errorHandler: nil)
  }

  /// WatchConnectivity calls back off the main thread: hop first, so state, haptics and the banner share one thread.
  /// `fresh` is false for a cached context: it fills the screen, but does not pass for a heartbeat.
  private func apply(_ payload: [String: Any], fresh: Bool = true) {
    DispatchQueue.main.async {
      switch WatchMessage.decode(payload) {
      case let .state(recording, clipCount, startedAt, saveAllowed)?:
        if self.saveAllowed != saveAllowed { self.saveAllowed = saveAllowed }
        self.recording = recording
        self.clipCount = clipCount
        self.startedAtMs = startedAt
        if fresh { self.lastStateAt = Date() }
        self.refresh()
      case let .result(saved)?:
        // The confirmation comes from the phone, once the clip is really saved (or the save failed).
        self.confirm(saved)
      default:
        break
      }
    }
  }

  private func confirm(_ saved: Bool) {
    WKInterfaceDevice.current().play(saved ? .success : .failure)
    confirmation = saved
    confirmationReset?.cancel()
    let reset = DispatchWorkItem { [weak self] in self?.confirmation = nil }
    confirmationReset = reset
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2, execute: reset)
  }

  /// Main thread only.
  private func refresh() {
    let reachable = WCSession.default.isReachable
    if self.reachable != reachable { self.reachable = reachable }
    if reachable { unreachableSince = nil } else if unreachableSince == nil { unreachableSince = Date() }
    let stateAge = Date().timeIntervalSince(lastStateAt)
    let next = WatchModel.screen(
      recording: recording, reachable: reachable, clipCount: clipCount, startedAtMs: startedAtMs,
      stateAge: stateAge, unreachableFor: unreachableSince.map { Date().timeIntervalSince($0) } ?? 0,
      sinceActive: Date().timeIntervalSince(activeSince))
    if screen != next { screen = next }
    // Nothing to look at once the recording is over or the phone is gone.
    var recordingShown = false
    if case .recording = next { recordingShown = true }
    if let asked = startAskedAt {
      switch WatchModel.startOutcome(askedAt: asked, now: Date().timeIntervalSince1970, recording: recordingShown) {
      case .started:
        startAskedAt = nil
        starting = false
        startFailed = false
      case .waiting: break
      case .failed: markStartFailed()
      }
    }
    if previewOn, !WatchModel.previewWanted(viewOn: true, reachable: reachable, recording: recordingShown) { setPreview(false) }
    publishToWidget(next)
  }

  /// The widget draws the timer and the clip count from this, in the app group both share. Main thread only.
  private func publishToWidget(_ screen: WatchScreen) {
    var shared = WatchSharedState(recording: false, clipCount: 0, startedAtMs: nil)
    if case let .recording(count, started) = screen, let started {
      shared = WatchSharedState(recording: true, clipCount: count, startedAtMs: started.timeIntervalSince1970 * 1000)
    }
    guard shared != lastShared else { return }
    lastShared = shared
    let group = WatchSharedState.groupID(forBundleID: Bundle.main.bundleIdentifier ?? "")
    UserDefaults(suiteName: group)?.set(shared.dictionary, forKey: WatchSharedState.key)
    WidgetCenter.shared.reloadAllTimelines()
  }

  // MARK: WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    // A watch app opened later still reads the last state the phone left as application context.
    apply(session.receivedApplicationContext)
  }

  func session(_ session: WCSession, didReceiveMessageData messageData: Data) {
    guard let image = UIImage(data: messageData) else { return }
    DispatchQueue.main.async { if self.previewOn { self.picture = image } }
  }

  func sessionReachabilityDidChange(_ session: WCSession) { DispatchQueue.main.async { self.refresh() } }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { apply(message) }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { apply(applicationContext) }
}
