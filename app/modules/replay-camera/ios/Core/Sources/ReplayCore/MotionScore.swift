import Foundation

/// A grey (luma) frame: one byte per pixel, row by row.
public struct LumaFrame {
  public let width: Int
  public let height: Int
  public let bytes: [UInt8]
  public init(width: Int, height: Int, bytes: [UInt8]) {
    self.width = width; self.height = height; self.bytes = bytes
  }
}

/// How much a ball candidate's patch changes between grid samples (spec 2026-10-24 §13.3 rule 1; Part 3 plan,
/// decision 5). Port of the bench's `focusbench/motion.py`; `MotionScoreTests` holds it to `Fixtures/v2/motion.json`.
///
/// On frames at the decode size: a 3×3 binomial blur ([1 2 1] / 4 across, then down; edges reflected without repeating
/// the edge pixel); a square window around the candidate (centre clamped inside the frame, radius
/// max(4, round(1.5 · r · W)) px, cut at the edges); the mean |blurred current − blurred previous| and the same against
/// the next frame; the score is the smaller one.
public enum MotionScore {
  public static let minRadiusPx = 4
  public static let radiusScale = 1.5

  /// nil when there is no previous or no next frame (the clip's ends), or the frames do not match.
  public static func score(previous: LumaFrame?, current: LumaFrame, next: LumaFrame?, x: Double, y: Double,
                           r: Double) -> Double? {
    guard let prev = previous, let nxt = next else { return nil }
    let w = current.width, h = current.height
    guard w >= 2, h >= 2, current.bytes.count == w * h,
          prev.width == w, prev.height == h, prev.bytes.count == w * h,
          nxt.width == w, nxt.height == h, nxt.bytes.count == w * h else { return nil }
    let win = window(width: w, height: h, x: x, y: y, r: r)
    let c = blurred(current, win), p = blurred(prev, win), n = blurred(nxt, win)
    var a = 0.0, b = 0.0
    for k in c.indices {
      a += abs(c[k] - p[k])
      b += abs(c[k] - n[k])
    }
    let count = Double(c.count)
    return min(a / count, b / count)
  }

  /// Rows y0..<y1 and columns x0..<x1 of the candidate's patch.
  static func window(width: Int, height: Int, x: Double, y: Double, r: Double) -> (y0: Int, y1: Int, x0: Int, x1: Int) {
    let cx = min(max(Int(x * Double(width)), 0), width - 1)
    let cy = min(max(Int(y * Double(height)), 0), height - 1)
    let radius = max(minRadiusPx, Int((radiusScale * r * Double(width)).rounded(.toNearestOrEven)))
    return (max(0, cy - radius), min(height, cy + radius + 1), max(0, cx - radius), min(width, cx + radius + 1))
  }

  /// Reflect-101: −1 → 1, n → n − 2.
  private static func reflect(_ i: Int, _ n: Int) -> Int {
    if i < 0 { return -i }
    if i >= n { return 2 * (n - 1) - i }
    return i
  }

  /// The blurred values inside the window only (the same as blurring the whole frame), row by row.
  private static func blurred(_ f: LumaFrame, _ win: (y0: Int, y1: Int, x0: Int, x1: Int)) -> [Double] {
    let w = f.width, h = f.height
    func across(_ row: Int, _ col: Int) -> Double {
      let base = row * w
      let left = Double(f.bytes[base + reflect(col - 1, w)])
      let mid = Double(f.bytes[base + col])
      let right = Double(f.bytes[base + reflect(col + 1, w)])
      return (left + 2 * mid + right) / 4
    }
    var out: [Double] = []
    out.reserveCapacity((win.y1 - win.y0) * (win.x1 - win.x0))
    for row in win.y0..<win.y1 {
      let up = reflect(row - 1, h), down = reflect(row + 1, h)
      for col in win.x0..<win.x1 {
        out.append((across(up, col) + 2 * across(row, col) + across(down, col)) / 4)
      }
    }
    return out
  }
}

/// How a stored (sensor) frame turns upright: EXIF orientations 1 (up), 3 (down), 6 (right) and 8 (left), the same as
/// `CGImagePropertyOrientation` `.up`, `.down`, `.right`, `.left` (`FocusAnalyzer.orientation(of:)`).
public enum StoredOrientation: Int { case up = 1, down = 3, right = 6, left = 8 }

extension LumaFrame {
  /// The upright luma of a stored plane (rows may be padded: `bytesPerRow` ≥ `width`). EXIF: with `.right` the stored
  /// 0th row is the picture's right side and the 0th column its top (a 90° turn clockwise to display); `.left` is the
  /// turn the other way; `.down` is upside down.
  public static func upright(stored: UnsafeBufferPointer<UInt8>, width: Int, height: Int, bytesPerRow: Int,
                             orientation: StoredOrientation) -> LumaFrame {
    let turned = orientation == .right || orientation == .left
    let w = turned ? height : width, h = turned ? width : height
    var out = [UInt8](repeating: 0, count: w * h)
    guard width > 0, height > 0, bytesPerRow >= width, stored.count >= (height - 1) * bytesPerRow + width else {
      return LumaFrame(width: w, height: h, bytes: out)
    }
    switch orientation {
    case .up:
      for v in 0..<h { for u in 0..<w { out[v * w + u] = stored[v * bytesPerRow + u] } }
    case .down:
      for v in 0..<h { for u in 0..<w { out[v * w + u] = stored[(height - 1 - v) * bytesPerRow + (width - 1 - u)] } }
    case .right:
      for v in 0..<h { for u in 0..<w { out[v * w + u] = stored[(w - 1 - u) * bytesPerRow + v] } }
    case .left:
      for v in 0..<h { for u in 0..<w { out[v * w + u] = stored[u * bytesPerRow + (h - 1 - v)] } }
    }
    return LumaFrame(width: w, height: h, bytes: out)
  }
}
