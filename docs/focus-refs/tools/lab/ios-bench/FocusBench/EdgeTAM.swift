// FocusBench (Modo Foco lab, iPhone step 2): EdgeTAM's four Core ML models and the tracking loop, as in
// tools/lab/coreml_export.py (`track`). Throwaway test code, not the app's.

import CoreML
import CoreGraphics
import Foundation
import ImageIO
import Vision

enum BenchError: Error, LocalizedError {
    case missing(String)
    case badOutput(String)
    case stopped

    var errorDescription: String? {
        switch self {
        case .stopped:
            return "Stopped"
        case .missing(let name):
            return "Not in the app: \(name). On the Mac run `tools/lab/ios_bench.py prepare`, then build again."
        case .badOutput(let name):
            return "Unexpected model output: \(name)"
        }
    }
}

func now() -> Double {
    return Double(DispatchTime.now().uptimeNanoseconds) / 1e9
}

/// A file copied into the app from FocusBench/Data (Xcode puts it at the bundle root; a folder copy also works).
func bundleURL(_ name: String, _ ext: String) -> URL? {
    if let url = Bundle.main.url(forResource: name, withExtension: ext) {
        return url
    }
    return Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Data")
}

struct ClipInfo: Decodable {
    let name: String
    let variant: String
    let sport: String
    let frames: Int
    let side: Int
    let seedFrame: Int
    let seedXY: [Double]          // the click, 0..1 of the crop
    let refs: [String: [[Double]?]] // the Mac's tracks: per frame [cx, cy, x, y, w, h, area, main] or null
}

struct BenchList: Decodable {
    let clips: [String]
    let attentionVariants: [String]?  // extra attention models, edgetam_attention_<tag> (export --variants)
}

struct Constants: Decodable {
    let noMemEmbed: [Float]

    enum CodingKeys: String, CodingKey {
        case noMemEmbed = "no_mem_embed"
    }
}

func loadJSON<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
    guard let url = bundleURL(name, "json") else {
        throw BenchError.missing(name + ".json")
    }
    return try JSONDecoder().decode(type, from: Data(contentsOf: url))
}

func loadFrame(_ clip: String, _ index: Int) throws -> CGImage {
    let name = String(format: "%@_%05d", clip, index)
    guard let url = bundleURL(name, "jpg"),
          let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        throw BenchError.missing(name + ".jpg")
    }
    return image
}

// MARK: - arrays

func floats(_ a: MLMultiArray) -> [Float] {
    if a.dataType == .float16 {
        return MLShapedArray<Float16>(a).scalars.map { Float($0) }
    }
    if a.dataType == .double {
        return MLShapedArray<Double>(a).scalars.map { Float($0) }
    }
    return MLShapedArray<Float>(a).scalars
}

func multiArray(_ values: [Float], _ shape: [Int]) -> MLMultiArray {
    return MLMultiArray(MLShapedArray<Float>(scalars: values, shape: shape))
}

func feature(_ a: MLMultiArray) -> MLFeatureValue {
    return MLFeatureValue(multiArray: a)
}

// MARK: - the four models

final class EdgeTAMModels {
    static let names = ["encoder", "attention", "decoder", "memory"]

    let models: [String: MLModel]
    let loadSeconds: [String: Double]
    let imageConstraint: MLImageConstraint?

    /// units: compute units per model ("encoder", "attention", "decoder", "memory"); a missing one uses .all.
    /// attentionFile: "attention" or a variant "attention_<tag>".
    init(units: [String: MLComputeUnits], only: [String] = EdgeTAMModels.names,
         attentionFile: String = "attention") throws {
        var models: [String: MLModel] = [:]
        var load: [String: Double] = [:]
        for name in only {
            let file = name == "attention" ? attentionFile : name
            guard let url = bundleURL("edgetam_" + file, "mlmodelc") else {
                throw BenchError.missing("edgetam_\(file).mlpackage")
            }
            let config = MLModelConfiguration()
            config.computeUnits = units[name] ?? .all
            let t = now()
            models[name] = try MLModel(contentsOf: url, configuration: config)
            load[name] = now() - t
        }
        self.models = models
        self.loadSeconds = load
        self.imageConstraint = models["encoder"].flatMap { $0.modelDescription.inputDescriptionsByName["image"] }
            .flatMap { $0.imageConstraint }
    }

