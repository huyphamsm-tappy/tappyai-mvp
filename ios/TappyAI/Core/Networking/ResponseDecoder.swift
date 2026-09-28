import Foundation

/// Shared JSON decoding config. The backend returns snake_case fields (e.g. `follower_count`),
/// so the default converts to camelCase; features may override per-model if needed.
enum ResponseDecoder {
    static let json: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = ISO8601Timestamp.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unrecognized date: \(raw)")
        }
        return d
    }()

    static let jsonEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()
}

/// Parses the timestamps the backend sends, without depending on Foundation's ISO-8601 parsers.
///
/// Postgres / Supabase emit microseconds with a numeric offset — `2026-09-27T10:00:00.123456+00:00`
/// — and JavaScript emits milliseconds with `Z`. `Date.ISO8601FormatStyle` and
/// `ISO8601DateFormatter` have both been version-dependent about fractional precision and `+00:00`
/// on iOS 16–17, and a single unparsed date fails the whole response. This parser is plain integer
/// arithmetic, so it behaves identically on every iOS version, and it is a stateless enum, so it is
/// `Sendable` without a lock or a shared formatter.
///
/// Accepted: `YYYY-MM-DD`, then optionally `T` or a space and `HH:MM[:SS[.fraction]]`, then
/// optionally `Z`, `+HH`, `+HHMM` or `+HH:MM` (or `-`). Any number of fraction digits. No zone
/// means UTC.
enum ISO8601Timestamp {
    static func date(from string: String) -> Date? {
        let s = Array(string.trimmingCharacters(in: .whitespaces).utf8)
        var i = 0

        func digits(_ count: Int) -> Int? {
            guard i + count <= s.count else { return nil }
            var value = 0
            for k in 0..<count {
                let c = s[i + k]
                guard c >= 48, c <= 57 else { return nil }
                value = value * 10 + Int(c - 48)
            }
            i += count
            return value
        }
        func expect(_ c: UInt8) -> Bool {
            guard i < s.count, s[i] == c else { return false }
            i += 1
            return true
        }

        guard let year = digits(4), expect(UInt8(ascii: "-")),
              let month = digits(2), expect(UInt8(ascii: "-")),
              let day = digits(2),
              (1...12).contains(month), (1...daysIn(month: month, year: year)).contains(day)
        else { return nil }

        var hour = 0, minute = 0, second = 0
        var fraction = 0.0
        var offsetSeconds = 0

        if i < s.count, s[i] == UInt8(ascii: "T") || s[i] == UInt8(ascii: "t") || s[i] == UInt8(ascii: " ") {
            i += 1
            guard let h = digits(2), expect(UInt8(ascii: ":")), let m = digits(2),
                  (0...23).contains(h), (0...59).contains(m)
            else { return nil }
            hour = h
            minute = m
            if expect(UInt8(ascii: ":")) {
                guard let sec = digits(2), (0...60).contains(sec) else { return nil }   // 60: leap second
                second = sec
                if i < s.count, s[i] == UInt8(ascii: ".") || s[i] == UInt8(ascii: ",") {
                    i += 1
                    var scale = 0.1
                    var any = false
                    while i < s.count, s[i] >= 48, s[i] <= 57 {
                        fraction += Double(s[i] - 48) * scale
                        scale /= 10
                        i += 1
                        any = true
                    }
                    guard any else { return nil }
                }
            }
            if i < s.count {
                if s[i] == UInt8(ascii: "Z") || s[i] == UInt8(ascii: "z") {
                    i += 1
                } else if s[i] == UInt8(ascii: "+") || s[i] == UInt8(ascii: "-") {
                    let sign = s[i] == UInt8(ascii: "-") ? -1 : 1
                    i += 1
                    guard let oh = digits(2), oh <= 23 else { return nil }
                    var om = 0
                    if i < s.count {
                        _ = expect(UInt8(ascii: ":"))
                        guard let m = digits(2), m <= 59 else { return nil }
                        om = m
                    }
                    offsetSeconds = sign * (oh * 3600 + om * 60)
                } else {
                    return nil
                }
            }
        }
        guard i == s.count else { return nil }

        let days = daysFromCivil(year: year, month: month, day: day)
        let seconds = days * 86_400 + hour * 3600 + minute * 60 + second - offsetSeconds
        return Date(timeIntervalSince1970: Double(seconds) + fraction)
    }

    /// Days since 1970-01-01 in the proleptic Gregorian calendar (H. Hinnant's days_from_civil).
    private static func daysFromCivil(year: Int, month: Int, day: Int) -> Int {
        let y = month <= 2 ? year - 1 : year
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let mp = (month + 9) % 12
        let doy = (153 * mp + 2) / 5 + day - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }

    private static func daysIn(month: Int, year: Int) -> Int {
        switch month {
        case 2: return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 ? 29 : 28
        case 4, 6, 9, 11: return 30
        default: return 31
        }
    }
}

extension KeyedDecodingContainer {
    /// An optional date that is never allowed to fail the whole response: absent, null or
    /// unparseable all read as nil.
    func decodeLenientDate(forKey key: Key) -> Date? {
        try? decodeIfPresent(Date.self, forKey: key)
    }
}
