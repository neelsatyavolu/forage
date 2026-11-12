import Foundation

/// Every endpoint the app calls, grouped by area (docs/api.md). Each factory returns a typed
/// `Endpoint` for `APIClient.send(_:)`, e.g. `try await app.api.send(API.Want.list)`.
enum API {}

extension API {
    /// Account (api.md §2). Prefer the `AppState` session methods, which also update the
    /// signed-in state.
    enum Account {
        static var current: Endpoint<AccountState> {
            Endpoint(method: .get, path: "/api/account")
        }

        static func register(_ credentials: Credentials) -> Endpoint<AccountSession> {
            Endpoint(method: .post, path: "/api/account/register", body: credentials)
        }

        static func login(_ credentials: Credentials) -> Endpoint<AccountSession> {
            Endpoint(method: .post, path: "/api/account/login", body: credentials)
        }

        static var logout: Endpoint<EmptyResponse> {
            Endpoint(method: .post, path: "/api/account/logout")
        }

        static var signOutEverywhere: Endpoint<EmptyResponse> {
            Endpoint(method: .post, path: "/api/account", body: SignOutEverywhereRequest())
        }

        static func delete(password: String) -> Endpoint<EmptyResponse> {
            Endpoint(method: .delete, path: "/api/account", body: DeleteAccountRequest(password: password))
        }

        static func forgot(email: String) -> Endpoint<ForgotResponse> {
            Endpoint(method: .post, path: "/api/account/forgot", body: ForgotRequest(email: email))
        }

        static func reset(_ request: ResetRequest) -> Endpoint<EmptyResponse> {
            Endpoint(method: .post, path: "/api/account/reset", body: request)
        }
    }

    /// ChatGPT / Grok connection (api.md §3).
    enum AI {
        /// Call on launch, after sign-in/out and after connect/disconnect.
        static var status: Endpoint<AIStatus> {
            Endpoint(method: .get, path: "/api/ai/status")
        }

        static func start(_ provider: AIProvider) -> Endpoint<AISignInStart> {
            Endpoint(method: .post, path: "/api/ai/\(provider.rawValue)/start")
        }

        static func complete(_ provider: AIProvider, callback: String) -> Endpoint<AIConnected> {
            let trimmed = String(callback.trimmingCharacters(in: .whitespacesAndNewlines).prefix(4000))
            return Endpoint(method: .post, path: "/api/ai/\(provider.rawValue)/complete",
                            body: AISignInComplete(callback: trimmed), timeout: Timeouts.ai)
        }

        static func logout(_ provider: AIProvider) -> Endpoint<AIDisconnected> {
            Endpoint(method: .post, path: "/api/ai/\(provider.rawValue)/logout")
        }
    }
}