    /// One prediction; adds its time to `timing[name]`.
    func run(_ name: String, _ inputs: [String: MLFeatureValue], _ timing: Timing) throws -> MLFeatureProvider {
        guard let model = models[name] else {
            throw BenchError.missing("edgetam_" + name)
        }
        let provider = try MLDictionaryFeatureProvider(dictionary: inputs)
        let t = now()
        let out = try model.prediction(from: provider)
        timing.add(name, now() - t)
        return out
    }
}

func output(_ out: MLFeatureProvider, _ name: String) throws -> MLMultiArray {
    guard let a = out.featureValue(for: name)?.multiArrayValue else {
        throw BenchError.badOutput(name)
    }
    return a
}

// MARK: - timing

final class Timing {
    var ms: [String: [Double]] = [:]

    func add(_ name: String, _ seconds: Double) {
        var list = ms[name] ?? []
        list.append(seconds * 1000)
        ms[name] = list
    }

    /// mean / median / p90 in ms, the first 3 calls (warm-up) left out when there are enough.
    func stats(_ name: String) -> [String: Double] {
        var list = ms[name] ?? []
        if list.count > 6 {
            list = Array(list.dropFirst(3))
        }
        if list.isEmpty {
            return ["mean": 0, "median": 0, "p90": 0, "calls": 0]
        }
        let sorted = list.sorted()
        let mean = list.reduce(0, +) / Double(list.count)
        let median = sorted[sorted.count / 2]
        let p90 = sorted[min(sorted.count - 1, Int(Double(sorted.count) * 0.9))]
        return ["mean": round1(mean), "median": round1(median), "p90": round1(p90), "calls": Double(list.count)]
    }
}

func round1(_ v: Double) -> Double {
    return (v * 10).rounded() / 10
}

// MARK: - mask summary (server.py's summarize, on the mask upsampled to the crop size as on the Mac)

