import Foundation

/// Pure parts of Connect Lodestar (api.md §9.3, §9.4, §11): outcome copy, reading the
/// callback, and the preference import summary.
enum LodestarConnectLogic {
    /// True once the web serves the JSON `POST /oauth/lodestar/callback` and the AASA
    /// `webcredentials` entry, and the app has the associated-domains entitlement (api.md §11).
    /// Until then Connect uses `LodestarWebConnectView`, the isolated web-view fallback.
    static let nativeCallbackAvailable = false

    static let callbackPath = "/oauth/lodestar/callback"

    /// What the callback reports in `/account?lodestar=<outcome>` (the web's `OUTCOME`).
    enum Outcome: String, Equatable, Sendable, CaseIterable {
        case connected
        case cancelled
        case expired
        case signedOut = "signed-out"
        case failed

        var text: String {
            switch self {
            case .connected: "Lodestar is connected."
            case .cancelled: "Connecting was cancelled in Lodestar."
            case .expired: "That sign-in took too long or came from another session. Try again."
            case .signedOut: "Sign in to Forage first, then connect Lodestar."
            case .failed: "Lodestar couldn't be connected. Try again."
            }
        }

        var isError: Bool { self != .connected }
    }

    /// The outcome when `url` is Forage's `/account?lodestar=…` page, else nil (keep navigating).
    /// An unknown outcome value reads as `.failed`.
    static func accountOutcome(_ url: URL, base: URL) -> Outcome? {
        guard sameOrigin(url, base), url.path() == "/account" || url.path() == "/account/" else { return nil }
        guard let raw = query(url)["lodestar"] else { return nil }
        return Outcome(rawValue: raw) ?? .failed
    }

    /// What the native callback URL carries.
    enum Callback: Equatable, Sendable {
        case code(LodestarCallback)
        case refused(Outcome)
    }

    /// Reads `code`, `state`, `iss` or `error` from the redirect (api.md §11 step 3).
    static func callback(from url: URL) -> Callback {
        let items = query(url)
        if let error = items["error"] {
            return .refused(error == "access_denied" ? .cancelled : .failed)
        }
        guard let code = items["code"], !code.isEmpty, code.count <= 200,
              let state = items["state"], !state.isEmpty
        else { return .refused(.failed) }
        return .code(LodestarCallback(code: code, state: state, iss: items["iss"]))
    }

    /// "Imported 4 cuisines, vegetarian, budget $$." (the web's `importedText`).
    static func importedText(_ seed: LodestarSeed) -> String {
        var parts = [plural(seed.cuisines.count, "cuisine")]
        parts += seed.dietary.map { $0.replacingOccurrences(of: "_", with: " ") }
        if let ceiling = seed.priceCeiling, ceiling > 0 {
            parts.append("budget \(String(repeating: "$", count: ceiling))")
        }
        return "Imported \(parts.joined(separator: ", "))."
    }

    private static func sameOrigin(_ a: URL, _ b: URL) -> Bool {
        a.scheme?.lowercased() == b.scheme?.lowercased()
            && a.host()?.lowercased() == b.host()?.lowercased()
            && (a.port ?? defaultPort(a)) == (b.port ?? defaultPort(b))
    }

    private static func defaultPort(_ url: URL) -> Int? {
        switch url.scheme?.lowercased() {
        case "https": 443
        case "http": 80
        default: nil
        }
    }

    private static func query(_ url: URL) -> [String: String] {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        var result: [String: String] = [:]
        for item in items where result[item.name] == nil {
            result[item.name] = item.value ?? ""
        }
        return result
    }
}

/// `data.seed` of `POST /api/lodestar/preferences`: what came over from Lodestar.
struct LodestarSeed: Codable, Hashable, Sendable {
    let cuisines: [String]
    let dietary: [String]
    let priceCeiling: Int?
}

struct LodestarPreferencesResponse: Codable, Hashable, Sendable {
    let seed: LodestarSeed
}

/// Lodestar routes not in `Core/Endpoints` yet (feature-local; promote later).
enum LodestarFeatureAPI {
    /// `POST /api/lodestar/preferences`: import liked cuisines, dietary needs and budget.
    static var importPreferences: Endpoint<LodestarPreferencesResponse> {
        Endpoint(method: .post, path: "/api/lodestar/preferences", timeout: Timeouts.recs)
    }
}
