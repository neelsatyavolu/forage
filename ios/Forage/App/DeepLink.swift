import Foundation

/// Links the app can open: `forage://reset?token=…`, and `https://forage.xanom.co/reset?token=…`
/// once the site serves an apple-app-site-association file (see ios/README.md).
enum DeepLink: Equatable, Sendable {
    /// The emailed password reset link, as pasted into the reset form.
    case resetPassword(link: String)

    static let scheme = "forage"

    /// nil for anything the app doesn't handle (another host, an unknown path).
    static func parse(_ url: URL, webBase: URL) -> DeepLink? {
        guard let parts = pathParts(url, webBase: webBase), parts.first == "reset",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
              ResetRequest.token(fromLink: token) != nil
        else { return nil }
        return .resetPassword(link: token)
    }

    /// `forage://reset` puts "reset" in the host; `https://host/reset` puts it in the path.
    private static func pathParts(_ url: URL, webBase: URL) -> [String]? {
        let path = url.pathComponents.filter { $0 != "/" }
        if url.scheme?.lowercased() == scheme {
            return [url.host()].compactMap { $0 } + path
        }
        guard ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
              let host = url.host()?.lowercased(), host == webBase.host()?.lowercased()
        else { return nil }
        return path
    }
}
