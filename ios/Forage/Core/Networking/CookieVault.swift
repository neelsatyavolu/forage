import Foundation
import os
import Security

/// Keeps the API cookies that outlive a launch (`fg_session`, `fg_device`, the sealed AI
/// cookies) in the Keychain, readable after first unlock and never backed up or synced.
/// The URLSession itself uses an in-memory cookie store, so nothing lands in
/// Library/Cookies. Cookies without an expiry date stay in memory only, like a browser.
final class CookieVault: Sendable {
    let service: String
    private let account = "cookies"
    /// The last bytes written, so unchanged cookies don't cause a Keychain write per request.
    private let lastSaved = OSAllocatedUnfairLock<Data?>(initialState: nil)
    private static let log = Logger(subsystem: "co.xanom.forage", category: "cookies")

    init(service: String = "co.xanom.forage.cookies") {
        self.service = service
    }

    /// Puts the saved cookies back into `storage`. Expired ones are dropped.
    func restore(into storage: HTTPCookieStorage, now: Date = .now) {
        guard let data = read() else { return }
        let saved = (try? PropertyListDecoder().decode([StoredCookie].self, from: data)) ?? []
        for cookie in saved.compactMap(\.cookie) where (cookie.expiresDate ?? .distantPast) > now {
            storage.setCookie(cookie)
        }
        lastSaved.withLock { $0 = data }
    }

    /// Writes every persistent cookie in `storage` (deletes the item when there are none).
    func save(from storage: HTTPCookieStorage) {
        let stored = (storage.cookies ?? []).filter { $0.expiresDate != nil }.map(StoredCookie.init)
        lastSaved.withLock { last in
            if stored.isEmpty {
                guard last != Data() else { return }
                delete()
                last = Data()
                return
            }
            guard let data = try? PropertyListEncoder().encode(stored), data != last else { return }
            if write(data) { last = data }
        }
    }

    /// Removes the Keychain item.
    func clear() {
        lastSaved.withLock { last in
            delete()
            last = Data()
        }
    }

    // MARK: - Keychain

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    private func read() -> Data? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status != errSecSuccess && status != errSecItemNotFound {
            Self.log.error("Keychain read failed: \(status, privacy: .public)")
        }
        return status == errSecSuccess ? result as? Data : nil
    }

    private func write(_ data: Data) -> Bool {
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query.merging(attributes) { $1 } as CFDictionary, nil)
        }
        if status != errSecSuccess {
            Self.log.error("Keychain write failed: \(status, privacy: .public)")
        }
        return status == errSecSuccess
    }

    private func delete() {
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            Self.log.error("Keychain delete failed: \(status, privacy: .public)")
        }
    }
}

/// The parts of an `HTTPCookie` worth keeping.
private struct StoredCookie: Codable {
    let name: String
    let value: String
    let domain: String
    let path: String
    let expires: Date?
    let secure: Bool
    let httpOnly: Bool
    let sameSite: String?

    init(_ cookie: HTTPCookie) {
        name = cookie.name
        value = cookie.value
        domain = cookie.domain
        path = cookie.path
        expires = cookie.expiresDate
        secure = cookie.isSecure
        httpOnly = cookie.isHTTPOnly
        sameSite = cookie.sameSitePolicy?.rawValue
    }

    var cookie: HTTPCookie? {
        var properties: [HTTPCookiePropertyKey: Any] = [.name: name, .value: value, .domain: domain, .path: path]
        if let expires { properties[.expires] = expires }
        if secure { properties[.secure] = "TRUE" }
        if httpOnly { properties[HTTPCookiePropertyKey("HttpOnly")] = "TRUE" }
        if let sameSite { properties[.sameSitePolicy] = sameSite }
        return HTTPCookie(properties: properties)
    }
}
