import Foundation
import XCTest
@testable import ReplayCore

private func pt(_ x: Double, _ y: Double, _ c: Double = 0.9) -> Point { Point(x: x, y: y, confidence: c) }

/// Shoulders at x 40/60 (shifted by dx) and y=50, nose at y=35; the wrists swing sideways above the head like a wave.
private func wavePose(_ t: Double, freq: Double = 2.0, amplitude: Double = 8.0, left: Bool = true, right: Bool = true,
                      wristY: Double = 12.0, jitter: Double = 0.0, dx: Double = 0.0) -> Pose {
  let swing = amplitude * sin(2 * Double.pi * freq * t)
  let lx = 60 + (left ? swing : 0.0) + dx
  let rx = 40 + (right ? swing : 0.0) + dx
  let j = jitter * sin(37.0 * t) // deterministic stand-in for detector noise
  return Pose(leftWrist: pt(lx + j, wristY), rightWrist: pt(rx - j, wristY), leftElbow: pt(lx, 30), rightElbow: pt(rx, 30),
              leftShoulder: pt(60 + dx, 50), rightShoulder: pt(40 + dx, 50), nose: pt(50 + dx, 35))
}

private func runWave(_ tracker: WaveTracker, from start: Double, to stop: Double, step: Double,
                     _ make: (Double) -> [Sighting]) -> [Double] {
  var fired: [Double] = []
  var i = 0
  while true {
    let t = start + Double(i) * step
    if t > stop + 1e-9 { break }
    if tracker.update(make(t), at: t) { fired.append(t) }
    i += 1
  }
  return fired
}

private func one(_ pose: Pose) -> [Sighting] { [Sighting(pose: pose, x: 0.5, y: 0.5)] }

final class WaveTrackerTests: XCTestCase {
  func test_wavingBothArms_firesOnce() {
    let fired = runWave(WaveTracker(), from: 0.0, to: 4.0, step: 0.125) { one(wavePose($0)) }
    XCTAssertEqual(fired.count, 1)
    XCTAssertLessThan(fired.first ?? 99, 2.0)
  }

  func test_waving_isFoundAtTheNormal4fpsRateToo() {
    let fired = runWave(WaveTracker(), from: 0.0, to: 4.0, step: 0.25) { one(wavePose($0, freq: 1.3)) }
    XCTAssertEqual(fired.count, 1)
  }

  func test_armsHeldStill_doNotWave() {
    let fired = runWave(WaveTracker(), from: 0.0, to: 5.0, step: 0.125) { one(wavePose($0, amplitude: 0.0, jitter: 0.6)) }
    XCTAssertEqual(fired, [])
  }

  func test_wavingWithTheHandsLow_doesNotFire() {
    let fired = runWave(WaveTracker(), from: 0.0, to: 5.0, step: 0.125) { one(wavePose($0, wristY: 70.0)) }
    XCTAssertEqual(fired, [])
  }

  func test_wavingWithOneArmOnly_doesNotFire() {
    let fired = runWave(WaveTracker(), from: 0.0, to: 5.0, step: 0.125) { one(wavePose($0, left: false)) }
    XCTAssertEqual(fired, [])
  }

  func test_aShortFlurry_doesNotFire() {
    let w = WaveTracker()
    let waving = runWave(w, from: 0.0, to: 0.6, step: 0.125) { one(wavePose($0)) }
    let calm = runWave(w, from: 0.75, to: 4.0, step: 0.125) { one(wavePose($0, wristY: 70.0)) }
    XCTAssertEqual(waving + calm, [])
  }

  func test_wavingOnAfterFiring_doesNotFireAgain() {
    let fired = runWave(WaveTracker(), from: 0.0, to: 9.0, step: 0.125) { one(wavePose($0)) }
    XCTAssertEqual(fired.count, 1)
  }

  func test_loweringTheArmsThenWavingAgain_firesAgain() {
    let w = WaveTracker()
    let first = runWave(w, from: 0.0, to: 2.5, step: 0.125) { one(wavePose($0)) }
    let down = runWave(w, from: 2.625, to: 4.0, step: 0.125) { one(wavePose($0, wristY: 70.0)) }
    let second = runWave(w, from: 4.125, to: 8.0, step: 0.125) { one(wavePose($0)) }
    XCTAssertEqual(first.count, 1)
    XCTAssertEqual(down, [])
    XCTAssertEqual(second.count, 1)
  }

  func test_oneDropoutInTheMiddleOfAWave_doesNotMatter() {
    let fired = runWave(WaveTracker(), from: 0.0, to: 3.0, step: 0.125) { t in
      abs(t - 0.875) < 1e-9 ? [] : one(wavePose(t))
    }
    XCTAssertEqual(fired.count, 1)
  }

  func test_theWaveIsFoundAmongOtherPlayers() {
    let still = wavePose(0.0, amplitude: 0.0)
    let fired = runWave(WaveTracker(), from: 0.0, to: 4.0, step: 0.125) { t in
      let people = [Sighting(pose: wavePose(t), x: 0.30, y: 0.5), Sighting(pose: still, x: 0.70, y: 0.5)]
      return Int(t / 0.125) % 2 == 0 ? people : Array(people.reversed()) // the order is not stable
    }
    XCTAssertEqual(fired.count, 1)
  }

  func test_twoPlayersEachDoingHalfAWave_doNotAddUp() {
    let fired = runWave(WaveTracker(), from: 0.0, to: 5.0, step: 0.125) { t in
      [Sighting(pose: wavePose(t, right: false), x: 0.30, y: 0.5), // only its left arm swings
       Sighting(pose: wavePose(t, left: false), x: 0.70, y: 0.5)]  // only its right arm swings
    }
    XCTAssertEqual(fired, [])
  }
}

final class WaveTrackerIdTests: XCTestCase {
  func test_trackedPlayersStandingCloseKeepTheirOwnSamples() { // gesture v2: ids, not positions, when known
    let still = wavePose(0, amplitude: 0.0)
    let fired = runWave(WaveTracker(), from: 0.0, to: 4.0, step: 0.125) { t in
      // Two players 0.05 apart (within matchDistance): only player 2 waves.
      [Sighting(pose: still, x: 0.50, y: 0.5, id: 1), Sighting(pose: wavePose(t), x: 0.55, y: 0.5, id: 2)]
    }
    XCTAssertEqual(fired.count, 1)
  }

  func test_halfAWaveEachByTwoTrackedPlayersDoesNotFire() {
    let fired = runWave(WaveTracker(), from: 0.0, to: 5.0, step: 0.125) { t in
      [Sighting(pose: wavePose(t, right: false), x: 0.50, y: 0.5, id: 1),
       Sighting(pose: wavePose(t, left: false), x: 0.52, y: 0.5, id: 2)]
    }
    XCTAssertEqual(fired, [])
  }
}