/// lowRes: 256x256 mask logits. Returns [cx, cy, x, y, w, h, area, main] in 0..1 of the crop, or nil (no ball).
func summarize(_ lowRes: [Float], n: Int, side: Int) -> [Double]? {
    var minX = n, minY = n, maxX = -1, maxY = -1
    for y in 0..<n {
        let row = y * n
        for x in 0..<n where lowRes[row + x] > 0 {
            if x < minX { minX = x }
            if x > maxX { maxX = x }
            if y < minY { minY = y }
            if y > maxY { maxY = y }
        }
    }
    if maxX < 0 {
        return nil
    }
    // bilinear, align_corners=False (PyTorch's F.interpolate), only where a positive low-res pixel can reach
    let scale = Double(n) / Double(side)
    func dstRange(_ lo: Int, _ hi: Int) -> (Int, Int) {
        let a = Int(floor((Double(lo - 1) + 0.5) / scale - 0.5))
        let b = Int(ceil((Double(hi + 1) + 0.5) / scale - 0.5))
        return (max(0, a), min(side - 1, b))
    }
    let (x0, x1) = dstRange(minX, maxX)
    let (y0, y1) = dstRange(minY, maxY)
    let w = x1 - x0 + 1
    let h = y1 - y0 + 1
    func taps(_ d: Int) -> (Int, Int, Float) {
        var s = (Double(d) + 0.5) * scale - 0.5
        if s < 0 { s = 0 }
        let i0 = min(Int(s), n - 1)
        let i1 = min(i0 + 1, n - 1)
        return (i0, i1, Float(s - Double(i0)))
    }
    let xt = (x0...x1).map { taps($0) }
    var bin = [UInt8](repeating: 0, count: w * h)
    var total = 0
    for yy in 0..<h {
        let (iy0, iy1, ly) = taps(y0 + yy)
        for xx in 0..<w {
            let (ix0, ix1, lx) = xt[xx]
            let top = (1 - lx) * lowRes[iy0 * n + ix0] + lx * lowRes[iy0 * n + ix1]
            let bottom = (1 - lx) * lowRes[iy1 * n + ix0] + lx * lowRes[iy1 * n + ix1]
            if (1 - ly) * top + ly * bottom > 0 {
                bin[yy * w + xx] = 1
                total += 1
            }
        }
    }
    if total == 0 {
        return nil
    }
    // largest 8-connected piece
    var label = [Int32](repeating: 0, count: w * h)
    var best = (count: 0, sx: 0.0, sy: 0.0, bx0: 0, by0: 0, bx1: 0, by1: 0)
    var next: Int32 = 0
    var stack: [Int] = []
    for start in 0..<(w * h) where bin[start] == 1 && label[start] == 0 {
        next += 1
        label[start] = next
        stack.append(start)
        var c = (count: 0, sx: 0.0, sy: 0.0, bx0: Int.max, by0: Int.max, bx1: -1, by1: -1)
        while let p = stack.popLast() {
            let px = p % w
            let py = p / w
            c.count += 1
            c.sx += Double(px)
            c.sy += Double(py)
            if px < c.bx0 { c.bx0 = px }
            if px > c.bx1 { c.bx1 = px }
            if py < c.by0 { c.by0 = py }
            if py > c.by1 { c.by1 = py }
            for dy in -1...1 {
                let qy = py + dy
                if qy < 0 || qy >= h { continue }
                for dx in -1...1 {
                    let qx = px + dx
                    if qx < 0 || qx >= w || (dx == 0 && dy == 0) { continue }
                    let q = qy * w + qx
                    if bin[q] == 1 && label[q] == 0 {
                        label[q] = next
                        stack.append(q)
                    }
                }
            }
        }
        if c.count > best.count {
            best = c
        }
    }
    let s = Double(side)
    func r(_ v: Double, _ digits: Double) -> Double {
        return (v * digits).rounded() / digits
    }
    let cx = (Double(x0) + best.sx / Double(best.count)) / s
    let cy = (Double(y0) + best.sy / Double(best.count)) / s
    return [r(cx, 1e4), r(cy, 1e4), r(Double(x0 + best.bx0) / s, 1e4), r(Double(y0 + best.by0) / s, 1e4),
            r(Double(best.bx1 - best.bx0 + 1) / s, 1e4), r(Double(best.by1 - best.by0 + 1) / s, 1e4),
            r(Double(best.count) / (s * s), 1e6), r(Double(best.count) / Double(total), 1e3)]
}

// MARK: - the loop

struct Slot {
    let mem: [Float16]   // (512, 64): the bank is kept in fp16, as the app would
    let ptr: [Float]     // (256)
}

struct FrameResult {
    let summary: [Double]?
    let score: Float
}

final class Tracker {
    static let nMem = 7
    static let nPtr = 16
    static let memSize = 512 * 64

    let models: EdgeTAMModels
    let noMem: [Float]
    let timing = Timing()
    /// Encoder input of frame i from a video (the soak test); nil: the bundled JPEG frames.
    var source: ((Int) throws -> MLFeatureValue)?
    /// Lab test 14: track every `step`-th 100 ms tick (2 = 5 fps), on the grid through the clicked frame.
    var step = 1

    init(models: EdgeTAMModels, noMem: [Float]) {
        self.models = models
        self.noMem = noMem
    }

    func encode(_ clip: ClipInfo, _ index: Int) throws -> (MLMultiArray, MLMultiArray, MLMultiArray) {
        let t = now()
        let value: MLFeatureValue
        if let source = source {
            value = try source(index)
        } else {
            let image = try loadFrame(clip.name, index)
            guard let constraint = models.imageConstraint else {
                throw BenchError.badOutput("encoder image input")
            }
            value = try MLFeatureValue(cgImage: image, constraint: constraint,
                                       options: [.cropAndScale: VNImageCropAndScaleOption.scaleFill.rawValue])
        }
        timing.add("prep", now() - t)
        let out = try models.run("encoder", ["image": value], timing)
        return (try output(out, "feat_s0"), try output(out, "feat_s1"), try output(out, "vision"))
    }

