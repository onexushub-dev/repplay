import CryptoKit
import Foundation
import Network
import os

/// The pictures of the camera view, for the remote phone's preview, over peer-to-peer Wi-Fi (spec 2026-10-23, section 13:
/// Bluetooth carries ~24 KB/s and the preview needs ~100 KB/s, so the commands stay on BLE and the pictures come here).
///
/// The camera phone publishes a Bonjour TCP service only while some remote wants the preview. Over the sealed BLE session it
/// gives each remote the service name, a 16-byte token and a 32-byte key (`RemoteMessage.previewLink`). The remote connects,
/// sends the token, and reads `[length, 4 bytes big-endian][sealed JPEG]` packets (`BleSession`, so nobody nearby can
/// watch or inject pictures). A slow link drops pictures instead of queueing them.
enum PreviewLink {
  static let serviceType = "_reprize-remote._tcp"
  static let tokenSize = 16
  static let maxPacket = 2_000_000
  static let log = Logger(subsystem: "Reprize", category: "Preview")

  static func parameters() -> NWParameters {
    let parameters = NWParameters.tcp
    parameters.includePeerToPeer = true
    return parameters
  }

  static func lengthPrefix(_ count: Int) -> Data {
    let value = UInt32(count)
    return Data([UInt8(value >> 24), UInt8((value >> 16) & 0xFF), UInt8((value >> 8) & 0xFF), UInt8(value & 0xFF)])
  }
}

// MARK: - Camera phone

final class PreviewServer {
  private struct Grant {
    let token: Data
    let key: Data
  }

  private final class Client {
    let connection: NWConnection
    var session: BleSession?
    var busy = false

    init(_ connection: NWConnection) {
      self.connection = connection
    }
  }

  let serviceName = "lance-" + String(UUID().uuidString.prefix(8)).lowercased()
  private let queue = DispatchQueue(label: "reprize.preview.server")
  private var listener: NWListener?
  /// One grant per remote id, kept while the remote is paired so a reconnect reuses it.
  private var grants: [String: Grant] = [:]
  private var clients: [ObjectIdentifier: Client] = [:]

  /// What a remote needs to open the preview (sent to it inside the sealed BLE session).
  func grant(remoteId: String) -> (service: String, token: Data, key: Data) {
    queue.sync {
      if let existing = grants[remoteId] { return (serviceName, existing.token, existing.key) }
      let fresh = Grant(token: BleCrypto.randomBytes(PreviewLink.tokenSize), key: BleCrypto.randomBytes(32))
      grants[remoteId] = fresh
      return (serviceName, fresh.token, fresh.key)
    }
  }

  func revoke(remoteId: String) {
    queue.async { self.grants.removeValue(forKey: remoteId) }
  }

  var isRunning: Bool { queue.sync { listener != nil } }

  /// Publishes the service (peer-to-peer Wi-Fi stays busy while it runs, so only while a preview is wanted).
  func start() {
    queue.async {
      guard self.listener == nil else { return }
      do {
        let created = try NWListener(using: PreviewLink.parameters())
        created.service = NWListener.Service(name: self.serviceName, type: PreviewLink.serviceType)
        created.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        created.stateUpdateHandler = { [weak self] state in
          guard let self else { return }
          switch state {
          case .ready:
            PreviewLink.log.info("preview service up")
          case let .failed(error):
            PreviewLink.log.error("preview service failed: \(String(describing: error), privacy: .public)")
            created.cancel()
            if self.listener === created { self.listener = nil }
          default:
            break
          }
        }
        created.start(queue: self.queue)
        self.listener = created
      } catch {
        PreviewLink.log.error("preview service not created: \(String(describing: error), privacy: .public)")
      }
    }
  }

  func stop() {
    queue.async {
      self.listener?.cancel()
      self.listener = nil
      for client in self.clients.values { client.connection.cancel() }
      self.clients.removeAll()
    }
  }

  /// One picture to every remote that opened the preview. Dropped for a remote whose previous one is still on its way.
  func send(_ jpeg: Data) {
    queue.async {
      for client in self.clients.values where client.session != nil && !client.busy {
        guard var session = client.session, let sealed = session.seal(jpeg) else { continue }
        client.session = session
        var packet = PreviewLink.lengthPrefix(sealed.count)
        packet.append(sealed)
        client.busy = true
        client.connection.send(content: packet, completion: .contentProcessed { [weak client] error in
          guard let client else { return }
          client.busy = false
          if error != nil { client.connection.cancel() }
        })
      }
    }
  }

