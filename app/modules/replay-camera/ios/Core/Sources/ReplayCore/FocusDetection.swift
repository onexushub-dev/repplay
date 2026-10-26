import Foundation

/// One detector output in the frame (or tile) it was run on: 0..1, origin top-left. `cls`: COCO class index.
public struct Detection: Equatable {
  public var cls: Int
  public var conf: Double
  public var x: Double, y: Double, w: Double, h: Double
  public init(cls: Int, conf: Double, x: Double, y: Double, w: Double, h: Double) {
    self.cls = cls; self.conf = conf; self.x = x; self.y = y; self.w = w; self.h = h
  }
}

/// How a clip is cut into tiles (Part 3 plan, Global Constraints; defaults until the device timing).
public struct TilePlan: Equatable {
  /// Frames are decoded with this long side (never above the clip's own size).
  public var decodeLongSide: Int
  public var cols: Int
  public var rows: Int
  /// Ball-led sports always tile; players-framed ones only when the first second's people are small.
  public var alwaysTiles: Bool
  public init(decodeLongSide: Int, cols: Int, rows: Int, alwaysTiles: Bool) {
    self.decodeLongSide = decodeLongSide; self.cols = cols; self.rows = rows; self.alwaysTiles = alwaysTiles
  }
}

/// The detector's pure half (spec 2026-10-24 §4.1): D-FINE-S decoding, tiles, merge and the sample rules. Port of the
/// bench's `decode.py` / `detect.py`; `FocusDetectionTests` holds it to `Fixtures/v2/dfine-decode.json`.
public enum FocusDetection {
  public static let person = 0
  public static let ball = 32
  public static let peopleMin = 0.3
  public static let ballMin = 0.15
  public static let nmsIoU = 0.45
  public static let tileOverlap = 0.15
  /// Players-framed clips tile when the median person height of the first second is under this, at the 640 scale.
  public static let tileBelowPx = 48.0

  /// D-FINE-S raw heads for a stretched input → person and ball detections in the input's frame: sigmoid on the
  /// logits, the best `queries` (query, class) pairs, those scoring ≥ `ballMin`, best first (ties: the lower index).
  /// `logits`: queries × classes, row-major; `boxes`: queries × 4 (cx, cy, w, h, 0..1). No NMS (a DETR needs none).
  public static func decodeDFine(logits: [Float], boxes: [Float], queries: Int = 300,
                                 classes: Int = 80) -> [Detection] {
    guard queries > 0, classes > 0, logits.count >= queries * classes, boxes.count >= queries * 4 else { return [] }
    // Only pairs at or above `ballMin` can come out; when fewer than `queries` of them exist, the best-`queries` cut
    // keeps them all, so sorting that subset gives exactly the full ranking's result.
    var pairs: [(index: Int, score: Double)] = []
    for i in 0..<(queries * classes) {
      let v = Double(logits[i])
      if v < -1.8 { continue }  // sigmoid(−1.8) < 0.15: cheap pre-filter, safely below the cut
      let s = 1 / (1 + exp(-v))
      if s >= ballMin { pairs.append((index: i, score: s)) }
    }
    pairs.sort { a, b in a.score > b.score || (a.score == b.score && a.index < b.index) }
    var out: [Detection] = []
    for p in pairs.prefix(queries) {
      let q = p.index / classes, c = p.index % classes
      guard c == person || c == ball else { continue }
      let cx = Double(boxes[q * 4]), cy = Double(boxes[q * 4 + 1])
      let bw = Double(boxes[q * 4 + 2]), bh = Double(boxes[q * 4 + 3])
      out.append(Detection(cls: c, conf: p.score, x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh))
    }
    return out
  }

  /// `n` segments covering 0..1, neighbours overlapping by `tileOverlap` of a segment; the last ends exactly at 1.
  static func axis(_ n: Int) -> [(start: Double, size: Double)] {
    guard n > 0 else { return [] }
    let size = 1 / (Double(n) - Double(n - 1) * tileOverlap)
    var out: [(start: Double, size: Double)] = []
    for i in 0..<(n - 1) { out.append((start: Double(i) * size * (1 - tileOverlap), size: size)) }
    out.append((start: 1 - size, size: size))
    return out
  }

