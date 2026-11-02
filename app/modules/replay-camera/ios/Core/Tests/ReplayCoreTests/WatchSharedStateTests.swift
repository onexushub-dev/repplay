import XCTest
@testable import ReplayCore

final class WatchSharedStateTests: XCTestCase {
  func testTheWidgetFindsTheWatchAppsGroup() {
    // The watch app and its widget share one group named after the watch app's bundle id.
    XCTAssertEqual(WatchSharedState.groupID(forBundleID: "app.reprize.mobile.watch"), "group.app.reprize.mobile.watch")
    XCTAssertEqual(WatchSharedState.groupID(forBundleID: "app.reprize.mobile.watch.widget"), "group.app.reprize.mobile.watch")
    XCTAssertEqual(WatchSharedState.groupID(forBundleID: "com.me.reprize.watch.widget"), "group.com.me.reprize.watch")
  }

  func testStateRoundTrips() {
    let cases: [WatchSharedState] = [
      WatchSharedState(recording: true, clipCount: 3, startedAtMs: 1_700_000_000_000),
      WatchSharedState(recording: false, clipCount: 0, startedAtMs: nil),
    ]
    for state in cases { XCTAssertEqual(WatchSharedState(dictionary: state.dictionary), state) }
  }

  func testNothingStoredMeansNotRecording() {
    XCTAssertEqual(WatchSharedState(dictionary: nil), WatchSharedState(recording: false, clipCount: 0, startedAtMs: nil))
    XCTAssertEqual(WatchSharedState(dictionary: ["junk": 1]), WatchSharedState(recording: false, clipCount: 0, startedAtMs: nil))
  }

  func testAStateWithoutAStartIsNotRecording() {
    // A timer needs a start: recording without one would show a clock that counts from 1970.
    let state = WatchSharedState(dictionary: ["recording": true, "clipCount": 2])
    XCTAssertFalse(state.recording)
  }
}
