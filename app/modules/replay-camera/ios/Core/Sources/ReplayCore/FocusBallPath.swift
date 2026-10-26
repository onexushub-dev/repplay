import Foundation

/// The ball-led framing's numbers (spec 2026-10-24 §4.3 and §13.1 decision 13; bench `path_v2.TUNING_V2`).
public struct FocusBallTuning {
  /// The target: x leans on the ball, y on the players near it (lobs and sets don't drag the camera up).
  public var ballWeightX = 0.7
  public var ballWeightY = 0.3
  public var nearPlayers = 2
  /// Look-ahead: the subject at t + Δ, Δ up to `lookaheadMaxS`, reached at this ball speed (frame widths / s).
  public var lookaheadMaxS = 0.5
  public var lookaheadFullSpeed = 1.0
  /// Lead room: the ball's horizontal speed × `leadS`, capped at `leadMax` of the crop width; the speed is smoothed.
  public var leadS = 0.5
  public var leadMax = 0.15
  public var sigmaLeadMs = 300.0
  /// Size: spread of the subject and its nearest players × scale + margin, widest within the look-ahead, smoothed.
  public var sizeLookaheadS = 0.8
  public var spreadScale = 1.3
  public var spreadMargin = 0.15
  public var sigmaSizeMs = 1200.0
  public var sigmaXMs = 200.0
  public var sigmaYMs = 800.0
  /// Camera (decision 13): a Gaussian on the placed rects' centre x, centre y, width and height.
  public var cameraSigmaMs = 600.0
  /// People filters, the players' centre where the ball is lost, and the lift: v1's.
  public var people = FocusTuning.standard
  /// A clip whose track never finds the ball gets the players path with this tuning.
  public var playersFallback = FocusTuning.players

  public init() {}
  public static let standard = FocusBallTuning()
}

/// Ball-led framing: port of the bench's `path_v2.ball_rects`; `FocusBallPathTests` holds it to the bench fixtures.
///
/// Per sample, from the ball track and the people (v1's far and still filters):
/// 1. Subject: the ball when seen or predicted, the holder when held, v1's players' centre when lost.
/// 2. Target: the subject (looked ahead with the ball's speed) weighted with the centre of its 2 nearest players.
/// 3. Lead room toward where the ball goes; size from the subject and its players, widest in the next 0.8 s.
/// 4. Placed as v1 (lift, clamped inside the video), then smoothed (σ 600 ms) and clamped again.
public enum FocusBallPath {
  /// One crop rect per sample; nil as v1 when too few samples have people. A track that is all `lost` (or does not
  /// match the samples) gives exactly the players path.
  public static func compute(samples: [FocusSample], track: [BallRow], videoWidth: Double, videoHeight: Double,
                             aspect: FocusAspect, maxZoom: Double,
                             tuning t: FocusBallTuning = .standard) -> [FocusRect]? {
    let n = samples.count
    guard n > 0, videoWidth > 0, videoHeight > 0 else { return nil }
    if track.count != n || track.allSatisfy({ $0.state == .lost }) {
      return FocusPath.compute(samples: samples, videoWidth: videoWidth, videoHeight: videoHeight, aspect: aspect,
                               zoom: true, maxZoom: maxZoom, tuning: t.playersFallback)
    }
    guard let placed = placedRects(samples: samples, track: track, W: videoWidth, H: videoHeight, aspect: aspect,
                                   maxZoom: maxZoom, tuning: t) else { return nil }
    return smoothRects(placed, sigmaMs: t.cameraSigmaMs, stepMs: stepMs(samples))
  }

  static func stepMs(_ samples: [FocusSample]) -> Double {
    let n = samples.count
    return n > 1 ? (samples[n - 1].tMs - samples[0].tMs) / Double(n - 1) : 100.0
  }

