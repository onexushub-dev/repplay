import CoreGraphics

public enum FitRect {
  /// Aspect-fit `size` inside `frame`, centred (y measured from the top, as in the Story layout).
  public static func fit(_ size: CGSize, into frame: CGSize) -> CGRect {
    let scale = min(frame.width / size.width, frame.height / size.height)
    let w = size.width * scale, h = size.height * scale
    return CGRect(x: (frame.width - w) / 2, y: (frame.height - h) / 2, width: w, height: h)
  }

  /// The export's frame rate: the clip's own (60 for the default 1080p60), never more than 60, and at least 30.
  /// A slowed clip has fewer real frames per second (60 fps at 0.5x = 30). 2026-10-29: exports were always 30 fps,
  /// so a 60 fps clip lost half its frames and its motion looked worse than in the app.
  public static func exportFrameRate(source: Double, speed: Double) -> Int {
    let own = source > 0 ? source : 30
    let shown = (own * (speed > 0 ? speed : 1)).rounded()
    return Int(min(max(shown, 30), 60))
  }
}
