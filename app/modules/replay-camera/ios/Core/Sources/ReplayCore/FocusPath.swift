import Foundation

/// A person found in one analysed frame: 0..1 of the video, origin top-left, display orientation.
public struct FocusBox: Equatable {
  public var x: Double, y: Double, width: Double, height: Double
  public init(x: Double, y: Double, width: Double, height: Double) {
    self.x = x; self.y = y; self.width = width; self.height = height
  }
}

/// One analysed frame (every 100 ms).
public struct FocusSample {
  public var tMs: Double
  public var boxes: [FocusBox]
  public init(tMs: Double, boxes: [FocusBox]) { self.tMs = tMs; self.boxes = boxes }
}

/// The visible part of the video: 0..1 of its size, origin top-left.
public struct FocusRect: Equatable {
  public var x: Double, y: Double, width: Double, height: Double
  public init(x: Double, y: Double, width: Double, height: Double) {
    self.x = x; self.y = y; self.width = width; self.height = height
  }
}

public enum FocusAspect {
  case landscape, portrait
  /// Width over height, in pixels.
  public var ratio: Double { self == .landscape ? 16.0 / 9.0 : 9.0 / 16.0 }
}

/// The Modo Foco rules' numbers (spec §4.2, from the 2026-10-23 spike). Tuned in the field test.
public struct FocusTuning {
  /// People shorter than this share of the median height of the tallest ones are far behind the court.
  public var farShare = 0.4
  public var tallestCount = 10
  /// Someone with a box this close (share of the frame width, bottom-centre) in this share of the samples within the
  /// window is standing still: a spectator, the bench.
  public var stillRadius = 0.012
  public var stillShare = 0.8
  public var stillWindowMs = 3000.0
  /// Motion weight: 1 + min(moved / (unit × width), cap).
  public var moveUnit = 0.01
  public var moveCap = 4.0
  public var spreadLow = 0.1
  public var spreadHigh = 0.9
  public var sigmaXMs = 600.0
  public var sigmaYMs = 800.0
  public var sigmaSizeMs = 1200.0
  /// Max pan: share of the frame width per second.
  public var maxPanPerSecond = 0.35
  public var spreadScale = 1.3
  public var spreadMargin = 0.15
  /// The rect's centre sits this share of its height above the players' centre. 0 since 2026-10-27: near players are
  /// big in the frame and a lift cut their feet.
  public var lift = 0.0
  /// Fewer samples with someone than this share: no framing.
  public var minPeopleShare = 0.2
  /// Someone who vanished (the detector often misses a player at the edge of the picture) still counts where last seen
  /// for this long, unless someone is found there again. 0 = off.
  public var holdMs = 1000.0
  /// The crop width is the widest needed within ± this window: it opens before someone reaches the edge and closes
  /// only once the play has settled. 0 = off.
  public var widthHoldMs = 1000.0

  // v14 "ação" (2026-10-28, FocusActivity): people tracked between samples; off in `standard` (v13).
  /// Stillness and movement measured per tracked person in body heights; replaces the pixel still filter above.
  public var activity = false
  /// A track not seen for this long ends.
  public var trackGapMs = 1000.0
  /// A box joins a track whose last centre is within this many body heights.
  public var trackMatch = 0.7
  /// Someone whose feet stay within this many body heights for the whole time they are seen ...
  public var stillBodies = 0.3
  /// ... when that time is at least this long, is not playing (bench, stands).
  public var spectatorMinMs = 8000.0
  /// The body height is the median over ± this window.
  public var activityWindowMs = 6000.0
  /// Weight: 1 + min(speed / speedUnit, moveCap), speed in body heights per second over ± speedWindowMs.
  public var speedUnit = 0.6
  public var speedWindowMs = 500.0
  /// The crop width covers the people in action (weight >= activeWeight) when there are any: the frame closes on the
  /// play instead of on everybody.
  public var activeSpread = false
  public var activeWeight = 2.0

  public init() {}
  public static let standard = FocusTuning()
  /// v14: what FocusAnalyzer uses since 2026-10-28, with the tiles finding the far players.
  public static let action: FocusTuning = {
    var t = FocusTuning()
    t.activity = true
    t.activeSpread = true
    return t
  }()
}

