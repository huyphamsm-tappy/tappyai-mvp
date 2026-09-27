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
            if let date = (try? Date(raw, strategy: iso8601WithFractionalSeconds))
                ?? (try? Date(raw, strategy: iso8601)) {
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

// `Date.ISO8601FormatStyle` is a Sendable value type, so these can be shared across
// concurrency domains (`ISO8601DateFormatter` is a non-Sendable class). Same two formats as
// before: internet date-time, with and without fractional seconds.
private let iso8601 = Date.ISO8601FormatStyle()
private let iso8601WithFractionalSeconds = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
