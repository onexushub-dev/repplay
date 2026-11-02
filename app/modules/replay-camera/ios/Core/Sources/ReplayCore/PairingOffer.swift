import Foundation

/// One pairing attempt on the camera phone: a QR secret and a 6-digit code that stop working after two minutes or
/// after five wrong proofs. The remote phone proves it knows one of them in the BLE handshake (`BleHostHandshake`).
///
/// A good proof only *reserves* the offer for that remote; the host spends it (drops the offer) when the pairing is
/// complete. If the connection never comes up the reservation is released, and the same remote (or another one) can
/// try again until the two minutes are over. Spending it on the proof alone made every retry look like an expired code.
public struct PairingOffer {
  public static let validFor = 120.0
  public static let maxAttempts = 5

  public enum Verdict: Equatable {
    case accepted
    case wrongProof(attemptsLeft: Int)
    case expired
    case locked
    /// A good proof, but another remote is already pairing with this offer.
    case taken
  }

  public let hostId: String
  public let hostName: String
  public let secret: Data
  public let code: String
  /// ms since 1970.
  public let createdAt: Double
  public private(set) var failedAttempts = 0
  /// The remote whose good proof is being turned into a pairing right now.
  public private(set) var reservedFor: String?

  public init(hostId: String, hostName: String, secret: Data, code: String, createdAt: Double) {
    self.hostId = hostId
    self.hostName = hostName
    self.secret = secret
    self.code = code
    self.createdAt = createdAt
  }

  public static func make(hostId: String, hostName: String, now: Double) -> PairingOffer {
    let secret = Data((0..<16).map { _ in UInt8.random(in: 0...255) })
    let code = String(format: "%06d", Int.random(in: 0..<1_000_000))
    return PairingOffer(hostId: hostId, hostName: hostName, secret: secret, code: code, createdAt: now)
  }

  /// `proves` answers whether the remote's proof was made with this key (the QR secret, then the UTF-8 bytes of the
  /// code); `now` is this phone's clock (ms since 1970). Only a wrong proof uses up an attempt. A good proof from the
  /// remote that already holds the reservation is accepted again (its first try may have been lost on the way); a good
  /// proof from a different remote is `.taken`.
  public mutating func check(remoteId: String, now: Double, proves: (Data) -> Bool) -> Verdict {
    if isExpired(now: now) { return .expired }
    if failedAttempts >= Self.maxAttempts { return .locked }
    for key in [secret, Data(code.utf8)] where proves(key) {
      if let holder = reservedFor, holder != remoteId { return .taken }
      reservedFor = remoteId
      return .accepted
    }
    failedAttempts += 1
    return .wrongProof(attemptsLeft: Self.maxAttempts - failedAttempts)
  }

  /// The connection of the reserving remote failed: let it (or another remote) try again.
  public mutating func release(remoteId: String) {
    if reservedFor == remoteId { reservedFor = nil }
  }

  public func isExpired(now: Double) -> Bool { now - createdAt > Self.validFor * 1000 }

  public var isLocked: Bool { failedAttempts >= Self.maxAttempts }

  public func secondsLeft(now: Double) -> Double {
    max(0, Self.validFor - (now - createdAt) / 1000)
  }

  /// What the QR code holds. The Camera app of the remote phone opens it, and expo-router lands on `/pair`.
  public var qrURL: String {
    let allowed = CharacterSet.urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=+#"))
    let name = hostName.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    let encodedSecret = secret.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
    return "reprize://pair?h=\(hostId)&s=\(encodedSecret)&n=\(name)"
  }
}
