import XCTest
@testable import ReplayCore

/// `Fixtures/v2/dfine-decode.json` and `tiles.json` (bench `native_fixtures.py`): D-FINE-S on a Repplay frame, full
/// frame and 2×3 tiles, decoded and merged by the bench in float64 from exactly what the file stores.
private struct DecodeFixture: Decodable {
  struct Pass: Decodable {
    let kind: String
    let tile: [Double]
    let logits: [[Double]]  // sparse: query, class, logit
    let boxes: [String: [Double]]  // sparse: query → cx, cy, w, h
  }
  let width: Double
  let height: Double
  let cols: Int
  let rows: Int
  let sparseFill: Double
  let passes: [Pass]
  let decoded: [[[Double]]]  // per pass: cls, conf, x, y, w, h
  let merged: [[Double]]
  let people: [[Double]]  // x, y, w, h, conf
  let balls: [[Double]]  // x, y, r, conf
}

private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
  let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures/v2"))
  return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
}

/// The dense heads as the bench rebuilt them (float32, as Core ML hands them over).
private func dense(_ p: DecodeFixture.Pass, fill: Double) -> (logits: [Float], boxes: [Float]) {
  var logits = [Float](repeating: Float(fill), count: 300 * 80)
  for e in p.logits { logits[Int(e[0]) * 80 + Int(e[1])] = Float(e[2]) }
  var boxes = [Float](repeating: 0, count: 300 * 4)
  for (q, b) in p.boxes {
    guard let i = Int(q) else { continue }
    for k in 0..<4 { boxes[i * 4 + k] = Float(b[k]) }
  }
  return (logits, boxes)
}

private func detection(_ v: [Double]) -> Detection {
  Detection(cls: Int(v[0]), conf: v[1], x: v[2], y: v[3], w: v[4], h: v[5])
}

private func assertSame(_ a: [Detection], _ b: [Detection], _ what: String, file: StaticString = #filePath,
                        line: UInt = #line) {
  XCTAssertEqual(a.count, b.count, what, file: file, line: line)
  for (i, (x, y)) in zip(a, b).enumerated() {
    XCTAssertEqual(x.cls, y.cls, "\(what) #\(i)", file: file, line: line)
    for (u, v) in [(x.conf, y.conf), (x.x, y.x), (x.y, y.y), (x.w, y.w), (x.h, y.h)] {
      XCTAssertEqual(u, v, accuracy: 1e-9, "\(what) #\(i)", file: file, line: line)
    }
  }
}

final class FocusDetectionTests: XCTestCase {
  func test_decodeMatchesTheBenchOnEveryPass() throws {
    let f = try fixture("dfine-decode", as: DecodeFixture.self)
    XCTAssertEqual(f.passes.count, 1 + f.cols * f.rows)
    for (i, p) in f.passes.enumerated() {
      let heads = dense(p, fill: f.sparseFill)
      assertSame(FocusDetection.decodeDFine(logits: heads.logits, boxes: heads.boxes), f.decoded[i].map(detection),
                 "pass \(i) (\(p.kind))")
    }
  }

  func test_mergeAndSampleMatchTheBench() throws {
    let f = try fixture("dfine-decode", as: DecodeFixture.self)
    let decoded = f.decoded.map { $0.map(detection) }
    let tiled = (1..<f.passes.count).map { i -> (tile: FocusRect, dets: [Detection]) in
      let t = f.passes[i].tile
      return (tile: FocusRect(x: t[0], y: t[1], width: t[2], height: t[3]), dets: decoded[i])
    }
    let merged = FocusDetection.merge(full: decoded[0], tiled: tiled)
    assertSame(merged, f.merged.map(detection), "merged")
    let s = FocusDetection.sample(merged, width: f.width, height: f.height)
    XCTAssertEqual(s.people.count, f.people.count)
    for (a, b) in zip(s.people, f.people) {
      XCTAssertEqual(a.x, b[0], accuracy: 1e-9); XCTAssertEqual(a.y, b[1], accuracy: 1e-9)
      XCTAssertEqual(a.width, b[2], accuracy: 1e-9); XCTAssertEqual(a.height, b[3], accuracy: 1e-9)
    }
    XCTAssertEqual(s.balls.count, f.balls.count)
    for (a, b) in zip(s.balls, f.balls) {
      XCTAssertEqual(a.x, b[0], accuracy: 1e-9); XCTAssertEqual(a.y, b[1], accuracy: 1e-9)
      XCTAssertEqual(a.r, b[2], accuracy: 1e-9); XCTAssertEqual(a.conf, b[3], accuracy: 1e-9)
    }
    XCTAssertGreaterThan(s.people.count, 0, "the sample frame has players")
  }

