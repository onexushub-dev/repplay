import XCTest
@testable import ReplayCore

final class ConcatPlanTests: XCTestCase {
  private let second: Int64 = 1_000_000

  func test_partsFollowEachOther() {
    let parts = [ConcatPart(videoUs: 2 * second, audioUs: 2 * second), ConcatPart(videoUs: 3 * second, audioUs: 3 * second)]
    let placed = ConcatPlan.layout(parts)
    XCTAssertEqual(placed.map { $0.startUs }, [0, 2 * second])
    XCTAssertEqual(placed.map { $0.videoUs }, [2 * second, 3 * second])
    XCTAssertEqual(ConcatPlan.totalUs(parts), 5 * second)
  }

  func test_aPartWithoutSoundLeavesASilentGapAndTheNextSoundLandsAtItsOwnStart() {
    let parts = [
      ConcatPart(videoUs: 2 * second, audioUs: 2 * second),
      ConcatPart(videoUs: 3 * second, audioUs: nil),
      ConcatPart(videoUs: 1 * second, audioUs: 1 * second),
    ]
    XCTAssertEqual(
      ConcatPlan.layout(parts).map { $0.audio },
      [.track(startUs: 0, durationUs: 2 * second), .silent, .track(startUs: 5 * second, durationUs: 1 * second)]
    )
  }

  func test_soundLongerThanItsPictureIsCutToThePicture() {
    let parts = [ConcatPart(videoUs: 2 * second, audioUs: 2_100_000)]
    XCTAssertEqual(ConcatPlan.layout(parts).map { $0.audio }, [.track(startUs: 0, durationUs: 2 * second)])
  }

  func test_aZeroLengthSoundCountsAsSilent() {
    let parts = [ConcatPart(videoUs: 2 * second, audioUs: 0)]
    XCTAssertEqual(ConcatPlan.layout(parts).map { $0.audio }, [.silent])
  }

  func test_noPartsIsAnEmptyTimeline() {
    XCTAssertEqual(ConcatPlan.layout([]), [])
    XCTAssertEqual(ConcatPlan.totalUs([]), 0)
  }
}
