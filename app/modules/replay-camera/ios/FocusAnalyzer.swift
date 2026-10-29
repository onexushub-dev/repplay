import AVFoundation
import Vision

/// Modo Foco analysis: one frame every 100 ms between `startMs` and `endMs`, people found with Vision, the framing
/// computed by `FocusPath` and written next to the clip (<clip>.focus.json). One analysis at a time, at utility priority.
enum FocusAnalyzer {
  struct Outcome {
    let ready: Bool
    let frames: Int
    let framesWithPeople: Int
    let meanPeople: Double
    let elapsedMs: Double
  }

  /// `interrupted`: Vision kept failing, as it does with the app in the background; the analysis is redone later.
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

  static func analyze(clipPath: String, startMs: Double, endMs: Double, outPath: String, debug: Bool) async throws -> Outcome {
    let asset = AVURLAsset(url: URL(fileURLWithPath: clipPath))
    guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw Failure.noVideo }
    let transform = try await track.load(.preferredTransform)
    let natural = try await track.load(.naturalSize)
    return try await withCheckedThrowingContinuation { (done: CheckedContinuation<Outcome, Error>) in
      work.async {
        defer { clearCancel(clipPath) }
        do {
          done.resume(returning: try run(asset: asset, track: track, transform: transform, natural: natural,
                                         clipPath: clipPath, startMs: startMs, endMs: endMs, outPath: outPath, debug: debug))
        } catch {
          done.resume(throwing: error)
        }
      }
    }
  }

  private static func run(asset: AVAsset, track: AVAssetTrack, transform: CGAffineTransform, natural: CGSize,
                          clipPath: String, startMs: Double, endMs: Double, outPath: String, debug: Bool) throws -> Outcome {
    let started = Date()
    if isCancelled(clipPath) { throw Failure.cancelled }
    let orientation = Self.orientation(of: transform)
    let turned = orientation == .left || orientation == .right
    let width = Double(turned ? natural.height : natural.width), height = Double(turned ? natural.width : natural.height)

    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    ])
    output.alwaysCopiesSampleData = false
    reader.add(output)
    if endMs > startMs {
      reader.timeRange = CMTimeRange(start: CMTime(seconds: startMs / 1000, preferredTimescale: 600),
                                     end: CMTime(seconds: endMs / 1000, preferredTimescale: 600))
    }
    guard reader.startReading() else { throw Failure.unreadable }

    let request = VNDetectHumanRectanglesRequest()
    request.upperBodyOnly = false
    // v14: the same detector on the gesture's 9 half-frame regions as well, so far players are found (ScanTiles).
    // With a regionOfInterest the boxes still come back normalized to the whole frame.
    let tileRequests: [(request: VNDetectHumanRectanglesRequest, region: CGRect)] = ScanTiles.regions.map { region in
      let r = VNDetectHumanRectanglesRequest()
      r.upperBodyOnly = false
      r.regionOfInterest = region
      return (r, region)
    }
    let frameSize = CGSize(width: width, height: height)
    var frames: [FocusSample] = []
    // Cut suggestion (experiment): how much of the court moved, per analysed frame, as [clip ms, share of the picture].
    var motion: [[Double]] = []
    var meter: CourtMotion?
    var people = 0
    var failures = 0
    var next = startMs
    while let buffer = output.copyNextSampleBuffer() {
      if isCancelled(clipPath) { reader.cancelReading(); throw Failure.cancelled }
      let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds * 1000
      if t + 0.5 < next { continue } // keep the first frame at or after each 100 ms tick
      while next <= t + 0.5 { next += stepMs }
      guard let pixels = CMSampleBufferGetImageBuffer(buffer) else { continue }
      if let level = courtMotion(pixels, turned: turned, meter: &meter) { motion.append([t, level]) }
      let boxes: [FocusBox]? = autoreleasepool {
        do {
          try VNImageRequestHandler(cvPixelBuffer: pixels, orientation: orientation)
            .perform([request] + tileRequests.map { $0.request })
        } catch {
          return nil
        }
        // Vision: normalized, origin bottom-left, in the upright picture (the orientation above).
        let full = (request.results ?? []).filter { $0.confidence >= minConfidence }
          .map { (box: $0.boundingBox, confidence: Double($0.confidence)) }
        var tiles: [(box: CGRect, confidence: Double)] = []
        for (r, region) in tileRequests {
          for o in r.results ?? [] {
            let b = o.boundingBox
            guard region.insetBy(dx: -0.02, dy: -0.02).contains(CGPoint(x: b.midX, y: b.midY)),
                  ScanTiles.plausible(b, confidence: Double(o.confidence), frame: frameSize) else { continue }
            tiles.append((b, Double(o.confidence)))
          }
        }
        return PersonBoxes.merge(full + tiles).map {
          FocusBox(x: Double($0.minX), y: Double(1 - $0.maxY), width: Double($0.width), height: Double($0.height))
        }
      }
      guard let found = boxes else { failures += 1; continue }
      people += found.count
      frames.append(FocusSample(tMs: t, boxes: found))
    }
    if reader.status == .failed { throw Failure.unreadable }
    // A few lost frames are covered by the grid; many mean Vision could not run (app in the background).
    if failures * 10 > (frames.count + failures) { throw Failure.interrupted }
    // Row k of the file is at startMs + k × 100 ms, whatever gaps the frames had.
    let samples = FocusGrid.samples(from: frames, startMs: startMs, endMs: endMs > startMs ? endMs : .infinity, stepMs: stepMs)

    let landscape = width >= height
    let main: FocusAspect = landscape ? .landscape : .portrait
    let other: FocusAspect = landscape ? .portrait : .landscape
    let mainRects = FocusPath.compute(samples: samples, videoWidth: width, videoHeight: height, aspect: main, zoom: true,
                                      tuning: .action)
    let otherRects = mainRects == nil
      ? nil : FocusPath.compute(samples: samples, videoWidth: width, videoHeight: height, aspect: other, zoom: false,
                                tuning: .action)

    var file: [String: Any] = [
      "v": 1, "rules": "v15-acao-zoom110", "stepMs": stepMs, "startMs": startMs, "size": [width, height],
      "landscape": rows(landscape ? mainRects : otherRects),
      "portrait": rows(landscape ? otherRects : mainRects),
    ]
    file["motion"] = motion.map { [($0[0] * 10).rounded() / 10, ($0[1] * 100_000).rounded() / 100_000] }
    if debug {
      file["samples"] = samples.map { s in [s.tMs, s.boxes.map { [r4($0.x), r4($0.y), r4($0.width), r4($0.height)] }] as [Any] }
    }
    let data = try JSONSerialization.data(withJSONObject: file)
    try data.write(to: URL(fileURLWithPath: outPath), options: .atomic) // never a half-written file to read
    return Outcome(ready: mainRects != nil, frames: frames.count, framesWithPeople: frames.filter { !$0.boxes.isEmpty }.count,
                   meanPeople: frames.isEmpty ? 0 : Double(people) / Double(frames.count),
                   elapsedMs: Date().timeIntervalSince(started) * 1000)
  }

  /// The frame's luma in a small grid, compared with the last one (`CourtMotion`); nil when the frame has no luma plane.
  private static func courtMotion(_ pixels: CVPixelBuffer, turned: Bool, meter: inout CourtMotion?) -> Double? {
    guard CVPixelBufferGetPlaneCount(pixels) > 0 else { return nil }
    CVPixelBufferLockBaseAddress(pixels, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddressOfPlane(pixels, 0) else { return nil }
    let width = CVPixelBufferGetWidthOfPlane(pixels, 0), height = CVPixelBufferGetHeightOfPlane(pixels, 0)
    let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixels, 0)
    let block = CourtMotion.blockSize(bufferWidth: width, bufferHeight: height, turned: turned)
    let grid = CourtMotion.grid(luma: UnsafeRawBufferPointer(start: base, count: bytesPerRow * height), bytesPerRow: bytesPerRow,
                                bufferWidth: width, bufferHeight: height, block: block)
    if meter == nil || meter?.width != grid.width || meter?.height != grid.height {
      meter = CourtMotion(width: grid.width, height: grid.height, tallAlongX: turned)
    }
    return meter?.next(grid.cells)
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
