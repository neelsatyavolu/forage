import Foundation
import Testing
@testable import Forage

@MainActor
@Suite("Account form")
struct AccountFormModelTests {
    private func actions(signIn: @escaping @MainActor (String, String) async throws -> Void = { _, _ in },
                         forgot: @escaping @MainActor (String) async throws -> String = { _ in "If an account exists…" }) -> AccountActions {
        AccountActions(signIn: signIn, register: { _, _ in }, forgot: forgot, reset: { _, _ in },
                       report: { $0.isCancellation ? nil : $0.userMessage })
    }

    @Test func validatesBeforeCalling() async {
        let model = AccountFormModel(mode: .register, email: "nope", resetLink: "")
        model.password = "short"
        let outcome = await model.submit(actions())
        #expect(outcome == nil)
        #expect(model.error == "Enter a valid email and a password of at least 8 characters.")
    }

    @Test func signInTrimsEmailAndClearsPassword() async {
        var seen: (String, String)?
        let model = AccountFormModel(mode: .signIn, email: "  a@b.co ", resetLink: "")
        model.password = "secret"
        let outcome = await model.submit(actions(signIn: { seen = ($0, $1) }))
        #expect(outcome == .signedIn)
        #expect(seen?.0 == "a@b.co")
        #expect(model.password.isEmpty)
    }

    @Test func serverErrorIsShown() async {
        let model = AccountFormModel(mode: .signIn, email: "a@b.co", resetLink: "")
        model.password = "wrong"
        let outcome = await model.submit(actions(signIn: { _, _ in
            throw APIError.server(status: 401, message: "That email and password don't match an account.")
        }))
        #expect(outcome == nil)
        #expect(model.error == "That email and password don't match an account.")
    }

    @Test func forgotShowsNotice() async {
        let model = AccountFormModel(mode: .forgot, email: "a@b.co", resetLink: "")
        #expect(await model.submit(actions()) == .noticeShown)
        #expect(model.notice == "If an account exists…")
    }

    @Test func resetNeedsAToken() async {
        let model = AccountFormModel(mode: .reset, email: "", resetLink: "https://forage.xanom.co/reset")
        model.password = "longenough"
        #expect(await model.submit(actions()) == nil)
        #expect(model.error == AccountFormModel.missingTokenMessage)
        model.resetLink = "https://forage.xanom.co/reset?token=abc_123"
        #expect(await model.submit(actions()) == .resetDone)
    }

    @Test func deleteNeedsPassword() async {
        let model = DeleteAccountModel()
        let deleted = await model.delete(using: { _ in }, report: { $0.userMessage })
        #expect(!deleted)
        #expect(model.error == "Enter your password to delete your account.")
        model.password = "pw"
        #expect(await model.delete(using: { _ in }, report: { $0.userMessage }))
    }

    @Test func deepLinks() {
        let base = APIConfig.defaultBaseURL
        #expect(DeepLink.parse(URL(string: "forage://reset?token=abc")!, webBase: base) == .resetPassword(link: "abc"))
        #expect(DeepLink.parse(URL(string: "https://forage.xanom.co/reset?token=abc")!, webBase: base) == .resetPassword(link: "abc"))
        #expect(DeepLink.parse(URL(string: "https://evil.example/reset?token=abc")!, webBase: base) == nil)
        #expect(DeepLink.parse(URL(string: "forage://reset")!, webBase: base) == nil)
    }

    @Test func aiSectionCopy() {
        #expect(AccountAISection.intro(signedIn: true).hasSuffix("saved to your account."))
        #expect(AccountAISection.intro(signedIn: false).contains("only on this device"))
    }
}
