import Foundation

/// The analysed frames put on the 100 ms grid the focus file promises: row k is at `startMs + k × stepMs`.
public enum FocusGrid {
  /// One grid tick: `frame` is the frame analysed for it (nil in a gap or before the first frame); `people` is the
  /// frame whose people it shows (the last one seen, so people carry over a gap; ball candidates must not).
  public struct Tick: Equatable {
    public var tMs: Double
    public var frame: Int?
    public var people: Int
    public init(tMs: Double, frame: Int?, people: Int) { self.tMs = tMs; self.frame = frame; self.people = people }
  }

  /// One tick per step from `startMs` up to the last frame (and before `endMs`): the first frame inside the tick's
  /// step, else the people last seen (a gap in the frames), else the first frame's (a late start).
  public static func ticks(frameTimes: [Double], startMs: Double, endMs: Double, stepMs: Double) -> [Tick] {
    guard let last = frameTimes.last, stepMs > 0 else { return [] }
    let stop = min(endMs, last + stepMs / 2)
    var out: [Tick] = []
    var i = 0
    var seen = 0
    var tick = startMs
    while tick < stop {
      // Frames before this tick's window were for earlier ticks (or passed over in a burst).
      while i < frameTimes.count && frameTimes[i] < tick - 0.5 { seen = i; i += 1 }
      var own: Int? = nil
      if i < frameTimes.count && frameTimes[i] < tick + stepMs - 0.5 {
        own = i
        seen = i
        i += 1
      }
      out.append(Tick(tMs: tick, frame: own, people: seen))
      tick += stepMs
    }
    return out
  }

  /// People only (v1 and the players path): each tick with the people of its `Tick.people` frame.
  public static func samples(from frames: [FocusSample], startMs: Double, endMs: Double,
                             stepMs: Double) -> [FocusSample] {
    ticks(frameTimes: frames.map { $0.tMs }, startMs: startMs, endMs: endMs, stepMs: stepMs).map { t in
      FocusSample(tMs: t.tMs, boxes: frames[t.people].boxes)
    }
  }
}
