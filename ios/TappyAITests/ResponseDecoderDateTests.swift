import XCTest
@testable import TappyAI

/// Backend timestamps (Postgres microseconds + offset, JS milliseconds + Z) parse on every iOS.
final class ResponseDecoderDateTests: XCTestCase {
    /// 2026-09-27T10:00:00Z
    private let base: TimeInterval = 1_790_503_200

    func testBaseInstant() {
        XCTAssertEqual(ISO8601Timestamp.date(from: "2026-09-27T10:00:00Z")?.timeIntervalSince1970, base)
    }

    func testAllBackendShapes() throws {
        let cases: [(String, TimeInterval)] = [
            ("2026-09-27T10:00:00Z", base),
            ("2026-09-27T10:00:00+00:00", base),
            ("2026-09-27T10:00:00.123Z", base + 0.123),
            ("2026-09-27T10:00:00.123456+00:00", base + 0.123456),
            ("2026-09-27T10:00:00.1+00", base + 0.1),
            ("2026-09-27 10:00:00.123456+00", base + 0.123456),     // Postgres text form
            ("2026-09-27T17:00:00+07:00", base),                    // Vietnam offset
            ("2026-09-27T17:00:00+0700", base),
            ("2026-09-27T05:30:00-04:30", base),
            ("2026-09-27T10:00:00", base),                          // no zone = UTC
            ("2026-09-27T10:00Z", base),                            // no seconds
        ]
        for (raw, expected) in cases {
            let date = try XCTUnwrap(ISO8601Timestamp.date(from: raw), raw)
            XCTAssertEqual(date.timeIntervalSince1970, expected, accuracy: 0.000_001, raw)
        }
    }

    func testDateOnlyAndLeapDay() {
        XCTAssertEqual(ISO8601Timestamp.date(from: "1970-01-01")?.timeIntervalSince1970, 0)
        XCTAssertEqual(ISO8601Timestamp.date(from: "2024-02-29T00:00:00Z")?.timeIntervalSince1970, 1_709_164_800)
    }

    func testRejectsMalformed() {
        for raw in ["", "yesterday", "2026-13-01T00:00:00Z", "2026-02-30T00:00:00Z", "2026-09-27T25:00:00Z",
                    "2026-09-27T10:00:00.Z", "2026-09-27T10:00:00+", "2026-09-27T10:00:00 junk"] {
            XCTAssertNil(ISO8601Timestamp.date(from: raw), raw)
        }
    }

    func testSharedDecoderUsesIt() throws {
        struct Row: Decodable { let createdAt: Date }
        let row = try ResponseDecoder.json.decode(Row.self,
                                                  from: Data(#"{"created_at":"2026-09-27T10:00:00.123456+00:00"}"#.utf8))
        XCTAssertEqual(row.createdAt.timeIntervalSince1970, base + 0.123456, accuracy: 0.000_001)
    }

    func testAnOptionalBadDateDoesNotFailTheResponse() throws {
        let json = #"{"id":"c1","title":"Trip","updated_at":"not a date","messages":[{},{}]}"#
        let summary = try ResponseDecoder.json.decode(ConversationSummary.self, from: Data(json.utf8))
        XCTAssertNil(summary.updatedAt)
        XCTAssertEqual(summary.messageCount, 2)
    }
}