    func decode(_ pix: MLMultiArray, _ s0: MLMultiArray, _ s1: MLMultiArray,
                        _ points: [Float], _ labels: [Float]) throws -> (MLMultiArray, [Float], Float) {
        let out = try models.run("decoder", ["pix": feature(pix), "feat_s0": feature(s0), "feat_s1": feature(s1),
                                             "points": feature(multiArray(points, [1, 2, 2])),
                                             "labels": feature(multiArray(labels, [1, 2]))], timing)
        let score = floats(try output(out, "score"))
        return (try output(out, "mask"), floats(try output(out, "obj_ptr")), score.isEmpty ? -1 : score[0])
    }

    func memorize(_ vision: MLMultiArray, _ mask: MLMultiArray, hard: Bool) throws -> [Float16] {
        let out = try models.run("memory", ["vision": feature(vision), "mask": feature(mask),
                                            "hard": feature(multiArray([hard ? 1 : 0], [1, 1]))], timing)
        return floats(try output(out, "mem")).map { Float16($0) }
    }

    /// Forward from the click, then backwards; ONE bank for both directions (as coreml_export.py).
    /// limit > 0: stop after that many frames (a quick timing run, not a full track).
    func track(_ clip: ClipInfo, limit: Int, shouldStop: () -> Bool,
               progress: (Int, Double) -> Void) throws -> [FrameResult?] {
        let n = clip.frames
        var results = [FrameResult?](repeating: nil, count: n)
        var bank: [Int: Slot] = [:]
        let s = clip.seedFrame
        var t = now()
        let (s0, s1, vision) = try encode(clip, s)
        var visionValues = floats(vision)
        for c in 0..<256 {
            let add = noMem[c]
            for i in 0..<4096 {
                visionValues[c * 4096 + i] += add
            }
        }
        let seed = [Float(clip.seedXY[0] * 1024), Float(clip.seedXY[1] * 1024), 0, 0]
        let (mask, ptr, score) = try decode(multiArray(visionValues, [1, 256, 64, 64]), s0, s1, seed, [1, -1])
        let cond = Slot(mem: try memorize(vision, mask, hard: true), ptr: ptr)
        results[s] = FrameResult(summary: summarize(floats(mask), n: 256, side: clip.side), score: score)
        timing.add("frame", now() - t)
        progress(1, 0)

        var memData = [Float](repeating: 0, count: Tracker.nMem * Tracker.memSize)
        var ptrData = [Float](repeating: 0, count: Tracker.nPtr * 256)
        let pad: [Float] = [0, 0, 0, 0]
        let none: [Float] = [-1, -1]
        var done = 1
        for (sign, order) in [(1, Array(stride(from: s + 1, to: n, by: 1))),
                              (-1, Array(stride(from: s - 1, through: 0, by: -1)))] {
            for f in order {
                if shouldStop() {
                    throw BenchError.stopped
                }
                if limit > 0 && done >= limit {
                    break
                }
                // Core ML's outputs are autoreleased: without a pool per frame they pile up for the whole clip
                // (2026-11-04, iPhone XR: killed at its 1850 MB limit)
                try autoreleasepool {
                t = now()
                let (fs0, fs1, fvision) = try encode(clip, f)
                let tLoop = now()
                // slot 0 = clicked frame, slots 1..6 = f-6..f-1 (backwards f+6..f+1); empty slots switched off
                var memOn: [Float] = [1]
                var ptrOn: [Float] = [1]
                for slot in 0..<Tracker.nMem {
                    var src = cond.mem
                    if slot > 0 {
                        if let prev = bank[f - sign * (Tracker.nMem - slot)] {
                            src = prev.mem
                            memOn.append(1)
                        } else {
                            memOn.append(0)
                        }
                    }
                    let base = slot * Tracker.memSize
                    memData.withUnsafeMutableBufferPointer { dst in
                        src.withUnsafeBufferPointer { from in
                            for i in 0..<Tracker.memSize {
                                dst[base + i] = Float(from[i])
                            }
                        }
                    }
                }
                for k in 0..<Tracker.nPtr {
                    var src = cond.ptr
                    if k > 0 {
                        if let prev = bank[f - sign * k] {
                            src = prev.ptr
                            ptrOn.append(1)
                        } else {
                            ptrOn.append(0)
                        }
                    }
                    for i in 0..<256 {
                        ptrData[k * 256 + i] = src[i]
                    }
                }
                timing.add("loop", now() - tLoop)
                let att = try models.run("attention", ["vision": feature(fvision),
                                                       "mem": feature(multiArray(memData, [Tracker.nMem, 512, 64])),
                                                       "ptr": feature(multiArray(ptrData, [Tracker.nPtr, 256])),
                                                       "mem_on": feature(multiArray(memOn, [1, Tracker.nMem])),
                                                       "ptr_on": feature(multiArray(ptrOn, [1, Tracker.nPtr]))],
                                         timing)
                let (fmask, fptr, fscore) = try decode(try output(att, "pix"), fs0, fs1, pad, none)
                bank[f] = Slot(mem: try memorize(fvision, fmask, hard: false), ptr: fptr)
                let tSum = now()
                results[f] = FrameResult(summary: summarize(floats(fmask), n: 256, side: clip.side), score: fscore)
                timing.add("summary", now() - tSum)
                let frameSeconds = now() - t
                timing.add("frame", frameSeconds)
                done += 1
                progress(done, frameSeconds * 1000)
                }
            }
        }
        return results
    }
}

