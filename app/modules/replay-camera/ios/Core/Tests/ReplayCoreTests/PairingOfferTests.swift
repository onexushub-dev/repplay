import XCTest
@testable import ReplayCore

final class PairingOfferTests: XCTestCase {
  private let secret = Data((0..<16).map { UInt8($0) })
  private let code = "042517"
  private let t0 = 1_700_000_000_000.0

  private func offer() -> PairingOffer {
    PairingOffer(hostId: "h1", hostName: "Quadra 1", secret: secret, code: code, createdAt: t0)
  }

  /// A remote whose proof was made with `key`, arriving at `at`.
  private func check(_ offer: inout PairingOffer, key: Data, at: Double, remoteId: String = "r1") -> PairingOffer.Verdict {
    offer.check(remoteId: remoteId, now: at) { $0 == key }
  }

  func testAcceptsAProofMadeWithTheSecret() {
    var o = offer()
    XCTAssertEqual(check(&o, key: secret, at: t0 + 1_000), .accepted)
  }

  func testAcceptsAProofMadeWithTheCode() {
    var o = offer()
    XCTAssertEqual(check(&o, key: Data(code.utf8), at: t0 + 1_000), .accepted)
  }

  func testAWrongProofCountsAnAttemptAndFiveLockTheOffer() {
    var o = offer()
    let wrong = Data("not the secret".utf8)
    for left in [4, 3, 2, 1, 0] {
      XCTAssertEqual(check(&o, key: wrong, at: t0 + 1_000), .wrongProof(attemptsLeft: left))
    }
    XCTAssertEqual(o.failedAttempts, 5)
    XCTAssertEqual(check(&o, key: secret, at: t0 + 2_000), .locked)
  }

  func testExpiresAfter120Seconds() {
    var early = offer()
    XCTAssertEqual(check(&early, key: secret, at: t0 + 119_000), .accepted)
    var late = offer()
    XCTAssertEqual(check(&late, key: secret, at: t0 + 121_000), .expired)
  }

  func testSecondsLeftCountsDownAndNeverGoesNegative() {
    let o = offer()
    XCTAssertEqual(o.secondsLeft(now: t0), 120, accuracy: 0.001)
    XCTAssertEqual(o.secondsLeft(now: t0 + 30_000), 90, accuracy: 0.001)
    XCTAssertEqual(o.secondsLeft(now: t0 + 130_000), 0, accuracy: 0.001)
  }

  func testALockedOfferStaysLockedWithTheRightProof() {
    var o = offer()
    for _ in 0..<5 { _ = check(&o, key: Data("x".utf8), at: t0 + 1_000) }
    XCTAssertEqual(check(&o, key: Data(code.utf8), at: t0 + 3_000), .locked)
  }

  func testAGoodProofOnlyReservesTheOfferSoARetryOfTheSameRemoteIsAccepted() {
    var o = offer()
    XCTAssertEqual(check(&o, key: secret, at: t0 + 1_000), .accepted)
    XCTAssertEqual(o.reservedFor, "r1")
    // The first connection never came up and the remote tries again 6 s later.
    XCTAssertEqual(check(&o, key: secret, at: t0 + 7_000), .accepted)
  }

  func testAnotherRemoteIsTakenWhileTheOfferIsReservedAndCanTryAfterTheRelease() {
    var o = offer()
    XCTAssertEqual(check(&o, key: secret, at: t0 + 1_000), .accepted)
    XCTAssertEqual(check(&o, key: secret, at: t0 + 2_000, remoteId: "r2"), .taken)
    XCTAssertEqual(o.failedAttempts, 0)  // not a wrong proof
    o.release(remoteId: "r1")
    XCTAssertNil(o.reservedFor)
    XCTAssertEqual(check(&o, key: secret, at: t0 + 3_000, remoteId: "r2"), .accepted)
  }

  func testReleaseOfAnotherRemoteKeepsTheReservation() {
    var o = offer()
    _ = check(&o, key: secret, at: t0 + 1_000)
    o.release(remoteId: "r2")
    XCTAssertEqual(o.reservedFor, "r1")
  }

  func testAReservedOfferStillExpiresAfter120SecondsAndNeverBefore() {
    var o = offer()
    XCTAssertEqual(check(&o, key: secret, at: t0 + 1_000), .accepted)
    XCTAssertFalse(o.isExpired(now: t0 + 119_000))
    // A retry just before the end (the old code would have called this expired after the first accepted proof).
    XCTAssertEqual(check(&o, key: secret, at: t0 + 119_000), .accepted)
    XCTAssertTrue(o.isExpired(now: t0 + 121_000))
    XCTAssertEqual(check(&o, key: secret, at: t0 + 121_000), .expired)
  }

  func testIsLockedAfterFiveWrongProofs() {
    var o = offer()
    XCTAssertFalse(o.isLocked)
    for _ in 0..<5 { _ = check(&o, key: Data("x".utf8), at: t0 + 1_000) }
    XCTAssertTrue(o.isLocked)
  }

  func testMakeProducesFreshSecretsAndCodes() {
    let a = PairingOffer.make(hostId: "h1", hostName: "Quadra 1", now: t0)
    let b = PairingOffer.make(hostId: "h1", hostName: "Quadra 1", now: t0)
    XCTAssertNotEqual(a.secret, b.secret)
    XCTAssertEqual(a.secret.count, 16)
    XCTAssertEqual(a.code.count, 6)
    XCTAssertTrue(a.code.allSatisfy { $0.isASCII && $0.isNumber })
    XCTAssertEqual(a.failedAttempts, 0)
    XCTAssertEqual(a.hostId, "h1")
    XCTAssertEqual(a.createdAt, t0)
  }

  /// The TypeScript parser (`parsePairLink`) is tested against this same string.
  func testQrURLIsPinned() {
    XCTAssertEqual(offer().qrURL, "reprize://pair?h=h1&s=AAECAwQFBgcICQoLDA0ODw&n=Quadra%201")
  }

  func testQrURLEscapesTheHostName() {
    let o = PairingOffer(hostId: "h1", hostName: "Ana & Beto=1+2", secret: secret, code: code, createdAt: t0)
    XCTAssertTrue(o.qrURL.hasSuffix("&n=Ana%20%26%20Beto%3D1%2B2"))
  }
}
