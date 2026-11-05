// Modo Foco lab, test 13 (2026-11-04): Vision optical flow (VNGenerateOpticalFlowRequest, free, iOS 14+ / macOS 11+)
// between consecutive 100 ms ticks of a clip, on frames scaled to a small long side, reduced per tick to the peak of
// the blurred flow magnitude (the fast-motion region): [x, y, strength] normalized (strength: long sides per 100 ms),
// the format of broadcast.py's flow files (its OpenCV `flow` command is the stand-in where this cannot run).
// The same reduction runs on the iPhone in FocusBench's "peopleflow" soak (Soak.swift, FlowProbe).
//
// Usage (Mac): swift tools/lab/flow-probe.swift <video.mp4> <startMs> <durMs> <out.flow.json> [side=320]
//   e.g. for each clip of the lab (window from lab/frames/<clip>/frames.json):
//   swift tools/lab/flow-probe.swift clips/basket-v-corner-normal-01.mp4 29984 30000 lab/tests/broadcast/basket-v-01.flow.json
import AVFoundation
import CoreImage
import Foundation
import Vision

let argv = Array(CommandLine.arguments.dropFirst())
guard argv.count >= 4, let startMs = Double(argv[1]), let durMs = Double(argv[2]) else {
    print("usage: swift flow-probe.swift <video.mp4> <startMs> <durMs> <out.flow.json> [side=320]")
    exit(1)
}
let side = argv.count >= 5 ? (Int(argv[4]) ?? 320) : 320
let asset = AVURLAsset(url: URL(fileURLWithPath: argv[0]))
guard let track = asset.tracks(withMediaType: .video).first else { print("no video track"); exit(1) }

func orientationOf(_ t: CGAffineTransform) -> CGImagePropertyOrientation {
    if t.a == 0 && t.b == 1 && t.c == -1 && t.d == 0 { return .right }
    if t.a == 0 && t.b == -1 && t.c == 1 && t.d == 0 { return .left }
    if t.a == -1 && t.b == 0 && t.c == 0 && t.d == -1 { return .down }
    return .up
}

/// Scales frames to `side` px on the long side (upright) and returns, per pair, the peak of the flow magnitude.
final class FlowProbe {
    let side: Int
    let context = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
    var previous: CVPixelBuffer?
    var flowMs: [Double] = []
    var scaleMs: [Double] = []
    var outputSize: [Int] = []

    init(side: Int) { self.side = side }

    func scaled(_ pixels: CVPixelBuffer, _ orientation: CGImagePropertyOrientation) -> CVPixelBuffer? {
        let image = CIImage(cvPixelBuffer: pixels).oriented(orientation)
        let e = image.extent
        let s = Double(side) / Double(max(e.width, e.height))
        let w = Int((Double(e.width) * s).rounded()), h = Int((Double(e.height) * s).rounded())
        var out: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
        CVPixelBufferCreate(nil, w, h, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &out)
        guard let buffer = out else { return nil }
        let moved = image.transformed(by: CGAffineTransform(translationX: -e.minX, y: -e.minY))
            .transformed(by: CGAffineTransform(scaleX: CGFloat(s), y: CGFloat(s)))
        context.render(moved, to: buffer)
        return buffer
    }

    /// The next tick's frame; nil for the first one (no pair yet) or when Vision fails.
    func add(_ pixels: CVPixelBuffer, _ orientation: CGImagePropertyOrientation) -> [Double]? {
        let t0 = Date()
        guard let current = scaled(pixels, orientation) else { return nil }
        scaleMs.append(Date().timeIntervalSince(t0) * 1000)
        defer { previous = current }
        guard let before = previous else { return nil }
        let t1 = Date()
        let request = VNGenerateOpticalFlowRequest(targetedCVPixelBuffer: current, options: [:])
        request.computationAccuracy = .low
        request.outputPixelFormat = kCVPixelFormatType_TwoComponent32Float
        do {
            try VNImageRequestHandler(cvPixelBuffer: before, options: [:]).perform([request])
        } catch {
            return nil
        }
        flowMs.append(Date().timeIntervalSince(t1) * 1000)
        guard let results = request.results, let observation = results.first else { return nil }
        return FlowProbe.peak(observation.pixelBuffer, inputLong: Double(max(CVPixelBufferGetWidth(current),
                                                                                CVPixelBufferGetHeight(current))),
                              sizeOut: &outputSize)
    }

