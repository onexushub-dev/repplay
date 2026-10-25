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

/// How a recording steps down when the phone heats up (thermal work, item 3). The resolution Modo Foco needs is kept as
/// long as possible: first the frame rate halves (1080p30), and only if the phone stays `serious` for
/// `holdBeforeNextStep` does it drop to 720p30. `critical` stops the recording. It never steps back up during a session:
/// every step restarts the writer, so going back and forth would cost saves.
public struct ThermalLadder {
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

  public init(requested: String, state: ThermalLevel, now: TimeInterval) {
    self.requested = requested
    quality = requested
    if state >= .serious, let lower = Self.step(below: requested) {
      quality = lower
      seriousSince = now
    }
  }

  /// True once the recording runs below what was asked for.
  public var degraded: Bool { quality != requested }

  public mutating func update(state: ThermalLevel, now: TimeInterval) -> Action {
    if state == .critical { return .stop }
    guard state == .serious else {
      seriousSince = nil
      return .none
    }
    let firstStep = quality == requested
    if !firstStep, let since = seriousSince, now - since < Self.holdBeforeNextStep { return .none }
    if !firstStep, seriousSince == nil {
      seriousSince = now
      return .none
    }
    guard let lower = Self.step(below: quality) else { return .none }
    quality = lower
    seriousSince = now
    return .reconfigure(lower)
  }

  /// The next quality down, or nil at the bottom. Anything above Full HD goes to 1080p30 first.
  public static func step(below quality: String) -> String? {
    switch quality {
    case "720p30": return nil
    case "1080p30": return "720p30"
    default: return "1080p30"
    }
  }
}
