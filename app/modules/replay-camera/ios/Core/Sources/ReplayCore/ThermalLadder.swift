import Foundation

/// `ProcessInfo.ThermalState`, platform-free (same raw values).
public enum ThermalLevel: Int, Comparable {
  case nominal = 0, fair, serious, critical

  public var name: String {
    switch self {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    }
  }

  public static func < (a: ThermalLevel, b: ThermalLevel) -> Bool { a.rawValue < b.rawValue }
}

/// How a recording steps down when the phone heats up (thermal work, item 3). The player's call (2026-10-31): keep the
/// quality as long as possible and never go below Full HD. So a step down (anything above 1080p30 becomes 1080p30, the
/// floor) only comes once the phone has stayed `serious` for `holdBeforeNextStep`: a short hot spell costs nothing.
/// `critical` stops the recording at once. It never steps back up during a session: every step restarts the writer
/// (and empties the buffer), so going back and forth would cost saves.
public struct ThermalLadder {
  /// How long the phone must stay `serious`, without cooling to `fair` or below, before the quality goes down.
  public static let holdBeforeNextStep: TimeInterval = 120

  public enum Action: Equatable {
    case none
    case reconfigure(String)
    case stop
  }

  public let requested: String
  public private(set) var quality: String
  /// When the current `serious` stretch began (or the last step was taken in it); nil while cooler.
  private var seriousSince: TimeInterval?

  /// A phone already hot at the start still records what was asked: the wait starts now.
  public init(requested: String, state: ThermalLevel, now: TimeInterval) {
    self.requested = requested
    quality = requested
    if state >= .serious { seriousSince = now }
  }

  /// True once the recording runs below what was asked for.
  public var degraded: Bool { quality != requested }

  public mutating func update(state: ThermalLevel, now: TimeInterval) -> Action {
    if state == .critical { return .stop }
    guard state == .serious else {
      seriousSince = nil
      return .none
    }
    guard let since = seriousSince else {
      seriousSince = now
      return .none
    }
    guard now - since >= Self.holdBeforeNextStep, let lower = Self.step(below: quality) else { return .none }
    quality = lower
    seriousSince = now
    return .reconfigure(lower)
  }

  /// The next quality down, or nil at the floor (1080p30, and anything already below it). Anything above goes to 1080p30.
  public static func step(below quality: String) -> String? {
    switch quality {
    case "720p30", "1080p30": return nil
    default: return "1080p30"
    }
  }
}
