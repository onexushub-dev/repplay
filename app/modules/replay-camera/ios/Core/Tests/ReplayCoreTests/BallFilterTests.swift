import XCTest
@testable import ReplayCore

private let person = FocusBox(x: 0.4, y: 0.2, width: 0.1, height: 0.4)

private func ball(_ x: Double, _ y: Double, conf: Double = 0.5) -> BallCandidate {
  BallCandidate(x: x, y: y, r: 0.004, conf: conf)
}

final class BallFilterTests: XCTestCase {
  func test_dropsTheFeetZoneAndUnsureBodyCandidates() {
    let feet = ball(0.45, 0.2 + 0.4 * 0.9, conf: 0.9)
    let bodySure = ball(0.45, 0.2 + 0.4 * 0.5, conf: 0.35)
    let bodyUnsure = ball(0.45, 0.2 + 0.4 * 0.5, conf: 0.25)
    let outside = ball(0.8, 0.5, conf: 0.16)
    let kept = BallFilter.apply([feet, bodySure, bodyUnsure, outside], people: [person], motion: nil)
    XCTAssertEqual(kept, [bodySure, outside])
  }

  func test_motionRuleKeepsCandidatesWithoutAScore() {
    let balls = [ball(0.1, 0.1), ball(0.2, 0.1), ball(0.3, 0.1)]
    XCTAssertEqual(BallFilter.apply(balls, people: [], motion: [3.9, 4.0, nil]), Array(balls[1...]))
    XCTAssertEqual(BallFilter.apply(balls, people: [], motion: nil), balls, "no scores at all: rule 1 is off")
  }

  func test_boxEdgesAreInside() {
    let left = ball(0.4, 0.2 + 0.4 * 0.9, conf: 0.9)
    let right = ball(0.5, 0.2 + 0.4 * 0.9, conf: 0.9)
    let bottom = ball(0.45, 0.6, conf: 0.9)
    XCTAssertEqual(BallFilter.apply([left, right, bottom], people: [person], motion: nil), [])
  }

  func test_firstBoxDecidesTheZone() {
    let shoe = ball(0.45, 0.2 + 0.4 * 0.9, conf: 0.9)  // feet of `person`, body of a taller box listed after it
    let taller = FocusBox(x: 0.4, y: 0.0, width: 0.1, height: 0.9)
    XCTAssertEqual(BallFilter.apply([shoe], people: [person, taller], motion: nil), [])
    XCTAssertEqual(BallFilter.apply([shoe], people: [taller, person], motion: nil), [shoe])
  }

  func test_matchesTheBenchOnTheBallFixtures() throws {
    for name in FocusV2Fixture.ballNames {
      let f = try FocusV2Fixture.load(name)
      let samples = f.samples, balls = f.balls, motion = f.motion, expected = f.filtered
      XCTAssertEqual(expected.count, samples.count, name)
      var kept = 0
      for i in samples.indices {
        let got = BallFilter.apply(balls[i], people: samples[i].boxes, motion: motion[i])
        XCTAssertEqual(got.count, expected[i].count, "\(name) sample \(i)")
        guard got.count == expected[i].count else { continue }
        for (a, b) in zip(got, expected[i]) {
          XCTAssertEqual(a.x, b.x, accuracy: 1e-9, "\(name) sample \(i)")
          XCTAssertEqual(a.y, b.y, accuracy: 1e-9, "\(name) sample \(i)")
          XCTAssertEqual(a.r, b.r, accuracy: 1e-9, "\(name) sample \(i)")
          XCTAssertEqual(a.conf, b.conf, accuracy: 1e-9, "\(name) sample \(i)")
        }
        kept += got.count
      }
      XCTAssertGreaterThan(kept, 0, "\(name): the fixture should keep some candidates")
    }
  }
}
