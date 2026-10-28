// Gesture-at-a-distance probe: replays a recorded clip through the app's own GesturePipeline (Vision, macOS) with the
// app's timing (4 samples/s, 8/s for 2 s after someone raised both hands) and reports when the trigger would fire.
// Runs each mode on the same clip, so the old whole-frame pipeline and the new tiled one can be compared.
//
//   cd docs/superpowers/spikes/gesture-distance
//   ./build-probe.sh                                  # compiles to /tmp/gesture-probe
//   /tmp/gesture-probe clips/hold-15m-01.mov          # writes clips/hold-15m-01.mov.gesture.json
//   /tmp/gesture-probe clips/*.mov                    # several clips, one json each
//
// Modes: wholeFrame (shipped until now) and standard (tiles + tracks + upscale), both with the app's limit of 4 people.
import AVFoundation
import CoreImage
import Foundation
import Vision

let modes: [(String, GesturePipeline.Options)] = [("wholeFrame", .wholeFrame), ("standard", .standard)]
let maxPeople = 4

func r3(_ v: Double) -> Double { (v * 1000).rounded() / 1000 }

func encode(_ p: Point?) -> Any {
  guard let p = p else { return NSNull() }
  return [r3(p.x), r3(p.y), r3(p.confidence)]
}

func run(path: String) {
  let url = URL(fileURLWithPath: path)
  let asset = AVURLAsset(url: url)
  let duration = CMTimeGetSeconds(asset.duration)
  guard duration > 0 else {
    print("could not read \(path)")
    return
  }
  let gen = AVAssetImageGenerator(asset: asset)
  gen.appliesPreferredTrackTransform = true // the picture upright, as the app orients frames by the accelerometer
  gen.requestedTimeToleranceBefore = .zero
  gen.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 60)

  func frame(at t: Double) -> CIImage? {
    guard let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) else { return nil }
    return CIImage(cgImage: cg)
  }

  var out: [String: Any] = ["file": url.lastPathComponent, "duration": r3(duration)]
  var size: [Double] = []
  for (name, options) in modes {
    let pipeline = GesturePipeline()
    var t = 0.0
    var armedUntil = -Double.infinity
    var samples: [[String: Any]] = []
    var fires: [Double] = []
    var withPose = 0
    var started = Date()
    while t < duration {
      guard let image = frame(at: t) else {
        t += 0.25
        continue
      }
      if size.isEmpty { size = [Double(image.extent.width), Double(image.extent.height)] }
      if samples.isEmpty { started = Date() }
      let r = pipeline.process(image, at: t, maxPeople: maxPeople, options: options)
      if r.raised { armedUntil = t + 2.0 }
      if r.fired { fires.append(r3(t)) }
      if !r.sightings.isEmpty { withPose += 1 }
      samples.append([
        "t": r3(t), "fired": r.fired, "isUp": r.isUp, "raised": r.raised, "people": r.people, "fromTiles": r.fromTiles,
        "smallestPx": Int(r.smallestPosedPx),
        "sightings": r.sightings.map { s -> [String: Any] in
          ["id": s.id, "x": r3(s.x), "y": r3(s.y), "lw": encode(s.pose.leftWrist), "rw": encode(s.pose.rightWrist),
           "le": encode(s.pose.leftElbow), "re": encode(s.pose.rightElbow), "ls": encode(s.pose.leftShoulder),
           "rs": encode(s.pose.rightShoulder), "nose": encode(s.pose.nose)]
        },
      ])
      // The app's timing: 4 samples/s, 8/s while armed.
      t += t < armedUntil ? 0.125 : 0.25
    }
    let elapsed = Date().timeIntervalSince(started)
    let msPerSample = samples.isEmpty ? 0 : elapsed * 1000 / Double(samples.count)
    out[name] = ["fires": fires, "samples": samples, "msPerSample": r3(msPerSample)]
    let fired = fires.map { String(format: "%.1fs", $0) }.joined(separator: " ")
    print("  \(name.padding(toLength: 10, withPad: " ", startingAt: 0)) fires [\(fired)]  pose in \(withPose)/\(samples.count) samples  "
          + String(format: "%.0f ms/sample", msPerSample))
  }
  out["size"] = size
  let outPath = path + ".gesture.json"
  if let data = try? JSONSerialization.data(withJSONObject: out, options: []) {
    try? data.write(to: URL(fileURLWithPath: outPath))
  }
  print("  written: \(outPath)")
}

let paths = Array(CommandLine.arguments.dropFirst())
guard !paths.isEmpty else {
  print("usage: gesture-probe <clip> [clip ...]")
  exit(1)
}
for path in paths {
  print(path)
  run(path: path)
}
