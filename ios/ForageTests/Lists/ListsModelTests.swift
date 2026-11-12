import Foundation
import Testing
@testable import Forage

@Suite("Lists model across accounts")
@MainActor
struct ListsModelTests {
    private static let bothLists = """
    {"ok":true,"data":{"visits":[\(Fixture.visit)],"places":[\(Fixture.place())],"scores":[\(Fixture.score)],"items":[]}}
    """

    private func app(host: String) -> AppState {
        let api = APIClient(config: APIConfig(baseURL: URL(string: "https://\(host)")!), vault: nil,
                            protocolClasses: [StubProtocol.self])
        return AppState(api: api)
    }

    @Test func nextAccountNeverSeesThePreviousLists() async {
        let host = "lists-accounts.test"
        let app = app(host: host)
        let model = ListsModel()
        StubProtocol.stub(host: host, .init(body: Self.bothLists))
        app.becomeSignedIn(AccountUser(email: "a@example.com", createdAt: nil))
        await model.load(app)
        #expect(model.state.value?.been.count == 1)

        // A signs out, B signs in on the same device and B's load fails.
        app.becomeSignedOut()
        app.becomeSignedIn(AccountUser(email: "b@example.com", createdAt: nil))
        StubProtocol.stub(host: host, .init(status: 500, body: #"{"ok":false,"error":"Something went wrong."}"#))
        await model.load(app)
        #expect(model.state.value == nil)
        if case .failed = model.state {} else { Issue.record("Expected a failed state, got \(model.state)") }
    }

    @Test func signedOutClearsWhatWasShown() async {
        let host = "lists-signout.test"
        let app = app(host: host)
        let model = ListsModel()
        StubProtocol.stub(host: host, .init(body: Self.bothLists))
        app.becomeSignedIn(AccountUser(email: "a@example.com", createdAt: nil))
        await model.load(app)
        #expect(model.state.value != nil)

        app.becomeSignedOut()
        await model.load(app)
        #expect(model.state.value == nil)
        #expect(model.actionError == nil)
    }
}
