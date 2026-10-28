// Modo Foco probe: runs the same Vision person detector the app uses (VNDetectHumanRectanglesRequest, conf >= 0.3,
// one frame every 100 ms) on a clip, plus candidate improvements:
//   - "tiled": the whole frame plus the 9 regions the gesture trigger scans (ScanTiles: 3 x 3 overlapping halves of the
//     frame), filtered and merged the way the gesture's GesturePipeline does — for small/far players
//   - "trajectories" (--ball): VNDetectTrajectoriesRequest, Vision's detector for thrown/hit objects (the ball)
//
// 2026-10-28: with a regionOfInterest, Vision still returns boxes normalized to the WHOLE frame (found on the gesture
// field test). This probe used to map them as if they were relative to the region, so its old "tiled" numbers (16-23
// people per frame, mostly phantoms) were wrong. People files made before this date have broken "tiled" boxes.
//
// Usage: swift vision-probe.swift <video.mp4> [out.json] [--ball]
import AVFoundation
import Foundation
import Vision

let rawArgs = Array(CommandLine.arguments.dropFirst())
let withBall = rawArgs.contains("--ball")
let args = rawArgs.filter { $0 != "--ball" }
guard args.count >= 1 else {
  print("usage: swift vision-probe.swift <video.mp4> [out.json] [--ball]")
  exit(1)
}
let url = URL(fileURLWithPath: args[0])
let outPath = args.count >= 2 ? args[1] : args[0] + ".probe.json"
let asset = AVURLAsset(url: url)
let duration = CMTimeGetSeconds(asset.duration)
guard duration > 0 else { print("could not read video"); exit(1) }

let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero

struct Box { var x, y, w, h: Double; var conf: Double } // normalized, origin top-left, upright picture

/// People in the whole frame (roi nil) or in one region of it. Boxes come back normalized to the whole frame either way.
func detect(_ image: CGImage, roi: CGRect?) -> [Box] {
  let req = VNDetectHumanRectanglesRequest()
  req.upperBodyOnly = false
  if let roi = roi { req.regionOfInterest = roi } // normalized, origin bottom-left
  do { try VNImageRequestHandler(cgImage: image, options: [:]).perform([req]) } catch { return [] }
  return (req.results ?? []).compactMap { (o: VNHumanObservation) -> Box? in
    let b = o.boundingBox // whole frame, origin bottom-left
    if let roi = roi, !roi.insetBy(dx: -0.02, dy: -0.02).contains(CGPoint(x: b.midX, y: b.midY)) { return nil }
    return Box(x: Double(b.minX), y: Double(1 - b.maxY), w: Double(b.width), h: Double(b.height), conf: Double(o.confidence))
  }
}

// ScanTiles.regions (ReplayCore): 3 x 3, each half the frame, middle row first (bottom-left origin).
var tiles: [CGRect] = []
for row in [1, 0, 2] { for col in 0..<3 { tiles.append(CGRect(x: Double(col) * 0.25, y: Double(row) * 0.25, width: 0.5, height: 0.5)) } }

/// ScanTiles.plausible: confident, person-shaped, at least 28 px tall.
func plausible(_ b: Box, width: Double, height: Double) -> Bool {
  let h = b.h * height, w = b.w * width
  guard b.conf >= 0.5, h >= 28, w > 0 else { return false }
  let aspect = h / w
  return aspect >= 0.9 && aspect <= 6
}

func area(_ b: Box) -> Double { b.w * b.h }
func inter(_ a: Box, _ b: Box) -> Double {
  let ix = max(0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x)), iy = max(0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
  return ix * iy
}
func iou(_ a: Box, _ b: Box) -> Double {
  let i = inter(a, b), u = area(a) + area(b) - i
  return u > 0 ? i / u : 0
}

/// PersonBoxes.merge: most confident first; a box mostly (70%) inside another is the same person and the bigger stays.
func merge(_ boxes: [Box]) -> [Box] {
  var keep: [Box] = []
  for b in boxes.sorted(by: { $0.conf > $1.conf }) {
    if let i = keep.firstIndex(where: { (k: Box) -> Bool in
      let s = min(area(k), area(b))
      return s > 0 && inter(k, b) / s > 0.7
    }) {
      if area(b) > area(keep[i]) { keep[i] = b }
    } else if !keep.contains(where: { iou($0, b) > 0.4 }) {
      keep.append(b)
    }
  }
  return keep
}

var samples: [[String: Any]] = []
var withFull = 0, withTiled = 0, count = 0
var heightsFull: [Double] = [], heightsTiled: [Double] = []
var t = 0.0
let started = Date()
while t < duration {
  defer { t += 0.1 }
  guard let img = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) else { continue }
  count += 1
  let W = Double(img.width), H = Double(img.height)
  let full = detect(img, roi: nil).filter { $0.conf >= 0.3 }
  let fromTiles = tiles.flatMap { detect(img, roi: $0) }.filter { plausible($0, width: W, height: H) }
  let tiled = merge(full + fromTiles)
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

// Ball (only with --ball): Vision trajectories over the whole clip (every frame).
var trajectories: [String: [String: Any]] = [:]
if withBall {
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
  "tilesFixed": true,
  "elapsedS": Date().timeIntervalSince(started),
]
let file: [String: Any] = ["summary": summary, "samples": samples, "trajectories": Array(trajectories.values)]
try! JSONSerialization.data(withJSONObject: file, options: [.prettyPrinted]).write(to: URL(fileURLWithPath: outPath))
print("summary:", summary)
print("written:", outPath)
