import Foundation

/// Cut suggestion (experiment, see docs/superpowers/backlog.md): how much of the court moved between two analysed
/// frames. Only small moving blobs count, the players out on the court; someone walking past the camera is one tall
/// blob and is left out, or a change of sides would look like the best moment of the clip.
///
/// Frames come as small grey grids (`grid(...)`), in the buffer's orientation. `tallAlongX`: the upright picture's
/// vertical runs along the buffer's x axis (a portrait clip from the landscape sensor).
public struct CourtMotion {
  public let width: Int
  public let height: Int
  public let tallAlongX: Bool
  private var previous: [Float]?

  /// A pixel changed when it moved this much more than the frame's typical change (0...255 luma).
  static let changed: Float = 12
  /// Blobs smaller than this many grid cells are noise.
  static let minArea = 3
  /// A blob at least this share of the picture's height is someone near the camera.
  static let tallShare = 0.22

  public init(width: Int, height: Int, tallAlongX: Bool) {
    self.width = width
    self.height = height
    self.tallAlongX = tallAlongX
  }

  /// The grid for a frame of `bufferWidth` × `bufferHeight`: about 160 × 90 cells across the upright picture.
  public static func blockSize(bufferWidth: Int, bufferHeight: Int, turned: Bool) -> Int {
    let uprightWidth = Double(turned ? bufferHeight : bufferWidth), uprightHeight = Double(turned ? bufferWidth : bufferHeight)
    let scale = min(160 / uprightWidth, 90 / uprightHeight)
    return max(1, Int((1 / scale).rounded()))
  }

  /// The mean luma of each `block` × `block` square of an 8-bit plane (every other pixel is read: plenty for this).
  public static func grid(luma: UnsafeRawBufferPointer, bytesPerRow: Int, bufferWidth: Int, bufferHeight: Int, block: Int) -> (cells: [Float], width: Int, height: Int) {
    let gw = bufferWidth / block, gh = bufferHeight / block
    var cells = [Float](repeating: 0, count: gw * gh)
    let step = block >= 4 ? 2 : 1
    for gy in 0..<gh {
      for gx in 0..<gw {
        var sum = 0, count = 0
        var y = gy * block
        while y < (gy + 1) * block {
          let row = y * bytesPerRow
          var x = gx * block
          while x < (gx + 1) * block {
            sum += Int(luma[row + x])
            count += 1
            x += step
          }
          y += step
        }
        cells[gy * gw + gx] = Float(sum) / Float(max(1, count))
      }
    }
    return (cells, gw, gh)
  }

  /// The share of the picture (0...1) moved by small blobs since the previous frame; 0 for the first frame.
  public mutating func next(_ frame: [Float]) -> Double {
    precondition(frame.count == width * height)
    guard let last = previous else {
      previous = frame
      return 0
    }
    previous = frame
    var diff = [Float](repeating: 0, count: frame.count)
    for i in 0..<frame.count { diff[i] = abs(frame[i] - last[i]) }
    // A light change moves every pixel: keep what moved more than the rest.
    let median = Self.median(diff)
    var mask = [UInt8](repeating: 0, count: frame.count)
    for i in 0..<frame.count where diff[i] - median > Self.changed { mask[i] = 1 }
    mask = close(mask)
    let tallCells = Double(tallAlongX ? width : height) * Self.tallShare
    var moved = 0
    for blob in blobs(mask) where blob.area >= Self.minArea {
      let extent = tallAlongX ? blob.spanX : blob.spanY
      if Double(extent) < tallCells { moved += blob.area }
    }
    return Double(moved) / Double(frame.count)
  }

  static func median(_ values: [Float]) -> Float {
    guard !values.isEmpty else { return 0 }
    let sorted = values.sorted()
    let mid = sorted.count / 2
    return sorted.count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  /// 3 × 3 closing (dilate, then erode): joins the pieces of one moving player. Outside the grid counts as neither.
  func close(_ mask: [UInt8]) -> [UInt8] {
    // dilate: on when a neighbour is on; else erode: (on only when every neighbour inside the grid is on)
    func pass(_ input: [UInt8], dilate: Bool) -> [UInt8] {
      var out = input
      for y in 0..<height {
        for x in 0..<width {
          var hit = !dilate
          for dy in -1...1 {
            for dx in -1...1 {
              let nx = x + dx, ny = y + dy
              guard nx >= 0, ny >= 0, nx < width, ny < height else { continue }
              let on = input[ny * width + nx] == 1
              if dilate, on { hit = true }
              if !dilate, !on { hit = false }
            }
          }
          out[y * width + x] = hit ? 1 : 0
        }
      }
      return out
    }
    return pass(pass(mask, dilate: true), dilate: false)
  }

  struct Blob { var area: Int; var spanX: Int; var spanY: Int }

  /// 8-connected blobs of the mask, with their area and the size of their bounding box.
  func blobs(_ mask: [UInt8]) -> [Blob] {
    var seen = [Bool](repeating: false, count: mask.count)
    var out: [Blob] = []
    var stack: [Int] = []
    for start in 0..<mask.count where mask[start] == 1 && !seen[start] {
      seen[start] = true
      stack.append(start)
      var area = 0, minX = Int.max, maxX = Int.min, minY = Int.max, maxY = Int.min
      while let i = stack.popLast() {
        area += 1
        let x = i % width, y = i / width
        minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
        for dy in -1...1 {
          for dx in -1...1 {
            let nx = x + dx, ny = y + dy
            guard nx >= 0, ny >= 0, nx < width, ny < height else { continue }
            let j = ny * width + nx
            if mask[j] == 1 && !seen[j] { seen[j] = true; stack.append(j) }
          }
        }
      }
      out.append(Blob(area: area, spanX: maxX - minX + 1, spanY: maxY - minY + 1))
    }
    return out
  }
}
