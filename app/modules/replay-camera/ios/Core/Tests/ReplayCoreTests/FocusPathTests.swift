import XCTest
@testable import ReplayCore

/// Fixtures: the Modo Foco spike detections (docs/superpowers/spikes/focus-mode). People only, put on the analyser's
/// 100 ms grid with `FocusGrid`, as `FocusAnalyzer` does.
private struct Fixture {
  let name: String
  let samples: [FocusSample]
  let width: Double
  let height: Double
  var aspect: FocusAspect { name.hasPrefix("landscape") ? .landscape : .portrait }
  var other: FocusAspect { aspect == .landscape ? .portrait : .landscape }
}

private struct RawFile: Decodable {
  struct Frame: Decodable { let i: Int; let d: [Det] }
  struct Det: Decodable { let k: String; let box: [Double] }
  let W: Double
  let H: Double
  let frames: [Frame]
}

private let fixtureNames = [
  "landscape-basketball-halfcourt", "landscape-basketball-stream", "landscape-volleyball",
  "portrait-basketball-app-motion", "portrait-basketball-app-still", "portrait-beach-tennis",
]

private func loadFixture(_ name: String) throws -> Fixture {
  let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
  let raw = try JSONDecoder().decode(RawFile.self, from: Data(contentsOf: url))
  let frames = raw.frames.map { frame in
    FocusSample(tMs: Double(frame.i) / 30 * 1000, boxes: frame.d.filter { $0.k == "p" }.map {
      FocusBox(x: $0.box[0] / raw.W, y: $0.box[1] / raw.H, width: ($0.box[2] - $0.box[0]) / raw.W,
               height: ($0.box[3] - $0.box[1]) / raw.H)
    })
  }
  let samples = FocusGrid.samples(from: frames, startMs: 0, endMs: .infinity, stepMs: 100)
  return Fixture(name: name, samples: samples, width: raw.W, height: raw.H)
}

private func tracks(_ f: Fixture) throws -> [(FocusAspect, Bool, [FocusRect])] {
  let main = try XCTUnwrap(FocusPath.compute(samples: f.samples, videoWidth: f.width, videoHeight: f.height,
                                             aspect: f.aspect, zoom: true), f.name)
  let other = try XCTUnwrap(FocusPath.compute(samples: f.samples, videoWidth: f.width, videoHeight: f.height,
                                              aspect: f.other, zoom: false), f.name)
  return [(f.aspect, true, main), (f.other, false, other)]
}

private func person(_ cx: Double, _ cy: Double) -> FocusBox {
  FocusBox(x: cx - 0.03, y: cy - 0.1, width: 0.06, height: 0.2)
}

final class FocusPathTests: XCTestCase {
  func test_rectsStayInsideTheFrame() throws {
    for name in fixtureNames {
      for (aspect, _, rects) in try tracks(loadFixture(name)) {
        for r in rects {
          XCTAssertGreaterThanOrEqual(r.x, -1e-9, "\(name) \(aspect)")
          XCTAssertGreaterThanOrEqual(r.y, -1e-9, "\(name) \(aspect)")
          XCTAssertLessThanOrEqual(r.x + r.width, 1 + 1e-9, "\(name) \(aspect)")
          XCTAssertLessThanOrEqual(r.y + r.height, 1 + 1e-9, "\(name) \(aspect)")
        }
      }
    }
  }

  func test_theZoomNeverGoesPastTheMax() throws {
    for name in fixtureNames {
      let f = try loadFixture(name)
      let rects = try XCTUnwrap(FocusPath.compute(samples: f.samples, videoWidth: f.width, videoHeight: f.height,
                                                  aspect: f.aspect, zoom: true))
      for r in rects { XCTAssertGreaterThanOrEqual(r.width, 1 / 1.5 - 1e-9, name) }
    }
  }

  func test_thePanSpeedIsLimited() throws {
    for name in fixtureNames {
      for (aspect, _, rects) in try tracks(loadFixture(name)) {
        for i in 1..<rects.count {
          let a = rects[i - 1].x + rects[i - 1].width / 2, b = rects[i].x + rects[i].width / 2
          XCTAssertLessThanOrEqual(abs(b - a), 0.35 * 0.1 + 1e-6, "\(name) \(aspect) at \(i)")
        }
      }
    }
  }

  func test_rectsHaveTheAspectInPixels() throws {
    for name in fixtureNames {
      let f = try loadFixture(name)
      for (aspect, _, rects) in try tracks(f) {
        let want = aspect == .landscape ? 16.0 / 9.0 : 9.0 / 16.0
        for r in rects { XCTAssertEqual(r.width * f.width / (r.height * f.height), want, accuracy: 1e-6, name) }
      }
    }
  }

  func test_spectatorsInTheStandsDoNotPullTheFraming() throws {
    // The stands are on the right of this video: without the still filter the mean centre is ~0.50, with it ~0.46.
    let f = try loadFixture("landscape-basketball-stream")
    let rects = try XCTUnwrap(FocusPath.compute(samples: f.samples, videoWidth: f.width, videoHeight: f.height,
                                                aspect: .landscape, zoom: true))
    let mean = rects.map { $0.x + $0.width / 2 }.reduce(0, +) / Double(rects.count)
    XCTAssertLessThan(mean, 0.48)
  }

