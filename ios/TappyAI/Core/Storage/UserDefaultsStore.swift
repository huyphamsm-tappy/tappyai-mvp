import Foundation

/// Typed convenience over `UserDefaults` for non-secret preferences (language, theme, response-style).
/// Mirrors the web's localStorage semantics (`tappy_lang`, `theme`, response-style).
struct UserDefaultsStore {
    private let defaults: UserDefaults
    init(_ defaults: UserDefaults = .standard) { self.defaults = defaults }

    enum Key: String {
        case language = "tappy_lang"
        case theme = "theme"
        case responseStyle = "tappy_response_style"
        case hasSeenLanguagePicker = "tappy_seen_language_picker"
    }

    func string(_ key: Key) -> String? { defaults.string(forKey: key.rawValue) }
    func set(_ value: String?, _ key: Key) { defaults.set(value, forKey: key.rawValue) }

    func bool(_ key: Key) -> Bool { defaults.bool(forKey: key.rawValue) }
    func set(_ value: Bool, _ key: Key) { defaults.set(value, forKey: key.rawValue) }

    func remove(_ key: Key) { defaults.removeObject(forKey: key.rawValue) }
}
