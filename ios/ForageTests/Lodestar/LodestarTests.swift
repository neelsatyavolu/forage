import Foundation
import Testing
@testable import Forage

@Suite("Connect Lodestar logic")
struct LodestarConnectLogicTests {
    private let base = URL(string: "https://forage.xanom.co")!

    @Test func outcomeCopyMatchesTheWeb() {
        #expect(LodestarConnectLogic.Outcome.connected.text == "Lodestar is connected.")
        #expect(LodestarConnectLogic.Outcome.signedOut.rawValue == "signed-out")
        #expect(!LodestarConnectLogic.Outcome.connected.isError)
        #expect(LodestarConnectLogic.Outcome.expired.isError)
    }

    @Test func readsTheAccountRedirect() {
        let read = { LodestarConnectLogic.accountOutcome(URL(string: $0)!, base: base) }
        #expect(read("https://forage.xanom.co/account?lodestar=connected") == .connected)
        #expect(read("https://forage.xanom.co/account?lodestar=signed-out") == .signedOut)
        #expect(read("https://forage.xanom.co/account?lodestar=weird") == .failed)
        #expect(read("https://forage.xanom.co/account") == nil)
        #expect(read("https://forage.xanom.co/oauth/lodestar/callback?code=x") == nil)
        #expect(read("https://lodestar.xanom.co/account?lodestar=connected") == nil)
        #expect(read("http://forage.xanom.co/account?lodestar=connected") == nil)
        #expect(LodestarConnectLogic.accountOutcome(URL(string: "http://localhost:3000/account?lodestar=expired")!,
                                                    base: URL(string: "http://localhost:3000")!) == .expired)
    }

    @Test func readsTheNativeCallback() {
        let url = URL(string: "https://forage.xanom.co/oauth/lodestar/callback?code=c1&state=s1&iss=https%3A%2F%2Flodestar.xanom.co")!
        #expect(LodestarConnectLogic.callback(from: url)
            == .code(LodestarCallback(code: "c1", state: "s1", iss: "https://lodestar.xanom.co")))
        let denied = URL(string: "https://forage.xanom.co/oauth/lodestar/callback?error=access_denied&state=s1")!
        #expect(LodestarConnectLogic.callback(from: denied) == .refused(.cancelled))
        let other = URL(string: "https://forage.xanom.co/oauth/lodestar/callback?error=server_error")!
        #expect(LodestarConnectLogic.callback(from: other) == .refused(.failed))
        let noState = URL(string: "https://forage.xanom.co/oauth/lodestar/callback?code=c1")!
        #expect(LodestarConnectLogic.callback(from: noState) == .refused(.failed))
    }

    @Test func importedText() {
        #expect(LodestarConnectLogic.importedText(LodestarSeed(cuisines: ["a", "b", "c", "d"], dietary: ["vegetarian", "gluten_free"], priceCeiling: 2))
            == "Imported 4 cuisines, vegetarian, gluten free, budget $$.")
        #expect(LodestarConnectLogic.importedText(LodestarSeed(cuisines: ["thai"], dietary: [], priceCeiling: nil))
            == "Imported 1 cuisine.")
    }

    @Test func preferencesDecode() throws {
        let decoded = try decodeEnvelope(#"{"seed":{"cuisines":["thai"],"dietary":[],"priceCeiling":null}}"#,
                                         as: LodestarPreferencesResponse.self)
        #expect(decoded.seed.cuisines == ["thai"])
        #expect(LodestarFeatureAPI.importPreferences.method == .post)
        #expect(LodestarFeatureAPI.importPreferences.path == "/api/lodestar/preferences")
    }
}

@Suite("Lodestar section")
struct LodestarSectionTests {
    @MainActor
    private final class Calls {
        var status: [LodestarStatus] = []
        var refreshed = 0
        var clearedCookie = 0
    }

    @MainActor
    private func model(_ calls: Calls,
                       connect: @escaping @Sendable () async throws -> URL = { URL(string: "https://lodestar.xanom.co/oauth/authorize?x=1")! },
                       disconnect: @escaping @Sendable () async throws -> LodestarStatus = { .unlinked },
                       importPreferences: @escaping @Sendable () async throws -> LodestarSeed = {
                           LodestarSeed(cuisines: ["thai"], dietary: [], priceCeiling: 1)
                       }) -> LodestarSectionModel {
        LodestarSectionModel(service: .init(
            connect: connect,
            callback: { _ in .linked(label: "lodestar.xanom.co", connectedAt: 1) },
            disconnect: disconnect,
            importPreferences: importPreferences,
            refresh: { calls.refreshed += 1 },
            setStatus: { calls.status.append($0) },
            handle: { $0.isCancellation ? nil : $0.userMessage },
            clearFlowCookie: { calls.clearedCookie += 1 }))
    }

    @Test @MainActor func connectOpensTheWebFallback() async {
        let calls = Calls()
        let model = model(calls)
        await model.connect()
        #expect(model.webConnect?.url.host() == "lodestar.xanom.co")
        #expect(!model.busy)

        await model.finishWeb(.connected)
        #expect(model.webConnect == nil)
        #expect(model.message == .init(text: "Lodestar is connected.", isError: false))
        #expect(calls.refreshed == 1)
        #expect(calls.clearedCookie == 1)
    }

    @Test @MainActor func closingTheFallbackSaysNothing() async {
        let calls = Calls()
        let model = model(calls)
        await model.connect()
        await model.finishWeb(nil)
        #expect(model.message == nil)
        #expect(calls.refreshed == 0)
        #expect(calls.clearedCookie == 1)
    }

    @Test @MainActor func connectErrorShows() async {
        let model = model(Calls(), connect: {
            throw APIError.server(status: 429, message: "Too many Lodestar requests. Wait a few minutes and try again.")
        })
        await model.connect()
        #expect(model.webConnect == nil)
        #expect(model.message?.isError == true)
    }

    @Test @MainActor func disconnectSetsStatus() async {
        let calls = Calls()
        let model = model(calls)
        await model.disconnect()
        #expect(calls.status == [.unlinked])
    }

    @Test @MainActor func importReportsAndRefreshesOn409() async {
        let calls = Calls()
        let ok = model(calls)
        await ok.importPreferences()
        #expect(ok.message == .init(text: "Imported 1 cuisine, budget $.", isError: false))

        let revoked = model(calls, importPreferences: {
            throw APIError.server(status: 409, message: "Connect Lodestar from Account first.")
        })
        await revoked.importPreferences()
        #expect(revoked.message == .init(text: "Connect Lodestar from Account first.", isError: true))
        #expect(calls.refreshed == 1)
    }
}
