import Foundation
import Security

/// Minimal Keychain wrapper for small secrets (the Supabase JWT lives here — never UserDefaults).
/// Items are stored with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (available in background,
/// not migrated to new devices).
struct KeychainStore {
    enum KeychainError: Error { case status(OSStatus) }

    private let service: String
    init(service: String = Bundle.main.bundleIdentifier ?? "com.tappyai.ios") {
        self.service = service
    }

    func set(_ data: Data, for key: String) throws {
        var query = baseQuery(key)
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }

    func set(_ string: String, for key: String) throws {
        try set(Data(string.utf8), for: key)
    }

    func data(for key: String) -> Data? {
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    func string(for key: String) -> String? {
        data(for: key).flatMap { String(data: $0, encoding: .utf8) }
    }

    func remove(_ key: String) {
        SecItemDelete(baseQuery(key) as CFDictionary)
    }

    private func baseQuery(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
    }
}
