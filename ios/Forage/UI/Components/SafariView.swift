import SafariServices
import SwiftUI

/// `SFSafariViewController` in a sheet, for outside links (a place's website, Google Maps).
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
