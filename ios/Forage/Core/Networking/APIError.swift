import Foundation

/// Every failure the API layer reports. `message` is always safe to show the user as written.
/// Cancellation is never an `APIError`: a cancelled request throws `CancellationError`.
enum APIError: Error, Equatable, Sendable {
    /// The server answered `{ok:false, error}` (any status). `message` is the server's sentence.
    case server(status: Int, message: String)
    /// The server answered something that is not the envelope (proxy page, empty body).
    case http(status: Int)
    /// No response: offline, DNS, TLS, connection lost.
    case offline
    /// The request ran past its timeout.
    case timedOut
    /// The envelope said ok but `data` didn't match the model. `detail` is for logs only.
    case decoding(detail: String)
    /// The request could not be built (bad body, bad URL). `detail` is for logs only.
    case invalidRequest(detail: String)

    static let offlineMessage = "Can't reach Forage. Check your connection."
    static let timedOutMessage = "Forage took too long to answer. Try again."
    static let decodingMessage = "Forage sent something this version of the app can't read. Try again, or update the app."
    static let invalidRequestMessage = "That request couldn't be sent. Try again."

    /// The only message that means "no valid session" (api.md §0). Every other 401 is something
    /// else: a wrong login, a wrong delete password, or AI not connected.
    static let signInMessage = "Sign in first."

    var message: String {
        switch self {
        case .server(_, let message): message
        case .http(let status): "Request failed (HTTP \(status))."
        case .offline: Self.offlineMessage
        case .timedOut: Self.timedOutMessage
        case .decoding: Self.decodingMessage
        case .invalidRequest: Self.invalidRequestMessage
        }
    }

    /// HTTP status, or 0 when there was no response.
    var status: Int {
        switch self {
        case .server(let status, _), .http(let status): status
        case .offline, .timedOut, .decoding, .invalidRequest: 0
        }
    }

    /// True when the session cookie is missing or revoked: drop to signed out.
    var isSignInRequired: Bool {
        guard case .server(401, let message) = self else { return false }
        return message == Self.signInMessage
    }

    /// True when an AI route needs the user to connect ChatGPT or Grok ("Connect your …",
    /// "Connect ChatGPT or Grok on the Account page to use Ask.").
    var needsAIConnection: Bool {
        guard case .server(401, let message) = self else { return false }
        return message.hasPrefix("Connect")
    }

    /// 429. Show the message; never retry automatically.
    var isRateLimited: Bool { status == 429 }

    /// 404 (for example "That place wasn't found.").
    var isNotFound: Bool { status == 404 }

    /// 409 on a Lodestar route: the link is gone, refresh `GET /api/lodestar`.
    var isLodestarUnlinked: Bool { status == 409 }

    /// Maps a transport error. Returns nil for cancellation, which callers rethrow as `CancellationError`.
    static func from(transport error: any Error) -> APIError? {
        if error is CancellationError { return nil }
        guard let urlError = error as? URLError else { return .offline }
        switch urlError.code {
        case .cancelled: return nil
        case .timedOut: return .timedOut
        default: return .offline
        }
    }
}

extension APIError: LocalizedError {
    var errorDescription: String? { message }
}

extension Error {
    /// A user-facing sentence for any error the app shows.
    var userMessage: String {
        if let api = self as? APIError { return api.message }
        return "That didn't work. Try again."
    }

    /// True for task or URL cancellation, which should never show an error.
    var isCancellation: Bool {
        if self is CancellationError { return true }
        if let url = self as? URLError, url.code == .cancelled { return true }
        return false
    }
}
