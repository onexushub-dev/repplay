import CoreGraphics
import XCTest
@testable import ReplayCore

private func box(_ x: Double, _ y: Double, _ w: Double = 0.03, _ h: Double = 0.08) -> CGRect {
  CGRect(x: x, y: y, width: w, height: h)
}

final class PersonTracksTests: XCTestCase {
  func test_aPersonIsKeptWhileTheDetectorMissesThem() {
    let tracks = PersonTracks(keepSeconds: 3.0)
    tracks.update([box(0.5, 0.5)], at: 0)
    tracks.update([], at: 1.0)
    tracks.update([], at: 2.9)
    XCTAssertEqual(tracks.tracks.count, 1)
    tracks.update([], at: 3.1)
    XCTAssertEqual(tracks.tracks.count, 0)
  }

  func test_theSamePersonFoundAgainKeepsTheirIdAndTakesTheNewBox() {
    let tracks = PersonTracks()
    tracks.update([box(0.5, 0.5)], at: 0)
    let id = tracks.tracks[0].id
    tracks.update([box(0.51, 0.5)], at: 0.25)
    XCTAssertEqual(tracks.tracks.count, 1)
    XCTAssertEqual(tracks.tracks[0].id, id)
    XCTAssertEqual(Double(tracks.tracks[0].box.minX), 0.51, accuracy: 1e-9)
  }

  func test_aSmallPersonWhoMovedLessThanTheirHeightIsStillTheSamePerson() {
    let tracks = PersonTracks()
    tracks.update([box(0.50, 0.5)], at: 0)
    tracks.update([box(0.53, 0.5)], at: 0.25) // no overlap left, but the centre moved under 0.6 box heights
    XCTAssertEqual(tracks.tracks.count, 1)
  }

  func test_aSecondTrackOnTheSamePersonGoesWhenOnlyTheWholeBodyIsSeenAgain() { // 2026-10-27 field test
    let tracks = PersonTracks()
    let whole = box(0.40, 0.40, 0.10, 0.20), arms = box(0.42, 0.50, 0.10, 0.12) // 2/3 of `arms` inside `whole`
    tracks.update([whole, arms], at: 0)
    XCTAssertEqual(tracks.tracks.count, 2)
    tracks.update([whole], at: 0.25)
    XCTAssertEqual(tracks.tracks.count, 1)
    XCTAssertEqual(tracks.tracks[0].box, whole)
  }

  func test_aPersonDroppedForTimeIsRememberedAsLostThenForgotten() {
    let tracks = PersonTracks(keepSeconds: 3.0, lostSeconds: 10.0)
    let far = box(0.5, 0.6, 0.02, 0.05)
    tracks.update([far], at: 0)
    tracks.update([], at: 3.5)
    XCTAssertEqual(tracks.tracks.count, 0)
    XCTAssertEqual(tracks.lost.map { $0.box }, [far])
    tracks.update([], at: 13.0)
    XCTAssertEqual(tracks.lost.count, 1)
    tracks.update([], at: 13.6)
    XCTAssertEqual(tracks.lost.count, 0)
  }

  func test_aLostPlaceIsForgottenWhenSomeoneIsFoundThere() {
    let tracks = PersonTracks()
    let far = box(0.5, 0.6, 0.02, 0.05)
    tracks.update([far], at: 0)
    tracks.update([], at: 3.5)
    tracks.update([box(0.505, 0.6, 0.02, 0.05)], at: 5)
    XCTAssertEqual(tracks.lost.count, 0)
    XCTAssertEqual(tracks.tracks.count, 1)
  }

  func test_aPersonDroppedForMissesIsNotRemembered() { // a pole or a bag: nothing to look for
    let tracks = PersonTracks(maxMisses: 1)
    tracks.update([box(0.5, 0.6)], at: 0)
    tracks.posed(tracks.tracks[0].id, at: 0, found: false, raised: false)
    tracks.update([], at: 5)
    XCTAssertEqual(tracks.lost.count, 0)
  }

  func test_focusTargetsPutArmsUpFirstThenMissingThenLostAndSkipBigPeople() {
    let tracks = PersonTracks(keepSeconds: 3.0)
    let gone = box(0.1, 0.6, 0.02, 0.05), raised = box(0.4, 0.6, 0.02, 0.05), quiet = box(0.7, 0.6, 0.02, 0.05)
    let near = box(0.3, 0.1, 0.1, 0.4)
    tracks.update([gone], at: 0)
    tracks.update([raised, quiet, near], at: 3.5) // `gone` is now a lost place
    let up = tracks.tracks.first { $0.box == raised }.map { $0.id } ?? -1
    tracks.posed(up, at: 3.5, found: true, raised: true)
    XCTAssertEqual(tracks.focusTargets(5, at: 3.75), [raised, quiet, gone])
    XCTAssertEqual(tracks.focusTargets(1, at: 3.75), [raised])
    XCTAssertEqual(tracks.focusTargets(0, at: 3.75), [])
  }

  func test_twoPeopleApartAreTwoTracks() {
    let tracks = PersonTracks()
    tracks.update([box(0.2, 0.5), box(0.7, 0.5)], at: 0)
    XCTAssertEqual(tracks.tracks.count, 2)
  }

  func test_pickGivesEverybodyATurn() {
    let tracks = PersonTracks()
    tracks.update([box(0.1, 0.5), box(0.3, 0.5), box(0.5, 0.5), box(0.7, 0.5)], at: 0)
    let first = tracks.pick(2, at: 0).map(\.id)
    for id in first { tracks.posed(id, at: 0, found: true, raised: false) }
    let second = tracks.pick(2, at: 0.25).map(\.id)
    XCTAssertEqual(Set(first).intersection(second), [])
  }

