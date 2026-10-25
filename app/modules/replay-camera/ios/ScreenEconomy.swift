import UIKit

/// Screen economy while recording (thermal work, item 2): the camera preview stops drawing and the screen brightness
/// goes down; turning it off gives both back. Capture, segment writing, triggers and saves are not touched.
/// Main thread only.
@MainActor
enum ScreenEconomy {
  /// Brightness while dark (0..1). The JS side also covers the screen in black, so this only has to be low.
  static let dimBrightness: CGFloat = 0.02

  private static var on = false
  /// The brightness to give back; nil while not dimmed.
  private static var saved: CGFloat?
  private static var observers: [NSObjectProtocol] = []

  static func set(_ value: Bool) {
    if value == on { return }
    on = value
    ReplayCameraView.setPreviewEnabled(!value)
    if value {
      dim()
      observe()
    } else {
      restore()
      stopObserving()
    }
  }

  private static var screen: UIScreen? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return (scenes.first { $0.activationState == .foregroundActive } ?? scenes.first)?.screen
  }

  private static func dim() {
    guard let screen = screen else { return }
    if saved == nil { saved = screen.brightness }
    screen.brightness = min(screen.brightness, dimBrightness)
  }

  private static func restore() {
    guard let value = saved else { return }
    saved = nil
    screen?.brightness = value
  }

  /// Leaving the app gives the brightness back (the player's own setting); coming back while still dark dims again.
  private static func observe() {
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { _ in
      MainActor.assumeIsolated { restore() }
    })
    observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
      MainActor.assumeIsolated { if on { dim() } }
    })
  }

  private static func stopObserving() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers = []
  }
}
