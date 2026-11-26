import XCTest
@testable import TappyAI

/// UAT 26/11: the answer to «Tiểu sử elon» stopped at «Năm 199» and the screen never moved again. While a reply streams, the app parses its WHOLE text
/// again after nearly every word (`ParsedContentCache`), so a parser that is slow or never returns on ONE partial text freezes the screen at
/// exactly that word. This feeds every few-character prefix of a realistic biography, and some hostile partial texts, through every parser the
/// message list runs, and fails if any call is slow or never returns. Each call runs on its own thread with a deadline, so a hang FAILS the
/// test (naming the text it hung on) instead of hanging CI. The slowest calls are printed so a CI log shows where the time goes.
final class ChatParserStressTests: XCTestCase {

    /// One pass of everything the list does with a reply's text.
    fileprivate static func everything(_ text: String) {
        let parsed = ContentParser.parse(text)
        _ = MarkdownBlocks.parse(parsed.text)
        _ = ContentParser.renderMarkdown(parsed.text)
        _ = MarkdownNormalize.balanceBoldPerLine(text)
        _ = DataStreamLineParser.frames(line: "0:" + (String(data: (try? JSONEncoder().encode(text)) ?? Data(), encoding: .utf8) ?? "\"\""))
    }

    /// How long `everything(text)` took, or nil when it had not returned after `limit` seconds (the thread is left behind).
    private func timed(_ text: String, limit: TimeInterval) -> Double? {
        let done = DispatchSemaphore(value: 0)
        let box = TimeBox()
        DispatchQueue.global(qos: .userInitiated).async {
            let start = DispatchTime.now().uptimeNanoseconds
            Self.everything(text)
            box.set(Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000_000)
            done.signal()
        }
        return done.wait(timeout: .now() + limit) == .success ? box.value : nil
    }

    private static let biography: String = {
        var s = "# Tiểu sử Elon Musk\n\n"
        s += "**Elon Musk** là doanh nhân người Mỹ gốc Nam Phi, sinh năm 1971 tại *Pretoria*. [1](https://vi.wikipedia.org/wiki/Elon_Musk)\n\n"
        s += "## Dòng thời gian\n"
        for year in 1971...2025 {
            s += "- **Năm \(year):** Một sự kiện quan trọng trong cuộc đời ông, có `mã`, **chữ đậm** và [liên kết](https://example.com/\(year)).\n"
        }
        s += "\n| Năm | Sự kiện | Công ty |\n|---|---|---|\n"
        for year in 1995...2010 { s += "| \(year) | Thành lập hoặc mua lại | Công ty \(year) |\n" }
        s += "\n> Một câu trích dẫn về tương lai.\n\n1. Mục một\n2. Mục hai\n3. Mục ba\n\n```swift\nlet x = 1\n```\n\n---\n\n"
        s += "Cuộc đời ông còn nhiều điều đáng nói: SpaceX, Tesla, Neuralink, The Boring Company, xAI. 🚀\n\n"
        s += "[FOLLOWUPS]Hỏi thêm về Tesla|Hỏi thêm về SpaceX|Hỏi thêm về xAI\n"
        return s
    }()

    func testNoPrefixOfARealisticBiographyIsSlowToParse() {
        let characters = Array(Self.biography)
        var worst: [(seconds: Double, length: Int, tail: String)] = []
        var total = 0.0
        var hung: String?
        var length = 1
        while length <= characters.count {
            let prefix = String(characters[0..<length])
            let tail = String(prefix.suffix(40)).replacingOccurrences(of: "\n", with: "⏎")
            guard let took = timed(prefix, limit: 10) else { hung = "length \(length) ends «\(tail)»"; break }
            total += took
            worst.append((took, length, tail))
            length += 9
        }
        worst.sort { $0.seconds > $1.seconds }
        print("PARSER-STRESS biography: \(characters.count) characters, total \(String(format: "%.2f", total)) s")
        for entry in worst.prefix(5) {
            print("PARSER-STRESS slowest: \(String(format: "%.1f", entry.seconds * 1000)) ms at \(entry.length) chars, ends «\(entry.tail)»")
        }
        XCTAssertNil(hung, "a parser did not return on this partial text — the screen would stop on it: \(hung ?? "")")
        XCTAssertLessThan(worst.first?.seconds ?? 0, 0.5, "one partial text must never take half a second to parse: the screen would stop on it")
    }

    func testHostilePartialTextsAreNotSlow() {
        let cases: [(String, String)] = [
            ("stars", String(repeating: "**a ", count: 600)),
            ("odd stars", String(repeating: "* ** *** **** ", count: 300)),
            ("table dashes", "|" + String(repeating: "-|", count: 2500) + "x"),
            ("brackets", String(repeating: "[", count: 4000)),
            ("link opens", String(repeating: "[a](", count: 800)),
            ("braces", "[TAPPY_PLAN]{" + String(repeating: "{\"a\":", count: 600)),
            ("cta braces", "[CTA_BUTTONS]{" + String(repeating: "\"x\":{", count: 600)),
            ("places marker", String(repeating: "[TAPPY_PLACES]{\"items\":[", count: 200)),
            ("backticks", String(repeating: "`", count: 6000)),
            ("underscores", String(repeating: "_ a ", count: 2500)),
            ("quotes", String(repeating: "> ", count: 3000)),
            ("bullets", String(repeating: "- ", count: 4000)),
            ("numbered", String(repeating: "1. a\n", count: 1500)),
            ("headings", String(repeating: "#", count: 5000)),
            ("fences", String(repeating: "```\n", count: 800)),
            ("emoji", String(repeating: "🚀👨‍👩‍👧‍👦", count: 1500)),
            ("long line", String(repeating: "Năm 1995 ", count: 5000)),
        ]
        var slow: [String] = []
        for (name, text) in cases {
            if let took = timed(text, limit: 20) {
                print("PARSER-STRESS hostile \(name): \(String(format: "%.1f", took * 1000)) ms")
                if took > 2 { slow.append("\(name) \(String(format: "%.1f", took)) s") }
            } else {
                print("PARSER-STRESS hostile \(name): DID NOT RETURN in 20 s")
                slow.append("\(name) did not return")
            }
        }
        XCTAssertTrue(slow.isEmpty, "slow partial texts: \(slow)")
    }
}

private final class TimeBox: @unchecked Sendable {
    private let lock = NSLock()
    private var seconds = 0.0
    func set(_ value: Double) { lock.lock(); seconds = value; lock.unlock() }
    var value: Double { lock.lock(); defer { lock.unlock() }; return seconds }
}
