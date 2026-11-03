// Modo Foco lab, test 3, ON THE MAC: Apple Vision's thrown-object detector (VNDetectTrajectoriesRequest, the API an
// iPhone app would use, free) over a clip's labelled window, recording EVERY trajectory at EVERY frame it is reported
// (the old vision-probe.swift kept only the last 6 points of each, too little to score).
//
//   swiftc -O tools/lab/vision-traj.swift -o lab/vision-traj
//   lab/vision-traj <video> <start ms> <duration ms> <out.json>
//
// Output: {"size": [w, h] upright, "transform": [a b c d tx ty], "fps", "rows": [...]}, one row per trajectory per
// frame: id, t (ms in the window, the frame the point belongs to), t0 (trajectory start), conf, r (moving average
// radius, normalized), xy (newest point, 0..1 of the UPRIGHT picture, origin top-left), raw (Vision's own point,
// origin bottom-left, buffer orientation), eq (parabola coefficients), n (points so far).
import AVFoundation
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 5, let startMs = Double(args[2]), let durMs = Double(args[3]) else {
  print("usage: vision-traj <video> <start ms> <duration ms> <out.json>")
  exit(1)
}
let url = URL(fileURLWithPath: args[1])
let asset = AVURLAsset(url: url)
guard let track = asset.tracks(withMediaType: .video).first else {
  print("no video track")
  exit(1)
}
let t = track.preferredTransform
let nat = track.naturalSize
let disp = nat.applying(t)
let DW = abs(disp.width), DH = abs(disp.height)
let fps = Double(track.nominalFrameRate)

var rows: [[String: Any]] = []
let lock = NSLock()
let request = VNDetectTrajectoriesRequest(frameAnalysisSpacing: .zero, trajectoryLength: 5) { req, _ in
  guard let obs = req.results as? [VNTrajectoryObservation] else { return }
  var batch: [[String: Any]] = []
  for o in obs {
    guard let p = o.detectedPoints.last else { continue }
    // Vision point: normalized, origin bottom-left, in the buffer's (encoded) orientation -> upright, origin top-left.
    let q = CGPoint(x: CGFloat(p.x) * nat.width, y: (1 - CGFloat(p.y)) * nat.height).applying(t)
    var x = q.x, y = q.y
    if x < 0 { x += DW }  // a rotation without translation in the transform leaves the point negative
    if y < 0 { y += DH }
    let c = o.equationCoefficients
    batch.append([
      "id": o.uuid.uuidString,
      "t": CMTimeGetSeconds(o.timeRange.end) * 1000 - startMs,
      "t0": CMTimeGetSeconds(o.timeRange.start) * 1000 - startMs,
      "conf": Double(o.confidence),
      "r": Double(o.movingAverageRadius),
      "xy": [Double(x / DW), Double(y / DH)],
      "raw": [Double(p.x), Double(p.y)],
      "eq": [Double(c.x), Double(c.y), Double(c.z)],
      "n": o.detectedPoints.count,
    ])
  }
  lock.lock()
  rows.append(contentsOf: batch)
  lock.unlock()
}
request.objectMinimumNormalizedRadius = 0.002
request.objectMaximumNormalizedRadius = 0.06

let started = Date()
let processor = VNVideoProcessor(url: url)
do {
  try processor.addRequest(request, processingOptions: VNVideoProcessor.RequestProcessingOptions())
  try processor.analyze(CMTimeRange(start: CMTime(seconds: startMs / 1000, preferredTimescale: 600),
                                    duration: CMTime(seconds: durMs / 1000, preferredTimescale: 600)))
} catch {
  print("vision failed: \(error)")
  exit(1)
}
let file: [String: Any] = [
  "size": [Double(DW), Double(DH)], "transform": [t.a, t.b, t.c, t.d, t.tx, t.ty].map { Double($0) },
  "fps": fps, "elapsedS": Date().timeIntervalSince(started), "rows": rows,
]
try! JSONSerialization.data(withJSONObject: file).write(to: URL(fileURLWithPath: args[4]))
print("\(args[4]): \(rows.count) rows in \(String(format: "%.1f", Date().timeIntervalSince(started)))s")
