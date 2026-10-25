import AVFoundation

/// Joins exported clips (same size and codec: they all come from `ClipExporter` with one frame) into one video.
/// `ConcatPlan` decides where each part and its sound land; a part without sound leaves a silent stretch.
enum VideoConcat {
  enum Failure: Error { case empty, noVideo, mismatch, export(Error?) }

  /// How the composition is built: picture and sound track by track (`ConcatPlan` places each), or clip by clip with
  /// whatever each file holds. The second is the plainer way and the fallback when AVFoundation refuses the first.
  private enum Build { case byTrack, byClip }

  static func concat(paths: [String], outPath: String) async throws -> (path: String, durationMs: Int) {
    guard !paths.isEmpty else { throw Failure.empty }
    // The assets stay referenced until the export ends: a track whose asset was released fails the export (-12780).
    var assets: [AVURLAsset] = []
    var videos: [AVAssetTrack] = []
    var sounds: [AVAssetTrack?] = []
    var parts: [ConcatPart] = []
    var firstSize: CGSize?
    var firstTransform = CGAffineTransform.identity
    for path in paths {
      let asset = AVURLAsset(url: URL(fileURLWithPath: path))
      guard let video = try await asset.loadTracks(withMediaType: .video).first else { throw Failure.noVideo }
      let size = try await video.load(.naturalSize)
      if let first = firstSize {
        if abs(first.width - size.width) > 0.5 || abs(first.height - size.height) > 0.5 { throw Failure.mismatch }
      } else {
        firstSize = size
        firstTransform = try await video.load(.preferredTransform)
      }
      let sound = try await asset.loadTracks(withMediaType: .audio).first
      var soundUs: Int64?
      if let sound = sound { soundUs = micros(try await sound.load(.timeRange).duration) }
      parts.append(ConcatPart(videoUs: micros(try await video.load(.timeRange).duration), audioUs: soundUs))
      assets.append(asset)
      videos.append(video)
      sounds.append(sound)
    }

    let out = URL(fileURLWithPath: outPath)
    try FileManager.default.createDirectory(at: out.deletingLastPathComponent(), withIntermediateDirectories: true)
    // Passthrough first (no quality loss, seconds), then a re-encoded join; each on both ways of building it.
    var lastError: Error?
    for build in [Build.byTrack, Build.byClip] {
      let composition = AVMutableComposition()
      do {
        switch build {
        case .byTrack: try placeByTrack(composition, videos: videos, sounds: sounds, parts: parts, transform: firstTransform)
        case .byClip: try placeByClip(composition, assets: assets, parts: parts)
        }
      } catch {
        lastError = error
        continue
      }
      for preset in [AVAssetExportPresetPassthrough, AVAssetExportPresetHighestQuality] {
        try? FileManager.default.removeItem(at: out)
        guard let session = AVAssetExportSession(asset: composition, presetName: preset) else { continue }
        session.outputURL = out
        session.outputFileType = .mp4
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
          session.exportAsynchronously { done.resume() }
        }
        if session.status == .completed {
          withExtendedLifetime(assets) {}
          return (out.path, Int(Double(ConcatPlan.totalUs(parts)) / 1000))
        }
        lastError = session.error
      }
    }
    try? FileManager.default.removeItem(at: out) // never leave a partial file behind
    throw Failure.export(lastError)
  }

  private static func placeByTrack(
    _ composition: AVMutableComposition, videos: [AVAssetTrack], sounds: [AVAssetTrack?], parts: [ConcatPart],
    transform: CGAffineTransform
  ) throws {
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    else { throw Failure.noVideo }
    videoTrack.preferredTransform = transform
    var soundTrack: AVMutableCompositionTrack?
    for (index, placed) in ConcatPlan.layout(parts).enumerated() {
      let at = time(placed.startUs)
      try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: time(placed.videoUs)), of: videos[index], at: at)
      if case let .track(_, length) = placed.audio, let source = sounds[index] {
        if soundTrack == nil {
          soundTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        }
        try soundTrack?.insertTimeRange(CMTimeRange(start: .zero, duration: time(length)), of: source, at: at)
      }
    }
  }

  private static func placeByClip(_ composition: AVMutableComposition, assets: [AVURLAsset], parts: [ConcatPart]) throws {
    for (index, placed) in ConcatPlan.layout(parts).enumerated() {
      try composition.insertTimeRange(
        CMTimeRange(start: .zero, duration: time(placed.videoUs)), of: assets[index], at: time(placed.startUs))
    }
  }

  private static func micros(_ t: CMTime) -> Int64 { Int64((t.seconds * 1_000_000).rounded()) }
  private static func time(_ us: Int64) -> CMTime { CMTime(value: us, timescale: 1_000_000) }
}
