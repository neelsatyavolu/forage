import Foundation
import os

/// The one way the app talks to Forage. All calls share one URLSession and one cookie
/// store, so `fg_session`, `fg_device`, the AI PKCE cookies and `fg_lodestar_flow` all flow.
///
/// Every method throws either `APIError` (show `message`) or `CancellationError` (show nothing).
final class APIClient: Sendable {
    static let sessionCookieName = "fg_session"

    let config: APIConfig
    let session: URLSession
    let cookies: HTTPCookieStorage
    private static let log = Logger(subsystem: "co.xanom.forage", category: "api")

    init(config: APIConfig = .current(), cookies: HTTPCookieStorage = .shared, protocolClasses: [AnyClass]? = nil) {
        self.config = config
        self.cookies = cookies
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = cookies
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.timeoutIntervalForRequest = Timeouts.ai
        configuration.timeoutIntervalForResource = 600
        configuration.waitsForConnectivity = false
        if let protocolClasses { configuration.protocolClasses = protocolClasses }
        self.session = URLSession(configuration: configuration)
    }

    var baseURL: URL { config.baseURL }

    /// Sends a JSON route and returns its unwrapped `data`.
    func send<R>(_ endpoint: Endpoint<R>) async throws -> R {
        let request = try endpoint.makeRequest(baseURL: baseURL)
        let (data, status) = try await perform(request)
        do {
            return try ResponseDecoder.decode(R.self, data: data, status: status)
        } catch {
            if case .decoding(let detail) = error {
                Self.log.error("Decoding \(endpoint.path, privacy: .public) failed: \(detail, privacy: .public)")
            }
            throw error
        }
    }

    /// True while an `fg_session` cookie is stored (it may still be revoked on the server).
    var hasSessionCookie: Bool {
        (cookies.cookies(for: baseURL) ?? []).contains { $0.name == Self.sessionCookieName }
    }

    /// Deletes the session cookie locally (used after logout, even if the call failed).
    func clearSessionCookie() {
        for cookie in cookies.cookies(for: baseURL) ?? [] where cookie.name == Self.sessionCookieName {
            cookies.deleteCookie(cookie)
        }
    }

    // MARK: - Transport

    private func perform(_ request: URLRequest) async throws -> (Data, Int) {
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.http(status: 0) }
            return (data, http.statusCode)
        } catch {
            throw Self.mapped(error)
        }
    }

    private static func mapped(_ error: any Error) -> any Error {
        if let api = error as? APIError { return api }
        guard let mapped = APIError.from(transport: error) else { return CancellationError() }
        return mapped
    }
}
