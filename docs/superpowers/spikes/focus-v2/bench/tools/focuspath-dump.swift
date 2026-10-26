// Prints FocusPath v1 rects for a spike fixture, read exactly as FocusPathTests reads it (people only, frame i at
// i/30 s, put on the 100 ms grid with FocusGrid). Used by the bench's parity test.
//
// Build (from docs/superpowers/spikes/focus-v2/bench):
//   swiftc -parse-as-library -O -o tools/focuspath-dump tools/focuspath-dump.swift \
//     ../../../../../app/modules/replay-camera/ios/Core/Sources/ReplayCore/FocusPath.swift \
//     ../../../../../app/modules/replay-camera/ios/Core/Sources/ReplayCore/FocusGrid.swift
// Run: tools/focuspath-dump <fixture.json> <landscape|portrait> <zoom: 1|0>   → JSON array of [x, y, w, h], or null
import Foundation

private struct RawFile: Decodable {
  struct Frame: Decodable { let i: Int; let d: [Det] }
  struct Det: Decodable { let k: String; let box: [Double] }
  let W: Double
  let H: Double
  let frames: [Frame]
}

@main
struct FocusPathDump {
  static func main() throws {
    let args = CommandLine.arguments
    guard args.count == 4 else {
      FileHandle.standardError.write("usage: focuspath-dump <fixture.json> <landscape|portrait> <1|0>\n".data(using: .utf8)!)
      exit(2)
    }
    let raw = try JSONDecoder().decode(RawFile.self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
    let frames = raw.frames.map { frame in
      FocusSample(tMs: Double(frame.i) / 30 * 1000, boxes: frame.d.filter { $0.k == "p" }.map {
        FocusBox(x: $0.box[0] / raw.W, y: $0.box[1] / raw.H, width: ($0.box[2] - $0.box[0]) / raw.W,
                 height: ($0.box[3] - $0.box[1]) / raw.H)
      })
    }
    let samples = FocusGrid.samples(from: frames, startMs: 0, endMs: .infinity, stepMs: 100)
    let aspect: FocusAspect = args[2] == "landscape" ? .landscape : .portrait
    let rects = FocusPath.compute(samples: samples, videoWidth: raw.W, videoHeight: raw.H, aspect: aspect, zoom: args[3] == "1")
    guard let rects else { print("null"); return }
    let rows = rects.map { [$0.x, $0.y, $0.width, $0.height] }
    print(String(data: try JSONSerialization.data(withJSONObject: rows), encoding: .utf8)!)
  }
}