    /// broadcast.py flow_peak: magnitude minus its median, box blur over 1/12 of the long side, argmax.
    static func peak(_ flow: CVPixelBuffer, inputLong: Double, sizeOut: inout [Int]) -> [Double]? {
        CVPixelBufferLockBaseAddress(flow, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(flow, .readOnly) }
        let w = CVPixelBufferGetWidth(flow), h = CVPixelBufferGetHeight(flow)
        sizeOut = [w, h]
        guard let base = CVPixelBufferGetBaseAddress(flow) else { return nil }
        let row = CVPixelBufferGetBytesPerRow(flow)
        // flow vectors are in pixels of the output buffer; scale them to the input frame
        let toInput = inputLong / Double(max(w, h))
        var mag = [Double](repeating: 0, count: w * h)
        for y in 0..<h {
            let p = (base + y * row).assumingMemoryBound(to: Float.self)
            for x in 0..<w {
                let u = Double(p[2 * x]), v = Double(p[2 * x + 1])
                mag[y * w + x] = (u * u + v * v).squareRoot() * toInput
            }
        }
        let sorted = mag.sorted()
        let median = sorted[sorted.count / 2]
        // integral image of max(mag - median, 0)
        var integral = [Double](repeating: 0, count: (w + 1) * (h + 1))
        for y in 0..<h {
            var acc = 0.0
            for x in 0..<w {
                acc += max(mag[y * w + x] - median, 0)
                integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + acc
            }
        }
        let k = max(3, (max(w, h) / 12) | 1), r = k / 2
        var best = -1.0, bx = 0, by = 0
        for y in 0..<h {
            let y0 = max(0, y - r), y1 = min(h, y + r + 1)
            for x in 0..<w {
                let x0 = max(0, x - r), x1 = min(w, x + r + 1)
                let sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0]
                    + integral[y0 * (w + 1) + x0]
                let mean = sum / Double(k * k) // cv2.blur's border handling differs slightly; fine for a lab signal
                if mean > best { best = mean; bx = x; by = y }
            }
        }
        let strength = best / inputLong
        if strength < 1e-4 { return nil }
        func r4(_ v: Double) -> Double { (v * 10000).rounded() / 10000 }
        return [r4((Double(bx) + 0.5) / Double(w)), r4((Double(by) + 0.5) / Double(h)), (strength * 100000).rounded() / 100000]
    }
}

let reader = try AVAssetReader(asset: asset)
reader.timeRange = CMTimeRange(start: CMTime(seconds: startMs / 1000, preferredTimescale: 600),
                               duration: CMTime(seconds: durMs / 1000, preferredTimescale: 600))
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
])
output.alwaysCopiesSampleData = false
reader.add(output)
guard reader.startReading() else { print("cannot read the video"); exit(1) }
let orientation = orientationOf(track.preferredTransform)
let probe = FlowProbe(side: side)
var frames: [Any] = []
var next = startMs
let count = Int((durMs / 100).rounded())
let t0 = Date()
while frames.count < count, let buffer = output.copyNextSampleBuffer() {
    let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds * 1000
    if t + 0.5 < next { continue }
    while next <= t + 0.5 { next += 100 }
    guard let pixels = CMSampleBufferGetImageBuffer(buffer) else { continue }
    autoreleasepool {
        if let p = probe.add(pixels, orientation) { frames.append(p) } else { frames.append(NSNull()) }
    }
}
func median(_ v: [Double]) -> Double { v.isEmpty ? 0 : v.sorted()[v.count / 2] }
let summary: [String: Any] = ["elapsedS": Date().timeIntervalSince(t0), "flowMsMedian": median(probe.flowMs),
                              "scaleMsMedian": median(probe.scaleMs), "flowOutputSize": probe.outputSize]
let json: [String: Any] = ["source": "vision-flow-\(side)", "stepMs": 100, "startMs": startMs, "frames": frames,
                           "summary": summary]
let data = try JSONSerialization.data(withJSONObject: json)
try data.write(to: URL(fileURLWithPath: argv[3]))
print("\(argv[3]): \(frames.count) ticks, Vision flow \(median(probe.flowMs)) ms per pair (output \(probe.outputSize))")
