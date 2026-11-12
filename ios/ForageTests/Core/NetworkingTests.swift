import Foundation
import Testing
@testable import Forage

@Suite("Envelope decoding")
struct EnvelopeTests {
    @Test func decodesSuccessData() throws {
        let value = try decodeEnvelope(#"{"user":{"email":"a@b.co","createdAt":1762000000000}}"#, as: AccountState.self)
        #expect(value.user?.email == "a@b.co")
        #expect(value.user?.createdAt == 1_762_000_000_000)
    }

    @Test func errorEnvelopeCarriesServerMessage() {
        let body = Data(#"{"ok":false,"error":"Too many attempts. Try again in 15 minutes."}"#.utf8)
        #expect(throws: APIError.server(status: 429, message: "Too many attempts. Try again in 15 minutes.")) {
            try ResponseDecoder.decode(AccountSession.self, data: body, status: 429)
        }
    }

    @Test func okFalseWithStatus200IsStillAnError() {
        let body = Data(#"{"ok":false,"error":"Nope."}"#.utf8)
        #expect(throws: APIError.server(status: 200, message: "Nope.")) {
            try ResponseDecoder.decode(EmptyResponse.self, data: body, status: 200)
        }
    }

    @Test func nonJSONBodyFallsBackToHTTPStatus() {
        // GET /api/ai/status isn't wrapped by handle(): a server failure is a plain 500.
        do {
            _ = try ResponseDecoder.decode(AIStatus.self, data: Data("Internal Server Error".utf8), status: 500)
            Issue.record("Expected an error")
        } catch {
            #expect(error == .http(status: 500))
            #expect(error.message == "Request failed (HTTP 500).")
        }
    }

    @Test func emptyDataObjectDecodes() throws {
        _ = try decodeEnvelope("{}", as: EmptyResponse.self)
        _ = try ResponseDecoder.decode(EmptyResponse.self, data: Data(#"{"ok":true}"#.utf8), status: 200)
    }

    @Test func wrongShapeIsADecodingError() {
        do {
            _ = try decodeEnvelope(#"{"connected":{"codex":"yes","grok":false}}"#, as: AIStatus.self)
            Issue.record("Expected an error")
        } catch {
            guard let api = error as? APIError, case .decoding = api else { Issue.record("Wrong error \(error)"); return }
            #expect(api.message == APIError.decodingMessage)
        }
    }
}

@Suite("API errors")
struct APIErrorTests {
    @Test func userMessages() {
        #expect(APIError.offline.message == "Can't reach Forage. Check your connection.")
        #expect(APIError.http(status: 504).message == "Request failed (HTTP 504).")
        #expect(APIError.server(status: 400, message: "Enter a valid email.").message == "Enter a valid email.")
        #expect(APIError.offline.status == 0)
    }

    @Test func onlySignInFirstSignsOut() {
        #expect(APIError.server(status: 401, message: "Sign in first.").isSignInRequired)
        #expect(!APIError.server(status: 401, message: "That email and password don't match an account.").isSignInRequired)
        #expect(!APIError.server(status: 401, message: "That password isn't right.").isSignInRequired)
        #expect(!APIError.server(status: 403, message: "Sign in first.").isSignInRequired)
    }

    @Test(arguments: [
        "Connect your ChatGPT or Grok account first.",
        "Connect your Grok account first.",
        "Connect ChatGPT or Grok on the Account page to use Ask.",
    ])
    func aiConnection401IsNotSignedOut(message: String) {
        let error = APIError.server(status: 401, message: message)
        #expect(!error.isSignInRequired)
        #expect(error.needsAIConnection)
    }

    @Test func statusHelpers() {
        #expect(APIError.server(status: 429, message: "x").isRateLimited)
        #expect(APIError.server(status: 404, message: "That place wasn't found.").isNotFound)
        #expect(APIError.server(status: 409, message: "Connect Lodestar from Account first.").isLodestarUnlinked)
        #expect(!APIError.server(status: 409, message: "x").needsAIConnection)
    }

    @Test func transportMapping() {
        #expect(APIError.from(transport: URLError(.notConnectedToInternet)) == .offline)
        #expect(APIError.from(transport: URLError(.timedOut)) == .timedOut)
        #expect(APIError.from(transport: URLError(.cancelled)) == nil)
        #expect(APIError.from(transport: CancellationError()) == nil)
        #expect(URLError(.cancelled).isCancellation)
        #expect(!APIError.offline.isCancellation)
    }
}

@Suite("Endpoint requests")
struct EndpointTests {
    let base = URL(string: "https://forage.xanom.co")!

    @Test func postWithoutBodySendsEmptyObjectAndNoOrigin() throws {
        let request = try API.Account.logout.makeRequest(baseURL: base)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "https://forage.xanom.co/api/account/logout")
        #expect(request.httpBody == Data("{}".utf8))
        #expect(request.value(forHTTPHeaderField: "Origin") == nil)
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    }

    @Test func deletesCarryABody() throws {
        let want = try API.Want.remove(placeId: Fixture.placeID).makeRequest(baseURL: base)
        #expect(want.httpMethod == "DELETE")
        #expect(want.httpBody == Data(#"{"placeId":"\#(Fixture.placeID)"}"#.utf8))
        let account = try API.Account.delete(password: "hunter22").makeRequest(baseURL: base)
        #expect(account.httpBody == Data(#"{"password":"hunter22"}"#.utf8))
    }

    @Test func getHasQueryAndNoBody() throws {
        let request = try API.Places.search(" ramen nagi ", near: LatLng(lat: 37.44431, lng: -122.16109)).makeRequest(baseURL: base)
        #expect(request.httpMethod == "GET")
        #expect(request.url?.absoluteString == "https://forage.xanom.co/api/places?q=ramen%20nagi&lat=37.44431&lng=-122.16109")
        #expect(request.httpBody == nil)
        let nearby = try API.Places.nearby(LatLng(lat: 1, lng: 2), radiusKm: 1.5).makeRequest(baseURL: base)
        #expect(nearby.url?.query == "lat=1.00000&lng=2.00000&radiusKm=1.5")
        let feedback = try API.Feedback.forPlace(id: "abc").makeRequest(baseURL: base)
        #expect(feedback.url?.absoluteString == "https://forage.xanom.co/api/feedback?placeId=abc")
    }

    @Test func timeoutsFollowRouteClasses() {
        #expect(API.Account.current.timeout == 30)
        #expect(API.Places.detail(id: "x").timeout == 45)
        #expect(API.Explore.geocode("mission").timeout == 45)
        #expect(API.Recs.near(NearRequest(lat: 0, lng: 0)).timeout == 90)
        #expect(API.Recs.ask(AskRequest(lat: 0, lng: 0, want: "ramen")).timeout == 150)
        #expect(API.Taste.refresh.timeout == 150)
        #expect(API.AI.complete(.codex, callback: "x").timeout == 150)
    }

    @Test func pathsResolveAgainstLocalBase() throws {
        let request = try API.Visits.edit(id: "v1", VisitPatch(reaction: .fine)).makeRequest(baseURL: APIConfig.localBaseURL)
        #expect(request.url?.absoluteString == "http://localhost:3000/api/visits/v1")
        #expect(request.httpMethod == "PATCH")
        let callback = try API.Lodestar.callback(LodestarCallback(code: "c", state: "s", iss: nil)).makeRequest(baseURL: base)
        #expect(callback.url?.path() == "/oauth/lodestar/callback")
    }

    @Test func aiCompleteTrimsAndCaps() throws {
        let long = "  " + String(repeating: "a", count: 5000) + "\n"
        let body = try #require(API.AI.complete(.grok, callback: long).makeRequest(baseURL: base).httpBody)
        let object = try #require(try JSONSerialization.jsonObject(with: body) as? [String: String])
        #expect(object["callback"]?.count == 4000)
    }

    @Test func configOverrideFromDefaults() throws {
        let defaults = try #require(UserDefaults(suiteName: "forage-tests-\(UUID().uuidString)"))
        let bundled = APIConfig.current(defaults: defaults).baseURL
        #expect(bundled == APIConfig.bundledBaseURL())
        defaults.set("http://localhost:3000", forKey: APIConfig.overrideKey)
        #expect(APIConfig.current(defaults: defaults).baseURL == APIConfig.localBaseURL)
        defaults.set("not a url", forKey: APIConfig.overrideKey)
        #expect(APIConfig.current(defaults: defaults).baseURL == bundled)
    }

    @Test func defaultBaseIsProduction() {
        #expect(APIConfig.defaultBaseURL.absoluteString == "https://forage.xanom.co")
    }
}
