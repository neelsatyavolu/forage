import Foundation

/// Where the app talks to. The default comes from Info.plist (`ForageBaseURL`);
/// the `apiBaseURL` user default overrides it, which also makes the launch argument
/// `-apiBaseURL http://localhost:3000` work for a local dev server. Debug builds can also
/// set it from Account > Developer.
struct APIConfig: Sendable, Equatable {
    static let defaultBaseURL = URL(string: "https://forage.xanom.co")!
    static let localBaseURL = URL(string: "http://localhost:3000")!
    static let overrideKey = "apiBaseURL"

    let baseURL: URL

    init(baseURL: URL) {
        self.baseURL = baseURL
    }

    /// Reads the override, then Info.plist, then the built-in default.
    static func current(defaults: UserDefaults = .standard, bundle: Bundle = .main) -> APIConfig {
        APIConfig(baseURL: validURL(defaults.string(forKey: overrideKey)) ?? bundledBaseURL(bundle: bundle))
    }

    /// Info.plist's `ForageBaseURL`, else the built-in default (ignores the override).
    static func bundledBaseURL(bundle: Bundle = .main) -> URL {
        validURL(bundle.object(forInfoDictionaryKey: "ForageBaseURL") as? String) ?? defaultBaseURL
    }

    /// Resolves a server-relative path or returns an absolute URL as is.
    func resolve(_ pathOrURL: String) -> URL? {
        if let absolute = URL(string: pathOrURL), absolute.scheme != nil {
            return absolute
        }
        return URL(string: pathOrURL, relativeTo: baseURL)?.absoluteURL
    }

    static func validURL(_ string: String?) -> URL? {
        guard let string, let url = URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              url.host() != nil
        else { return nil }
        return url
    }
}
