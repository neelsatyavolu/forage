import Foundation

/// `data` of `GET /api/account`. Signed out (or a revoked cookie) is `user == nil`;
/// `progress` comes with a user.
struct AccountState: Codable, Hashable, Sendable {
    let user: AccountUser?
    var progress: RateProgress?
}

/// A signed-in account, or a guest (api.md §2.0): a real user with no email yet.
struct AccountUser: Codable, Hashable, Sendable {
    /// nil only for a guest.
    let email: String?
    /// Missing on login/register answers; present on `GET /api/account`.
    let createdAt: EpochMillis?
    let guest: Bool

    init(email: String?, createdAt: EpochMillis?, guest: Bool = false) {
        self.email = email
        self.createdAt = createdAt
        self.guest = guest
    }

    private enum CodingKeys: String, CodingKey { case email, createdAt, guest }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        email = try c.decodeIfPresent(String.self, forKey: .email)
        createdAt = try c.decodeIfPresent(EpochMillis.self, forKey: .createdAt)
        guest = try c.decodeIfPresent(Bool.self, forKey: .guest) ?? (email == nil)
    }

    /// Whose lists are on screen: the email, or one key for this device's guest.
    var ownerKey: String { email ?? "guest" }
}

/// `data` of login and register.
struct AccountSession: Codable, Hashable, Sendable {
    let user: AccountUser
}

/// Body of login and register.
struct Credentials: Codable, Hashable, Sendable {
    let email: String
    let password: String
}

struct ForgotRequest: Codable, Hashable, Sendable {
    let email: String
}

/// `data` of `POST /api/account/forgot`: show `message` as a neutral notice.
struct ForgotResponse: Codable, Hashable, Sendable {
    let message: String
}

struct ResetRequest: Codable, Hashable, Sendable {
    let token: String
    let password: String

    /// Pulls `token` out of a pasted reset link (`https://forage.xanom.co/reset?token=…`),
    /// or accepts a bare token.
    static func token(fromLink text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let components = URLComponents(string: trimmed),
           let token = components.queryItems?.first(where: { $0.name == "token" })?.value, !token.isEmpty {
            return token
        }
        let isBareToken = !trimmed.isEmpty && trimmed.count <= 100
            && trimmed.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }
        return isBareToken ? trimmed : nil
    }
}

struct DeleteAccountRequest: Codable, Hashable, Sendable {
    let password: String
}

struct SignOutEverywhereRequest: Codable, Hashable, Sendable {
    var action = "signout-everywhere"
}
