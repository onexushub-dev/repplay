import Foundation

/// The analysed frames put on the 100 ms grid the focus file promises: row k is at `startMs + k × stepMs`.
public enum FocusGrid {
  /// One sample per tick from `startMs` up to the last frame (and before `endMs`): the first frame inside the tick's
  /// step, else the people last seen (a gap in the frames), else the first frame (a late start).
  public static func samples(from frames: [FocusSample], startMs: Double, endMs: Double, stepMs: Double) -> [FocusSample] {
    guard let first = frames.first, let last = frames.last, stepMs > 0 else { return [] }
    let stop = min(endMs, last.tMs + stepMs / 2)
    var out: [FocusSample] = []
    var i = 0
    var seen = first.boxes
    var tick = startMs
    while tick < stop {
      // Frames before this tick's window were for earlier ticks (or passed over in a burst).
      while i < frames.count && frames[i].tMs < tick - 0.5 { seen = frames[i].boxes; i += 1 }
      if i < frames.count && frames[i].tMs < tick + stepMs - 0.5 {
        seen = frames[i].boxes
        i += 1
      }
      out.append(FocusSample(tMs: tick, boxes: seen))
      tick += stepMs
    }
    return out
  }
}
