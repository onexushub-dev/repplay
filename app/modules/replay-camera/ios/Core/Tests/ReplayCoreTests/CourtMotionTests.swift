import XCTest
@testable import ReplayCore

final class CourtMotionTests: XCTestCase {
  /// A 160 × 90 grey frame with bright rectangles `(x, y, w, h)`.
  private func frame(_ rects: [(Int, Int, Int, Int)], width: Int = 160, height: Int = 90) -> [Float] {
    var f = [Float](repeating: 80, count: width * height)
    for (x, y, w, h) in rects {
      for yy in y..<(y + h) { for xx in x..<(x + w) { f[yy * width + xx] = 200 } }
    }
    return f
  }

  func test_theFirstFrameAndAStillPictureAreZero() {
    var m = CourtMotion(width: 160, height: 90, tallAlongX: false)
    XCTAssertEqual(m.next(frame([(10, 10, 4, 8)])), 0)
    XCTAssertEqual(m.next(frame([(10, 10, 4, 8)])), 0)
  }

  func test_aSmallPlayerMovingCounts() {
    var m = CourtMotion(width: 160, height: 90, tallAlongX: false)
    _ = m.next(frame([(10, 10, 4, 8)]))
    XCTAssertGreaterThan(m.next(frame([(20, 10, 4, 8)])), 0.003)
  }

  func test_someoneTallWalkingPastTheCameraIsLeftOut() {
    var m = CourtMotion(width: 160, height: 90, tallAlongX: false)
    _ = m.next(frame([(10, 30, 20, 60)]))
    XCTAssertEqual(m.next(frame([(40, 30, 20, 60)])), 0)
  }

  func test_aPortraitClipMeasuresTallnessAlongTheBufferWidth() {
    // In buffer coordinates the person lies along x: 60 wide is tall in the upright picture.
    var portrait = CourtMotion(width: 160, height: 90, tallAlongX: true)
    _ = portrait.next(frame([(10, 10, 60, 15)]))
    XCTAssertEqual(portrait.next(frame([(10, 40, 60, 15)])), 0)
    var landscape = CourtMotion(width: 160, height: 90, tallAlongX: false)
    _ = landscape.next(frame([(10, 10, 60, 15)]))
    XCTAssertGreaterThan(landscape.next(frame([(10, 40, 60, 15)])), 0)
  }

  func test_aLightChangeOnTheWholePictureIsNotMotion() {
    var m = CourtMotion(width: 160, height: 90, tallAlongX: false)
    _ = m.next([Float](repeating: 80, count: 160 * 90))
    XCTAssertEqual(m.next([Float](repeating: 120, count: 160 * 90)), 0)
  }

  func test_specksAreNoise() {
    var m = CourtMotion(width: 160, height: 90, tallAlongX: false)
    _ = m.next(frame([]))
    XCTAssertEqual(m.next(frame([(50, 50, 1, 1), (100, 20, 1, 1)])), 0)
  }

  func test_blockSizeFitsTheUprightPictureIn160By90() {
    XCTAssertEqual(CourtMotion.blockSize(bufferWidth: 1920, bufferHeight: 1080, turned: false), 12)
    XCTAssertEqual(CourtMotion.blockSize(bufferWidth: 1920, bufferHeight: 1080, turned: true), 21)
    XCTAssertEqual(CourtMotion.blockSize(bufferWidth: 3840, bufferHeight: 2160, turned: false), 24)
  }

  func test_gridAveragesEachBlock() {
    var plane = [UInt8](repeating: 10, count: 8 * 4)
    for y in 0..<4 { for x in 4..<8 { plane[y * 8 + x] = 250 } }
    let g = plane.withUnsafeBytes { CourtMotion.grid(luma: $0, bytesPerRow: 8, bufferWidth: 8, bufferHeight: 4, block: 4) }
    XCTAssertEqual(g.width, 2)
    XCTAssertEqual(g.height, 1)
    XCTAssertEqual(g.cells, [10, 250])
  }
}
