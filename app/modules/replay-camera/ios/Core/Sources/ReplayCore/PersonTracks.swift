import CoreGraphics

/// The people the gesture detector knows about, kept between samples.
///
/// A far player flickers in and out of the person detector, and the tiles that find small people only scan one part
/// of the frame per sample. So each person found is kept for `keepSeconds` after the last time a detector saw them,
/// and the pose step runs on their last known box. Somebody making the gesture stands still, so a slightly stale box
/// is still on them.
///
/// Boxes are normalized with the origin at the bottom-left (Vision).
public final class PersonTracks {
  public struct Track: Equatable {
    public let id: Int
    public var box: CGRect
    public var lastSeen: Double
    /// Last time the pose step ran on this person (-infinity: never), so everybody gets a turn.
    public var lastPosed: Double
    /// Until when this person counts as having the arms up: they go first, every sample.
    public var raisedUntil: Double
    /// Pose runs in a row that found no body in the box (a pole, a bag, a shadow; a far player also misses now and then).
    public var misses: Int
  }

  public private(set) var tracks: [Track] = []
  /// Where people the detector stopped finding were last seen (dropped for time, not for misses), for `lostSeconds`:
  /// a far player standing still to make the gesture is usually still there (2026-10-28 field test, 30 m).
  public private(set) var lost: [(box: CGRect, at: Double)] = []
  private let keepSeconds: Double
  private let maxMisses: Int
  private let raisedSeconds: Double
  private let lostSeconds: Double
  private var nextId = 0

  public init(keepSeconds: Double = 3.0, maxMisses: Int = 5, raisedSeconds: Double = 2.0, lostSeconds: Double = 10.0) {
    self.keepSeconds = keepSeconds
    self.maxMisses = maxMisses
    self.raisedSeconds = raisedSeconds
    self.lostSeconds = lostSeconds
  }

  /// Folds in this sample's detections (already merged, see `PersonBoxes.merge`) and drops people not seen for a while.
  public func update(_ boxes: [CGRect], at t: Double) {
    var used = Set<Int>()
    for box in boxes {
      var best: Int?
      var bestScore = 0.0
      for (i, track) in tracks.enumerated() where !used.contains(i) {
        let score = PersonTracks.match(track.box, box)
        if score > bestScore {
          best = i
          bestScore = score
        }
      }
      if let i = best {
        tracks[i].box = box
        tracks[i].lastSeen = t
        used.insert(i)
      } else {
        tracks.append(Track(id: nextId, box: box, lastSeen: t, lastPosed: -Double.infinity,
                            raisedUntil: -Double.infinity, misses: 0))
        used.insert(tracks.count - 1)
        nextId += 1
      }
    }
    let expired = tracks.filter { t - $0.lastSeen > keepSeconds + 1e-9 && $0.misses < maxMisses }
    lost += expired.map { (box: $0.box, at: t) }
    lost.removeAll { place in t - place.at > lostSeconds + 1e-9 || boxes.contains { PersonTracks.match($0, place.box) > 0 } }
    tracks.removeAll { t - $0.lastSeen > keepSeconds + 1e-9 || $0.misses >= maxMisses }
    // One person, two tracks (a partial box from a tile, or the box changing shape between arms up and arms out, made
    // a second one): a track not seen now whose box lies mostly inside a box seen now is that same person.
    let seen = tracks.filter { $0.lastSeen == t }.map(\.box)
    tracks.removeAll { track in
      track.lastSeen < t && seen.contains { PersonBoxes.contained($0, track.box, over: 0.5) }
    }
  }

  /// Who gets the pose step this sample: people with the arms up first (the biggest first), then whoever waited longest.
  public func pick(_ count: Int, at t: Double) -> [Track] {
    let sorted = tracks.sorted { a, b in
      let ar = a.raisedUntil > t, br = b.raisedUntil > t
      if ar != br { return ar }
      if ar { return PersonBoxes.area(a.box) > PersonBoxes.area(b.box) }
      if a.lastPosed != b.lastPosed { return a.lastPosed < b.lastPosed }
      return PersonBoxes.area(a.box) > PersonBoxes.area(b.box)
    }
    return Array(sorted.prefix(max(0, count)))
  }

