import CoreBluetooth

/// The Bluetooth selfie remote as iOS shows it to the app (2026-11-01).
///
/// iOS never lists paired devices, but a BLE remote that is connected right now is returned by
/// `retrieveConnectedPeripherals` for a service it offers. The AB Shutter3 field test showed it under Battery (0x180F)
/// and Device Information (0x180A), never HID (0x1812, hidden from apps); AirPods show only Device Information. So the
/// app can tell "the remote is connected", "it is gone" (switched off, out of range, unpaired) and "Bluetooth is off".
/// A classic-Bluetooth remote never shows here: JS then keeps to presses alone.
final class BluetoothProbe: NSObject, CBCentralManagerDelegate {
  static let shared = BluetoothProbe()

  private static let services: [(key: String, uuid: CBUUID)] = [
    ("hid", CBUUID(string: "1812")),
    ("battery", CBUUID(string: "180F")),
    ("info", CBUUID(string: "180A")),
  ]
  private static let timeout: TimeInterval = 4

  private var central: CBCentralManager?
  private var waiting: [([String: Any]) -> Void] = []

  /// Calls `completion` once, on the main queue, with `state` ("on", "off", "unauthorized", "unsupported",
  /// "notDetermined", "unknown") and `devices` ([id, name, services]) of the BLE peripherals connected right now.
  /// `ask` false: when Bluetooth was never asked for, answers "notDetermined" instead of making iOS ask now.
  func run(ask: Bool, _ completion: @escaping ([String: Any]) -> Void) {
    DispatchQueue.main.async {
      if self.central == nil, !ask, CBCentralManager.authorization == .notDetermined {
        completion(["state": "notDetermined", "devices": [[String: Any]]()])
        return
      }
      self.waiting.append(completion)
      if let central = self.central, central.state == .poweredOn || central.state == .poweredOff
        || central.state == .unauthorized || central.state == .unsupported
      {
        self.finish(force: true)
        return
      }
      if self.central == nil {
        // No "turn on Bluetooth" alert: the app says so itself, on the screen that needs it.
        self.central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionShowPowerAlertKey: false])
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + Self.timeout) { [weak self] in self?.finish(force: true) }
    }
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    finish(force: false)
  }

  /// `force`: answer whatever the state (the timeout); otherwise wait while Bluetooth is still starting up.
  private func finish(force: Bool) {
    guard !waiting.isEmpty, let central else { return }
    if !force && (central.state == .unknown || central.state == .resetting) { return }
    var devices: [String: (name: String, services: [String])] = [:]
    if central.state == .poweredOn {
      for service in Self.services {
        for p in central.retrieveConnectedPeripherals(withServices: [service.uuid]) {
          let id = p.identifier.uuidString
          var entry = devices[id] ?? (name: p.name ?? "", services: [])
          entry.services.append(service.key)
          devices[id] = entry
        }
      }
    }
    let result: [String: Any] = [
      "state": Self.name(of: central.state),
      "devices": devices.map { ["id": $0.key, "name": $0.value.name, "services": $0.value.services] as [String: Any] },
    ]
    let done = waiting
    waiting = []
    done.forEach { $0(result) }
  }

  private static func name(of state: CBManagerState) -> String {
    switch state {
    case .poweredOn: return "on"
    case .poweredOff: return "off"
    case .unauthorized: return "unauthorized"
    case .unsupported: return "unsupported"
    default: return "unknown"
    }
  }
}
