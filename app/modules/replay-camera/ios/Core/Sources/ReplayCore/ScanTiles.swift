import CoreGraphics

/// The person detector shrinks the whole frame to its small input, so a player under ~10% of the frame height
/// (with the 0.5x lens: ~11 m away with the phone on its side, ~6 m upright) is often not found at all. Asking it to look at a region half the frame's
/// width and height shows people at twice the size. A few tiles are scanned per sample, round-robin, and the people
/// found are kept by PersonTracks until the scan comes back.
///
/// Regions are normalized with the origin at the bottom-left (Vision `regionOfInterest`). The boxes found in a region
/// come back normalized to the whole frame, not to the region.
public enum ScanTiles {
  /// 3 × 3 overlapping regions, each half the frame on both axes. The middle row first: on a court, that is where
  /// the far players are.
  public static let regions: [CGRect] = {
    let order = [1, 0, 2] // rows, bottom-left origin: middle, bottom, top
    var out: [CGRect] = []
    for row in order {
      for col in 0..<3 {
        out.append(CGRect(x: Double(col) * 0.25, y: Double(row) * 0.25, width: 0.5, height: 0.5))
      }
    }
    return out
  }()

  /// The tiles to scan at the `index`-th sample when `perSample` are scanned each time.
  public static func tiles(at index: Int, perSample: Int) -> [CGRect] {
    guard perSample > 0 else { return [] }
    let n = regions.count
    let start = ((index * perSample) % n + n) % n
    return (0..<min(perSample, n)).map { regions[(start + $0) % n] }
  }

  /// A region around one (small, far) person for the detector to look at closely: about 4 of their heights tall,
  /// between 15% and 50% of the frame, roughly square in pixels, kept inside the frame. A person 5% of the frame tall is
  /// seen ~4x bigger than in the whole frame (a half-frame tile: 2x).
  public static func focusRegion(around box: CGRect, frame: CGSize) -> CGRect {
    let h = min(0.5, max(0.15, Double(box.height) * 4))
    let w = min(1.0, max(0.15, h * Double(frame.height) / max(1, Double(frame.width))))
    let x = min(max(0, Double(box.midX) - w / 2), 1 - w)
    let y = min(max(0, Double(box.midY) - h / 2), 1 - h)
    return CGRect(x: x, y: y, width: w, height: h)
  }

  /// Small boxes from a tile are where the detector guesses most: keep only confident, person-shaped ones
  /// at least `minPixels` tall in the frame.
  public static func plausible(_ box: CGRect, confidence: Double, frame: CGSize,
                               minConfidence: Double = 0.5, minPixels: Double = 28) -> Bool {
    let h = Double(box.height * frame.height), w = Double(box.width * frame.width)
    guard confidence >= minConfidence, h >= minPixels, w > 0 else { return false }
    let aspect = h / w
    return aspect >= 0.9 && aspect <= 6
  }
}
