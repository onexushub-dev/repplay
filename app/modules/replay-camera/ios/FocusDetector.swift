import CoreML
import Vision

/// The Modo Foco v2 detector (Part 3 plan, task 5): D-FINE-S (Core ML, image input) on the full frame and on tiles.
/// Vision orients the frame, crops each tile (`regionOfInterest`) and stretches it to the model's 640×640
/// (`.scaleFill`, D-FINE's own pre-processing); decoding, merging and the sample rules are ReplayCore's
/// `FocusDetection`. Missing model → `shared()` is nil and the analysis keeps v1's Vision people (decision 6).
final class FocusDetector {
  enum Failure: Error { case noOutput }

  private static let lock = NSLock()
  nonisolated(unsafe) private static var loaded: FocusDetector? // guarded by `lock`
  nonisolated(unsafe) private static var tried = false // guarded by `lock`

  /// "dfine_s" (written to the focus file as `model`).
  static let modelName = "dfine_s"

  private let model: VNCoreMLModel

  private init(model: VNCoreMLModel) { self.model = model }

  /// The detector, loaded once; nil when the model is missing or cannot load (logged once).
  static func shared() -> FocusDetector? {
    lock.lock(); defer { lock.unlock() }
    if tried { return loaded }
    tried = true
    guard let url = modelURL() else {
      NSLog("[Repplay] Modo Foco detector missing: FocusDetector.mlmodelc not in ReplayCameraModels.bundle")
      return nil
    }
    do {
      let config = MLModelConfiguration()
      config.computeUnits = .all
      loaded = FocusDetector(model: try VNCoreMLModel(for: try MLModel(contentsOf: url, configuration: config)))
    } catch {
      NSLog("[Repplay] Modo Foco detector failed to load: %@", String(describing: error))
    }
    return loaded
  }

  /// The pod's resource bundle sits next to the code (dynamic framework) or in the app (static, as this pod is).
  private static func modelURL() -> URL? {
    for host in [Bundle(for: FocusDetector.self), Bundle.main] {
      guard let bundleURL = host.url(forResource: "ReplayCameraModels", withExtension: "bundle"),
            let bundle = Bundle(url: bundleURL),
            let url = bundle.url(forResource: "FocusDetector", withExtension: "mlmodelc") else { continue }
      return url
    }
    return nil
  }

  /// Detections in the upright frame (0..1, origin top-left): the full frame alone when `tiles` is empty (a DETR needs
  /// no NMS), else the full frame and every tile merged (`FocusDetection.merge`).
  func detect(_ pixels: CVPixelBuffer, orientation: CGImagePropertyOrientation, tiles: [FocusRect]) throws -> [Detection] {
    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: orientation)
    let full = try pass(handler, tile: nil)
    if tiles.isEmpty { return full }
    var parts: [(tile: FocusRect, dets: [Detection])] = []
    for tile in tiles { parts.append((tile: tile, dets: try pass(handler, tile: tile))) }
    return FocusDetection.merge(full: full, tiled: parts)
  }

  /// One model run on the full frame or a tile; boxes in that tile's coordinates (0..1, top-left).
  private func pass(_ handler: VNImageRequestHandler, tile: FocusRect?) throws -> [Detection] {
    let request = VNCoreMLRequest(model: model)
    request.imageCropAndScaleOption = .scaleFill
    if let t = tile {
      // Vision's region is normalized in the oriented (upright) image with the origin bottom-left.
      request.regionOfInterest = CGRect(x: t.x, y: 1 - t.y - t.height, width: t.width, height: t.height)
    }
    try autoreleasepool { try handler.perform([request]) }
    var logits: MLMultiArray? = nil
    var boxes: MLMultiArray? = nil
    for case let o as VNCoreMLFeatureValueObservation in request.results ?? [] {
      if o.featureName == "output0" { logits = o.featureValue.multiArrayValue }
      if o.featureName == "output1" { boxes = o.featureValue.multiArrayValue }
    }
    guard let l = logits, let b = boxes else { throw Failure.noOutput }
    return FocusDetection.decodeDFine(logits: Self.floats(l), boxes: Self.floats(b))
  }

  /// The array's values in order (Core ML hands FP16 or FP32 back, usually contiguous).
  private static func floats(_ a: MLMultiArray) -> [Float] {
    let n = a.count
    let shape = a.shape.map { $0.intValue }
    var contiguous = true
    var expected = 1
    for (dim, stride) in zip(shape, a.strides.map { $0.intValue }).reversed() {
      if stride != expected { contiguous = false; break }
      expected *= dim
    }
    if contiguous {
      switch a.dataType {
      case .float32:
        return a.withUnsafeBufferPointer(ofType: Float.self) { Array($0.prefix(n)) }
      #if arch(arm64)
      case .float16:
        return a.withUnsafeBufferPointer(ofType: Float16.self) { $0.prefix(n).map { Float($0) } }
      #endif
      case .double:
        return a.withUnsafeBufferPointer(ofType: Double.self) { $0.prefix(n).map { Float($0) } }
      default:
        break
      }
    }
    // Slow path, any layout and type: walk the indices in row-major order.
    var out = [Float](repeating: 0, count: n)
    var index = [Int](repeating: 0, count: shape.count)
    for i in 0..<n {
      out[i] = a[index.map { NSNumber(value: $0) }].floatValue
      var d = shape.count - 1
      while d >= 0 {
        index[d] += 1
        if index[d] < shape[d] { break }
        index[d] = 0
        d -= 1
      }
    }
    return out
  }
}
