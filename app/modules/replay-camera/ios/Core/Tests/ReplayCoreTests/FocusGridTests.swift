import XCTest
@testable import ReplayCore

final class FocusGridTests: XCTestCase {
  private func box(_ x: Double) -> FocusBox { FocusBox(x: x, y: 0.4, width: 0.05, height: 0.2) }

  func test_oneSamplePerTickOnTheTickTime() {
    let frames = [0.0, 33, 66, 100, 133, 166, 200].map { FocusSample(tMs: $0, boxes: [box($0 / 1000)]) }
    let grid = FocusGrid.samples(from: frames, startMs: 0, endMs: 300, stepMs: 100)
    XCTAssertEqual(grid.map(\.tMs), [0, 100, 200])
    XCTAssertEqual(grid[1].boxes, [box(0.1)])
  }

  func test_aGapInTheFramesRepeatsTheLastPeopleSoLaterRowsKeepTheirTime() {
    // Frames stop between 100 and 400 ms (dropped while hot): rows 200 and 300 hold what was last seen.
    let frames = [0.0, 100, 400, 500].map { FocusSample(tMs: $0, boxes: [box($0 / 1000)]) }
    let grid = FocusGrid.samples(from: frames, startMs: 0, endMs: 600, stepMs: 100)
    XCTAssertEqual(grid.map(\.tMs), [0, 100, 200, 300, 400, 500])
    XCTAssertEqual(grid[2].boxes, [box(0.1)])
    XCTAssertEqual(grid[3].boxes, [box(0.1)])
    XCTAssertEqual(grid[4].boxes, [box(0.4)])
  }

  func test_aLateFirstFrameIsUsedForTheTicksBeforeIt() {
    let frames = [250.0, 300].map { FocusSample(tMs: $0, boxes: [box($0 / 1000)]) }
    let grid = FocusGrid.samples(from: frames, startMs: 0, endMs: 400, stepMs: 100)
    XCTAssertEqual(grid.map(\.tMs), [0, 100, 200, 300])
    XCTAssertEqual(grid[0].boxes, [box(0.25)])
    XCTAssertEqual(grid[2].boxes, [box(0.25)])
    XCTAssertEqual(grid[3].boxes, [box(0.3)])
  }

  func test_theGridStopsAtTheLastFrame() {
    let frames = [0.0, 100, 200].map { FocusSample(tMs: $0, boxes: []) }
    XCTAssertEqual(FocusGrid.samples(from: frames, startMs: 0, endMs: 10_000, stepMs: 100).count, 3)
  }

  func test_noFramesGiveNoSamples() {
    XCTAssertTrue(FocusGrid.samples(from: [], startMs: 0, endMs: 1000, stepMs: 100).isEmpty)
  }
}
