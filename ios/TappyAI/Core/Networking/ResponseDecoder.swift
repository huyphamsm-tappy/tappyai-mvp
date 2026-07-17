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
            if let date = ISO8601DateFormatter.withFractionalSeconds.date(from: raw)
                ?? ISO8601DateFormatter.standard.date(from: raw) {
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

private extension ISO8601DateFormatter {
    static let standard = ISO8601DateFormatter()
    static let withFractionalSeconds: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