  /// Steps 1–3 and v1's placement, before the camera smoothing (`track.count` must equal `samples.count`).
  static func placedRects(samples: [FocusSample], track: [BallRow], W: Double, H: Double, aspect: FocusAspect,
                          maxZoom: Double, tuning t: FocusBallTuning) -> [FocusRect]? {
    let n = samples.count
    let step = stepMs(samples)
    let dt = step / 1000
    let hw = H / W
    guard let people = FocusPath.filteredPeople(samples, W: W, H: H, tuning: t.people) else { return nil }
    let v1 = FocusPath.targets(people, W: W, H: H, tuning: t.people)
    let v1x = FocusPath.fill(v1.cx), v1y = FocusPath.fill(v1.cy)

    // 1. Subject per sample, the ball's horizontal speed and its speed.
    var subject: [(x: Double, y: Double)] = []
    var isBall: [Bool] = []
    for (i, r) in track.enumerated() {
      subject.append(r.state == .lost ? (x: v1x[i], y: v1y[i]) : (x: r.x, y: r.y))
      isBall.append(r.state == .seen || r.state == .predicted)
    }
    var vx = [Double](repeating: 0, count: n)
    var speed = [Double](repeating: 0, count: n)
    for i in 0..<n {
      let a = max(0, i - 1), b = min(n - 1, i + 1)
      guard b > a, isBall[a], isBall[b] else { continue }
      let span = Double(b - a) * dt
      vx[i] = (subject[b].x - subject[a].x) / span
      speed[i] = hypot(subject[b].x - subject[a].x, (subject[b].y - subject[a].y) * hw) / span
    }

    // 2. Target: the subject looked ahead, weighted with its nearest players.
    var tx = [Double](repeating: 0, count: n)
    var ty = [Double](repeating: 0, count: n)
    var spread = [Double?](repeating: nil, count: n)
    for i in 0..<n {
      if track[i].state == .lost {
        tx[i] = v1x[i]
        ty[i] = v1y[i]
        spread[i] = v1.spread[i]
        continue
      }
      let ahead = t.lookaheadMaxS * min(1, speed[i] / t.lookaheadFullSpeed)
      var j = min(n - 1, i + Int((ahead / dt).rounded(.toNearestOrEven)))
      if track[j].state == .lost { j = i }
      let s = subject[j]
      let centres = people[i].map { (x: $0.x + $0.width / 2, y: $0.y + $0.height / 2) }
      let distance = centres.map { hypot($0.x - s.x, ($0.y - s.y) * hw) }
      let order = centres.indices.sorted { a, b in  // nearest first; the earlier box wins a tie (as the bench)
        distance[a] < distance[b] || (distance[a] == distance[b] && a < b)
      }
      let near = order.prefix(max(0, t.nearPlayers)).map { centres[$0] }
      if near.isEmpty {
        tx[i] = s.x
        ty[i] = s.y
        continue
      }
      var px = 0.0, py = 0.0
      for c in near { px += c.x; py += c.y }
      px /= Double(near.count)
      py /= Double(near.count)
      tx[i] = t.ballWeightX * s.x + (1 - t.ballWeightX) * px
      ty[i] = t.ballWeightY * s.y + (1 - t.ballWeightY) * py
      var lo = s.x, hi = s.x
      for c in near { lo = min(lo, c.x); hi = max(hi, c.x) }
      spread[i] = hi - lo
    }

    // 3. Size: widest spread within the look-ahead window, v1's clamp and smoothing; then the lead room.
    let sp = FocusPath.fill(spread)
    let kAhead = Int((t.sizeLookaheadS / dt).rounded(.toNearestOrEven))
    var widest = [Double](repeating: 0, count: n)
    for i in 0..<n {
      var m = sp[i]
      var k = i + 1
      while k < n && k <= i + kAhead { m = max(m, sp[k]); k += 1 }
      widest[i] = m
    }
    let widths = FocusPath.gaussian(widest.map { min(max($0 * t.spreadScale + t.spreadMargin, 1 / maxZoom), 1) },
                                    sigma: t.sigmaSizeMs / step)
    tx = FocusPath.gaussian(tx, sigma: t.sigmaXMs / step)
    ty = FocusPath.gaussian(ty, sigma: t.sigmaYMs / step)
    let lead = FocusPath.gaussian(vx, sigma: t.sigmaLeadMs / step)
    for i in 0..<n {
      let cap = t.leadMax * widths[i]
      tx[i] += max(-cap, min(cap, lead[i] * t.leadS))
    }

    // 4. v1's placement: the rect of the aspect around the target, lifted, clamped inside the video.
    let ratio = aspect.ratio
    return (0..<n).map { i -> FocusRect in
      var w = widths[i]
      var h = w * W / (ratio * H)
      if h > 1 { h = 1; w = ratio * H / W }
      let left = min(max(tx[i] - w / 2, 0), 1 - w)
      let top = min(max(ty[i] - t.people.lift * h - h / 2, 0), 1 - h)
      return FocusRect(x: left, y: top, width: w, height: h)
    }
  }

  /// The camera: Gaussian (v1's edge-held kernel) on centre x, centre y, width and height; then clamped inside.
  static func smoothRects(_ rects: [FocusRect], sigmaMs: Double, stepMs: Double) -> [FocusRect] {
    let sigma = sigmaMs / stepMs
    let xs = FocusPath.gaussian(rects.map { $0.x + $0.width / 2 }, sigma: sigma)
    let ys = FocusPath.gaussian(rects.map { $0.y + $0.height / 2 }, sigma: sigma)
    let ws = FocusPath.gaussian(rects.map { $0.width }, sigma: sigma)
    let hs = FocusPath.gaussian(rects.map { $0.height }, sigma: sigma)
    return rects.indices.map { i -> FocusRect in
      let w = ws[i], h = hs[i]
      return FocusRect(x: min(max(xs[i] - w / 2, 0), 1 - w), y: min(max(ys[i] - h / 2, 0), 1 - h), width: w, height: h)
    }
  }
}
