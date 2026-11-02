import Foundation
import Security
import UIKit

/// Small wrapper over the Keychain's generic passwords. Items survive reinstalls and are readable after the first
/// unlock, which is when the app can run.
enum Keychain {
  private static let service = "reprize.remote"

  private static func match(_ account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  static func read(account: String) -> Data? {
    var query = match(account)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
    return result as? Data
  }

  static func write(_ data: Data, account: String) {
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    ]
    if SecItemUpdate(match(account) as CFDictionary, attributes as CFDictionary) == errSecItemNotFound {
      var item = match(account)
      item.merge(attributes) { _, new in new }
      SecItemAdd(item as CFDictionary, nil)
    }
  }
}

/// The trusted list of one role (camera phone: its remotes; remote phone: its camera phone), kept in the Keychain.
final class KeychainPeerStore: PeerKeyStore {
  private struct Item: Codable {
    let id: String
    let name: String
    let key: String
  }

  private let account: String

  init(account: String) { self.account = account }

  func load() -> [TrustedPeer] {
    guard let data = Keychain.read(account: account),
          let items = try? JSONDecoder().decode([Item].self, from: data) else { return [] }
    return items.compactMap { item in
      Data(base64Encoded: item.key).map { TrustedPeer(id: item.id, name: item.name, key: $0) }
    }
  }

  func save(_ peers: [TrustedPeer]) {
    let items = peers.map { Item(id: $0.id, name: $0.name, key: $0.key.base64EncodedString()) }
    if let data = try? JSONEncoder().encode(items) { Keychain.write(data, account: account) }
  }
}

/// Who this phone is to the other one: a random id that stays the same, and a name to show.
enum DeviceIdentity {
  private static let account = "reprize.remote.deviceId"

  static var id: String {
    if let data = Keychain.read(account: account), let saved = String(data: data, encoding: .utf8) { return saved }
    let fresh = UUID().uuidString
    Keychain.write(Data(fresh.utf8), account: account)
    return fresh
  }

  private static let nameAccount = "reprize.remote.deviceName"

  /// The name the person chose for this phone, if any (an empty or blank one means "use the default").
  static var customName: String? {
    guard let data = Keychain.read(account: nameAccount), let text = String(data: data, encoding: .utf8) else { return nil }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  static func setCustomName(_ name: String) {
    let clean = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(DeviceName.maxLength))
    // The Keychain does not like empty values: a single space stands for "no custom name".
    Keychain.write(Data((clean.isEmpty ? " " : clean).utf8), account: nameAccount)
  }

  /// "iPhone11,8" and the like; on the simulator the model it pretends to be.
  private static var modelIdentifier: String {
    if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
    var info = utsname()
    uname(&info)
    return withUnsafePointer(to: &info.machine) {
      $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
    }
  }

  /// Since iOS 16 the system name is just "iPhone" for apps without a special entitlement, so the default is the
  /// model plus a few characters of the id ("iPhone XR#1234"); see `DeviceName` in Core. The person can rename it.
  static var name: String {
    DeviceName.resolve(
      custom: customName, system: UIDevice.current.name, identifier: modelIdentifier,
      code: String(id.prefix(4).uppercased()))
  }
}
