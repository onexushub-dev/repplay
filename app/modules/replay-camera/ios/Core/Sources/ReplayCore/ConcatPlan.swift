import Foundation

/// One exported clip to join: how long its picture lasts and, if it has sound, how long the sound lasts.
public struct ConcatPart: Equatable {
  public var videoUs: Int64
  public var audioUs: Int64?
  public init(videoUs: Int64, audioUs: Int64?) {
    self.videoUs = videoUs
    self.audioUs = audioUs
  }
}

public enum AudioPlacement: Equatable {
  /// The part's sound, placed at `startUs` on the joined timeline for `durationUs`.
  case track(startUs: Int64, durationUs: Int64)
  /// No sound for this stretch: the joined audio track is left empty here.
  case silent
}

public struct ConcatPlacement: Equatable {
  public var startUs: Int64
  public var videoUs: Int64
  public var audio: AudioPlacement
}

/// Where each exported clip lands in the joined video. Parts follow each other; sound never outlasts its own picture,
/// and a part without sound leaves a gap instead of shifting the sound of the parts after it.
public enum ConcatPlan {
  public static func layout(_ parts: [ConcatPart]) -> [ConcatPlacement] {
    var start: Int64 = 0
    return parts.map { part in
      defer { start += part.videoUs }
      let audio: AudioPlacement
      if let length = part.audioUs, length > 0 {
        audio = .track(startUs: start, durationUs: min(length, part.videoUs))
      } else {
        audio = .silent
      }
      return ConcatPlacement(startUs: start, videoUs: part.videoUs, audio: audio)
    }
  }

  public static func totalUs(_ parts: [ConcatPart]) -> Int64 {
    parts.reduce(0) { $0 + $1.videoUs }
  }
}
