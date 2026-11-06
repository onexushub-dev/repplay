import AVKit
import MediaPlayer
import UIKit

/// Capture events (iOS 17.2+): while the camera runs, a press of a volume button (or a Bluetooth selfie remote, which
/// presses "volume up") reaches the app as a capture event instead of changing the volume. A capture event does not go
/// through the volume: no parking, no stale slider, no route changes, and it still arrives with the volume at the top.
///
/// Where it sits: on every live camera preview (`ReplayCameraView`). 2026-11-05 field logs: on the key window it was
/// installed and enabled but never got a single event, not even the iPhone's own volume button; on the preview every
/// press arrived, with the volume library's hidden MPVolumeView on screen or not.
///
/// The volume path (`useVolumeRemote`) stays on as the fallback: older iOS, a moment with no preview on screen (the
/// camera restarting). A press this interaction takes never changes the volume, so a press is never counted twice.
/// Main thread only.
@MainActor
final class CaptureButtons {
  static let shared = CaptureButtons()

  private var enabled = false
  /// The interaction on each live camera preview.
  private let interactions = NSMapTable<UIView, UIInteraction>.weakToStrongObjects()
  /// With two previews on screen, one press could reach both: it is emitted once.
  private var lastPressAt: CFTimeInterval = 0
  private static let duplicateWindow: CFTimeInterval = 0.15

  /// Whether this phone can deliver capture events (iOS 17.2+).
  nonisolated static var supported: Bool {
    if #available(iOS 17.2, *) { return true }
    return false
  }

  /// True: presses arrive as `onCaptureButton` (on every preview on screen now, and on those that appear later).
  /// False: the buttons go back to the system (volume).
  func set(_ enabled: Bool) {
    guard #available(iOS 17.2, *) else { return }
    self.enabled = enabled
    if enabled { attach() } else { detach() }
  }

  /// A camera preview joined or left a window; while enabled, it gets its own interaction.
  func previewMoved(_ view: UIView) {
    guard #available(iOS 17.2, *), enabled, view.window != nil else { return }
    if attach(to: view) {
      ReplayEngine.shared.diag("controle: captura instalada no preview — \(diagState())") // TEMP(diag-remote)
    }
  }

  @available(iOS 17.2, *)
  private func attach() {
    for view in ReplayCameraView.liveViews() where view.window != nil {
      _ = attach(to: view)
    }
    ReplayEngine.shared.diag("controle: captura instalada — \(diagState())") // TEMP(diag-remote)
  }

  /// True when the view got a new interaction.
  @available(iOS 17.2, *)
  private func attach(to view: UIView) -> Bool {
    if let current = interactions.object(forKey: view) as? AVCaptureEventInteraction {
      current.isEnabled = true
      return false
    }
    let made = AVCaptureEventInteraction(primary: { [weak self] event in
      guard let self else { return }
      self.handle(event, button: "primary")
    }, secondary: { [weak self] event in
      guard let self else { return }
      self.handle(event, button: "secondary")
    })
    made.isEnabled = true
    view.addInteraction(made)
    interactions.setObject(made, forKey: view)
    return true
  }

  private func detach() {
    let views = interactions.keyEnumerator().allObjects.compactMap { $0 as? UIView }
    for view in views {
      if let made = interactions.object(forKey: view) { view.removeInteraction(made) }
    }
    interactions.removeAllObjects()
  }

  /// One press per `began` (`onCaptureButton` in JS): a remote's press and release come together, and a `cancelled`
  /// after it changes nothing. `button`: "primary" (volume down, Action button, Camera Control) or "secondary" (volume up).
  @available(iOS 17.2, *)
  private func handle(_ event: AVCaptureEvent, button: String) {
    // TEMP(diag-remote): every event, for the field test.
    let phase: String
    switch event.phase {
    case .began: phase = "began"
    case .ended: phase = "ended"
    case .cancelled: phase = "cancelled"
    @unknown default: phase = "fase \(event.phase.rawValue)"
    }
    ReplayEngine.shared.diag("controle: evento de captura (\(button), \(phase))")
    guard event.phase == .began else { return }
    let now = CACurrentMediaTime()
    if now - lastPressAt < Self.duplicateWindow { return }
    lastPressAt = now
    ReplayEngine.shared.emit?("onCaptureButton", ["button": button])
  }

  /// TEMP(diag-remote): what is installed right now, in one line for the diagnostic log.
  func diagState() -> String {
    let previews = interactions.keyEnumerator().allObjects.compactMap { $0 as? UIView }
    let onScreen = previews.filter { $0.window != nil }.count
    let running = ReplayEngine.shared.capture.session.isRunning ? "sim" : "NÃO"
    var volumeViews = 0
    for window in Self.sceneWindows() { volumeViews += Self.countVolumeViews(in: window) }
    return "previews: \(onScreen) de \(previews.count) na tela, câmera rodando: \(running), "
      + "MPVolumeView na tela: \(volumeViews), ligado: \(enabled ? "sim" : "não")"
  }

  private static func countVolumeViews(in view: UIView) -> Int {
    var count = view is MPVolumeView ? 1 : 0
    for sub in view.subviews { count += countVolumeViews(in: sub) }
    return count
  }

  private static func sceneWindows() -> [UIWindow] {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    guard let scene else { return [] }
    return scene.windows
  }
}
