import XCTest
@testable import ReplayCore

final class ThermalLadderTests: XCTestCase {
  func test_coolPhoneKeepsTheRequestedQuality() {
    var ladder = ThermalLadder(requested: "1080p60", state: .nominal, now: 0)
    XCTAssertEqual(ladder.quality, "1080p60")
    XCTAssertEqual(ladder.update(state: .fair, now: 10), .none)
    XCTAssertEqual(ladder.quality, "1080p60")
    XCTAssertFalse(ladder.degraded)
  }

  func test_seriousFirstHalvesTheFrameRateAndKeepsFullHD() {
    var ladder = ThermalLadder(requested: "1080p60", state: .nominal, now: 0)
    XCTAssertEqual(ladder.update(state: .serious, now: 100), .reconfigure("1080p30"))
    XCTAssertEqual(ladder.quality, "1080p30")
    XCTAssertTrue(ladder.degraded)
  }

  func test_720pOnlyAfterTwoMinutesStillSerious() {
    var ladder = ThermalLadder(requested: "1080p60", state: .nominal, now: 0)
    _ = ladder.update(state: .serious, now: 100)
    XCTAssertEqual(ladder.update(state: .serious, now: 100 + ThermalLadder.holdBeforeNextStep - 1), .none)
    XCTAssertEqual(ladder.update(state: .serious, now: 100 + ThermalLadder.holdBeforeNextStep), .reconfigure("720p30"))
    XCTAssertEqual(ladder.quality, "720p30")
    XCTAssertEqual(ladder.update(state: .serious, now: 10_000), .none) // nothing lower
  }

  func test_coolingDownResetsTheWaitButNeverStepsBackUp() {
    var ladder = ThermalLadder(requested: "1080p60", state: .nominal, now: 0)
    _ = ladder.update(state: .serious, now: 100)
    XCTAssertEqual(ladder.update(state: .fair, now: 150), .none)
    XCTAssertEqual(ladder.quality, "1080p30") // a step up would restart the writer again
    XCTAssertEqual(ladder.update(state: .serious, now: 200), .none) // the wait starts again
    XCTAssertEqual(ladder.update(state: .serious, now: 200 + ThermalLadder.holdBeforeNextStep), .reconfigure("720p30"))
  }

  func test_criticalStops() {
    var ladder = ThermalLadder(requested: "1080p60", state: .nominal, now: 0)
    XCTAssertEqual(ladder.update(state: .critical, now: 5), .stop)
  }

  func test_startingHotStartsOneStepDown() {
    let ladder = ThermalLadder(requested: "1080p60", state: .serious, now: 0)
    XCTAssertEqual(ladder.quality, "1080p30")
    XCTAssertTrue(ladder.degraded)
  }

  func test_higherQualitiesStepToFullHD30First() {
    XCTAssertEqual(ThermalLadder.step(below: "2160p30"), "1080p30")
    XCTAssertEqual(ThermalLadder.step(below: "1440p30"), "1080p30")
    XCTAssertEqual(ThermalLadder.step(below: "1080p60"), "1080p30")
    XCTAssertEqual(ThermalLadder.step(below: "1080p30"), "720p30")
    XCTAssertNil(ThermalLadder.step(below: "720p30"))
  }

  func test_aRequested30fpsRecordingGoesStraightTo720() {
    var ladder = ThermalLadder(requested: "1080p30", state: .nominal, now: 0)
    XCTAssertEqual(ladder.update(state: .serious, now: 1), .reconfigure("720p30"))
  }

  func test_stateFromProcessInfoRawValues() {
    XCTAssertEqual(ThermalLevel(rawValue: 0), .nominal)
    XCTAssertEqual(ThermalLevel(rawValue: 3), .critical)
    XCTAssertEqual(ThermalLevel.fair.name, "fair")
  }
}
