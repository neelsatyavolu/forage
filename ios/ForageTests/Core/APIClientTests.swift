import Foundation
import os
import Testing
@testable import Forage

/// Answers requests from a per-host table, so suites running in parallel don't share stubs.
final class StubProtocol: URLProtocol {
    struct Reply: Sendable {
        var status = 200
        var body = ""
        var headers: [String: String] = ["Content-Type": "application/json"]
        var failure: URLError.Code?
    }

    private static let replies = OSAllocatedUnfairLock<[String: Reply]>(initialState: [:])
    private static let seen = OSAllocatedUnfairLock<[String: [URLRequest]]>(initialState: [:])

    static func stub(host: String, _ reply: Reply) {
        replies.withLock { $0[host] = reply }
    }

    static func requests(host: String) -> [URLRequest] {
        seen.withLock { $0[host] ?? [] }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let request = self.request
        let host = request.url?.host() ?? ""
        Self.seen.withLock { $0[host, default: []].append(request) }
        guard let reply = Self.replies.withLock({ $0[host] }), let url = request.url else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotFindHost))
            return
        }
        if let failure = reply.failure {
            client?.urlProtocol(self, didFailWithError: URLError(failure))
            return
        }
        let response = HTTPURLResponse(url: url, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: reply.headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(reply.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@Suite("API client over stubbed HTTP")
struct APIClientTests {
    private func client(host: String) -> APIClient {
        let cookies = HTTPCookieStorage.sharedCookieStorage(forGroupContainerIdentifier: "forage-tests-\(host)")
        return APIClient(config: APIConfig(baseURL: URL(string: "https://\(host)")!), cookies: cookies,
                         vault: nil, protocolClasses: [StubProtocol.self])
    }

    @Test func sendDecodesData() async throws {
        let host = "decode.test"
        StubProtocol.stub(host: host, .init(body: #"{"ok":true,"data":{"connected":{"codex":true,"grok":false}}}"#))
        let status = try await client(host: host).send(API.AI.status)
        #expect(status.defaultProvider == .codex)
        let sent = try #require(StubProtocol.requests(host: host).first)
        #expect(sent.url?.path() == "/api/ai/status")
        #expect(sent.value(forHTTPHeaderField: "Origin") == nil)
    }

    @Test func signInFirstIsSignInRequired() async {
        let host = "signedout.test"
        StubProtocol.stub(host: host, .init(status: 401, body: #"{"ok":false,"error":"Sign in first."}"#))
        do {
            _ = try await client(host: host).send(API.Visits.list)
            Issue.record("Expected an error")
        } catch let error as APIError {
            #expect(error.isSignInRequired)
            #expect(error.message == "Sign in first.")
        } catch {
            Issue.record("Wrong error \(error)")
        }
    }

    @Test func offlineMapsToFriendlyMessage() async {
        let host = "offline.test"
        StubProtocol.stub(host: host, .init(failure: .notConnectedToInternet))
        do {
            _ = try await client(host: host).send(API.Want.list)
            Issue.record("Expected an error")
        } catch {
            #expect(error as? APIError == .offline)
            #expect(error.userMessage == "Can't reach Forage. Check your connection.")
        }
    }

    @Test func sessionCookieHelpers() throws {
        let base = URL(string: "https://cookie.test")!
        let api = APIClient(config: APIConfig(baseURL: base), vault: nil, protocolClasses: [StubProtocol.self])
        let cookie = try #require(HTTPCookie(properties: [
            .name: APIClient.sessionCookieName, .value: "u.1.1.sig", .domain: "cookie.test", .path: "/", .secure: "TRUE",
        ]))
        api.cookies.setCookie(cookie)
        #expect(api.hasSessionCookie)
        #expect(!(HTTPCookieStorage.shared.cookies(for: base) ?? []).contains { $0.name == APIClient.sessionCookieName })
        api.clearSessionCookie()
        #expect(!api.hasSessionCookie)
    }

    @Test func sessionCookieSurvivesRelaunchThroughKeychainOnly() async throws {
        let host = "vault.test"
        let base = URL(string: "https://\(host)")!
        let vault = CookieVault(service: "co.xanom.forage.tests.\(UUID().uuidString)")
        defer { vault.clear() }
        StubProtocol.stub(host: host, .init(body: #"{"ok":true,"data":{"connected":{"codex":false,"grok":false}}}"#))
        let first = APIClient(config: APIConfig(baseURL: base), vault: vault, protocolClasses: [StubProtocol.self])
        // URLSession only applies Set-Cookie for real HTTP, so put the cookie in as if a response had set it.
        let cookie = try #require(HTTPCookie(properties: [
            .name: APIClient.sessionCookieName, .value: "u.1.1.sig", .domain: host, .path: "/", .secure: "TRUE",
            .expires: Date.now.addingTimeInterval(3600), HTTPCookiePropertyKey("HttpOnly"): "TRUE",
        ]))
        first.cookies.setCookie(cookie)
        _ = try await first.send(API.AI.status)
        #expect(first.hasSessionCookie)
        #expect(!(HTTPCookieStorage.shared.cookies(for: base) ?? []).contains { $0.name == APIClient.sessionCookieName })

        // A new client (a relaunch) gets the cookie back from the Keychain.
        let relaunched = APIClient(config: APIConfig(baseURL: base), vault: vault, protocolClasses: [StubProtocol.self])
        let restored = try #require(relaunched.cookies.cookies(for: base)?.first { $0.name == APIClient.sessionCookieName })
        #expect(restored.value == "u.1.1.sig")
        #expect(restored.isHTTPOnly)
        #expect(restored.isSecure)

        // Sign-out removes it from the Keychain too.
        relaunched.clearSessionCookie()
        let afterSignOut = APIClient(config: APIConfig(baseURL: base), vault: vault, protocolClasses: [StubProtocol.self])
        #expect(!afterSignOut.hasSessionCookie)
    }

    @Test @MainActor func appStateDropsToSignedOutOnlyForSignInFirst() {
        let app = AppState(api: client(host: "state.test"))
        #expect(app.handle(APIError.server(status: 401, message: "That password isn't right.")) == "That password isn't right.")
        #expect(app.session == .checking)
        #expect(app.handle(APIError.server(status: 401, message: "Sign in first.")) == "Sign in first.")
        #expect(app.session == .signedOut)
        #expect(app.handle(CancellationError()) == nil)
    }
}
