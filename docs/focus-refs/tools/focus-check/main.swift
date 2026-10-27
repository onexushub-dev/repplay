// Runs the app's own FocusGrid + FocusPath (ReplayCore sources, compiled in) on vision-probe people, with the
// standard tuning, and writes a focus file like FocusAnalyzer's. Used to prove tools/focus_variant.py matches the Swift.
//
//   cd docs/focus-refs
//   C=../../app/modules/replay-camera/ios/Core/Sources/ReplayCore
//   swiftc -O $C/FocusPath.swift $C/FocusGrid.swift tools/focus-check/main.swift -o /tmp/focus-check
//   /tmp/focus-check PEOPLE.json APP.focus.json OUT.focus.json
import Foundation

let args = CommandLine.arguments
guard args.count == 4 else { print("usage: focus-check PEOPLE.json APP.focus.json OUT.json"); exit(1) }
func json(_ path: String) -> [String: Any] {
  (try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path)))) as! [String: Any]
}
let probe = json(args[1]), app = json(args[2])
let size = (app["size"] as! [NSNumber]).map { $0.doubleValue }
let W = size[0], H = size[1]
let startMs = (app["startMs"] as! NSNumber).doubleValue, stepMs = (app["stepMs"] as! NSNumber).doubleValue
let rows = max((app["landscape"] as! [Any]).count, (app["portrait"] as! [Any]).count)
let endMs = startMs + Double(rows) * stepMs

let frames: [FocusSample] = (probe["samples"] as! [[String: Any]]).compactMap { s in
  let t = (s["t"] as! NSNumber).doubleValue
  guard t >= startMs - 0.5, t < endMs else { return nil }
  let boxes = (s["full"] as! [[NSNumber]]).map {
    FocusBox(x: $0[0].doubleValue, y: $0[1].doubleValue, width: $0[2].doubleValue, height: $0[3].doubleValue)
  }
  return FocusSample(tMs: t, boxes: boxes)
}
let samples = FocusGrid.samples(from: frames, startMs: startMs, endMs: endMs, stepMs: stepMs)
let landscape = W >= H
let main: FocusAspect = landscape ? .landscape : .portrait
let other: FocusAspect = landscape ? .portrait : .landscape
let mainRects = FocusPath.compute(samples: samples, videoWidth: W, videoHeight: H, aspect: main, zoom: true)
let otherRects = mainRects == nil ? nil : FocusPath.compute(samples: samples, videoWidth: W, videoHeight: H, aspect: other, zoom: false)
func r4(_ v: Double) -> Double { (v * 10000).rounded() / 10000 }
func rows(_ r: [FocusRect]?) -> [[Double]] { (r ?? []).map { [r4($0.x), r4($0.y), r4($0.width), r4($0.height)] } }
let out: [String: Any] = ["v": 1, "stepMs": stepMs, "startMs": startMs, "size": [W, H],
                          "landscape": rows(landscape ? mainRects : otherRects),
                          "portrait": rows(landscape ? otherRects : mainRects)]
try! JSONSerialization.data(withJSONObject: out).write(to: URL(fileURLWithPath: args[3]))
print("written \(args[3]): \(samples.count) samples, \(mainRects == nil ? "no framing" : "framing ok")")
