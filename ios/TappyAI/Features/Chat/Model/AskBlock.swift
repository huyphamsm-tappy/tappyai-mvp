import Foundation

/// One consult question and its quick-reply options (web `AskQuestionView`).
struct AskQuestion: Equatable, Sendable, Identifiable {
    let id: String
    let q: String
    let options: [String]
}

/// `[TAPPY_ASK]{"v":1,"questions":[{id,q,options[]}]}[/TAPPY_ASK]` — port of web
/// `src/lib/structuredContent/parseAsk.ts` and Android `AskBlock`: ≤3 questions, each with 2–4
/// trimmed options; a question with fewer than 2 options is dropped; a malformed block yields no
/// questions but is still removed from the text; a block still arriving (streaming) is hidden.
enum AskBlock {
    struct Result: Equatable {
        let text: String
        let questions: [AskQuestion]
    }

    static func parse(_ content: String) -> Result {
        guard content.contains("[TAPPY_ASK]") else { return Result(text: content, questions: []) }
        guard let block = try? NSRegularExpression(pattern: #"\[TAPPY_ASK\]([\s\S]*?)\[/TAPPY_ASK\]"#),
              let m = block.firstMatch(in: content, range: NSRange(content.startIndex..., in: content)),
              let whole = Range(m.range, in: content),
              let inner = Range(m.range(at: 1), in: content) else {
            // Open tag with no close yet: hide from the tag to the end.
            let cut = content.range(of: "[TAPPY_ASK]").map { String(content[..<$0.lowerBound]) } ?? content
            return Result(text: cut.trimmingCharacters(in: .whitespacesAndNewlines), questions: [])
        }
        var text = String(content[..<whole.lowerBound]) + String(content[whole.upperBound...])
        text = text.replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return Result(text: text, questions: decode(String(content[inner])))
    }

    private static func decode(_ json: String) -> [AskQuestion] {
        guard let data = json.trimmingCharacters(in: .whitespacesAndNewlines).data(using: .utf8),
              let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let arr = root["questions"] as? [[String: Any]] else { return [] }
        var out: [AskQuestion] = []
        for (i, o) in arr.enumerated() {
            guard let q = (o["q"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) else { continue }
            let options = ((o["options"] as? [Any]) ?? [])
                .compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .prefix(4)
            guard options.count >= 2 else { continue }
            out.append(AskQuestion(id: (o["id"] as? String) ?? "q\(i + 1)", q: q, options: Array(options)))
        }
        return Array(out.prefix(3))
    }

    /// The user's reply from the chosen options, in question order: "2 người · 100-300k · Món Nhật".
    static func composeAnswer(_ questions: [AskQuestion], chosen: [String: String], free: String = "") -> String {
        let parts = questions.compactMap { chosen[$0.id] }.filter { !$0.isEmpty }
        let extra = free.trimmingCharacters(in: .whitespacesAndNewlines)
        return (parts + (extra.isEmpty ? [] : [extra])).joined(separator: " · ")
    }
}
