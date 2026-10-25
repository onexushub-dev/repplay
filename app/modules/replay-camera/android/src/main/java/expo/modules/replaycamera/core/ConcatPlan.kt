package expo.modules.replaycamera.core

/** One exported clip to join: how long its picture lasts and, if it has sound, how long the sound lasts. */
data class ConcatPart(val videoUs: Long, val audioUs: Long?)

sealed class AudioPlacement {
  /** The part's sound, placed at [startUs] on the joined timeline for [durationUs]. */
  data class Track(val startUs: Long, val durationUs: Long) : AudioPlacement()

  /** No sound for this stretch: the joined audio track is left empty here. */
  object Silent : AudioPlacement()
}

data class ConcatPlacement(val startUs: Long, val videoUs: Long, val audio: AudioPlacement)

/**
 * Where each exported clip lands in the joined video. Parts follow each other; sound never outlasts its own picture,
 * and a part without sound leaves a gap instead of shifting the sound of the parts after it.
 */
object ConcatPlan {
  fun layout(parts: List<ConcatPart>): List<ConcatPlacement> {
    var start = 0L
    return parts.map { part ->
      val length = part.audioUs
      val audio = if (length != null && length > 0) AudioPlacement.Track(start, minOf(length, part.videoUs)) else AudioPlacement.Silent
      ConcatPlacement(start, part.videoUs, audio).also { start += part.videoUs }
    }
  }

  fun totalUs(parts: List<ConcatPart>): Long = parts.sumOf { it.videoUs }
}