  func test_tilesMatchTheBench() throws {
    let f = try fixture("tiles", as: [String: [[Double]]].self)
    for (cols, rows) in [(3, 2), (2, 3), (4, 3), (3, 4)] {
      let expected = try XCTUnwrap(f["\(cols)x\(rows)"])
      let tiles = FocusDetection.tiles(cols: cols, rows: rows)
      XCTAssertEqual(tiles.count, expected.count)
      for (a, b) in zip(tiles, expected) {
        XCTAssertEqual(a.x, b[0], accuracy: 1e-12); XCTAssertEqual(a.y, b[1], accuracy: 1e-12)
        XCTAssertEqual(a.width, b[2], accuracy: 1e-12); XCTAssertEqual(a.height, b[3], accuracy: 1e-12)
      }
      XCTAssertEqual(tiles.last.map { $0.x + $0.width } ?? 0, 1, accuracy: 1e-12, "the last tile ends at the edge")
    }
  }

  func test_nmsKeepsTheBestOfAnOverlapAndEveryClass() {
    let a = Detection(cls: 0, conf: 0.9, x: 0.1, y: 0.1, w: 0.2, h: 0.4)
    let b = Detection(cls: 0, conf: 0.6, x: 0.11, y: 0.1, w: 0.2, h: 0.4)  // overlaps a: dropped
    let c = Detection(cls: 32, conf: 0.5, x: 0.11, y: 0.1, w: 0.2, h: 0.4)  // same place, another class: kept
    let d = Detection(cls: 0, conf: 0.7, x: 0.6, y: 0.1, w: 0.2, h: 0.4)  // elsewhere: kept
    XCTAssertEqual(FocusDetection.nms([b, c, a, d]), [a, d, c])
  }

  func test_tilePlan() {
    let cases: [(Double, Bool, Bool, TilePlan)] = [
      (1080, false, true, TilePlan(decodeLongSide: 1920, cols: 3, rows: 2, alwaysTiles: true)),
      (1080, true, false, TilePlan(decodeLongSide: 1920, cols: 2, rows: 3, alwaysTiles: false)),
      (720, false, false, TilePlan(decodeLongSide: 1920, cols: 3, rows: 2, alwaysTiles: false)),
      (1440, false, true, TilePlan(decodeLongSide: 2560, cols: 4, rows: 3, alwaysTiles: true)),
      (2160, true, true, TilePlan(decodeLongSide: 2560, cols: 3, rows: 4, alwaysTiles: true)),
    ]
    for (short, portrait, ball, expected) in cases {
      XCTAssertEqual(FocusDetection.tilePlan(shortSide: short, portrait: portrait, ballLed: ball), expected)
    }
  }

  func test_smallOrMissingPeopleAskForTiles() {
    let scale = 1920.0 * 640 / 1920  // a portrait 1080×1920 frame: 640 px per frame height
    XCTAssertTrue(FocusDetection.needsTiles(firstSecondPeopleHeights: [], scale640: scale))
    XCTAssertTrue(FocusDetection.needsTiles(firstSecondPeopleHeights: [0.05, 0.06, 0.07], scale640: scale))  // ~38 px
    XCTAssertFalse(FocusDetection.needsTiles(firstSecondPeopleHeights: [0.1, 0.2, 0.3], scale640: scale))
  }
}
