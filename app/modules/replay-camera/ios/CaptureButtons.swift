import AVKit
import UIKit

/// Capture events (iOS 17.2+): while the camera runs, a press of a volume button reaches the app as a capture event
/// instead of changing the volume. Bluetooth selfie remotes press "volume up", so they should arrive here too (to
/// confirm in the field: the diagnostic log says which path each press took).
///
/// Why (2026-10-31 field logs): reading presses as volume changes depends on the volume itself. A camera restart (the
/// thermal step) moved the reported volume to 1.00 and was taken for a press, and for minutes no volume change arrived
/// at all while the remote was pressed. A capture event does not go through the volume: no parking, no stale slider,
/// no route changes. The volume path stays on as the fallback (older iOS, a remote that does not go through here, the
/// moment the camera restarts): a press this interaction takes never changes the volume, so a press is never counted twice.
///
/// The interaction sits on the key window, which is always in the responder chain whatever screen is up.
/// Main thread only.
@MainActor
final class CaptureButtons {
  static let shared = CaptureButtons()

  private var interaction: UIInteraction?
  private weak var host: UIView?

  /// Whether this phone can deliver capture events (iOS 17.2+).
  nonisolated static var supported: Bool {
    if #available(iOS 17.2, *) { return true }
    return false
  }

  /// True: presses arrive as `onCaptureButton` (from now on, on whatever window is key now). False: the buttons go back
  /// to the system (volume).
  func set(_ enabled: Bool) {
    guard #available(iOS 17.2, *) else { return }
    if enabled { attach() } else { detach() }
  }

  @available(iOS 17.2, *)
  private func attach() {
    guard let window = Self.keyWindow() else {
      ReplayEngine.shared.diag("controle: botões de captura sem janela, fica só o volume") // TEMP(diag-remote)
      return
    }
    if let current = interaction as? AVCaptureEventInteraction, host === window {
      current.isEnabled = true
      return
    }
    detach()
    let made = AVCaptureEventInteraction(primary: { [weak self] event in
      self?.handle(event, button: "primary")
    }, secondary: { [weak self] event in
      self?.handle(event, button: "secondary")
    })
    made.isEnabled = true
    window.addInteraction(made)
    interaction = made
    host = window
  }

  private func detach() {
    if let interaction, let host { host.removeInteraction(interaction) }
    interaction = nil
    host = nil
  }

  /// One press per `began` (`onCaptureButton` in JS): a remote's press and release come together, and a `cancelled`
  /// after it changes nothing. `button`: "primary" (volume down, Action button, Camera Control) or "secondary" (volume up).
  @available(iOS 17.2, *)
  private func handle(_ event: AVCaptureEvent, button: String) {
    guard event.phase == .began else { return }
    ReplayEngine.shared.emit?("onCaptureButton", ["button": button])
  }

  private static func keyWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    guard let scene else { return nil }
    return scene.windows.first { $0.isKeyWindow } ?? scene.windows.first
  }
}
