import XCTest
@testable import TappyAI

/// The Deep Research card (web `ResearchCard.tsx`, Android `ResearchCard.kt`): what it says for each phase, how a step shows its state,
/// which source it opens, and when the report can be kept. The model is the part with rules; the view only draws it.
final class ResearchCardModelTests: XCTestCase {

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relative), encoding: .utf8)
    }

    private func catalog() throws -> [String: Any] {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("TappyAI/Resources/Localizable.xcstrings"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(json["strings"] as? [String: Any])
    }

    private func value(_ key: String, _ lang: String, in strings: [String: Any]) -> String? {
        let entry = strings[key] as? [String: Any]
        let loc = (entry?["localizations"] as? [String: Any])?[lang] as? [String: Any]
        return (loc?["stringUnit"] as? [String: Any])?["value"] as? String
    }

    // MARK: - Steps

    func testEachStepStatusHasItsOwnMark() {
        XCTAssertEqual(ResearchCardModel.stepMark(.pending), "○")
        XCTAssertEqual(ResearchCardModel.stepMark(.running), "◌")
        XCTAssertEqual(ResearchCardModel.stepMark(.done), "✓")
        XCTAssertEqual(ResearchCardModel.stepMark(.failed), "–")
    }

    func testEachStepStatusIsSaidInWordsForVoiceOver() {
        XCTAssertEqual(ResearchCardModel.stepStatusKey(.pending), "chat.research.step.pending")
        XCTAssertEqual(ResearchCardModel.stepStatusKey(.running), "chat.research.step.running")
        XCTAssertEqual(ResearchCardModel.stepStatusKey(.done), "chat.research.step.done")
        XCTAssertEqual(ResearchCardModel.stepStatusKey(.failed), "chat.research.step.failed")
    }

    // MARK: - Sources

    func testASourceShowsItsTitleOrElseItsSite() {
        XCTAssertEqual(ResearchCardModel.sourceLabel(ResearchLink(id: 1, title: "VnExpress", url: "https://vnexpress.net/a")), "VnExpress")
        XCTAssertEqual(ResearchCardModel.sourceLabel(ResearchLink(id: 2, title: "  ", url: "https://vnexpress.net/a")), "vnexpress.net")
    }

    func testASourceOpensOnlyThroughTheSafeDoor() {
        XCTAssertEqual(ResearchCardModel.openableURL(ResearchLink(id: 1, title: "A", url: "https://vnexpress.net/a"))?.absoluteString,
                       "https://vnexpress.net/a")
        XCTAssertNil(ResearchCardModel.openableURL(ResearchLink(id: 2, title: "A", url: "javascript:alert(1)")))
        XCTAssertNil(ResearchCardModel.openableURL(ResearchLink(id: 3, title: "A", url: "file:///etc/hosts")))
        XCTAssertNil(ResearchCardModel.openableURL(ResearchLink(id: 4, title: "A", url: "https://chatgpt.com/share/x")),
                     "never another AI product's page")
    }

    // MARK: - Keeping the report

    func testTheReportCanBeKeptOnlyWhenTheResearchIsDoneAndThereIsText() {
        XCTAssertTrue(ResearchCardModel.offersDownload(phase: .done, report: "# T\n\ntext"))
        XCTAssertFalse(ResearchCardModel.offersDownload(phase: .done, report: "  \n"))
        XCTAssertFalse(ResearchCardModel.offersDownload(phase: .done, report: nil))
        for phase in [ResearchPhase.planning, .researching, .writing, .failed] {
            XCTAssertFalse(ResearchCardModel.offersDownload(phase: phase, report: "# T\n\ntext"), "\(phase)")
        }
    }

    // MARK: - Words

    func testTheCardHasTheWebsWordsInBothLanguages() throws {
        let strings = try catalog()
        let keys = ["chat.research.planning", "chat.research.researching %lld", "chat.research.writing %lld", "chat.research.done %lld",
                    "chat.research.failed", "chat.research.sources", "chat.research.step.pending", "chat.research.step.running",
                    "chat.research.step.done", "chat.research.step.failed"]
        for key in keys {
            for lang in ["vi", "en"] {
                XCTAssertFalse((value(key, lang, in: strings) ?? "").isEmpty, "\(key) \(lang)")
            }
        }
        XCTAssertEqual(value("chat.research.planning", "vi", in: strings), "Đang lập kế hoạch nghiên cứu…")
        XCTAssertEqual(value("chat.research.done %lld", "en", in: strings), "Research complete · %lld sources")
        XCTAssertEqual(value("chat.research.done %lld", "vi", in: strings), "Đã nghiên cứu xong · %lld nguồn")
        let card = try source("TappyAI/Features/Chat/UI/ResearchCardView.swift")
        for key in keys where !key.hasPrefix("chat.research.step.") {
            let literal = key.replacingOccurrences(of: "%lld", with: "\\(status.sources)")
            XCTAssertTrue(card.contains("\"\(literal)\""), "the card draws \(key)")
        }
    }

    // MARK: - Where the card is drawn

    func testTheCardIsDrawnLiveAndOnTheReplyAboveItsText() throws {
        let list = try source("TappyAI/Features/Chat/UI/ChatMessageList.swift")
        XCTAssertTrue(list.contains("liveResearch"), "the running turn's card")
        XCTAssertTrue(list.contains("ResearchCardView("))
        let view = try source("TappyAI/Features/Chat/UI/ChatView.swift")
        XCTAssertTrue(view.contains("liveResearch: vm.liveResearch"))
    }

    func testTheCardNeverOpensAnAddressItself() throws {
        // an address the model wrote opens only through the list's reviewed door (ExternalPurchaseGuardTests lists the files that open addresses)
        let card = try source("TappyAI/Features/Chat/UI/ResearchCardView.swift")
        XCTAssertTrue(card.contains("onOpenLink"))
        XCTAssertFalse(card.contains("UIApplication"))
    }
}
