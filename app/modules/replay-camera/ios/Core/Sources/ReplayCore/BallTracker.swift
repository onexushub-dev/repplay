import Foundation

/// What a ball row stands for: the ball seen in that sample, predicted through a short gap, held by the moving player
/// nearest where it was last seen, or lost.
public enum BallState: Int { case seen = 0, predicted, held, lost }

/// The ball in one sample: 0..1 of the video, origin top-left, display orientation. `conf` is the matched candidate's
/// confidence (0 when not seen). A lost row has x = y = 0.
public struct BallRow: Equatable {
  public var x: Double, y: Double
  public var state: BallState
  public var conf: Double
  public init(x: Double, y: Double, state: BallState, conf: Double) {
    self.x = x; self.y = y; self.state = state; self.conf = conf
  }
}

/// The ball tracker's numbers (spec 2026-10-24 §4.2 and §13.3 rule 4; bench `tracker.TRACKER_TUNING`). Distances are
/// in frame widths (y × height / width).
public struct BallTrackerTuning {
  /// Rule 1: a candidate with another candidate within `staticRadius` in at least `staticShare` of the samples within
  /// ±`staticWindowMs` is scenery.
  public var staticShare = 0.5
  public var staticWindowMs = 2000.0
  public var staticRadius = 0.02
  /// A track counts once it has `startHits` matches within `startWindowMs`; it ends after `predictMaxMs` unmatched.
  public var startHits = 3
  public var startWindowMs = 500.0
  public var predictMaxMs = 700.0
  /// After the prediction, the moving player nearest the last sighting holds the ball until this long after it.
  public var heldMaxMs = 3000.0
  /// Process noise of the constant-velocity model (frame widths / s²) and the measurement noise (frame widths).
  public var accelStd = 3.0
  public var measStd = 0.006
  /// Association gate: base + growth × consecutive misses; a track with one match uses `gateNew` × (1 + misses).
  public var gateBase = 0.08
  public var gateGrowth = 0.05
  public var gateNew = 0.35
  /// A track whose matches all stay this close to their centre is scenery.
  public var staticTrackRadius = 0.015
  /// Who can hold the ball: people whose feet move (v1's still rule).
  public var stillPersonRadius = 0.012
  public var stillPersonShare = 0.8
  public var stillPersonWindowMs = 3000.0

  public init() {}
  public static let standard = BallTrackerTuning()
}