public enum FocusPath {
  /// One crop rect per sample, or nil when there are too few people for a framing. `zoom: false` gives the largest rect
  /// of `aspect` that fits, moved with the play (the track for the other shape).
  public static func compute(samples: [FocusSample], videoWidth: Double, videoHeight: Double, aspect: FocusAspect,
                             zoom: Bool, maxZoom: Double = 1.5, tuning t: FocusTuning = .standard) -> [FocusRect]? {
    let n = samples.count
    guard n > 0, videoWidth > 0, videoHeight > 0 else { return nil }
    let W = videoWidth, H = videoHeight
    let step = n < 2 ? 100 : (samples[n - 1].tMs - samples[0].tMs) / Double(n - 1)

    // 1. Far people out.
    let near: [[FocusBox]] = samples.map { s in
      guard !s.boxes.isEmpty else { return [] }
      let tallest = Array(s.boxes.map { $0.height }.sorted(by: >).prefix(t.tallestCount))
      let ref = median(tallest)
      return s.boxes.filter { $0.height >= t.farShare * ref }
    }
    // 2. Still people out.
    var people: [[FocusBox]] = []
    var activityWeights: [[Double]]? = nil
    if t.activity {
      let act = FocusActivity.people((0..<n).map { FocusSample(tMs: samples[$0].tMs, boxes: near[$0]) }, W: W, H: H, t: t)
      people = act.map { $0.map { $0.box } }
      activityWeights = act.map { $0.map { $0.weight } }
    }
    let feet = near.map { $0.map { (x: $0.x + $0.width / 2, y: $0.y + $0.height) } }
    for i in 0..<n where !t.activity {
      var keep: [FocusBox] = []
      for (j, box) in near[i].enumerated() {
        let foot = feet[i][j]
        var hits = 0, total = 0
        for k in 0..<n where k != i && abs(samples[k].tMs - samples[i].tMs) <= t.stillWindowMs {
          total += 1
          if feet[k].contains(where: { hypot((foot.x - $0.x) * W, (foot.y - $0.y) * H) < t.stillRadius * W }) { hits += 1 }
        }
        let still = total > 0 && Double(hits) >= t.stillShare * Double(total)
        if !still { keep.append(box) }
      }
      people.append(keep)
    }
    if Double(people.filter { !$0.isEmpty }.count) < t.minPeopleShare * Double(n) { return nil }
    if t.holdMs > 0 { people = held(people, samples: samples, W: W, H: H, holdMs: t.holdMs) }

    // 3–4. Weights and the target per sample.
    var cx = [Double?](repeating: nil, count: n), cy = cx, spread = cx
    var previous: [(x: Double, y: Double)] = []
    for i in 0..<n {
      let centres = people[i].map { (x: $0.x + $0.width / 2, y: $0.y + $0.height / 2) }
      guard !centres.isEmpty else { previous = []; continue }
      let weights: [Double]
      if let own = activityWeights {
        // Each person's own speed; people held where last seen (appended by `held`) weigh 1.
        weights = centres.indices.map { $0 < own[i].count ? own[i][$0] : 1 }
      } else {
        weights = centres.map { c -> Double in
          let moved = previous.map { hypot((c.x - $0.x) * W, (c.y - $0.y) * H) }.min() ?? 0
          return 1 + min(moved / (t.moveUnit * W), t.moveCap)
        }
      }
      let total = weights.reduce(0, +)
      cx[i] = zip(centres, weights).map { $0.x * $1 }.reduce(0, +) / total
      cy[i] = zip(centres, weights).map { $0.y * $1 }.reduce(0, +) / total
      let xs = centres.map { $0.x }
      let active = activityWeights != nil && t.activeSpread ? xs.indices.filter { weights[$0] >= t.activeWeight } : []
      if !active.isEmpty {
        let ax = active.map { xs[$0] }
        spread[i] = ax.max()! - ax.min()!
      } else {
        spread[i] = weightedQuantile(xs, weights, t.spreadHigh) - weightedQuantile(xs, weights, t.spreadLow)
      }
      previous = centres
    }

    // 5. Smooth with look-ahead, then limit the pan speed.
    var x = gaussian(fill(cx), sigma: t.sigmaXMs / step)
    let y = gaussian(fill(cy), sigma: t.sigmaYMs / step)
    let limit = t.maxPanPerSecond * step / 1000
    for i in 1..<max(n, 1) { x[i] = x[i - 1] + min(max(x[i] - x[i - 1], -limit), limit) }

    // 6–7. Size and placement.
    var wanted = fill(spread).map { min(max($0 * t.spreadScale + t.spreadMargin, 1 / maxZoom), 1) }
    if zoom && t.widthHoldMs > 0 { wanted = windowMax(wanted, radius: Int((t.widthHoldMs / step).rounded())) }
    let widths: [Double] = zoom ? gaussian(wanted, sigma: t.sigmaSizeMs / step) : Array(repeating: 1, count: n)
    let ratio = aspect.ratio
    return (0..<n).map { i -> FocusRect in
      var w = zoom ? widths[i] : min(1, ratio * H / W)
      var h = w * W / (ratio * H)
      if h > 1 { h = 1; w = ratio * H / W }
      let left = min(max(x[i] - w / 2, 0), 1 - w)
      let top = min(max(y[i] - t.lift * h - h / 2, 0), 1 - h)
      return FocusRect(x: left, y: top, width: w, height: h)
    }
  }

