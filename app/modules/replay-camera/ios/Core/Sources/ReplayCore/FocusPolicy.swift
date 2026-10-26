import Foundation

/// What the Modo Foco crop follows.
public enum FocusFollow: String { case ball, players }

/// Where a ball-led sport's ball candidates come from. Today only the general detector (after `BallFilter`); a ball
/// model such as TrackNetV3 would be the next case (spec 2026-10-24 §13.4).
public enum BallSource: String { case detector }

/// How one recording is framed: what to follow, the ball source, and the zoom cap.
public struct FocusPlan: Equatable {
  public var follow: FocusFollow
  public var ballSource: BallSource?
  public var maxZoom: Double
  public init(follow: FocusFollow, ballSource: BallSource?, maxZoom: Double) {
    self.follow = follow; self.ballSource = ballSource; self.maxZoom = maxZoom
  }
}

/// Sport → framing (spec §13.1 decisions 8, 10 as amended 2026-10-26, 14; ids from §13.6; bench `policy.policy`).
/// Tennis and volleyball (indoor and beach) follow the ball, from the detector's filtered candidates; volleyball's zoom
/// is capped at 1.5×. Every other id — `livre`, the other sports, and old or unknown ids such as `quadra` — frames the
/// players. The zoom cap comes from the capture's short side (`FocusPath.maxZoom`).
public enum FocusPolicy {
  public static let volleyballMaxZoom = 1.5
  static let ballSports: [String: BallSource] = ["tenis": .detector, "volei": .detector, "voleiPraia": .detector]
  static let zoomCaps: [String: Double] = [
    "volei": FocusPolicy.volleyballMaxZoom, "voleiPraia": FocusPolicy.volleyballMaxZoom,
  ]

  public static func plan(sport: String, shortSidePx: Double) -> FocusPlan {
    var cap = FocusPath.maxZoom(shortSidePx: shortSidePx)
    guard let source = ballSports[sport] else { return FocusPlan(follow: .players, ballSource: nil, maxZoom: cap) }
    if let sportCap = zoomCaps[sport] { cap = min(sportCap, cap) }
    return FocusPlan(follow: .ball, ballSource: source, maxZoom: cap)
  }
}

/// The one entry point the analyser calls (Part 3): the crop rects of a recording and, for ball-led sports, the ball
/// track (for the `.focus.json` and the `Seguir` control).
public enum FocusV2 {
  /// `balls` and `motion` hold one list per sample (`motion` nil, or a nil list, where there are no scores). Players
  /// sports ignore them and return an empty track.
  public static func rects(plan: FocusPlan, samples: [FocusSample], balls: [[BallCandidate]], motion: [[Double?]?]?,
                           videoWidth: Double, videoHeight: Double,
                           aspect: FocusAspect) -> (rects: [FocusRect]?, track: [BallRow]) {
    if plan.follow == .players || videoWidth <= 0 || videoHeight <= 0 {
      let rects = FocusPath.compute(samples: samples, videoWidth: videoWidth, videoHeight: videoHeight, aspect: aspect,
                                    zoom: true, maxZoom: plan.maxZoom, tuning: .players)
      return (rects, [])
    }
    let n = samples.count
    var input: [[BallCandidate]] = []
    input.reserveCapacity(n)
    for i in 0..<n {
      let candidates = i < balls.count ? balls[i] : []
      if plan.ballSource == .detector {
        var scores: [Double?]? = nil
        if let all = motion, i < all.count { scores = all[i] }
        input.append(BallFilter.apply(candidates, people: samples[i].boxes, motion: scores))
      } else {
        input.append(candidates)
      }
    }
    let track = BallTracker.track(times: samples.map { $0.tMs }, balls: input, people: samples.map { $0.boxes },
                                  heightOverWidth: videoHeight / videoWidth)
    let rects = FocusBallPath.compute(samples: samples, track: track, videoWidth: videoWidth, videoHeight: videoHeight,
                                      aspect: aspect, maxZoom: plan.maxZoom)
    return (rects, track)
  }
}
