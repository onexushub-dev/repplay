import XCTest
@testable import ReplayCore

final class FocusPolicyTests: XCTestCase {
  func test_policyTable() {
    let cases: [(String, Double, FocusPlan)] = [
      ("tenis", 2160, FocusPlan(follow: .ball, ballSource: .detector, maxZoom: 3)),
      ("tenis", 1440, FocusPlan(follow: .ball, ballSource: .detector, maxZoom: 2)),
      ("volei", 2160, FocusPlan(follow: .ball, ballSource: .detector, maxZoom: 1.5)),
      ("voleiPraia", 1080, FocusPlan(follow: .ball, ballSource: .detector, maxZoom: 1.5)),
      ("volei", 900, FocusPlan(follow: .ball, ballSource: .detector, maxZoom: 1.25)),  // never above the source's cap
      ("basquete", 1080, FocusPlan(follow: .players, ballSource: nil, maxZoom: 1.5)),
      ("livre", 2160, FocusPlan(follow: .players, ballSource: nil, maxZoom: 3)),
      ("beachTennis", 2160, FocusPlan(follow: .players, ballSource: nil, maxZoom: 3)),
      ("tenisMesa", 2160, FocusPlan(follow: .players, ballSource: nil, maxZoom: 3)),
      ("futebol", 1080, FocusPlan(follow: .players, ballSource: nil, maxZoom: 1.5)),
      ("quadra", 2160, FocusPlan(follow: .players, ballSource: nil, maxZoom: 3)),  // saved before 2026-10-25
      ("xyz", 2160, FocusPlan(follow: .players, ballSource: nil, maxZoom: 3)),
      ("", 2160, FocusPlan(follow: .players, ballSource: nil, maxZoom: 3)),
    ]
    for (sport, short, expected) in cases {
      XCTAssertEqual(FocusPolicy.plan(sport: sport, shortSidePx: short), expected, "\(sport) \(short)")
    }
  }

  func test_endToEndOnAllFixtures() throws {
    for name in FocusV2Fixture.names {
      let f = try FocusV2Fixture.load(name)
      let plan = FocusPolicy.plan(sport: f.raw.sport, shortSidePx: min(f.width, f.height))
      XCTAssertEqual(plan.follow.rawValue, f.raw.follow, name)
      XCTAssertEqual(plan.ballSource.map { $0.rawValue }, f.raw.ballSource, name)
      XCTAssertEqual(plan.maxZoom, f.raw.maxZoom, accuracy: 1e-12, name)
      let out = FocusV2.rects(plan: plan, samples: f.samples, balls: f.balls, motion: f.motion, videoWidth: f.width,
                              videoHeight: f.height, aspect: f.aspect)
      let expected = try XCTUnwrap(f.rects, name)
      let rects = try XCTUnwrap(out.rects, name)
      XCTAssertEqual(rects.count, expected.count, name)
      for (i, (a, b)) in zip(rects, expected).enumerated() {
        XCTAssertEqual(a.x, b.x, accuracy: 1e-4, "\(name) sample \(i)")
        XCTAssertEqual(a.y, b.y, accuracy: 1e-4, "\(name) sample \(i)")
        XCTAssertEqual(a.width, b.width, accuracy: 1e-4, "\(name) sample \(i)")
        XCTAssertEqual(a.height, b.height, accuracy: 1e-4, "\(name) sample \(i)")
      }
      XCTAssertEqual(out.track.map { $0.state }, f.track.map { $0.state }, "\(name): track states")
      if plan.follow == .players { XCTAssertTrue(out.track.isEmpty, name) }
    }
  }

  func test_aBallSportWithNoCandidatesFramesThePlayers() throws {
    let f = try FocusV2Fixture.load("tennis-02")
    let plan = FocusPolicy.plan(sport: "tenis", shortSidePx: 2160)
    let empty = [[BallCandidate]](repeating: [], count: f.samples.count)
    let out = FocusV2.rects(plan: plan, samples: f.samples, balls: empty, motion: nil, videoWidth: f.width,
                            videoHeight: f.height, aspect: f.aspect)
    let players = FocusPath.compute(samples: f.samples, videoWidth: f.width, videoHeight: f.height, aspect: f.aspect,
                                    zoom: true, maxZoom: 3, tuning: .players)
    XCTAssertEqual(out.rects, players)
    XCTAssertTrue(out.track.allSatisfy { $0.state == .lost })
  }
}
