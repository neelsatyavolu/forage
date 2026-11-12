import SwiftUI
import WebKit

// FALLBACK, isolated on purpose (api.md §11 "Interim without any web change").
//
// The web's Lodestar callback is a browser GET that needs Forage's `fg_session` and
// `fg_lodestar_flow` cookies. `ASWebAuthenticationSession` runs in Safari's cookie jar, which has
// neither, so until the web adds a JSON `POST /oauth/lodestar/callback` (plus the AASA
// `webcredentials` entry) the app runs the consent page in a private `WKWebView` seeded with the
// app's own cookies for the Forage host. The callback runs inside it and redirects to
// `/account?lodestar=<outcome>`, which this view intercepts and cancels.
//
// Drawbacks: Lodestar's sign-in is shown in an embedded web view (RFC 8252 prefers a system
// browser) and a Safari login to Lodestar isn't reused. Delete this file once
// `LodestarConnectLogic.nativeCallbackAvailable` is true.

/// The sheet: a header with Close and the web view. `onFinish(nil)` means closed by the user.
struct LodestarWebConnectSheet: View {
    let start: URL
    let base: URL
    let cookies: [HTTPCookie]
    let onFinish: (LodestarConnectLogic.Outcome?) -> Void
    @State private var loadError: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Connect Lodestar").textStyle(.headline).foregroundStyle(Color.ink)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                IconButton(systemName: "xmark", accessibilityLabel: "Close") { onFinish(nil) }
            }
            .padding(.leading, Sizes.sheetPadding)
            .padding(.trailing, Spacing.sm)
            .padding(.vertical, Spacing.xs)
            Hairline()
            if let loadError {
                InlineError(message: loadError).padding(Sizes.sheetPadding)
            }
            LodestarWebView(start: start, base: base, cookies: cookies, onOutcome: onFinish,
                            onLoadError: { loadError = $0 })
        }
        .background(Color.card)
    }
}

private struct LodestarWebView: UIViewRepresentable {
    let start: URL
    let base: URL
    let cookies: [HTTPCookie]
    let onOutcome: (LodestarConnectLogic.Outcome) -> Void
    let onLoadError: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(base: base, onOutcome: onOutcome, onLoadError: onLoadError)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // Private store: nothing from this sign-in outlives the sheet.
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        let store = webView.configuration.websiteDataStore.httpCookieStore
        let request = URLRequest(url: start)
        Task { @MainActor in
            for cookie in cookies { await store.setCookie(cookie) }
            webView.load(request)
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        private let base: URL
        private let onOutcome: (LodestarConnectLogic.Outcome) -> Void
        private let onLoadError: (String) -> Void
        private var finished = false

        init(base: URL, onOutcome: @escaping (LodestarConnectLogic.Outcome) -> Void,
             onLoadError: @escaping (String) -> Void) {
            self.base = base
            self.onOutcome = onOutcome
            self.onLoadError = onLoadError
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = navigationAction.request.url,
                  let outcome = LodestarConnectLogic.accountOutcome(url, base: base)
            else { return .allow }
            if !finished {
                finished = true
                onOutcome(outcome)
            }
            return .cancel
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
            report(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
            report(error)
        }

        private func report(_ error: any Error) {
            guard !finished else { return }
            let ns = error as NSError
            // Our own cancel, or a policy change: not a failure.
            if ns.domain == NSURLErrorDomain, ns.code == NSURLErrorCancelled { return }
            if ns.domain == "WebKitErrorDomain", ns.code == 102 { return }
            onLoadError("Can't reach Lodestar. Check your connection, then close this and try again.")
        }
    }
}
