import Foundation

/// Persists auth tokens. Protocol so tests can inject an in-memory double.
protocol TokenStorage: Sendable {
    func load() -> AuthTokens?
    func save(_ tokens: AuthTokens)
    func clear()
}

/// Keychain-backed token storage (production default).
struct KeychainTokenStorage: TokenStorage {
    private let keychain: KeychainStore
    private let key = "auth.tokens"

    init(keychain: KeychainStore = KeychainStore()) { self.keychain = keychain }

    func load() -> AuthTokens? {
        guard let data = keychain.data(for: key) else { return nil }
        return try? JSONDecoder().decode(AuthTokens.self, from: data)
    }

    func save(_ tokens: AuthTokens) {
        guard let data = try? JSONEncoder().encode(tokens) else { return }
        try? keychain.set(data, for: key)
    }

    func clear() { keychain.remove(key) }
}

/// In-memory storage for tests/previews.
final class InMemoryTokenStorage: TokenStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var tokens: AuthTokens?
    init(_ tokens: AuthTokens? = nil) { self.tokens = tokens }
    func load() -> AuthTokens? { lock.lock(); defer { lock.unlock() }; return tokens }
    func save(_ t: AuthTokens) { lock.lock(); tokens = t; lock.unlock() }
    func clear() { lock.lock(); tokens = nil; lock.unlock() }
}
