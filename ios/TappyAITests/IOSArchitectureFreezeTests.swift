import XCTest
@testable import TappyAI

// ── iOS chat architecture freeze 02/11/2026 (owner: "đóng băng iOS") ─────────────────────────────────────────────────────────────────
//
// The frozen shape of the app's chat is written in docs/architecture/IOS-CHAT-FREEZE-20261102.md. This test pins the values and the wiring that
// shape rests on. A red line here is not a test to update: changing one of these is an architecture change, and it needs the owner's approval
// and a new dated entry in that document first.
final class IOSArchitectureFreezeTests: XCTestCase {
    private var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // TappyAITests
            .deletingLastPathComponent() // ios
            .deletingLastPathComponent() // repository
    }

    private func read(_ relative: String) throws -> String {
        try String(contentsOf: repoRoot.appendingPathComponent(relative), encoding: .utf8)
    }

    func testTheFreezeDocumentExistsAndNamesThisTest() throws {
        let doc = try read("docs/architecture/IOS-CHAT-FREEZE-20261102.md")
        XCTAssertTrue(doc.contains("IOSArchitectureFreezeTests.swift"))
    }

    func testModesAreFiveOnTheWireAutoByDefaultAndTheMenuKeepsOnlyDeepResearch() {
        XCTAssertEqual(ChatMode.allCases.map(\.wire), ["auto", "chat", "web", "think", "deep"])
        XCTAssertEqual(ChatMode.default, .auto)
        XCTAssertEqual(ChatMode.menu, [.deep])
        XCTAssertEqual(ChatMode.deep.afterSend(), .auto)
        XCTAssertEqual(ChatMode.deep.picked(.deep), .auto)
    }

    func testTheStreamMaySitSilentFor130SecondsAndDeepResearchFor320() {
        XCTAssertEqual(ChatStreamTimeout.standard, 130)
        XCTAssertEqual(ChatStreamTimeout.deepResearch, 320)
    }

    func testTheClientDeclaresItsSurfaceAndThatItDrawsTheDecisionCard() {
        XCTAssertEqual(ChatClientDeclaration.surfaceHeader, "x-tappy-surface")
        XCTAssertEqual(ChatClientDeclaration.surface, "ios")
        XCTAssertEqual(ChatClientDeclaration.capsHeader, "x-tappy-caps")
        XCTAssertEqual(ChatClientDeclaration.caps, "card")
    }

    func testAttachmentsAreAPictureOrAPdfUpTo3MB() {
        XCTAssertEqual(ChatAttachmentLimits.pdfBytes, 3_000_000)
        XCTAssertEqual(attachmentCheck(mime: "application/pdf", byteCount: 2_999_999), .ok(.pdf))
        XCTAssertEqual(attachmentCheck(mime: "application/pdf", byteCount: 3_000_001), .pdfTooLarge)
        XCTAssertEqual(attachmentCheck(mime: "image/png", byteCount: 5_000_000), .ok(.image))
        XCTAssertEqual(attachmentCheck(mime: "text/plain", byteCount: 10), .unsupported)
    }

    func testAPageOfAnotherAIProductIsNeverASourceAndLinksOpenOnlyAsHttp() {
        XCTAssertTrue(AiSourcePolicy.isAiProductSource("https://ai-hay.vn/x"))
        XCTAssertTrue(AiSourcePolicy.isAiProductSource("https://www.google.com/url?q=https://chatgpt.com/share/x"))
        XCTAssertFalse(AiSourcePolicy.isAiProductSource("https://vi.wikipedia.org/wiki/Quang_Trung"))
        XCTAssertNotNil(safeWebURL("https://vi.wikipedia.org/wiki/Quang_Trung"))
        XCTAssertNil(safeWebURL("tel:+84123456789"))
        XCTAssertNil(safeWebURL("javascript:alert(1)"))
        XCTAssertNil(safeWebURL("https://ai-hay.vn/x"))
    }

    func testTheChatKeepsNoAskBlockNoFiveAreasAndReadsNoPlan() throws {
        for removed in ["Features/Chat/Model/AskBlock.swift", "Features/Chat/Model/AskCardModel.swift", "Features/Chat/UI/AskCardView.swift",
                        "Features/Chat/Model/TravelPlaceFilter.swift"] {
            XCTAssertFalse(FileManager.default.fileExists(atPath: repoRoot.appendingPathComponent("ios/TappyAI/" + removed).path), removed)
        }
        let model = try read("ios/TappyAI/Features/Chat/UI/ChatViewModel.swift")
        XCTAssertTrue(model.contains("turnToken"))
        XCTAssertFalse(model.contains("PlanAccess"))
    }
}
