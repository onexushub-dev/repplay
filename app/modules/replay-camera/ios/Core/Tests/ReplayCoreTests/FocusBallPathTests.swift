import XCTest
@testable import ReplayCore

private func walkers(_ k: Int, around c: Double) -> [FocusBox] {  // 4 players near `c` that keep moving
  (0..<4).map { j in
    FocusBox(x: c - 0.15 + 0.1 * Double(j) + 0.01 * Double((k + 3 * j) % 7), y: 0.35, width: 0.04, height: 0.3)
  }
}

private func centre(_ r: FocusRect) -> Double { r.x + r.width / 2 }

private func inside(_ r: FocusRect) -> Bool {
  r.x >= -1e-9 && r.x + r.width <= 1 + 1e-9 && r.y >= -1e-9 && r.y + r.height <= 1 + 1e-9
}

final class FocusBallPathTests: XCTestCase {
  func test_matchesTheBenchOnTheBallFixtures() throws {
    for name in FocusV2Fixture.ballNames {
      let f = try FocusV2Fixture.load(name)
      let expected = try XCTUnwrap(f.rects, name)
      // The fixture's own track, so a tracker drift cannot hide here.
      let rects = try XCTUnwrap(FocusBallPath.compute(samples: f.samples, track: f.track, videoWidth: f.width,
                                                      videoHeight: f.height, aspect: f.aspect,
                                                      maxZoom: f.raw.maxZoom), name)
      XCTAssertEqual(rects.count, expected.count, name)
      for (i, (a, b)) in zip(rects, expected).enumerated() {
        XCTAssertEqual(a.x, b.x, accuracy: 1e-4, "\(name) sample \(i)")
        XCTAssertEqual(a.y, b.y, accuracy: 1e-4, "\(name) sample \(i)")
        XCTAssertEqual(a.width, b.width, accuracy: 1e-4, "\(name) sample \(i)")
        XCTAssertEqual(a.height, b.height, accuracy: 1e-4, "\(name) sample \(i)")
      }
    }
  }

  func test_noTrackFallsBackToThePlayersPath() throws {
    let f = try FocusV2Fixture.load("tennis-02")
    let lost = [BallRow](repeating: BallRow(x: 0, y: 0, state: .lost, conf: 0), count: f.samples.count)
    let players = FocusPath.compute(samples: f.samples, videoWidth: f.width, videoHeight: f.height, aspect: f.aspect,
                                    zoom: true, maxZoom: 3, tuning: .players)
    XCTAssertNotNil(players)
    XCTAssertEqual(FocusBallPath.compute(samples: f.samples, track: lost, videoWidth: f.width, videoHeight: f.height,
                                         aspect: f.aspect, maxZoom: 3), players)
    XCTAssertEqual(FocusBallPath.compute(samples: f.samples, track: [], videoWidth: f.width, videoHeight: f.height,
                                         aspect: f.aspect, maxZoom: 3), players, "a track that does not fit")
  }

  func test_clipEdgesAreHeldAndRectsStayInside() throws {
    // 10 s: players near x 0.3 for 3 s, moving to 0.7, staying there for the last 3 s. The ball is held near 0.3 for
    // the first 3 s, seen with the players while they move, lost for the last 3 s.
    let n = 100
    func around(_ k: Int) -> Double { k < 30 ? 0.3 : (k >= 70 ? 0.7 : 0.3 + 0.4 * Double(k - 30) / 40) }
    let samples = (0..<n).map { k in FocusSample(tMs: Double(k) * 100, boxes: walkers(k, around: around(k))) }
    let track = (0..<n).map { k -> BallRow in
      if k < 30 { return BallRow(x: 0.3, y: 0.5, state: .held, conf: 0) }
      if k < 70 { return BallRow(x: around(k), y: 0.5, state: .seen, conf: 0.6) }
      return BallRow(x: 0, y: 0, state: .lost, conf: 0)
    }
    let rects = try XCTUnwrap(FocusBallPath.compute(samples: samples, track: track, videoWidth: 1920,
                                                    videoHeight: 1080, aspect: .landscape, maxZoom: 3))
    let placed = try XCTUnwrap(FocusBallPath.placedRects(samples: samples, track: track, W: 1920, H: 1080,
                                                         aspect: .landscape, maxZoom: 3, tuning: .standard))
    // The bench: 0.0022 at the start and 0.0002 at the end; up to 0.028 in the middle, where the camera smooths.
    XCTAssertEqual(centre(rects[0]), centre(placed[0]), accuracy: 0.005, "the first crop is not dragged off the play")
    XCTAssertEqual(centre(rects[n - 1]), centre(placed[n - 1]), accuracy: 0.005, "nor the last")
    XCTAssertGreaterThan(zip(rects, placed).map { abs(centre($0) - centre($1)) }.max() ?? 0, 0.01, "it does smooth")
    XCTAssertTrue(rects.allSatisfy(inside))
  }

  func test_smoothRectsHoldsTheEdges() {
    let rects = (0..<40).map { k in FocusRect(x: k < 20 ? 0 : 0.6, y: 0.3, width: 0.4, height: 0.4) }
    let out = FocusBallPath.smoothRects(rects, sigmaMs: 600, stepMs: 100)
    XCTAssertEqual(out[0].x, 0, accuracy: 1e-9)
    XCTAssertEqual(out[39].x, 0.6, accuracy: 1e-9)
    XCTAssertTrue(out.allSatisfy(inside))
  }

  func test_theZoomCapIsRespected() throws {
    let f = try FocusV2Fixture.load("volley-01")
    for maxZoom in [1.5, 3.0] {
      let rects = try XCTUnwrap(FocusBallPath.compute(samples: f.samples, track: f.track, videoWidth: f.width,
                                                      videoHeight: f.height, aspect: f.aspect, maxZoom: maxZoom))
      for r in rects { XCTAssertGreaterThanOrEqual(r.width, 1 / maxZoom - 1e-9, "max \(maxZoom)") }
      XCTAssertTrue(rects.allSatisfy(inside), "max \(maxZoom)")
    }
  }
}
