import Foundation

/// `data` of `GET /api/ai/status`. Unlike Lodestar there is no model list.
struct AIStatus: Codable, Hashable, Sendable {
    let connected: Connected

    struct Connected: Codable, Hashable, Sendable {
        let codex: Bool
        let grok: Bool
    }

    /// What the web assumes when the status call fails.
    static let disconnected = AIStatus(connected: Connected(codex: false, grok: false))

    var anyConnected: Bool { connected.codex || connected.grok }

    /// ChatGPT when connected, otherwise Grok, otherwise none (the server's `tokensFor`).
    var defaultProvider: AIProvider? {
        if connected.codex { return .codex }
        if connected.grok { return .grok }
        return nil
    }

    var connectedCount: Int { (connected.codex ? 1 : 0) + (connected.grok ? 1 : 0) }

    func isConnected(_ provider: AIProvider) -> Bool {
        switch provider {
        case .codex: connected.codex
        case .grok: connected.grok
        case .unknown: false
        }
    }
}

/// `data` of `POST /api/ai/{provider}/start`.
struct AISignInStart: Codable, Hashable, Sendable {
    let authorizeUrl: String
}

/// Body of `POST /api/ai/{provider}/complete`: the full loopback redirect URL, a query string,
/// or (Grok only) the bare code.
struct AISignInComplete: Codable, Hashable, Sendable {
    let callback: String
}

/// `data` of `/complete`.
struct AIConnected: Codable, Hashable, Sendable {
    let connected: AIProvider
}

/// `data` of `POST /api/ai/{provider}/logout`.
struct AIDisconnected: Codable, Hashable, Sendable {
    let disconnected: AIProvider
}
