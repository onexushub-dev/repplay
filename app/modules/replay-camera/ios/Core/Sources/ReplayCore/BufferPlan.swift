import Foundation

public enum BufferPlan {
  /// How many segments keep `seconds` of video; a missing or bad length means the default minute.
  public static func segments(forSeconds seconds: Double, segmentSeconds: Double) -> Int {
    let window = seconds > 0 ? seconds : 60
    return Int((window / segmentSeconds).rounded(.up))
  }

  /// The recording's H.264 bit rate: 10 Mbps for Full HD at 60 fps, 6 Mbps at 30 fps, scaled by the pixel count, so a
  /// 4K picture (4× Full HD) keeps the same quality per pixel (4K 30 → 24 Mbps).
  public static func videoBitRate(width: Int, height: Int, fps: Int) -> Int {
    let fullHD = fps >= 60 ? 10_000_000 : 6_000_000
    let pixels = Double(max(width, 1) * max(height, 1)) / Double(1920 * 1080)
    return Int((Double(fullHD) * max(pixels, 1)).rounded())
  }
}
