import AuthenticationServices
import UIKit

/// The intended Connect Lodestar flow (api.md §11): Lodestar's consent page in
/// `ASWebAuthenticationSession`, with the system catching the https redirect to
/// `/oauth/lodestar/callback` before it loads. The app then posts `{code, state, iss}` to the
/// callback through its own client, which carries `fg_session` and `fg_lodestar_flow`.
///
/// Off until the web change lands (`LodestarConnectLogic.nativeCallbackAvailable`): the https
/// callback needs the associated-domains entitlement and the web's JSON `POST` handler.
@MainActor
final class LodestarNativeConnect: NSObject, ASWebAuthenticationPresentationContextProviding {
    enum Failure: Error, Equatable {
        /// The user closed the sheet: show nothing.
        case closed
        case couldNotStart
    }

    private var session: ASWebAuthenticationSession?

    /// Shows the consent page and returns the callback URL.
    func authorize(_ url: URL, callbackHost: String) async throws -> URL {
        cancel()
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callback: .https(host: callbackHost, path: LodestarConnectLogic.callbackPath)
            ) { callbackURL, error in
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else if let auth = error as? ASWebAuthenticationSessionError, auth.code == .canceledLogin {
                    continuation.resume(throwing: Failure.closed)
                } else {
                    continuation.resume(throwing: Failure.couldNotStart)
                }
            }
            session.presentationContextProvider = self
            // Reuse a Lodestar login from Safari.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                continuation.resume(throwing: Failure.couldNotStart)
            }
        }
    }

    func cancel() {
        session?.cancel()
        session = nil
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let windows = scenes.flatMap(\.windows)
            if let window = windows.first(where: \.isKeyWindow) ?? windows.first { return window }
            return ASPresentationAnchor(windowScene: scenes[0])
        }
    }
}
