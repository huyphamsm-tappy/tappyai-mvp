import Foundation

// MARK: - Lenient decoding
//
// 🚨 ONE FIELD MUST NEVER BREAK A WHOLE SCREEN. TestFlight build 50 (30/09) showed the failure mode:
// a single renamed field (`freemium.anonDailyLimit` → `anonLifetimeLimit`) made the whole
// `/api/config` decode throw, and every user saw "Không tải được cấu hình". Production and the app
// are released on different days, so a field being added, renamed, missing or null is NORMAL, not
// exceptional. The rules every response model follows:
//
//  1. Only a field the screen genuinely cannot work without is required (usually just `id`).
//  2. Every other field is optional, or has a neutral default (0, false, "", []) when a default
//     cannot say something untrue (a count of 0 on a row the server sent without counts is how the
//     screen looked before the count existed; it asserts nothing about the content).
//  3. A LIST drops the elements that do not decode and keeps the rest (`lossyArray`), and a missing
//     or null list is empty — one malformed row is one missing tile, not an error screen.
//  4. Extra fields are ignored (Decodable already does this).

/// One array element that may fail to decode; `value` is nil instead of throwing.
struct LossyElement<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws {
        value = try? T(from: decoder)
    }
}

/// A top-level JSON array decoded element by element (`GET /api/conversations` answers a bare array).
struct LossyList<T: Decodable>: Decodable {
    let items: [T]
    init(from decoder: Decoder) throws {
        let elements = (try? [LossyElement<T>](from: decoder)) ?? []
        items = elements.compactMap(\.value)
    }
}

extension KeyedDecodingContainer {
    /// The value, or nil when the key is missing, null, or holds the wrong type.
    func lenient<T: Decodable>(_ type: T.Type, forKey key: Key) -> T? {
        (try? decodeIfPresent(type, forKey: key)) ?? nil
    }

    /// The value, or `fallback` when the key is missing, null, or holds the wrong type.
    func lenient<T: Decodable>(_ type: T.Type, forKey key: Key, default fallback: T) -> T {
        lenient(type, forKey: key) ?? fallback
    }

    /// An integer that may arrive as `3`, `3.0` or `"3"` (Postgres counts through PostgREST and
    /// aggregates do all three). Nil when absent or not a number.
    func lenientInt(forKey key: Key) -> Int? {
        if let i = lenient(Int.self, forKey: key) { return i }
        if let d = lenient(Double.self, forKey: key), d.isFinite { return Int(d) }
        if let s = lenient(String.self, forKey: key) { return Int(s.trimmingCharacters(in: .whitespaces)) }
        return nil
    }

    /// A number that may arrive as `4.5` or `"4.5"` (Postgres `numeric` is serialised as a string).
    func lenientDouble(forKey key: Key) -> Double? {
        if let d = lenient(Double.self, forKey: key) { return d }
        if let s = lenient(String.self, forKey: key) { return Double(s.trimmingCharacters(in: .whitespaces)) }
        return nil
    }

    /// A list: missing / null / not-a-list → `[]`; elements that do not decode are dropped.
    func lossyArray<T: Decodable>(_ type: T.Type, forKey key: Key) -> [T] {
        guard let elements = try? decodeIfPresent([LossyElement<T>].self, forKey: key) else { return [] }
        return elements.compactMap(\.value)
    }

    /// A required identifier: a string, or a number rendered as a string (some tables use bigint ids).
    func requiredId(forKey key: Key) throws -> String {
        if let s = lenient(String.self, forKey: key), !s.isEmpty { return s }
        if let i = lenient(Int.self, forKey: key) { return String(i) }
        throw DecodingError.keyNotFound(key, .init(codingPath: codingPath, debugDescription: "missing id"))
    }
}
