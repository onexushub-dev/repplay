import AVFoundation
import Vision

/// Modo Foco analysis (v2, Part 3 plan task 6): one frame every 100 ms between `startMs` and `endMs`; people and ball
/// candidates from the D-FINE-S detector (`FocusDetector`, on tiles when needed), a motion score per candidate, the
/// framing from `FocusV2` for the recording's sport, written next to the clip (<clip>.focus.json, v2). Without the
/// model it falls back to Vision's people and the players path (decision 6). One analysis at a time, at utility
/// priority, cancellable.
enum FocusAnalyzer {
  struct Outcome {
    let ready: Bool
    let frames: Int
    let framesWithPeople: Int
    let meanPeople: Double
    let elapsedMs: Double
    let follow: String
    /// Share of the samples with the ball seen or predicted (0 for players-framed sports).
    let ballShare: Double
    let model: String
  }

  /// `interrupted`: Vision or Core ML kept failing, as they do with the app in the background; redone later.
  enum Failure: Error { case noVideo, unreadable, cancelled, interrupted }

  static let stepMs = 100.0
  static let minConfidence: VNConfidence = 0.3
  private static let work = DispatchQueue(label: "repplay.focus", qos: .utility)
  private static let lock = NSLock()
  nonisolated(unsafe) private static var cancelled = Set<String>() // guarded by `lock`

  /// Stops the analysis of this clip if it is waiting or running; it then rejects with `cancelled`.
  static func cancel(clipPath: String) {
    lock.lock(); cancelled.insert(clipPath); lock.unlock()
  }

