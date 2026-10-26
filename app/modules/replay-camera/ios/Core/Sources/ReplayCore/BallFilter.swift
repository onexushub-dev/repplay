import Foundation

/// A ball candidate from the general detector: centre (0..1 of the video, origin top-left, display orientation), radius
/// (share of the frame width) and the detector's confidence.
public struct BallCandidate: Equatable {
  public var x: Double, y: Double, r: Double, conf: Double
  public init(x: Double, y: Double, r: Double, conf: Double) {
    self.x = x; self.y = y; self.r = r; self.conf = conf
  }
}

/// The ball candidate filters' numbers (spec 2026-10-24 §13.3; bench `filters.FILTER_TUNING`).
public struct BallFilterTuning {
  /// Rule 1: the candidate's patch must change by at least this mean absolute value (0–255) vs the previous and the
  /// next sample (the min of both).
  public var motionMin = 4.0
  /// Rule 2: the bottom share of a person box is the feet zone (shoes).
  public var feetShare = 0.15
  /// Rule 3: inside a person box, above the feet, only this confidence or more stays.
  public var bodyConfMin = 0.3

  public init() {}
  public static let standard = BallFilterTuning()
}

/// Rules 1–3 of spec §13.3, applied to one sample's candidates before the tracker. Rule 4 (static scenery) is the
/// tracker's. Port of the bench's `filters.filter_balls`; `BallFilterTests` checks it against the bench fixtures.
public enum BallFilter {
  private enum Zone { case outside, body, feet }

  /// The candidates that pass, in their original order. `motion` holds one score per candidate; a nil score (first or
  /// last sample, a patch cut by the frame edge) keeps the candidate, and a nil list turns rule 1 off.
  public static func apply(_ candidates: [BallCandidate], people: [FocusBox], motion: [Double?]?,
                           tuning t: BallFilterTuning = .standard) -> [BallCandidate] {
    var keep: [BallCandidate] = []
    for (i, c) in candidates.enumerated() {
      if let scores = motion, i < scores.count, let m = scores[i], m < t.motionMin { continue }
      switch zone(of: c, in: people, feetShare: t.feetShare) {
      case .feet:
        continue
      case .body:
        if c.conf < t.bodyConfMin { continue }
      case .outside:
        break
      }
      keep.append(c)
    }
    return keep
  }

  /// The first box (detector order) that holds the candidate decides; boxes are inclusive on every edge.
  private static func zone(of c: BallCandidate, in people: [FocusBox], feetShare: Double) -> Zone {
    for p in people where p.x <= c.x && c.x <= p.x + p.width && p.y <= c.y && c.y <= p.y + p.height {
      return (c.y - p.y) / p.height >= 1 - feetShare ? .feet : .body
    }
    return .outside
  }
}