  /// Runs on `queue`. The first 16 bytes must be a token we handed out; anything else is closed.
  private func accept(_ connection: NWConnection) {
    let client = Client(connection)
    let id = ObjectIdentifier(client)
    clients[id] = client
    connection.stateUpdateHandler = { [weak self] state in
      switch state {
      case .failed, .cancelled:
        self?.clients.removeValue(forKey: id)
      default:
        break
      }
    }
    connection.start(queue: queue)
    connection.receive(minimumIncompleteLength: PreviewLink.tokenSize, maximumLength: PreviewLink.tokenSize) {
      [weak self] data, _, _, error in
      guard let self else { return }
      guard error == nil, let data, data.count == PreviewLink.tokenSize,
            let grant = self.grants.values.first(where: { BleCrypto.equal($0.token, data) }) else {
        connection.cancel()
        return
      }
      client.session = BleSession(key: SymmetricKey(data: grant.key), side: .host)
    }
  }
}

// MARK: - Remote phone

final class PreviewClient {
  /// Called with each JPEG, off the main thread.
  var onFrame: ((Data) -> Void)?

  private struct Target: Equatable {
    let service: String
    let token: Data
    let key: Data
  }

  private let queue = DispatchQueue(label: "reprize.preview.client")
  private var target: Target?
  private var connection: NWConnection?
  private var session: BleSession?

  /// Opens (or keeps) the preview from this service. Retries by itself until `close()`.
  func open(service: String, token: Data, key: Data) {
    queue.async {
      let next = Target(service: service, token: token, key: key)
      if self.target == next, self.connection != nil { return }
      self.connection?.cancel()
      self.connection = nil
      self.target = next
      self.connect()
    }
  }

  func close() {
    queue.async {
      self.target = nil
      self.connection?.cancel()
      self.connection = nil
      self.session = nil
    }
  }

  /// Runs on `queue`.
  private func connect() {
    guard let target else { return }
    let endpoint = NWEndpoint.service(name: target.service, type: PreviewLink.serviceType, domain: "local.", interface: nil)
    let created = NWConnection(to: endpoint, using: PreviewLink.parameters())
    connection = created
    session = BleSession(key: SymmetricKey(data: target.key), side: .remote)
    created.stateUpdateHandler = { [weak self] state in
      guard let self, self.connection === created else { return }
      switch state {
      case .ready:
        created.send(content: target.token, completion: .contentProcessed { _ in })
        self.readLength(created)
      case .waiting, .failed:
        self.retry(created)
      default:
        break
      }
    }
    created.start(queue: queue)
  }

  /// Runs on `queue`.
  private func retry(_ failed: NWConnection) {
    guard connection === failed else { return }
    failed.cancel()
    connection = nil
    queue.asyncAfter(deadline: .now() + 1.5) { [weak self] in
      guard let self, self.target != nil, self.connection == nil else { return }
      self.connect()
    }
  }

  private func readLength(_ link: NWConnection) {
    link.receive(minimumIncompleteLength: 4, maximumLength: 4) { [weak self] data, _, _, error in
      guard let self, self.connection === link else { return }
      guard error == nil, let data, data.count == 4 else { return self.retry(link) }
      let bytes = [UInt8](data)
      let length = Int(bytes[0]) << 24 | Int(bytes[1]) << 16 | Int(bytes[2]) << 8 | Int(bytes[3])
      guard length > 0, length <= PreviewLink.maxPacket else { return self.retry(link) }
      self.readBody(link, length: length)
    }
  }

  private func readBody(_ link: NWConnection, length: Int) {
    link.receive(minimumIncompleteLength: length, maximumLength: length) { [weak self] data, _, _, error in
      guard let self, self.connection === link else { return }
      guard error == nil, let data, data.count == length else { return self.retry(link) }
      if var session = self.session, let jpeg = session.open(data) {
        self.session = session
        self.onFrame?(jpeg)
      }
      self.readLength(link)
    }
  }
}
