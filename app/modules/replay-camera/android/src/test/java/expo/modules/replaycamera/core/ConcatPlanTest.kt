package expo.modules.replaycamera.core

import org.junit.Assert.assertEquals
import org.junit.Test

class ConcatPlanTest {
  private val second = 1_000_000L

  @Test fun test_partsFollowEachOther() {
    val parts = listOf(ConcatPart(2 * second, 2 * second), ConcatPart(3 * second, 3 * second))
    val placed = ConcatPlan.layout(parts)
    assertEquals(listOf(0L, 2 * second), placed.map { it.startUs })
    assertEquals(listOf(2 * second, 3 * second), placed.map { it.videoUs })
    assertEquals(5 * second, ConcatPlan.totalUs(parts))
  }

  @Test fun test_aPartWithoutSoundLeavesASilentGapAndTheNextSoundLandsAtItsOwnStart() {
    val parts = listOf(
      ConcatPart(2 * second, 2 * second),
      ConcatPart(3 * second, null),
      ConcatPart(1 * second, 1 * second),
    )
    assertEquals(
      listOf(AudioPlacement.Track(0, 2 * second), AudioPlacement.Silent, AudioPlacement.Track(5 * second, 1 * second)),
      ConcatPlan.layout(parts).map { it.audio },
    )
  }

  @Test fun test_soundLongerThanItsPictureIsCutToThePicture() {
    val parts = listOf(ConcatPart(2 * second, 2_100_000L))
    assertEquals(listOf<AudioPlacement>(AudioPlacement.Track(0, 2 * second)), ConcatPlan.layout(parts).map { it.audio })
  }

  @Test fun test_aZeroLengthSoundCountsAsSilent() {
    val parts = listOf(ConcatPart(2 * second, 0L))
    assertEquals(listOf<AudioPlacement>(AudioPlacement.Silent), ConcatPlan.layout(parts).map { it.audio })
  }

  @Test fun test_noPartsIsAnEmptyTimeline() {
    assertEquals(emptyList<ConcatPlacement>(), ConcatPlan.layout(emptyList()))
    assertEquals(0L, ConcatPlan.totalUs(emptyList()))
  }
}
