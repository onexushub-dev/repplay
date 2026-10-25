// Modo Foco probe: runs the same Vision person detector the app uses (VNDetectHumanRectanglesRequest, conf >= 0.3,
// one frame every 100 ms) on a clip, plus two candidate improvements:
//   - "tiled": the same detector on overlapping enlarged regions (regionOfInterest), merged with NMS — for small/far players
//   - "trajectories": VNDetectTrajectoriesRequest, Vision's detector for thrown/hit objects (the ball)
// Usage: swift vision-probe.swift <video.mp4> [out.json]
import AVFoundation
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 2 else {
  print("usage: swift vision-probe.swift <video.mp4> [out.json]")
  exit(1)
}
let url = URL(fileURLWithPath: args[1])
let outPath = args.count >= 3 ? args[2] : args[1] + ".probe.json"
let asset = AVURLAsset(url: url)
let duration = CMTimeGetSeconds(asset.duration)
guard duration > 0 else { print("could not read video"); exit(1) }

let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero

struct Box { var x, y, w, h: Double; var conf: Double } // normalized, origin top-left, upright picture

func detect(_ image: CGImage, roi: CGRect) -> [Box] {
  let req = VNDetectHumanRectanglesRequest()
  req.upperBodyOnly = false
  req.regionOfInterest = roi // normalized, origin bottom-left
  do { try VNImageRequestHandler(cgImage: image, options: [:]).perform([req]) } catch { return [] }
  return (req.results ?? []).filter { $0.confidence >= 0.3 }.map { o in
    let b = o.boundingBox // relative to roi, origin bottom-left
    let fx = Double(roi.minX + b.minX * roi.width), fy = Double(roi.minY + b.minY * roi.height)
    let fw = Double(b.width * roi.width), fh = Double(b.height * roi.height)
    return Box(x: fx, y: 1 - (fy + fh), w: fw, h: fh, conf: Double(o.confidence))
  }
}

func iou(_ a: Box, _ b: Box) -> Double {
  let ix = max(0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x)), iy = max(0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
  let inter = ix * iy
  let union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}

func nms(_ boxes: [Box]) -> [Box] {
  var keep: [Box] = []
  for b in boxes.sorted(by: { $0.conf > $1.conf }) where !keep.contains(where: { iou($0, b) > 0.45 }) { keep.append(b) }
  return keep
}

// Overlapping tiles: 3 columns × 6 rows of half-width, 30%-height regions (bottom-left origin for Vision).
var tiles: [CGRect] = []
for c in 0..<3 { for r in 0..<6 { tiles.append(CGRect(x: Double(c) * 0.25, y: Double(r) * 0.14, width: 0.5, height: 0.3)) } }

var samples: [[String: Any]] = []
var withFull = 0, withTiled = 0, count = 0
var heightsFull: [Double] = [], heightsTiled: [Double] = []
var t = 0.0
let started = Date()
while t < duration {
  defer { t += 0.1 }
  guard let img = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) else { continue }
  count += 1
  let full = detect(img, roi: CGRect(x: 0, y: 0, width: 1, height: 1))
  let tiled = nms(full + tiles.flatMap { detect(img, roi: $0) })
  if !full.isEmpty { withFull += 1 }
  if !tiled.isEmpty { withTiled += 1 }
  heightsFull += full.map { $0.h }
  heightsTiled += tiled.map { $0.h }
  let enc: ([Box]) -> [[Double]] = { $0.map { [($0.x * 1e4).rounded() / 1e4, ($0.y * 1e4).rounded() / 1e4,
                                                ($0.w * 1e4).rounded() / 1e4, ($0.h * 1e4).rounded() / 1e4,
                                                ($0.conf * 100).rounded() / 100] } }
  samples.append(["t": (t * 1000).rounded(), "full": enc(full), "tiled": enc(tiled)])
  if count % 20 == 0 { print(String(format: "  %.1fs / %.1fs", t, duration)) }
}

// Ball: Vision trajectories over the whole clip (every frame).
var trajectories: [String: [String: Any]] = [:]
let processor = VNVideoProcessor(url: url)
let trajReq = VNDetectTrajectoriesRequest(frameAnalysisSpacing: .zero, trajectoryLength: 6) { req, _ in
  for o in (req.results as? [VNTrajectoryObservation]) ?? [] {
    let pts = o.detectedPoints.map { [Double($0.x), 1 - Double($0.y)] } // top-left origin
    trajectories[o.uuid.uuidString] = [
      "startS": CMTimeGetSeconds(o.timeRange.start), "endS": CMTimeGetSeconds(o.timeRange.end),
      "conf": Double(o.confidence), "points": pts,
    ]
  }
}
trajReq.objectMinimumNormalizedRadius = 0.002
trajReq.objectMaximumNormalizedRadius = 0.06
do {
  try processor.addRequest(trajReq, processingOptions: VNVideoProcessor.RequestProcessingOptions())
  try processor.analyze(CMTimeRange(start: .zero, duration: asset.duration))
} catch {
  print("trajectories failed: \(error)")
}

func median(_ v: [Double]) -> Double { v.isEmpty ? 0 : v.sorted()[v.count / 2] }
let summary: [String: Any] = [
  "samples": count,
  "shareWithPeopleFull": count > 0 ? Double(withFull) / Double(count) : 0,
  "shareWithPeopleTiled": count > 0 ? Double(withTiled) / Double(count) : 0,
  "meanPeopleFull": count > 0 ? Double(heightsFull.count) / Double(count) : 0,
  "meanPeopleTiled": count > 0 ? Double(heightsTiled.count) / Double(count) : 0,
  "medianHeightFull": median(heightsFull), "medianHeightTiled": median(heightsTiled),
  "trajectories": trajectories.count,
  "elapsedS": Date().timeIntervalSince(started),
]
let file: [String: Any] = ["summary": summary, "samples": samples, "trajectories": Array(trajectories.values)]
try! JSONSerialization.data(withJSONObject: file, options: [.prettyPrinted]).write(to: URL(fileURLWithPath: outPath))
print("summary:", summary)
print("written:", outPath)