  /// People who vanished kept where last seen for `holdMs`, unless someone is found within a body length of them.
  static func held(_ people: [[FocusBox]], samples: [FocusSample], W: Double, H: Double, holdMs: Double) -> [[FocusBox]] {
    var out = people
    var memory: [(box: FocusBox, seen: Double)] = []
    for i in people.indices {
      let now = samples[i].tMs
      let centres = people[i].map { (x: $0.x + $0.width / 2, y: $0.y + $0.height / 2) }
      var kept: [(box: FocusBox, seen: Double)] = []
      for m in memory where now - m.seen <= holdMs {
        let c = (x: m.box.x + m.box.width / 2, y: m.box.y + m.box.height / 2)
        let reach = max(m.box.width * W, m.box.height * H)
        if centres.contains(where: { hypot((c.x - $0.x) * W, (c.y - $0.y) * H) < reach }) { continue }
        kept.append(m)
        out[i].append(m.box)
      }
      memory = kept + people[i].map { (box: $0, seen: now) }
    }
    return out
  }

  /// Each value replaced by the largest within ± `radius` samples.
  static func windowMax(_ values: [Double], radius: Int) -> [Double] {
    guard radius > 0 else { return values }
    let n = values.count
    return (0..<n).map { i in values[max(0, i - radius)...min(n - 1, i + radius)].max()! }
  }

  static func median(_ values: [Double]) -> Double {
    let s = values.sorted(), n = s.count
    return n % 2 == 1 ? s[n / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
  }

  /// The first value (sorted) whose cumulative weight share reaches `q`.
  static func weightedQuantile(_ values: [Double], _ weights: [Double], _ q: Double) -> Double {
    let order = values.indices.sorted { values[$0] < values[$1] }
    let total = weights.reduce(0, +)
    var sum = 0.0
    for i in order {
      sum += weights[i]
      if sum / total >= q { return values[i] }
    }
    return values[order[order.count - 1]]
  }

  /// Gaps filled linearly between known values; ends hold the nearest known value.
  static func fill(_ values: [Double?]) -> [Double] {
    let known = values.indices.filter { values[$0] != nil }
    guard let first = known.first, let last = known.last else { return Array(repeating: 0.5, count: values.count) }
    var out = [Double](repeating: 0, count: values.count)
    var k = 0
    for i in values.indices {
      if i <= first { out[i] = values[first]!; continue }
      if i >= last { out[i] = values[last]!; continue }
      while known[k + 1] < i { k += 1 }
      let a = known[k], b = known[k + 1]
      let va = values[a]!, vb = values[b]!
      out[i] = i == b ? vb : va + (vb - va) * Double(i - a) / Double(b - a)
    }
    return out
  }

  /// Centred Gaussian (radius 3σ) with the edge values repeated.
  static func gaussian(_ values: [Double], sigma: Double) -> [Double] {
    guard sigma > 0, values.count > 1 else { return values }
    let r = Int((3 * sigma).rounded(.up))
    let kernel = (-r...r).map { exp(-0.5 * pow(Double($0) / sigma, 2)) }
    let norm = kernel.reduce(0, +)
    let n = values.count
    return (0..<n).map { i in
      var sum = 0.0
      for (j, k) in kernel.enumerated() { sum += values[min(max(i + j - r, 0), n - 1)] * k }
      return sum / norm
    }
  }
}
