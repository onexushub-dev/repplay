import CoreGraphics
import XCTest
@testable import ReplayCore

final class FitRectTests: XCTestCase {
  func test_landscapeVideoInAStoryFrame() {
    let r = FitRect.fit(CGSize(width: 1920, height: 1080), into: CGSize(width: 1080, height: 1920))
    XCTAssertEqual(r.origin.x, 0, accuracy: 0.01)
    XCTAssertEqual(r.origin.y, 656.25, accuracy: 0.01)
    XCTAssertEqual(r.width, 1080, accuracy: 0.01)
    XCTAssertEqual(r.height, 607.5, accuracy: 0.01)
  }

  func test_exportKeepsTheClipsFrameRate() {
    XCTAssertEqual(FitRect.exportFrameRate(source: 60, speed: 1), 60) // 1080p60, the default
    XCTAssertEqual(FitRect.exportFrameRate(source: 59.94, speed: 1), 60)
    XCTAssertEqual(FitRect.exportFrameRate(source: 30, speed: 1), 30)
    XCTAssertEqual(FitRect.exportFrameRate(source: 60, speed: 0.5), 30) // slow motion: 30 real frames a second
    XCTAssertEqual(FitRect.exportFrameRate(source: 30, speed: 0.5), 30) // never below 30
    XCTAssertEqual(FitRect.exportFrameRate(source: 60, speed: 2), 60) // never above 60
    XCTAssertEqual(FitRect.exportFrameRate(source: 0, speed: 1), 30) // unknown: as before
  }

  func test_portraitVideoFillsTheFrame() {
    let r = FitRect.fit(CGSize(width: 1080, height: 1920), into: CGSize(width: 1080, height: 1920))
    XCTAssertEqual(r, CGRect(x: 0, y: 0, width: 1080, height: 1920))
  }
}