  func test_pickPutsSomeoneWithTheArmsUpFirstEverySample() {
    let tracks = PersonTracks()
    tracks.update([box(0.1, 0.5), box(0.3, 0.5), box(0.5, 0.5, 0.01, 0.03)], at: 0) // the small one is far away
    let far = tracks.tracks[2].id
    for track in tracks.tracks { tracks.posed(track.id, at: 0, found: true, raised: track.id == far) }
    XCTAssertEqual(tracks.pick(1, at: 0.25).map(\.id), [far])
    tracks.posed(far, at: 0.25, found: true, raised: true)
    XCTAssertEqual(tracks.pick(1, at: 0.5).map(\.id), [far])
  }

  func test_somethingThePoseStepNeverFindsABodyInIsDropped() {
    let tracks = PersonTracks(maxMisses: 3)
    tracks.update([box(0.5, 0.5)], at: 0)
    let id = tracks.tracks[0].id
    tracks.posed(id, at: 0, found: false, raised: false)
    tracks.posed(id, at: 0.25, found: false, raised: false)
    XCTAssertEqual(tracks.tracks.count, 1)
    tracks.posed(id, at: 0.5, found: false, raised: false)
    XCTAssertEqual(tracks.tracks.count, 0)
  }

  func test_aBodyFoundResetsTheMisses() {
    let tracks = PersonTracks(maxMisses: 2)
    tracks.update([box(0.5, 0.5)], at: 0)
    let id = tracks.tracks[0].id
    tracks.posed(id, at: 0, found: false, raised: false)
    tracks.posed(id, at: 0.25, found: true, raised: false)
    tracks.posed(id, at: 0.5, found: false, raised: false)
    XCTAssertEqual(tracks.tracks.count, 1)
  }
}

final class PersonBoxesTests: XCTestCase {
  func test_mergeKeepsTheMostConfidentOfOverlappingBoxes() {
    let a = box(0.5, 0.5), b = box(0.505, 0.5)
    XCTAssertEqual(PersonBoxes.merge([(a, 0.6), (b, 0.9)]), [b])
  }

  func test_mergeKeepsTheWholeBodyOfAPersonCutByATileEdge() {
    let whole = box(0.5, 0.5, 0.04, 0.10), part = box(0.5, 0.55, 0.04, 0.05)
    XCTAssertEqual(PersonBoxes.merge([(whole, 0.7), (part, 0.9)]), [whole])
    XCTAssertEqual(PersonBoxes.merge([(whole, 0.9), (part, 0.7)]), [whole])
  }

  func test_mergeKeepsPeopleApart() {
    XCTAssertEqual(PersonBoxes.merge([(box(0.1, 0.5), 0.9), (box(0.6, 0.5), 0.8)]).count, 2)
  }
}

final class ScanTilesTests: XCTestCase {
  func test_theTilesCoverTheWholeFrame() {
    for x in stride(from: 0.01, to: 1.0, by: 0.07) {
      for y in stride(from: 0.01, to: 1.0, by: 0.07) {
        XCTAssertTrue(ScanTiles.regions.contains { $0.contains(CGPoint(x: x, y: y)) }, "\(x), \(y)")
      }
    }
  }

  func test_roundRobinVisitsEveryTile() {
    var seen: [CGRect] = []
    for i in 0..<5 { seen += ScanTiles.tiles(at: i, perSample: 2) }
    XCTAssertEqual(Set(seen.map { "\($0)" }).count, ScanTiles.regions.count)
  }

  func test_theMiddleRowComesFirst() {
    XCTAssertTrue(ScanTiles.tiles(at: 0, perSample: 3).allSatisfy { $0.minY == 0.25 })
  }

  func test_focusRegionLooksCloselyAroundAFarPersonInsideTheFrame() {
    let portrait = CGSize(width: 1080, height: 1920)
    let far = CGRect(x: 0.5, y: 0.5, width: 0.02, height: 0.05) // 96 px tall
    let r = ScanTiles.focusRegion(around: far, frame: portrait)
    XCTAssertEqual(Double(r.height), 0.2, accuracy: 1e-9)
    XCTAssertEqual(Double(r.width) * 1080, Double(r.height) * 1920, accuracy: 1) // square in pixels
    XCTAssertTrue(r.contains(CGPoint(x: far.midX, y: far.midY)))
    let corner = ScanTiles.focusRegion(around: CGRect(x: 0.98, y: 0.0, width: 0.02, height: 0.03), frame: portrait)
    XCTAssertTrue(CGRect(x: 0, y: 0, width: 1, height: 1).insetBy(dx: -1e-9, dy: -1e-9).contains(corner))
    XCTAssertEqual(Double(corner.height), 0.15, accuracy: 1e-9) // never smaller than 15% of the frame
  }

  func test_plausibleRejectsTinyFlatOrUnsureBoxes() {
    let frame = CGSize(width: 1920, height: 1080)
    let person = CGRect(x: 0.5, y: 0.5, width: 0.012, height: 0.06) // 23 x 65 px
    XCTAssertTrue(ScanTiles.plausible(person, confidence: 0.8, frame: frame))
    XCTAssertFalse(ScanTiles.plausible(person, confidence: 0.3, frame: frame))
    XCTAssertFalse(ScanTiles.plausible(CGRect(x: 0.5, y: 0.5, width: 0.005, height: 0.02), confidence: 0.9, frame: frame))
    XCTAssertFalse(ScanTiles.plausible(CGRect(x: 0.5, y: 0.5, width: 0.08, height: 0.06), confidence: 0.9, frame: frame))
  }
}
