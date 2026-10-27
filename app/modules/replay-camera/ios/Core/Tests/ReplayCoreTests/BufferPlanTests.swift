import XCTest
@testable import ReplayCore

final class BufferPlanTests: XCTestCase {
  func test_segmentsForTheWindow() {
    XCTAssertEqual(BufferPlan.segments(forSeconds: 60, segmentSeconds: 1), 60)
    XCTAssertEqual(BufferPlan.segments(forSeconds: 120, segmentSeconds: 1), 120)
    XCTAssertEqual(BufferPlan.segments(forSeconds: 120, segmentSeconds: 2), 60)
  }

  func test_theBitRateFollowsThePixelsAndTheFrameRate() {
    XCTAssertEqual(BufferPlan.videoBitRate(width: 1920, height: 1080, fps: 60), 10_000_000)
    XCTAssertEqual(BufferPlan.videoBitRate(width: 1920, height: 1080, fps: 30), 6_000_000)
    XCTAssertEqual(BufferPlan.videoBitRate(width: 3840, height: 2160, fps: 30), 24_000_000)
    // Smaller pictures (the 720p heat fallback) keep the Full HD rate, as before.
    XCTAssertEqual(BufferPlan.videoBitRate(width: 1280, height: 720, fps: 30), 6_000_000)
  }

  func test_partialSegmentsRoundUpAndBadInputFallsBackToOneMinute() {
    XCTAssertEqual(BufferPlan.segments(forSeconds: 61, segmentSeconds: 2), 31)
    XCTAssertEqual(BufferPlan.segments(forSeconds: 0, segmentSeconds: 1), 60)
  }
}