// MARK: - one model alone, on dummy inputs (which compute unit suits which model)

func zeros(_ shape: [Int]) -> MLFeatureValue {
    return feature(multiArray([Float](repeating: 0, count: shape.reduce(1, *)), shape))
}

/// Loads one model on `units` and times `calls` predictions; returns (load s, median ms of the calls after the first).
func probe(_ name: String, units: MLComputeUnits, image: CGImage, calls: Int = 4,
           attentionFile: String = "attention") throws -> (Double, Double) {
    let models = try EdgeTAMModels(units: [name: units], only: [name], attentionFile: attentionFile)
    var inputs: [String: MLFeatureValue] = [:]
    switch name {
    case "encoder":
        guard let constraint = models.imageConstraint else {
            throw BenchError.badOutput("encoder image input")
        }
        inputs["image"] = try MLFeatureValue(cgImage: image, constraint: constraint,
                                             options: [.cropAndScale: VNImageCropAndScaleOption.scaleFill.rawValue])
    case "attention":
        inputs = ["vision": zeros([1, 256, 64, 64]), "mem": zeros([7, 512, 64]), "ptr": zeros([16, 256]),
                  "mem_on": feature(multiArray([Float](repeating: 1, count: 7), [1, 7])),
                  "ptr_on": feature(multiArray([Float](repeating: 1, count: 16), [1, 16]))]
    case "decoder":
        inputs = ["pix": zeros([1, 256, 64, 64]), "feat_s0": zeros([1, 32, 256, 256]),
                  "feat_s1": zeros([1, 64, 128, 128]), "points": zeros([1, 2, 2]),
                  "labels": feature(multiArray([-1, -1], [1, 2]))]
    default:
        inputs = ["vision": zeros([1, 256, 64, 64]), "mask": zeros([1, 1, 256, 256]), "hard": zeros([1, 1])]
    }
    let timing = Timing()
    for _ in 0..<calls {
        try autoreleasepool {
            _ = try models.run(name, inputs, timing)
        }
    }
    let list = Array((timing.ms[name] ?? []).dropFirst()).sorted()
    return (models.loadSeconds[name] ?? 0, list.isEmpty ? 0 : round1(list[list.count / 2]))
}

// MARK: - agreement with the Mac's track

func agreement(_ phone: [[Double]?], _ mac: [[Double]?], side: Int) -> (medianPx: Double, mismatches: Int) {
    var d: [Double] = []
    var mismatches = 0
    for (p, q) in zip(phone, mac) {
        if let p = p, let q = q {
            d.append(hypot((p[0] - q[0]) * Double(side), (p[1] - q[1]) * Double(side)))
        } else if (p == nil) != (q == nil) {
            mismatches += 1
        }
    }
    let sorted = d.sorted()
    return (sorted.isEmpty ? -1 : round1(sorted[sorted.count / 2]), mismatches)
}
