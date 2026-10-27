import AVFoundation
import UniformTypeIdentifiers

/// Encodes camera samples into 1s fragmented-MP4 segments and hands each finished one to `onSegment`.
/// File names carry the writer's `generation`, so segments of an old writer never collide with a new one's.
final class SegmentWriter: NSObject, AVAssetWriterDelegate {
  static let segmentSeconds = 1.0

  let generation: Int
  let initSegmentURL: URL
  /// The encoded picture, as the sensor delivers it (landscape): its short side is the clip's resolution.
  let width: Int
  let height: Int
  var onSegment: ((Segment, Int) -> Void)?
  var onFailure: ((Error?) -> Void)?
  /// Read once, at the first frame: the rotation players apply to this writer's video.
  var rotationDegrees: () -> Int = { 0 }

  private let writer: AVAssetWriter
  private let videoInput: AVAssetWriterInput
  private let audioInput: AVAssetWriterInput?
  private var sessionStart: CMTime?
  private var segmentIndex = 0
  private var reportedFailure = false

  /// `withAudio` must be false when the capture session has no microphone input:
  /// an input that never receives samples stalls the writer.
  init(width: Int, height: Int, fps: Int, withAudio: Bool, generation: Int) {
    self.generation = generation
    self.width = width
    self.height = height
    initSegmentURL = ReplayPaths.buffer.appendingPathComponent("init-\(generation).mp4")
    writer = AVAssetWriter(contentType: UTType(AVFileType.mp4.rawValue)!)
    writer.outputFileTypeProfile = .mpeg4AppleHLS
    writer.preferredOutputSegmentInterval = CMTime(seconds: Self.segmentSeconds, preferredTimescale: 600)

    videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: BufferPlan.videoBitRate(width: width, height: height, fps: fps),
        AVVideoMaxKeyFrameIntervalDurationKey: Self.segmentSeconds,
        AVVideoAllowFrameReorderingKey: false,
        AVVideoExpectedSourceFrameRateKey: fps,
      ],
    ])
    videoInput.expectsMediaDataInRealTime = true

    if withAudio {
      let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: 44_100,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 96_000,
      ])
      audio.expectsMediaDataInRealTime = true
      audioInput = audio
    } else {
      audioInput = nil
    }

    super.init()
    writer.add(videoInput)
    if let audioInput { writer.add(audioInput) }
    writer.delegate = self
  }

  /// Call from the capture queue only.
  func appendVideo(_ buffer: CMSampleBuffer) {
    let time = CMSampleBufferGetPresentationTimeStamp(buffer)
    if sessionStart == nil {
      videoInput.transform = CGAffineTransform(rotationAngle: CGFloat(rotationDegrees()) * .pi / 180)
      writer.initialSegmentStartTime = time
      guard writer.startWriting() else { return reportFailure() }
      writer.startSession(atSourceTime: time)
      sessionStart = time
    }
    if videoInput.isReadyForMoreMediaData { videoInput.append(buffer) }
    if writer.status == .failed { reportFailure() }
  }

  /// Call from the capture queue only. Audio before the first video frame is dropped.
  func appendAudio(_ buffer: CMSampleBuffer) {
    guard sessionStart != nil, let audioInput, audioInput.isReadyForMoreMediaData else { return }
    audioInput.append(buffer)
  }

  func finish(completion: @escaping () -> Void) {
    guard sessionStart != nil, writer.status == .writing else { return completion() }
    videoInput.markAsFinished()
    audioInput?.markAsFinished()
    writer.finishWriting(completionHandler: completion)
  }

  private func reportFailure() {
    guard !reportedFailure else { return }
    reportedFailure = true
    onFailure?(writer.error)
  }

  func assetWriter(_ writer: AVAssetWriter, didOutputSegmentData segmentData: Data,
                   segmentType: AVAssetSegmentType, segmentReport: AVAssetSegmentReport?) {
    switch segmentType {
    case .initialization:
      try? segmentData.write(to: initSegmentURL)
    case .separable:
      let url = ReplayPaths.buffer.appendingPathComponent("\(generation)-\(segmentIndex).m4s")
      segmentIndex += 1
      guard (try? segmentData.write(to: url)) != nil else { return }
      let video = segmentReport?.trackReports.first { $0.mediaType == .video }
      let start = (video?.earliestPresentationTimeStamp ?? .zero) - (sessionStart ?? .zero)
      let duration = video?.duration.seconds ?? Self.segmentSeconds
      onSegment?(Segment(url: url, startTime: start.seconds, duration: duration), generation)
    @unknown default:
      break
    }
  }
}