  /// Small (far) people to look for closely this sample (a region around each, see `ScanTiles.focusRegion`), most
  /// useful first: arms up, then not found in the last sample (longest first), then the places where someone was lost.
  /// People taller than `maxHeight` of the frame are left out: the whole-frame pass finds them.
  public func focusTargets(_ count: Int, at t: Double, maxHeight: Double = 0.15) -> [CGRect] {
    guard count > 0 else { return [] }
    let small = tracks.filter { Double($0.box.height) <= maxHeight }
    let raised = small.filter { $0.raisedUntil > t }.sorted { $0.lastSeen < $1.lastSeen }
    let missing = small.filter { $0.raisedUntil <= t }.sorted { $0.lastSeen < $1.lastSeen }
    let places = lost.filter { Double($0.box.height) <= maxHeight }.sorted { $0.at > $1.at }.map { $0.box }
    return Array((raised.map { $0.box } + missing.map { $0.box } + places).prefix(count))
  }

  /// The result of the pose step on a person: whether a body was found and whether the arms were up.
  public func posed(_ id: Int, at t: Double, found: Bool, raised: Bool) {
    guard let i = tracks.firstIndex(where: { $0.id == id }) else { return }
    tracks[i].lastPosed = t
    tracks[i].misses = found ? 0 : tracks[i].misses + 1
    if raised { tracks[i].raisedUntil = t + raisedSeconds }
    if tracks[i].misses >= maxMisses { tracks.remove(at: i) }
  }

  public func reset() {
    tracks = []
    lost = []
  }

  /// How well two boxes of (maybe) the same person line up: their IoU, or, for a small person who moved a bit, a
  /// lower score when the centres are within one box height. 0 when they are not the same person.
  static func match(_ a: CGRect, _ b: CGRect) -> Double {
    let iou = PersonBoxes.iou(a, b)
    if iou >= 0.2 { return iou }
    let reach = Double(max(a.height, b.height))
    let dx = Double(abs(a.midX - b.midX)), dy = Double(abs(a.midY - b.midY))
    guard reach > 0, dx <= reach * 0.6, dy <= reach * 0.6 else { return 0 }
    return 0.1
  }

}

public enum PersonBoxes {
  public static func iou(_ a: CGRect, _ b: CGRect) -> Double {
    let inter = a.intersection(b)
    guard !inter.isNull, inter.width > 0, inter.height > 0 else { return 0 }
    let i = Double(inter.width * inter.height)
    let u = Double(a.width * a.height + b.width * b.height) - i
    return u > 0 ? i / u : 0
  }

  /// One box per person from the whole-frame pass and the tiles: the most confident of overlapping boxes wins.
  /// A box mostly inside another is the same person cut by a tile edge (or a part of them): the bigger box stays,
  /// since the pose step needs the whole body.
  public static func merge(_ boxes: [(box: CGRect, confidence: Double)]) -> [CGRect] {
    var keep: [CGRect] = []
    for b in boxes.sorted(by: { $0.confidence > $1.confidence }) {
      if let i = keep.firstIndex(where: { contained($0, b.box) }) {
        if area(b.box) > area(keep[i]) { keep[i] = b.box }
      } else if !keep.contains(where: { iou($0, b.box) > 0.4 }) {
        keep.append(b.box)
      }
    }
    return keep
  }

  /// The smaller of the two boxes is more than `over` (70% by default) inside the bigger one.
  static func contained(_ a: CGRect, _ b: CGRect, over: Double = 0.7) -> Bool {
    let inter = a.intersection(b)
    guard !inter.isNull else { return false }
    let smaller = min(area(a), area(b))
    return smaller > 0 && area(inter) / smaller > over
  }

  static func area(_ r: CGRect) -> Double { Double(r.width * r.height) }
}