  func test_nobodyMeansNoFraming() {
    let empty = (0..<50).map { FocusSample(tMs: Double($0) * 100, boxes: []) }
    XCTAssertNil(FocusPath.compute(samples: empty, videoWidth: 1920, videoHeight: 1080, aspect: .landscape, zoom: true))
  }

  func test_peopleInFewerThanAFifthOfTheSamplesMeansNoFraming() {
    func run(_ withPeople: Int) -> [FocusRect]? {
      let samples = (0..<50).map { i in
        // One player moving across, so the still filter keeps them.
        FocusSample(tMs: Double(i) * 100, boxes: i < withPeople ? [person(0.2 + Double(i) * 0.01, 0.5)] : [])
      }
      return FocusPath.compute(samples: samples, videoWidth: 1920, videoHeight: 1080, aspect: .landscape, zoom: true)
    }
    XCTAssertNil(run(9))
    XCTAssertNotNil(run(10))
  }

  func test_someoneStandingStillIsIgnored() throws {
    // A spectator still at the far left for 10 s; a player walking on the right. The framing follows the player.
    let samples = (0..<100).map { i in
      FocusSample(tMs: Double(i) * 100, boxes: [person(0.1, 0.5), person(0.6 + 0.2 * sin(Double(i) / 10), 0.5)])
    }
    let rects = try XCTUnwrap(FocusPath.compute(samples: samples, videoWidth: 1920, videoHeight: 1080,
                                                aspect: .landscape, zoom: true))
    // The rect (2/3 wide at the 1.5x cap) can only centre between 1/3 and 2/3. Without the filter it lags by ~0.16.
    for i in 30..<70 {
      let player = min(max(0.6 + 0.2 * sin(Double(i) / 10), 1.0 / 3), 2.0 / 3)
      XCTAssertEqual(rects[i].x + rects[i].width / 2, player, accuracy: 0.06, "at \(i)")
    }
  }

  func test_theOtherTrackUsesTheWholeHeightOfALandscapeVideo() throws {
    let f = try loadFixture("landscape-volleyball")
    let rects = try XCTUnwrap(FocusPath.compute(samples: f.samples, videoWidth: f.width, videoHeight: f.height,
                                                aspect: .portrait, zoom: false))
    for r in rects { XCTAssertEqual(r.height, 1, accuracy: 1e-9) }
  }

  // MARK: - Modo Foco v2 (spec §13.1 decisions 4 and 12)

  func test_playersPresetMatchesTheBench() throws {
    for name in ["basket-v-corner-normal-01", "basket-v-corner-unavailable-01"] {
      let f = try FocusV2Fixture.load(name)
      let expected = try XCTUnwrap(f.rects, name)
      let rects = try XCTUnwrap(FocusPath.compute(samples: f.samples, videoWidth: f.width, videoHeight: f.height,
                                                  aspect: f.aspect, zoom: true, maxZoom: f.raw.maxZoom,
                                                  tuning: .players), name)
      XCTAssertEqual(rects.count, expected.count, name)
      for (i, (a, b)) in zip(rects, expected).enumerated() {
        XCTAssertEqual(a.x, b.x, accuracy: 1e-6, "\(name) sample \(i)")
        XCTAssertEqual(a.y, b.y, accuracy: 1e-6, "\(name) sample \(i)")
        XCTAssertEqual(a.width, b.width, accuracy: 1e-6, "\(name) sample \(i)")
        XCTAssertEqual(a.height, b.height, accuracy: 1e-6, "\(name) sample \(i)")
      }
    }
  }

  func test_playersPresetChangesOnlyItsThreeValues() {
    let p = FocusTuning.players, s = FocusTuning.standard
    XCTAssertEqual(p.spreadScale, 1.1)
    XCTAssertEqual(p.spreadMargin, 0.10)
    XCTAssertEqual(p.sigmaXMs, 800)
    XCTAssertEqual(p.sigmaYMs, s.sigmaYMs)
    XCTAssertEqual(p.sigmaSizeMs, s.sigmaSizeMs)
    XCTAssertEqual(p.maxPanPerSecond, s.maxPanPerSecond)
    XCTAssertEqual(p.lift, s.lift)
    XCTAssertEqual(p.farShare, s.farShare)
    XCTAssertEqual(p.stillRadius, s.stillRadius)
  }

  func test_maxZoomByResolution() {
    XCTAssertEqual(FocusPath.maxZoom(shortSidePx: 1080), 1.5)
    XCTAssertEqual(FocusPath.maxZoom(shortSidePx: 1440), 2)
    XCTAssertEqual(FocusPath.maxZoom(shortSidePx: 2160), 3)
    XCTAssertEqual(FocusPath.maxZoom(shortSidePx: 4320), 3)
    XCTAssertEqual(FocusPath.maxZoom(shortSidePx: 607), 1)
    XCTAssertEqual(FocusPath.maxZoom(shortSidePx: 1215), 1215.0 / 720.0)
  }
}