/// Offline ball tracker: port of the bench's `tracker.track_ball` (docs/superpowers/spikes/focus-v2/bench), operation
/// by operation so `BallTrackerTests` can hold it to the bench fixtures.
///
/// 1. Static candidates out (rule 1 above).
/// 2. Tracks: constant-velocity Kalman filter, greedy association (most confident candidate first) with a gate growing
///    with misses; unclaimed candidates start tracks.
/// 3. Each confirmed, moving track is smoothed backwards (RTS) from its first to its last match, and extrapolated for
///    up to `predictMaxMs` after it.
/// 4. Per sample, the covering track that is seen there wins, then the one with the highest sum of confidences.
/// 5. No track: held by the nearest moving player (followed sample to sample) until `heldMaxMs` after the last
///    sighting, then lost.
public enum BallTracker {
  /// One row per sample. `times` are the samples' times (ms, increasing, one grid step apart); `balls` and `people`
  /// hold one list per sample. `hw` is the video's height over its width.
  public static func track(times: [Double], balls: [[BallCandidate]], people: [[FocusBox]],
                           heightOverWidth hw: Double, tuning t: BallTrackerTuning = .standard) -> [BallRow] {
    let n = times.count
    let lost = BallRow(x: 0, y: 0, state: .lost, conf: 0)
    guard n > 0 else { return [] }
    guard balls.count == n, people.count == n, hw > 0, t.startHits > 0 else {
      return [BallRow](repeating: lost, count: n)
    }
    let step = n > 1 ? (times[n - 1] - times[0]) / Double(n - 1) : 100.0
    let dt = step / 1000
    let m = KalmanModel(dt: dt, tuning: t)
    let isStatic = staticFlags(times: times, balls: balls, hw: hw, tuning: t)
    let maxMisses = Int((t.predictMaxMs / step).rounded(.toNearestOrEven))

    // 2. Forward pass.
    var live: [Track] = []
    var done: [Track] = []
    for i in 0..<n {
      var pool: [Candidate] = []
      for (j, b) in balls[i].enumerated() where !isStatic[i][j] {
        pool.append(Candidate(x: b.x, y: b.y * hw, conf: b.conf))
      }
      for tr in live {  // predict
        let xp = m.F * tr.x
        let pp = m.F * tr.P * m.Ft + m.Q
        tr.states[i] = Track.Step(x: xp, P: pp, xPred: xp, PPred: pp)
      }
      var used = Set<Int>()
      var claimed = [Bool](repeating: false, count: pool.count)
      // Most confident first; the earlier candidate wins a tie (Python's sort is stable).
      let order = pool.indices.sorted { a, b in
        pool[a].conf > pool[b].conf || (pool[a].conf == pool[b].conf && a < b)
      }
      for ci in order {
        let c = pool[ci]
        var best: Int? = nil
        var bestD = 0.0
        for (k, tr) in live.enumerated() {
          guard let st = tr.states[i] else { continue }
          let d = hypot(c.x - st.xPred[0, 0], c.y - st.xPred[1, 0])
          let gate = tr.hits.count == 1
            ? t.gateNew * Double(1 + tr.misses)
            : t.gateBase + t.gateGrowth * Double(tr.misses)
          if d <= gate && (best == nil || d < bestD) && !used.contains(k) {
            best = k
            bestD = d
          }
        }
        guard let k = best, let st = live[k].states[i] else { continue }
        used.insert(k)
        let tr = live[k]
        let xp = st.xPred, pp = st.PPred
        let residual = KalmanMatrix(2, 1, [c.x, c.y]) - m.H * xp
        let s = m.H * pp * m.Ht + m.R
        let gain = pp * m.Ht * s.inverse
        tr.x = xp + gain * residual
        tr.P = (KalmanMatrix.identity(4) - gain * m.H) * pp
        tr.states[i] = Track.Step(x: tr.x, P: tr.P, xPred: xp, PPred: pp)
        tr.misses = 0
        tr.score += c.conf
        tr.hits.append(Track.Hit(index: i, x: c.x, y: c.y, conf: c.conf))
        claimed[ci] = true
      }
      for (k, tr) in live.enumerated() where !used.contains(k) {
        if let st = tr.states[i] {
          tr.x = st.x
          tr.P = st.P
        }
        tr.misses += 1
      }
      for (ci, c) in pool.enumerated() where !claimed[ci] {  // a candidate nobody claimed starts a track
        let x0 = KalmanMatrix(4, 1, [c.x, c.y, 0, 0])
        let v = t.measStd * t.measStd
        let p0 = KalmanMatrix(4, 4, [v, 0, 0, 0, 0, v, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
        let tr = Track(x: x0, P: p0, score: c.conf, hit: Track.Hit(index: i, x: c.x, y: c.y, conf: c.conf))
        tr.states[i] = Track.Step(x: x0, P: p0, xPred: x0, PPred: p0)
        live.append(tr)
      }
      var keep: [Track] = []
      for tr in live {
        if tr.misses > maxMisses { done.append(tr) } else { keep.append(tr) }
      }
      live = keep
    }
    done += live

    // 3. Offline smoothing over each confirmed, moving track.
    var smoothed: [(score: Double, rows: [Int: Row])] = []
    for tr in done {
      guard tr.hits.count >= t.startHits,
            Double(tr.hits[t.startHits - 1].index - tr.hits[0].index) * step <= t.startWindowMs else { continue }
      var sx = 0.0, sy = 0.0
      for h in tr.hits { sx += h.x; sy += h.y }
      let mx = sx / Double(tr.hits.count), my = sy / Double(tr.hits.count)
      var spread = 0.0
      for h in tr.hits { spread = max(spread, hypot(h.x - mx, h.y - my)) }
      if spread < t.staticTrackRadius { continue }  // never moved: scenery seen only now and then

      let first = tr.hits[0].index, last = tr.hits[tr.hits.count - 1].index
      var xs: [Int: KalmanMatrix] = [:]
      var ps: [Int: KalmanMatrix] = [:]
      for k in first...last {
        if let st = tr.states[k] { xs[k] = st.x; ps[k] = st.P }
      }
      var b = last
      while b > first {  // RTS, from the last match back to the first
        let a = b - 1
        if let st = tr.states[b], let xa = xs[a], let pa = ps[a], let xb = xs[b], let pb = ps[b] {
          let gain = pa * m.Ft * st.PPred.inverse
          xs[a] = xa + gain * (xb - st.xPred)
          ps[a] = pa + gain * (pb - st.PPred) * gain.transposed
        }
        b -= 1
      }
      var matched: [Int: Double] = [:]
      for h in tr.hits { matched[h.index] = h.conf }
      var rows: [Int: Row] = [:]
      for k in first...last {
        guard let v = xs[k] else { continue }
        if let conf = matched[k] {
          rows[k] = Row(x: v[0, 0], yw: v[1, 0], state: .seen, conf: conf)
        } else {
          rows[k] = Row(x: v[0, 0], yw: v[1, 0], state: .predicted, conf: 0)
        }
      }
      guard let lx = xs[last] else { continue }
      var k = last + 1
      while k < min(n, last + 1 + maxMisses) {  // extrapolate after the last match
        let g = Double(k - last) * dt
        rows[k] = Row(x: lx[0, 0] + lx[2, 0] * g, yw: lx[1, 0] + lx[3, 0] * g, state: .predicted, conf: 0)
        k += 1
      }
      smoothed.append((score: tr.score, rows: rows))
    }

    // 4–5. Main track per sample, then held / lost.
    let movers = movingPeople(times: times, people: people, hw: hw, tuning: t)
    var out: [BallRow] = []
    out.reserveCapacity(n)
    var heldFrom: (x: Double, y: Double)? = nil
    var lastSeen: (index: Int, x: Double, y: Double)? = nil
    for i in 0..<n {
      var best: (score: Double, row: Row)? = nil
      for s in smoothed {
        guard let row = s.rows[i] else { continue }
        if let b = best {
          let seen = row.state == .seen, bSeen = b.row.state == .seen
          if (seen && !bSeen) || (seen == bSeen && s.score > b.score) { best = (score: s.score, row: row) }
        } else {
          best = (score: s.score, row: row)
        }
      }
      if let b = best {
        out.append(BallRow(x: b.row.x, y: b.row.yw / hw, state: b.row.state, conf: b.row.conf))
        if b.row.state == .seen { lastSeen = (index: i, x: b.row.x, y: b.row.yw) }
        heldFrom = nil
        continue
      }
      if let ls = lastSeen, Double(i - ls.index) * step <= t.heldMaxMs, !movers[i].isEmpty {
        let ref = heldFrom ?? (x: ls.x, y: ls.y)
        var nearest: (x: Double, y: Double)? = nil
        var nearestD = 0.0
        for p in movers[i] {
          let cx = p.x + p.width / 2, cy = (p.y + p.height / 2) * hw
          let d = hypot(cx - ref.x, cy - ref.y)
          if nearest == nil || d < nearestD {
            nearest = (x: cx, y: cy)
            nearestD = d
          }
        }
        if let c = nearest {
          heldFrom = c
          out.append(BallRow(x: c.x, y: c.y / hw, state: .held, conf: 0))
          continue
        }
      }
      out.append(lost)
    }
    return out
  }

  // MARK: - Rules over neighbouring samples

  /// Indices of the other samples within ±window of sample i (times increase).
  private static func neighbours(_ times: [Double], _ i: Int, windowMs: Double) -> [Int] {
    var out: [Int] = []
    var k = i - 1
    while k >= 0 && abs(times[k] - times[i]) <= windowMs { out.append(k); k -= 1 }
    k = i + 1
    while k < times.count && abs(times[k] - times[i]) <= windowMs { out.append(k); k += 1 }
    return out
  }

  private static func staticFlags(times: [Double], balls: [[BallCandidate]], hw: Double,
                                  tuning t: BallTrackerTuning) -> [[Bool]] {
    var flags: [[Bool]] = []
    for i in times.indices {
      let near = neighbours(times, i, windowMs: t.staticWindowMs)
      flags.append(balls[i].map { b in
        var hits = 0
        for k in near where balls[k].contains(where: { o in hypot(b.x - o.x, (b.y - o.y) * hw) < t.staticRadius }) {
          hits += 1
        }
        return !near.isEmpty && Double(hits) >= t.staticShare * Double(near.count)
      })
    }
    return flags
  }

  private static func movingPeople(times: [Double], people: [[FocusBox]], hw: Double,
                                   tuning t: BallTrackerTuning) -> [[FocusBox]] {
    let feet: [[(x: Double, y: Double)]] = people.map { boxes in
      boxes.map { p in (x: p.x + p.width / 2, y: (p.y + p.height) * hw) }
    }
    var out: [[FocusBox]] = []
    for i in times.indices {
      let near = neighbours(times, i, windowMs: t.stillPersonWindowMs)
      var keep: [FocusBox] = []
      for (j, p) in people[i].enumerated() {
        let f = feet[i][j]
        var hits = 0
        for k in near where feet[k].contains(where: { g in hypot(f.x - g.x, f.y - g.y) < t.stillPersonRadius }) {
          hits += 1
        }
        let still = !near.isEmpty && Double(hits) >= t.stillPersonShare * Double(near.count)
        if !still { keep.append(p) }
      }
      out.append(keep)
    }
    return out
  }

  // MARK: - Internals

  private struct Candidate { let x: Double, y: Double, conf: Double }  // y in frame widths

  private struct Row { let x: Double, yw: Double, state: BallState, conf: Double }  // yw in frame widths

  private final class Track {
    struct Step { let x: KalmanMatrix, P: KalmanMatrix, xPred: KalmanMatrix, PPred: KalmanMatrix }
    struct Hit { let index: Int, x: Double, y: Double, conf: Double }
    var x: KalmanMatrix  // x, y (frame widths), vx, vy (per second)
    var P: KalmanMatrix
    var misses = 0
    var score: Double
    var hits: [Hit]
    var states: [Int: Step] = [:]  // sample index → forward pass
    init(x: KalmanMatrix, P: KalmanMatrix, score: Double, hit: Hit) {
      self.x = x; self.P = P; self.score = score; self.hits = [hit]
    }
  }

  /// Constant-velocity model in frame-width units: state (x, y, vx, vy), measurement (x, y).
  private struct KalmanModel {
    let F: KalmanMatrix, Ft: KalmanMatrix, Q: KalmanMatrix, H: KalmanMatrix, Ht: KalmanMatrix, R: KalmanMatrix
    init(dt: Double, tuning t: BallTrackerTuning) {
      let f = KalmanMatrix(4, 4, [1, 0, dt, 0, 0, 1, 0, dt, 0, 0, 1, 0, 0, 0, 0, 1])
      F = f
      Ft = f.transposed
      let q = t.accelStd * t.accelStd
      let g = KalmanMatrix(4, 2, [dt * dt / 2, 0, 0, dt * dt / 2, dt, 0, 0, dt])
      Q = g.scaled(q) * g.transposed  // the bench's `q * G @ G.T`
      let h = KalmanMatrix(2, 4, [1, 0, 0, 0, 0, 1, 0, 0])
      H = h
      Ht = h.transposed
      let r = t.measStd * t.measStd
      R = KalmanMatrix(2, 2, [r, 0, 0, r])
    }
  }
}

/// A small row-major matrix for the tracker's 4×4 Kalman algebra.
struct KalmanMatrix: Equatable {
  let rows: Int, cols: Int
  var a: [Double]

  init(_ rows: Int, _ cols: Int, _ a: [Double]) {
    precondition(a.count == rows * cols, "matrix size")
    self.rows = rows; self.cols = cols; self.a = a
  }

  static func identity(_ n: Int) -> KalmanMatrix {
    var m = KalmanMatrix(n, n, [Double](repeating: 0, count: n * n))
    for i in 0..<n { m[i, i] = 1 }
    return m
  }

  subscript(i: Int, j: Int) -> Double {
    get { a[i * cols + j] }
    set { a[i * cols + j] = newValue }
  }

  var transposed: KalmanMatrix {
    var m = KalmanMatrix(cols, rows, [Double](repeating: 0, count: a.count))
    for i in 0..<rows { for j in 0..<cols { m[j, i] = self[i, j] } }
    return m
  }

  func scaled(_ s: Double) -> KalmanMatrix { KalmanMatrix(rows, cols, a.map { $0 * s }) }

  static func * (l: KalmanMatrix, r: KalmanMatrix) -> KalmanMatrix {
    precondition(l.cols == r.rows, "matrix product")
    var m = KalmanMatrix(l.rows, r.cols, [Double](repeating: 0, count: l.rows * r.cols))
    for i in 0..<l.rows {
      for j in 0..<r.cols {
        var acc = 0.0
        for k in 0..<l.cols { acc += l[i, k] * r[k, j] }
        m[i, j] = acc
      }
    }
    return m
  }

  static func + (l: KalmanMatrix, r: KalmanMatrix) -> KalmanMatrix {
    precondition(l.rows == r.rows && l.cols == r.cols, "matrix sum")
    return KalmanMatrix(l.rows, l.cols, zip(l.a, r.a).map { $0 + $1 })
  }

  static func - (l: KalmanMatrix, r: KalmanMatrix) -> KalmanMatrix {
    precondition(l.rows == r.rows && l.cols == r.cols, "matrix difference")
    return KalmanMatrix(l.rows, l.cols, zip(l.a, r.a).map { $0 - $1 })
  }

  /// Gauss–Jordan with partial pivoting (the Kalman covariances are symmetric positive definite).
  var inverse: KalmanMatrix {
    precondition(rows == cols, "square matrix")
    let n = rows
    var m = self
    var inv = KalmanMatrix.identity(n)
    for col in 0..<n {
      var pivot = col
      for r in (col + 1)..<n where abs(m[r, col]) > abs(m[pivot, col]) { pivot = r }
      if pivot != col {
        for j in 0..<n {
          let t = m[col, j]; m[col, j] = m[pivot, j]; m[pivot, j] = t
          let u = inv[col, j]; inv[col, j] = inv[pivot, j]; inv[pivot, j] = u
        }
      }
      let p = m[col, col]
      for j in 0..<n { m[col, j] /= p; inv[col, j] /= p }
      for r in 0..<n where r != col {
        let f = m[r, col]
        if f == 0 { continue }
        for j in 0..<n {
          m[r, j] -= f * m[col, j]
          inv[r, j] -= f * inv[col, j]
        }
      }
    }
    return inv
  }
}