  /// The tiles of a `cols` × `rows` grid, row by row, in frame coordinates.
  public static func tiles(cols: Int, rows: Int) -> [FocusRect] {
    var out: [FocusRect] = []
    for r in axis(rows) {
      for c in axis(cols) { out.append(FocusRect(x: c.start, y: r.start, width: c.size, height: r.size)) }
    }
    return out
  }

  static func iou(_ a: Detection, _ b: Detection) -> Double {
    let ax2 = a.x + a.w, ay2 = a.y + a.h, bx2 = b.x + b.w, by2 = b.y + b.h
    let iw = max(0, min(ax2, bx2) - max(a.x, b.x))
    let ih = max(0, min(ay2, by2) - max(a.y, b.y))
    let inter = iw * ih
    let union = a.w * a.h + b.w * b.h - inter
    return union > 0 ? inter / union : 0
  }

  /// Per-class non-maximum suppression, the most confident first (ties: the earlier detection).
  public static func nms(_ dets: [Detection], iou threshold: Double = nmsIoU) -> [Detection] {
    let order = dets.indices.sorted { a, b in dets[a].conf > dets[b].conf || (dets[a].conf == dets[b].conf && a < b) }
    var keep: [Detection] = []
    for i in order {
      let d = dets[i]
      if keep.allSatisfy({ $0.cls != d.cls || iou($0, d) <= threshold }) { keep.append(d) }
    }
    return keep
  }

  /// The full-frame detections plus each tile's (in tile coordinates) put back into frame coordinates, then NMS.
  public static func merge(full: [Detection], tiled: [(tile: FocusRect, dets: [Detection])]) -> [Detection] {
    var all = full
    for part in tiled {
      let t = part.tile
      for d in part.dets {
        all.append(Detection(cls: d.cls, conf: d.conf, x: t.x + d.x * t.width, y: t.y + d.y * t.height,
                             w: d.w * t.width, h: d.h * t.height))
      }
    }
    return nms(all)
  }

  /// The sample rules: people at ≥ `peopleMin`, ball candidates at ≥ `ballMin` with r = (w + h · H / W) / 4 (frame
  /// widths). `width` and `height`: the frame's pixel size.
  public static func sample(_ dets: [Detection], width: Double,
                            height: Double) -> (people: [FocusBox], balls: [BallCandidate]) {
    var people: [FocusBox] = []
    var balls: [BallCandidate] = []
    for d in dets {
      if d.cls == person && d.conf >= peopleMin {
        people.append(FocusBox(x: d.x, y: d.y, width: d.w, height: d.h))
      } else if d.cls == ball && d.conf >= ballMin {
        let r = (d.w + d.h * height / width) / 4
        balls.append(BallCandidate(x: d.x + d.w / 2, y: d.y + d.h / 2, r: r, conf: d.conf))
      }
    }
    return (people, balls)
  }

  /// The tile grid and decode size for a clip (`shortSide` in pixels): up to 1080 → 3×2 (2×3 portrait) from a 1920 px
  /// decode; above → 4×3 (3×4) from 2560 px. Part 1 task 2 may change these.
  public static func tilePlan(shortSide: Double, portrait: Bool, ballLed: Bool) -> TilePlan {
    if shortSide <= 1080 {
      return TilePlan(decodeLongSide: 1920, cols: portrait ? 2 : 3, rows: portrait ? 3 : 2, alwaysTiles: ballLed)
    }
    return TilePlan(decodeLongSide: 2560, cols: portrait ? 3 : 4, rows: portrait ? 4 : 3, alwaysTiles: ballLed)
  }

  /// Players-framed clips: tile when the first second's people are small (or nobody was found: look closer).
  /// `heights`: the people's heights (0..1 of the frame height); `scale640`: pixels per frame height at the model's
  /// 640 scale (frame height × 640 / long side).
  public static func needsTiles(firstSecondPeopleHeights heights: [Double], scale640: Double) -> Bool {
    guard !heights.isEmpty else { return true }
    return FocusPath.median(heights) * scale640 < tileBelowPx
  }
}
