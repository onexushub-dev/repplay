import Foundation

/// What the watch shows. Platform-free on purpose: the same file is compiled into the watch app and into
/// the ReplayCore tests (symlinked there), so the rules below are covered by `swift test`.
enum WatchScreen: Equatable {
  case idle
  /// Just opened (or raised) and the phone has not spoken yet: a neutral wait, not a lost link.
  case connecting
  case offline
  case recording(clipCount: Int, startedAt: Date?)
}

enum StartOutcome: Equatable {
  case waiting, started, failed
}

enum WatchModel {
  /// The phone repeats its state this often while recording (WatchBridge).
  static let heartbeat = 5.0
  /// A recording state older than this is not believed: the phone app is gone even if the link says reachable.
  static let staleAfter = 12.0
  /// A phone that cannot be reached for less than this is a flicker, not a lost link: the screen stays as it was.
  static let offlineGrace = 10.0
  /// Right after the app comes to the front the state it holds may be old (or only the one cached from the last game):
  /// it waits this long for the phone's next beat before calling the phone gone.
  static let connectGrace = 5.0
  /// How long a "Começar gravação" waits for the phone to answer by reporting a recording.
  static let startWait = 6.0
  /// One save per this many seconds from the watch: a sleeve or a ball on a full-screen target saves nothing more.
  static let saveCooldown = 3.0

  /// A recording whose phone has been unreachable for `offlineGrace` seconds (`unreachableFor`), or has stopped
  /// reporting (`stateAge` in seconds), is lost: `connecting` while the app has only just come to the front
  /// (`sinceActive` < `connectGrace`, so a stale or cached state is not shown as a live recording), `offline` after.
  /// With no recording the watch is `idle`, whatever the connection.
  static func screen(
    recording: Bool, reachable: Bool, clipCount: Int, startedAtMs: Double?, stateAge: Double, unreachableFor: Double,
    sinceActive: Double
  ) -> WatchScreen {
    guard recording else { return .idle }
    let lost = stateAge > staleAfter || (!reachable && unreachableFor >= offlineGrace)
    if lost { return sinceActive < connectGrace ? .connecting : .offline }
    return .recording(clipCount: clipCount, startedAt: startedAtMs.map { Date(timeIntervalSince1970: $0 / 1000) })
  }

  /// A start the watch asked for (`askedAt`, `now` in seconds) is answered by the phone reporting a recording. No answer
  /// in `startWait` means the Revi app is not open on the phone.
  static func startOutcome(askedAt: Double, now: Double, recording: Bool) -> StartOutcome {
    if recording { return .started }
    return now - askedAt >= startWait ? .failed : .waiting
  }

  /// Start is for an idle phone, Stop for a recording one, and both need the phone within reach.
  static func canStart(recording: Bool, reachable: Bool) -> Bool { !recording && reachable }
  static func canStop(recording: Bool, reachable: Bool) -> Bool { recording && reachable }

  /// "mm:ss", or "h:mm:ss" from one hour on.
  static func elapsed(since start: Date, now: Date) -> String {
    let total = max(0, Int(now.timeIntervalSince(start)))
    let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60)
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
  }

  /// The watch keeps asking for pictures only while its view is open, the phone is reachable and a recording runs.
  static func previewWanted(viewOn: Bool, reachable: Bool, recording: Bool) -> Bool {
    viewOn && reachable && recording
  }

  /// `allowed` is the phone's word on the watch trigger (paid): when locked nothing is sent at all.
  static func canSave(now: Double, lastSave: Double?, allowed: Bool = true) -> Bool {
    guard allowed else { return false }
    guard let lastSave else { return true }
    return now - lastSave >= saveCooldown
  }

}
