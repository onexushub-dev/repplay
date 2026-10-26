import XCTest
@testable import ReplayCore

/// A Modo Foco v2 fixture (`Fixtures/v2/<clip>.json`, written by the bench: `python run.py fixtures`): the analyser's
/// samples and what the frozen bench computes from them. Shared by the Part 2 suites (BallFilter, BallTracker,
/// FocusPath players preset, FocusBallPath, FocusPolicy).
struct FocusV2Fixture {
  struct Raw: Decodable {
    struct Sample: Decodable {
      let t: Double
      let people: [[Double]]  // x, y, w, h, conf
      let balls: [[Double]]  // x, y, r, conf
      let motion: [Double?]?
    }
    let clip: String
    let sport: String
    let W: Double
    let H: Double
    let stepMs: Double
    let startMs: Double
    let maxZoom: Double
    let follow: String
    let ballSource: String?
    let samples: [Sample]
    let filtered: [[[Double]]]  // per sample, the tracker's input; [] for players sports
    let track: [[Double]]  // x, y, state (0 seen, 1 predicted, 2 held, 3 lost), conf; [] for players sports
    let rects: [[Double]]?
  }

  static let names = ["basket-v-corner-normal-01", "basket-v-corner-unavailable-01", "tennis-02", "volley-01"]
  static let ballNames = ["tennis-02", "volley-01"]

  let raw: Raw
  var name: String { raw.clip }
  var width: Double { raw.W }
  var height: Double { raw.H }
  var aspect: FocusAspect { raw.H >= raw.W ? .portrait : .landscape }

  /// People per sample, as `FocusPath` takes them.
  var samples: [FocusSample] {
    raw.samples.map { s in FocusSample(tMs: s.t, boxes: s.people.map(FocusV2Fixture.box)) }
  }
  var balls: [[BallCandidate]] { raw.samples.map { $0.balls.map(FocusV2Fixture.ball) } }
  var motion: [[Double?]?] { raw.samples.map { $0.motion } }
  var filtered: [[BallCandidate]] { raw.filtered.map { $0.map(FocusV2Fixture.ball) } }
  var rects: [FocusRect]? {
    guard let rs = raw.rects else { return nil }
    return rs.map { FocusRect(x: $0[0], y: $0[1], width: $0[2], height: $0[3]) }
  }

  static func box(_ v: [Double]) -> FocusBox { FocusBox(x: v[0], y: v[1], width: v[2], height: v[3]) }
  static func ball(_ v: [Double]) -> BallCandidate { BallCandidate(x: v[0], y: v[1], r: v[2], conf: v[3]) }

  static func load(_ name: String) throws -> FocusV2Fixture {
    let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures/v2"),
                            "missing Fixtures/v2/\(name).json")
    return FocusV2Fixture(raw: try JSONDecoder().decode(Raw.self, from: Data(contentsOf: url)))
  }
}
