import XCTest
@testable import ReplayCore

/// The bench's `tests/test_tracker.py` cases, one sample every 100 ms, plus the bench fixtures (spec §4.2, §13).
private let stepMs = 100.0

private func line(_ k: Int) -> (Double, Double) { (0.2 + 0.05 * Double(k), 0.5) }  // 0.5 frame widths / s

private func box(_ x: Double, _ y: Double, _ w: Double, _ h: Double) -> FocusBox {
  FocusBox(x: x, y: y, width: w, height: h)
}

private func tracked(_ n: Int, ball: ((Int) -> (Double, Double)?)? = nil, people: ((Int) -> [FocusBox])? = nil,
                     extra: ((Int) -> [BallCandidate])? = nil, hw: Double = 1) -> [BallRow] {
  var times: [Double] = [], balls: [[BallCandidate]] = [], boxes: [[FocusBox]] = []
  for k in 0..<n {
    var bs: [BallCandidate] = []
    if let f = ball, let p = f(k) { bs.append(BallCandidate(x: p.0, y: p.1, r: 0.01, conf: 0.6)) }
    if let f = extra { bs += f(k) }
    times.append(Double(k) * stepMs)
    balls.append(bs)
    if let f = people { boxes.append(f(k)) } else { boxes.append([]) }
  }
  return BallTracker.track(times: times, balls: balls, people: boxes, heightOverWidth: hw)
}

final class BallTrackerTests: XCTestCase {
  func test_aParabolaIsTracked() {
    func arc(_ k: Int) -> (Double, Double) {
      let t = Double(k) / 10
      return (0.2 + 0.4 * t, 0.8 - 2.4 * t + 3 * t * t)
    }
    let rows = tracked(15, ball: { k in arc(k) })
    XCTAssertEqual(rows.map { $0.state }, [BallState](repeating: .seen, count: 15))
    for (k, r) in rows.enumerated() {
      XCTAssertEqual(r.x, arc(k).0, accuracy: 0.01)
      XCTAssertEqual(r.y, arc(k).1, accuracy: 0.01)
    }
  }

  func test_aStraightPassIsTracked() {
    XCTAssertTrue(tracked(12, ball: { k in line(k) }).allSatisfy { $0.state == .seen })
  }

  func test_aStaticCandidateIsDropped() {
    XCTAssertTrue(tracked(40, ball: { _ in (0.7, 0.24) }).allSatisfy { $0.state == .lost })
  }

  func test_aShortGapIsPredicted() {
    let rows = tracked(14, ball: { k in (5..<10).contains(k) ? nil : line(k) })  // 0.5 s without candidates
    XCTAssertEqual(rows[5..<10].map { $0.state }, [BallState](repeating: .predicted, count: 5))
    for k in 5..<10 {
      XCTAssertEqual(rows[k].x, line(k).0, accuracy: 0.03)
      XCTAssertEqual(rows[k].y, 0.5, accuracy: 0.03)
    }
  }

  func test_aLongGapIsHeldByTheNearestPlayer() {
    func player(_ k: Int) -> FocusBox { box(0.52 + 0.002 * Double(k), 0.30, 0.06, 0.25) }  // nearest the last ball
    func far(_ k: Int) -> FocusBox { box(0.05 + 0.002 * Double(k), 0.30, 0.06, 0.25) }
    let rows = tracked(23, ball: { k in k < 8 ? line(k) : nil }, people: { k in [player(k), far(k)] })
    // Last seen at k = 7; predicted for 0.7 s (k 8...14), then held (k 15...22, before 3 s).
    XCTAssertTrue(rows[8..<15].allSatisfy { $0.state == .predicted })
    XCTAssertTrue(rows[15..<23].allSatisfy { $0.state == .held })
    XCTAssertEqual(rows[18].x, 0.55 + 0.002 * 18, accuracy: 1e-9)
    XCTAssertEqual(rows[18].y, 0.425, accuracy: 1e-9)
  }

  func test_aVeryLongGapIsLost() {
    let rows = tracked(55, ball: { k in k < 8 ? line(k) : nil },
                       people: { k in [box(0.52 + 0.002 * Double(k), 0.30, 0.06, 0.25)] })
    XCTAssertTrue(rows[(7 + 31)...].allSatisfy { $0.state == .lost })  // more than 3 s after the last sighting
  }

  func test_aMovingBallBeatsAStaticBall() {
    let rows = tracked(20, ball: { k in line(k) }, extra: { _ in [BallCandidate(x: 0.7, y: 0.24, r: 0.02, conf: 0.9)] })
    for (k, r) in rows.enumerated() {
      XCTAssertEqual(r.state, .seen)
      XCTAssertEqual(r.x, line(k).0, accuracy: 0.01)
    }
  }

  func test_nothingBeforeTheFirstSightingAndOneRowPerSample() {
    let rows = tracked(10, ball: { k in k >= 5 ? line(k) : nil })
    XCTAssertEqual(rows.count, 10)
    XCTAssertTrue(rows[..<5].allSatisfy { $0.state == .lost })
  }

  func test_heightIsMeasuredInFrameWidths() {
    // A portrait frame (H = 16/9 W): a jump of 0.05 in y is 0.089 widths, still one smooth vertical pass.
    let rows = tracked(12, ball: { k in (0.5, 0.2 + 0.05 * Double(k)) }, hw: 16.0 / 9.0)
    XCTAssertTrue(rows.allSatisfy { $0.state == .seen })
  }

  func test_anIntermittentStaticCandidateIsDropped() {
    let rows = tracked(40, ball: { k in k % 2 == 0 ? (0.964, 0.883) : nil })
    XCTAssertTrue(rows.allSatisfy { $0.state == .lost })
  }

  func test_onlyMovingPlayersHoldTheBall() {
    let mural = box(0.53, 0.28, 0.05, 0.2)  // closest to where the ball was last seen, but never moves
    func player(_ k: Int) -> FocusBox { box(0.20 + 0.01 * Double(k), 0.30, 0.06, 0.25) }
    let rows = tracked(30, ball: { k in k < 8 ? line(k) : nil }, people: { k in [mural, player(k)] })
    XCTAssertEqual(rows[20].state, .held)
    XCTAssertEqual(rows[20].x, player(20).x + 0.03, accuracy: 1e-9)
  }

  func test_noSamplesGiveNoRows() {
    XCTAssertEqual(BallTracker.track(times: [], balls: [], people: [], heightOverWidth: 0.5625), [])
  }

  func test_matchesTheBenchOnTheBallFixtures() throws {
    for name in FocusV2Fixture.ballNames {
      let f = try FocusV2Fixture.load(name)
      let rows = BallTracker.track(times: f.times, balls: f.filtered, people: f.samples.map { $0.boxes },
                                   heightOverWidth: f.height / f.width)
      let expected = f.track
      XCTAssertEqual(rows.count, expected.count, name)
      var wrongStates = 0
      for (i, (a, b)) in zip(rows, expected).enumerated() {
        if a.state != b.state {
          wrongStates += 1
          if wrongStates <= 5 { XCTFail("\(name) sample \(i): state \(a.state) vs bench \(b.state)") }
          continue
        }
        XCTAssertEqual(a.x, b.x, accuracy: 1e-4, "\(name) sample \(i)")
        XCTAssertEqual(a.y, b.y, accuracy: 1e-4, "\(name) sample \(i)")
      }
      XCTAssertEqual(wrongStates, 0, "\(name): samples whose state differs from the bench")
      XCTAssertGreaterThan(expected.filter { $0.state == .seen }.count, 0, name)
    }
  }
}
