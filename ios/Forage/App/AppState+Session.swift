import Foundation

/// Account actions. Each throws `APIError` (show `message`) on failure and updates the shared
/// state on success, so screens only handle their own busy and error UI.
extension AppState {
    func signIn(email: String, password: String) async throws {
        let result = try await api.send(API.Account.login(Credentials(email: email, password: password)))
        await finishSignIn(result)
    }

    func register(email: String, password: String) async throws {
        let result = try await api.send(API.Account.register(Credentials(email: email, password: password)))
        await finishSignIn(result)
    }

    /// Signs out this device. Never fails from the user's view: local state is cleared regardless
    /// (the web ignores failures too).
    func signOut() async {
        _ = try? await api.send(API.Account.logout)
        becomeSignedOut()
        await refreshAIStatus()
    }

    /// Deletes the account (App Store 5.1.1(v)). A wrong password throws
    /// "That password isn't right." and leaves the session as is.
    func deleteAccount(password: String) async throws {
        do {
            _ = try await api.send(API.Account.delete(password: password))
        } catch let error as APIError where error.isSignInRequired {
            becomeSignedOut()
            throw error
        }
        becomeSignedOut()
        await refreshAIStatus()
    }

    /// Ends every other session; this device stays signed in with a fresh cookie.
    func signOutEverywhereElse() async throws {
        do {
            _ = try await api.send(API.Account.signOutEverywhere)
        } catch {
            handle(error)
            throw error
        }
    }

    /// Returns the neutral "If an account exists…" message to show.
    func requestPasswordReset(email: String) async throws -> String {
        try await api.send(API.Account.forgot(email: email)).message
    }

    /// Sets a new password from a reset token; the server signs this device in.
    func resetPassword(token: String, password: String) async throws {
        _ = try await api.send(API.Account.reset(ResetRequest(token: token, password: password)))
        await refreshAccount()
        await refreshAIStatus()
    }

    /// Removes the connection (from the account when signed in, from this device either way),
    /// then refreshes. Failures are ignored, like the web.
    func disconnectAI(_ provider: AIProvider) async {
        _ = try? await api.send(API.AI.logout(provider))
        await refreshAIStatus()
    }

    private func finishSignIn(_ result: AccountSession) async {
        becomeSignedIn(result.user)
        // Login answers carry no createdAt; GET /api/account does.
        await refreshAccount()
        await refreshAIStatus()
    }
}
