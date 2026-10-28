import Foundation

/// Modo Foco "ação" (2026-10-28, v14): people followed between samples, so stillness and movement are measured per
/// person and in body heights rather than in fixed pixels.
///
/// The v1 still filter (a foot within `stillRadius` of the frame width in 80% of the samples) dropped nobody in
/// practice: boxes jitter more than that and come and go, more so with the tiles that find far players. Here:
/// - someone still for the whole time they are seen, for at least `spectatorMinMs`, is left out (the bench, the stands);
///   a player in a ready stance for a few seconds keeps counting;
/// - each person weighs 1 + their speed in body heights per second over `speedUnit` (capped at `moveCap`), so the
///   people in action pull the framing.
///
/// A line-by-line port lives in docs/focus-refs/tools/focus_variant.py (`activity`): keep them in step.
enum FocusActivity {
  struct Item {
    let sample: Int
    let box: FocusBox
  }

  /// Greedy tracks over the samples, in creation order; each track's items in time order.
  static func tracks(_ samples: [FocusSample], W: Double, H: Double, t: FocusTuning) -> [[Item]] {
    var items: [[Item]] = []
    var last: [(x: Double, y: Double, h: Double)] = []
    var seen: [Double] = []
    for (i, s) in samples.enumerated() {
      let now = s.tMs
      let open = items.indices.filter { now - seen[$0] <= t.trackGapMs }
      var pairs: [(d: Double, j: Int, k: Int)] = []
      for (j, b) in s.boxes.enumerated() {
        let c = (x: (b.x + b.width / 2) * W, y: (b.y + b.height / 2) * H)
        for k in open {
          let l = last[k]
          let d = hypot(c.x - l.x, c.y - l.y) / max(l.h, b.height * H, 1e-9)
          if d <= t.trackMatch { pairs.append((d, j, k)) }
        }
      }
      pairs.sort { a, b in a.d != b.d ? a.d < b.d : (a.j != b.j ? a.j < b.j : a.k < b.k) }
      var usedBoxes = Set<Int>(), usedTracks = Set<Int>()
      for p in pairs where !usedBoxes.contains(p.j) && !usedTracks.contains(p.k) {
        usedBoxes.insert(p.j)
        usedTracks.insert(p.k)
        let b = s.boxes[p.j]
        items[p.k].append(Item(sample: i, box: b))
        last[p.k] = ((b.x + b.width / 2) * W, (b.y + b.height / 2) * H, b.height * H)
        seen[p.k] = now
      }
      for (j, b) in s.boxes.enumerated() where !usedBoxes.contains(j) {
        items.append([Item(sample: i, box: b)])
        last.append(((b.x + b.width / 2) * W, (b.y + b.height / 2) * H, b.height * H))
        seen.append(now)
      }
    }
    return items
  }

  /// Per sample: the people who count, in track order, each with their weight.
  static func people(_ samples: [FocusSample], W: Double, H: Double, t: FocusTuning) -> [[(box: FocusBox, weight: Double)]] {
    var out = [[(box: FocusBox, weight: Double)]](repeating: [], count: samples.count)
    for track in tracks(samples, W: W, H: H, t: t) {
      let times = track.map { samples[$0.sample].tMs }
      let feet = track.map { (x: ($0.box.x + $0.box.width / 2) * W, y: ($0.box.y + $0.box.height) * H) }
      let heights = track.map { $0.box.height * H }
      // Still for the whole time it was seen, long enough: not playing.
      let body = FocusPath.median(heights)
      let mx = FocusPath.median(feet.map { $0.x }), my = FocusPath.median(feet.map { $0.y })
      let reach = feet.map { hypot($0.x - mx, $0.y - my) }.max()! / max(body, 1e-9)
      if times[times.count - 1] - times[0] >= t.spectatorMinMs && reach < t.stillBodies { continue }
      for a in track.indices {
        let near = track.indices.filter { abs(times[$0] - times[a]) <= t.activityWindowMs }
        let size = FocusPath.median(near.map { heights[$0] })
        let win = track.indices.filter { abs(times[$0] - times[a]) <= t.speedWindowMs }
        let q0 = win.min { times[$0] < times[$1] }!, q1 = win.max { times[$0] < times[$1] }!
        let dt = (times[q1] - times[q0]) / 1000
        let speed = dt > 0 ? hypot(feet[q1].x - feet[q0].x, feet[q1].y - feet[q0].y) / max(size, 1e-9) / dt : 0
        out[track[a].sample].append((track[a].box, 1 + min(speed / t.speedUnit, t.moveCap)))
      }
    }
    return out
  }
}
