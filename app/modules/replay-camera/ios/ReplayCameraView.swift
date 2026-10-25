import AVFoundation
import ExpoModulesCore

/// Live preview of the replay session's camera.
class ReplayCameraView: ExpoView {
  private let previewLayer = AVCaptureVideoPreviewLayer(session: ReplayEngine.shared.capture.session)

  /// Every live preview, so screen economy can stop them all from drawing.
  private static let views = NSHashTable<ReplayCameraView>.weakObjects()
  private static var previewEnabled = true

  /// Off: the preview layers stop receiving frames (capture and writing go on). Main thread.
  static func setPreviewEnabled(_ enabled: Bool) {
    previewEnabled = enabled
    for view in views.allObjects { view.applyPreviewEnabled() }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
    Self.views.add(self)
    applyPreviewEnabled()
  }

  private func applyPreviewEnabled() {
    previewLayer.connection?.isEnabled = Self.previewEnabled
    previewLayer.isHidden = !Self.previewEnabled
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
  }
}
