import UIKit

/// One share sheet for several files (Photos' "Save N videos", Messages, WhatsApp, AirDrop...).
enum MultiShare {
  /// Resolves "shared" when the person completed an activity, "dismissed" when the sheet was closed without one.
  @MainActor
  static func share(paths: [String]) async -> String {
    let urls = paths.map { URL(fileURLWithPath: $0) }
    guard !urls.isEmpty, let top = topViewController() else { return "dismissed" }
    return await withCheckedContinuation { continuation in
      let sheet = UIActivityViewController(activityItems: urls, applicationActivities: nil)
      // iPad shows the sheet as a popover and crashes without an anchor.
      if let popover = sheet.popoverPresentationController {
        popover.sourceView = top.view
        popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
        popover.permittedArrowDirections = []
      }
      sheet.completionWithItemsHandler = { _, completed, _, _ in
        continuation.resume(returning: completed ? "shared" : "dismissed")
      }
      top.present(sheet, animated: true)
    }
  }

  @MainActor
  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
    var top = scene?.windows.first { $0.isKeyWindow }?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }
}
