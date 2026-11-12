import Foundation
import Testing
@testable import Forage

@Suite("AI sign-in logic")
struct AIConnectLogicTests {
    @Test func requestTargetFromRawHTTP() {
        let raw = "GET /auth/callback?code=abc&state=xyz HTTP/1.1\r\nHost: localhost:1455\r\n\r\n"
        #expect(AIConnectLogic.requestTarget(raw) == "/auth/callback?code=abc&state=xyz")
        #expect(AIConnectLogic.requestTarget("POST / HTTP/1.1") == nil)
    }

    @Test func outcomes() {
        #expect(AIConnectLogic.outcome(target: "/auth/callback?code=abc&state=xyz", provider: .codex)
            == .callback("http://localhost:1455/auth/callback?code=abc&state=xyz"))
        #expect(AIConnectLogic.outcome(target: "/callback?code=g1", provider: .grok) == .callback("http://127.0.0.1:56121/callback?code=g1"))
        #expect(AIConnectLogic.outcome(target: "/auth/callback?error=access_denied", provider: .codex) == .refused)
        #expect(AIConnectLogic.outcome(target: "/favicon.ico", provider: .codex) == .ignore)
        #expect(AIConnectLogic.outcome(target: "/callback?code=abc", provider: .codex) == .ignore)
    }

    @Test func forageCopy() {
        #expect(AIConnectLogic.successPage == "Connected. You can return to Forage.")
        #expect(AIConnectLogic.httpResponse(body: "x").contains("<title>Forage</title>"))
        #expect(AIConnectLogic.intro(signedIn: false).hasPrefix("Forage's AI runs on your own ChatGPT or Grok subscription."))
        #expect(AIConnectLogic.nativeMessage("This sign-in expired. Click Connect again.") == "This sign-in expired. Tap Connect again.")
        #expect(AIConnectLogic.pastePlaceholder(.grok) == "Code from Grok")
    }

    @Test func firstChoice() {
        let onlyCodex = AIStatus(connected: .init(codex: true, grok: false))
        #expect(AIConnectSheet.firstChoice(onlyCodex) == .grok)
        #expect(AIConnectSheet.firstChoice(.disconnected) == .codex)
    }

    @Test @MainActor func modelStartsAndFinishes() async {
        let model = AIConnectModel(start: { _ in "https://auth.openai.com/oauth/authorize?x=1" },
                                   complete: { provider, _ in provider })
        #expect(!model.canConnect)
        #expect(await model.begin() != nil)
        model.pasted = "http://localhost:1455/auth/callback?code=a&state=b"
        #expect(model.canConnect)
        #expect(await model.finish())
        #expect(model.connected == .codex)
    }

    @Test @MainActor func modelShowsTapCopyOnFailure() async {
        let model = AIConnectModel(start: { _ in "https://auth.x.ai/oauth2/authorize" }, complete: { _, _ in
            throw APIError.server(status: 400, message: "This sign-in expired. Click Connect again.")
        })
        model.select(.grok)
        _ = await model.begin()
        #expect(!(await model.finish(callback: "code")))
        #expect(model.error == "This sign-in expired. Tap Connect again.")
    }
}