  private static func isCancelled(_ clipPath: String) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return cancelled.contains(clipPath)
  }

  private static func clearCancel(_ clipPath: String) {
    lock.lock(); cancelled.remove(clipPath); lock.unlock()
  }

  /// `sport`: the recording's sport id (spec §13.6); unknown ids frame the players.
  static func analyze(clipPath: String, startMs: Double, endMs: Double, sport: String, outPath: String,
                      debug: Bool) async throws -> Outcome {
    let asset = AVURLAsset(url: URL(fileURLWithPath: clipPath))
    guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw Failure.noVideo }
    let transform = try await track.load(.preferredTransform)
    let natural = try await track.load(.naturalSize)
    let job = Job(asset: asset, track: track, transform: transform, natural: natural, clipPath: clipPath,
                  startMs: startMs, endMs: endMs, sport: sport, outPath: outPath, debug: debug)
    return try await withCheckedThrowingContinuation { (done: CheckedContinuation<Outcome, Error>) in
      work.async {
        defer { clearCancel(clipPath) }
        do {
          done.resume(returning: try run(job))
        } catch {
          done.resume(throwing: error)
        }
      }
    }
  }

  private struct Job {
    let asset: AVAsset
    let track: AVAssetTrack
    let transform: CGAffineTransform
    let natural: CGSize
    let clipPath: String
    let startMs: Double
    let endMs: Double
    let sport: String
    let outPath: String
    let debug: Bool
  }

  /// One analysed frame (upright coordinates, 0..1).
  private struct Frame {
    let tMs: Double
    let people: [FocusBox]
    let balls: [BallCandidate]
    var luma: LumaFrame?
    var motion: [Double?]?
  }

  private static func run(_ job: Job) throws -> Outcome {
    let started = Date()
    if isCancelled(job.clipPath) { throw Failure.cancelled }
    let orientation = Self.orientation(of: job.transform)
    let turned = orientation == .left || orientation == .right
    let width = Double(turned ? job.natural.height : job.natural.width)
    let height = Double(turned ? job.natural.width : job.natural.height)
    let short = min(width, height)

    let detector = FocusDetector.shared()
    let asked = FocusPolicy.plan(sport: job.sport, shortSidePx: short)
    // No model: v1's Vision people, so only the players can be followed (decision 6).
    let plan = detector == nil ? FocusPlan(follow: .players, ballSource: nil, maxZoom: asked.maxZoom) : asked
    let ballLed = plan.follow == .ball

    var frames: [Frame]
    var tiled = false
    if let d = detector {
      let tp = FocusDetection.tilePlan(shortSide: short, portrait: height > width, ballLed: ballLed)
      let size = decodeSize(job.natural, longSide: tp.decodeLongSide)
      tiled = tp.alwaysTiles
      if !tiled {
        // Players-framed: the first second, full frame only, decides (spec §4.1).
        let firstEnd = job.endMs > job.startMs ? min(job.endMs, job.startMs + 1000) : job.startMs + 1000
        let first = try readFrames(job, startMs: job.startMs, endMs: firstEnd, size: size) { _, pixels in
          let dets = try d.detect(pixels, orientation: orientation, tiles: [])
          return FocusDetection.sample(dets, width: width, height: height).people
        }
        let heights = first.flatMap { $0.map { $0.height } }
        let scale640 = height * 640 / max(width, height)
        tiled = FocusDetection.needsTiles(firstSecondPeopleHeights: heights, scale640: scale640)
      }
      let tiles = tiled ? FocusDetection.tiles(cols: tp.cols, rows: tp.rows) : []
      let stored = StoredOrientation(rawValue: Int(orientation.rawValue)) ?? .up
      let decoded = size.map { "\(Int($0.width))x\(Int($0.height))" } ?? "native"
      NSLog("[Repplay] focus v2 start %@ model=%@ sport=%@ follow=%@ decode=%@ tiles=%ld (%.0f s of video)",
            (job.clipPath as NSString).lastPathComponent, FocusDetector.modelName, job.sport, plan.follow.rawValue,
            decoded, tiles.count, (job.endMs > job.startMs ? job.endMs - job.startMs : 0) / 1000)
      frames = []
      _ = try readFrames(job, startMs: job.startMs, endMs: job.endMs, size: size) { t, pixels -> Bool in
        let s = FocusDetection.sample(try d.detect(pixels, orientation: orientation, tiles: tiles), width: width,
                                      height: height)
        frames.append(Frame(tMs: t, people: s.people, balls: s.balls, luma: ballLed ? luma(pixels, stored) : nil,
                            motion: nil))
        if ballLed { scoreMotion(&frames, upTo: frames.count - 1) }
        if frames.count % 50 == 0 {
          NSLog("[Repplay] focus v2 progress %ld samples, %.0f ms", frames.count, Date().timeIntervalSince(started) * 1000)
        }
        return true
      }
      if ballLed && !frames.isEmpty { scoreMotion(&frames, upTo: frames.count) }  // the last one: no next frame
    } else {
      NSLog("[Repplay] focus v2 start %@ model=vision (detector unavailable) sport=%@",
            (job.clipPath as NSString).lastPathComponent, job.sport)
      let request = VNDetectHumanRectanglesRequest()
      request.upperBodyOnly = false
      frames = []
      _ = try readFrames(job, startMs: job.startMs, endMs: job.endMs, size: nil) { t, pixels -> Bool in
        try VNImageRequestHandler(cvPixelBuffer: pixels, orientation: orientation).perform([request])
        // Vision: normalized, origin bottom-left, in the upright picture (the orientation above).
        let people = (request.results ?? []).filter { $0.confidence >= minConfidence }.map {
          let b = $0.boundingBox
          return FocusBox(x: Double(b.minX), y: Double(1 - b.maxY), width: Double(b.width), height: Double(b.height))
        }
        frames.append(Frame(tMs: t, people: people, balls: [], luma: nil, motion: nil))
        return true
      }
    }

    // Row k of the file is at startMs + k × 100 ms, whatever gaps the frames had. People carry over a gap; ball
    // candidates do not (a repeated candidate would look like a still ball).
    let ticks = FocusGrid.ticks(frameTimes: frames.map { $0.tMs }, startMs: job.startMs,
                                endMs: job.endMs > job.startMs ? job.endMs : .infinity, stepMs: stepMs)
    let samples = ticks.map { FocusSample(tMs: $0.tMs, boxes: frames[$0.people].people) }
    let balls: [[BallCandidate]] = ticks.map { t in
      guard let f = t.frame else { return [] }
      return frames[f].balls
    }
    let motion: [[Double?]?] = ticks.map { t in
      guard let f = t.frame else { return nil }
      return frames[f].motion
    }

    let landscape = width >= height
    let main: FocusAspect = landscape ? .landscape : .portrait
    let other: FocusAspect = landscape ? .portrait : .landscape
    let v2 = FocusV2.rects(plan: plan, samples: samples, balls: balls, motion: motion, videoWidth: width,
                           videoHeight: height, aspect: main)
    let mainRects = v2.rects
    let otherRects = mainRects == nil
      ? nil : FocusPath.compute(samples: samples, videoWidth: width, videoHeight: height, aspect: other, zoom: false)
    let model = detector == nil ? "vision" : FocusDetector.modelName

    var file: [String: Any] = [
      "v": 2, "stepMs": stepMs, "startMs": job.startMs, "size": [width, height], "model": model,
      "sport": job.sport, "follow": plan.follow.rawValue,
      "landscape": rows(landscape ? mainRects : otherRects),
      "portrait": rows(landscape ? otherRects : mainRects),
    ]
    var ballShare = 0.0
    if ballLed {
      // `Seguir: Jogadores` on a ball-led clip: the main shape framed by the players.
      if mainRects != nil {
        let players = FocusPath.compute(samples: samples, videoWidth: width, videoHeight: height, aspect: main,
                                        zoom: true, maxZoom: plan.maxZoom, tuning: .players)
        if players != nil { file["players"] = rows(players) }
      }
      file["ball"] = v2.track.map { [r4($0.x), r4($0.y), Double($0.state.rawValue), r4($0.conf)] }
      let found = v2.track.filter { $0.state == .seen || $0.state == .predicted }.count
      ballShare = v2.track.isEmpty ? 0 : Double(found) / Double(v2.track.count)
    }
    if job.debug {
      // The bench's detections shape (`focusbench/device.py` reads it back).
      file["samples"] = ticks.indices.map { k -> [String: Any] in
        [
          "t": ticks[k].tMs,
          "people": samples[k].boxes.map { [r4($0.x), r4($0.y), r4($0.width), r4($0.height)] },
          "balls": balls[k].map { [r4($0.x), r4($0.y), r4($0.r), r4($0.conf)] },
          "motion": motionJSON(motion[k]),
        ]
      }
      file["tiled"] = tiled
    }
    let data = try JSONSerialization.data(withJSONObject: file)
    try data.write(to: URL(fileURLWithPath: job.outPath), options: .atomic) // never a half-written file to read
    let elapsed = Date().timeIntervalSince(started) * 1000
    NSLog("[Repplay] focus v2 %@ %.0f ms model=%@ sport=%@ follow=%@ tiled=%@ frames=%ld ball=%.2f",
          (job.clipPath as NSString).lastPathComponent, elapsed, model, job.sport, plan.follow.rawValue,
          tiled ? "yes" : "no", frames.count, ballShare)
    let people = frames.reduce(0) { $0 + $1.people.count }
    return Outcome(ready: mainRects != nil, frames: frames.count,
                   framesWithPeople: frames.filter { !$0.people.isEmpty }.count,
                   meanPeople: frames.isEmpty ? 0 : Double(people) / Double(frames.count), elapsedMs: elapsed,
                   follow: plan.follow.rawValue, ballShare: ballShare, model: model)
  }

  /// Reads the first frame at or after each 100 ms tick between the two times and hands it to `body` (which keeps
  /// what it needs). A `body` that throws counts as a lost frame; more than 10% lost means Vision or Core ML could
  /// not run (app in the background) → `interrupted`. Returns what `body` returned, in order.
  @discardableResult
  private static func readFrames<T>(_ job: Job, startMs: Double, endMs: Double, size: CGSize?,
                                    body: (Double, CVPixelBuffer) throws -> T) throws -> [T] {
    let reader = try AVAssetReader(asset: job.asset)
    var settings: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    ]
    if let s = size {
      settings[kCVPixelBufferWidthKey as String] = Int(s.width)
      settings[kCVPixelBufferHeightKey as String] = Int(s.height)
    }
    let output = AVAssetReaderTrackOutput(track: job.track, outputSettings: settings)
    output.alwaysCopiesSampleData = false
    reader.add(output)
    if endMs > startMs {
      reader.timeRange = CMTimeRange(start: CMTime(seconds: startMs / 1000, preferredTimescale: 600),
                                     end: CMTime(seconds: endMs / 1000, preferredTimescale: 600))
    }
    guard reader.startReading() else { throw Failure.unreadable }
    var out: [T] = []
    var failures = 0
    var next = startMs
    while let buffer = output.copyNextSampleBuffer() {
      if isCancelled(job.clipPath) { reader.cancelReading(); throw Failure.cancelled }
      let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds * 1000
      if t + 0.5 < next { continue } // keep the first frame at or after each 100 ms tick
      while next <= t + 0.5 { next += stepMs }
      guard let pixels = CMSampleBufferGetImageBuffer(buffer) else { continue }
      let value: T? = autoreleasepool {
        do { return try body(t, pixels) } catch { return nil }
      }
      if let v = value { out.append(v) } else { failures += 1 }
    }
    if reader.status == .failed { throw Failure.unreadable }
    if failures * 10 > (out.count + failures) { throw Failure.interrupted }
    return out
  }

  /// The decode size (stored orientation) with this long side, or nil when the clip is not larger (never upscaled).
  private static func decodeSize(_ natural: CGSize, longSide: Int) -> CGSize? {
    let long = max(natural.width, natural.height)
    guard long > CGFloat(longSide), long > 0 else { return nil }
    let scale = CGFloat(longSide) / long
    func even(_ v: CGFloat) -> CGFloat { CGFloat(Int((v * scale / 2).rounded()) * 2) }
    return CGSize(width: even(natural.width), height: even(natural.height))
  }

  /// The upright luma plane of a 420f buffer, for the motion score.
  private static func luma(_ pixels: CVPixelBuffer, _ orientation: StoredOrientation) -> LumaFrame? {
    CVPixelBufferLockBaseAddress(pixels, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
    guard CVPixelBufferGetPlaneCount(pixels) >= 1, let base = CVPixelBufferGetBaseAddressOfPlane(pixels, 0) else {
      return nil
    }
    let w = CVPixelBufferGetWidthOfPlane(pixels, 0), h = CVPixelBufferGetHeightOfPlane(pixels, 0)
    let row = CVPixelBufferGetBytesPerRowOfPlane(pixels, 0)
    let stored = UnsafeBufferPointer(start: base.assumingMemoryBound(to: UInt8.self), count: row * h)
    return LumaFrame.upright(stored: stored, width: w, height: h, bytesPerRow: row, orientation: orientation)
  }

  /// Scores frame `k − 1` once frame `k` is in (or the last one when `k == frames.count`), against its neighbours
  /// when they are one step apart, then drops the luma no later frame needs.
  private static func scoreMotion(_ frames: inout [Frame], upTo k: Int) {
    let i = k - 1
    guard i >= 0, i < frames.count, let current = frames[i].luma else {
      if i >= 0 && i < frames.count { frames[i].motion = frames[i].balls.map { _ in nil } }
      return
    }
    func near(_ a: Int, _ b: Int) -> Bool { abs(frames[a].tMs - frames[b].tMs) <= stepMs * 1.5 }
    let previous = i > 0 && near(i - 1, i) ? frames[i - 1].luma : nil
    let next = k < frames.count && near(i, k) ? frames[k].luma : nil
    frames[i].motion = frames[i].balls.map {
      MotionScore.score(previous: previous, current: current, next: next, x: $0.x, y: $0.y, r: $0.r)
    }
    if i > 0 { frames[i - 1].luma = nil }
    if k >= frames.count { frames[i].luma = nil }
  }

  /// A sample's motion scores for the debug file: null for none, and null for a candidate without a score.
  private static func motionJSON(_ scores: [Double?]?) -> Any {
    guard let all = scores else { return NSNull() }
    return all.map { s -> Any in
      if let v = s { return r4(v) }
      return NSNull()
    }
  }

  private static func rows(_ rects: [FocusRect]?) -> [[Double]] {
    (rects ?? []).map { [r4($0.x), r4($0.y), r4($0.width), r4($0.height)] }
  }

  private static func r4(_ v: Double) -> Double { (v * 10000).rounded() / 10000 }

  /// How to turn the stored frames upright, from the track's transform (the camera stores sensor-oriented frames).
  static func orientation(of t: CGAffineTransform) -> CGImagePropertyOrientation {
    if t.a == 0 && t.b == 1 && t.c == -1 && t.d == 0 { return .right }
    if t.a == 0 && t.b == -1 && t.c == 1 && t.d == 0 { return .left }
    if t.a == -1 && t.d == -1 { return .down }
    return .up
  }
}
