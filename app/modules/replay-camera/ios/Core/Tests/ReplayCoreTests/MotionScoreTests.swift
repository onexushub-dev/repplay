import XCTest
@testable import ReplayCore

/// `Fixtures/v2/motion.json` (bench `native_fixtures.py`): three 64×48 grey frames with a moving blob and a patch
/// changing at the right edge, and the bench's scores for a few candidates.
private struct MotionFixture: Decodable {
  struct Candidate: Decodable {
    let x: Double, y: Double, r: Double
    let score: Double?
    let noPrevious: Double?
  }
  let width: Int
  let height: Int
  let frames: [[UInt8]]
  let candidates: [Candidate]
}

final class MotionScoreTests: XCTestCase {
  func test_matchesTheBench() throws {
    let url = try XCTUnwrap(Bundle.module.url(forResource: "motion", withExtension: "json",
                                              subdirectory: "Fixtures/v2"))
    let f = try JSONDecoder().decode(MotionFixture.self, from: Data(contentsOf: url))
    let frames = f.frames.map { LumaFrame(width: f.width, height: f.height, bytes: $0) }
    var moving = 0
    for c in f.candidates {
      let got = MotionScore.score(previous: frames[0], current: frames[1], next: frames[2], x: c.x, y: c.y, r: c.r)
      let expected = try XCTUnwrap(c.score)
      XCTAssertEqual(try XCTUnwrap(got), expected, accuracy: 1e-9, "candidate at \(c.x), \(c.y)")
      if expected > 4 { moving += 1 }
      XCTAssertNil(MotionScore.score(previous: nil, current: frames[1], next: frames[2], x: c.x, y: c.y, r: c.r))
      XCTAssertNil(c.noPrevious)
    }
    XCTAssertGreaterThan(moving, 0, "the fixture has a moving candidate")
  }

  func test_framesThatDoNotMatchGiveNoScore() {
    let a = LumaFrame(width: 4, height: 4, bytes: [UInt8](repeating: 10, count: 16))
    let b = LumaFrame(width: 5, height: 4, bytes: [UInt8](repeating: 10, count: 20))
    XCTAssertNil(MotionScore.score(previous: a, current: a, next: b, x: 0.5, y: 0.5, r: 0.1))
    XCTAssertEqual(MotionScore.score(previous: a, current: a, next: a, x: 0.5, y: 0.5, r: 0.1), 0)
  }

  func test_windowIsClampedAndHasAMinimumRadius() {
    XCTAssertTrue(MotionScore.window(width: 64, height: 48, x: 0, y: 0.999, r: 0.01) == (43, 48, 0, 5))
    XCTAssertTrue(MotionScore.window(width: 64, height: 48, x: 1.2, y: -0.1, r: 0.001) == (0, 5, 59, 64))
  }

  // MARK: - Upright luma (EXIF orientations)

  /// Stored 3 wide × 2 high, rows padded to 4 bytes: a b c · d e f (1…6), padding 0.
  private func turned(_ o: StoredOrientation) -> LumaFrame {
    let stored: [UInt8] = [1, 2, 3, 0, 4, 5, 6, 0]
    return stored.withUnsafeBufferPointer {
      LumaFrame.upright(stored: $0, width: 3, height: 2, bytesPerRow: 4, orientation: o)
    }
  }

  func test_uprightTurnsThePlaneAsExifSays() {
    let up = turned(.up)
    XCTAssertEqual([up.width, up.height], [3, 2]); XCTAssertEqual(up.bytes, [1, 2, 3, 4, 5, 6])
    let down = turned(.down)
    XCTAssertEqual(down.bytes, [6, 5, 4, 3, 2, 1])
    let right = turned(.right)  // a 90° turn clockwise: the left column, bottom to top, becomes the top row
    XCTAssertEqual([right.width, right.height], [2, 3]); XCTAssertEqual(right.bytes, [4, 1, 5, 2, 6, 3])
    let left = turned(.left)  // the other way: the right column, top to bottom, becomes the top row
    XCTAssertEqual([left.width, left.height], [2, 3]); XCTAssertEqual(left.bytes, [3, 6, 2, 5, 1, 4])
  }
}

