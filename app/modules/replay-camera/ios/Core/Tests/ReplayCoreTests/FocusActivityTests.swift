import XCTest
@testable import ReplayCore

private let W = 1920.0, H = 1080.0

/// 100 ms samples for `seconds`, each with the boxes `at(i)` gives.
private func samples(_ seconds: Double, _ at: (Int) -> [FocusBox]) -> [FocusSample] {
  (0..<Int(seconds * 10)).map { FocusSample(tMs: Double($0) * 100, boxes: at($0)) }
}

private let spectator = FocusBox(x: 0.10, y: 0.50, width: 0.03, height: 0.10)
/// A spectator whose box jitters from frame to frame (as real boxes do): enough to escape the v13 pixel filter.
private func jittery(_ i: Int) -> FocusBox { FocusBox(x: 0.10 + (i % 2 == 0 ? 0.007 : -0.007), y: 0.50, width: 0.03, height: 0.10) }
private func player(_ i: Int, from x0: Double = 0.40, stillFor: Int = 0) -> FocusBox {
  FocusBox(x: x0 + 0.002 * Double(max(0, i - stillFor)), y: 0.45, width: 0.03, height: 0.10)
}

final class FocusActivityTests: XCTestCase {
  func test_someoneStillTheWholeTimeIsLeftOutAndAPlayerMovingCounts() {
    let s = samples(12) { [jittery($0), player($0)] }
    let people = FocusActivity.people(s, W: W, H: H, t: .action)
    for row in people {
      XCTAssertEqual(row.count, 1)
      XCTAssertEqual(row[0].box.y, 0.45)
    }
    XCTAssertGreaterThan(people[50][0].weight, 1.4) // ~0.36 body heights per second
  }

  func test_aPlayerInAReadyStanceForAFewSecondsStillCounts() {
    let s = samples(12) { [player($0, stillFor: 40)] } // still 4 s, then moves
    let people = FocusActivity.people(s, W: W, H: H, t: .action)
    XCTAssertEqual(people[10].count, 1)
    XCTAssertEqual(people[10][0].weight, 1, accuracy: 1e-9) // not moving yet: counts, with the lowest weight
    XCTAssertGreaterThan(people[80][0].weight, 1.4)
  }

  func test_someoneStillForLessThanTheSpectatorTimeCounts() {
    let s = samples(6) { _ in [spectator] }
    XCTAssertTrue(FocusActivity.people(s, W: W, H: H, t: .action).allSatisfy { $0.count == 1 })
  }

  func test_twoPeopleApartAreTwoTracks() {
    let s = samples(2) { [player($0), player($0, from: 0.70)] }
    XCTAssertEqual(FocusActivity.tracks(s, W: W, H: H, t: .action).count, 2)
  }

  func test_theActionFramingFollowsThePlayerNotTheBench() {
    let s = samples(12) { [jittery($0), player($0)] }
    let v13 = FocusPath.compute(samples: s, videoWidth: W, videoHeight: H, aspect: .landscape, zoom: true)!
    let v14 = FocusPath.compute(samples: s, videoWidth: W, videoHeight: H, aspect: .landscape, zoom: true, tuning: .action)!
    let mid = 60
    // v13 keeps the bench in the frame (its still filter misses it) and opens wide; v14 closes on the player.
    XCTAssertLessThan(v14[mid].width, v13[mid].width)
    let playerX = player(mid).x + player(mid).width / 2
    XCTAssertTrue(v14[mid].x <= playerX && playerX <= v14[mid].x + v14[mid].width)
    XCTAssertGreaterThan(v14[mid].x, spectator.x + spectator.width)
  }

  func test_standardTuningIsUnchanged() { // v13 stays available, the app picks .action
    XCTAssertFalse(FocusTuning.standard.activity)
    XCTAssertTrue(FocusTuning.action.activity && FocusTuning.action.activeSpread)
  }
}
