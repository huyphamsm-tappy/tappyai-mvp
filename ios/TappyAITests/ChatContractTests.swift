import XCTest
@testable import TappyAI

/// R14 chatSessionId + the `[TAPPY_ASK]` block + the client declaration headers.
final class ChatContractTests: XCTestCase {
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "ChatContractTests")
        defaults.removePersistentDomain(forName: "ChatContractTests")
    }

    func testNewChatGetsValidLowercaseUUID() {
        let id = ChatSessionId.resolve(historyRowId: nil, store: ChatSessionIdStore(defaults: defaults))
        XCTAssertTrue(ChatSessionId.isValid(id), id)
        XCTAssertEqual(id, id.lowercased())
    }

    func testReopenedChatKeepsStoredId() {
        let store = ChatSessionIdStore(defaults: defaults)
        let stored = "0b9f1c52-7a1e-4d63-9f0a-2b7c4d8e1a55"
        store.put("row-1", stored)
        XCTAssertEqual(ChatSessionId.resolve(historyRowId: "row-1", store: store), stored)
    }

    func testOldChatWithoutStoredIdGetsFreshId() {
        let store = ChatSessionIdStore(defaults: defaults)
        let a = ChatSessionId.resolve(historyRowId: "unknown", store: store)
        XCTAssertTrue(ChatSessionId.isValid(a))
    }

    func testCorruptStoredIdIsReplaced() {
        let store = ChatSessionIdStore(defaults: defaults)
        store.put("row-2", "not-a-uuid")
        XCTAssertNotEqual(ChatSessionId.resolve(historyRowId: "row-2", store: store), "not-a-uuid")
    }

    func testDeclarationHeaders() {
        XCTAssertEqual(ChatClientDeclaration.surfaceHeader, "x-tappy-surface")
        XCTAssertEqual(ChatClientDeclaration.surface, "ios")
        XCTAssertEqual(ChatClientDeclaration.capsHeader, "x-tappy-caps")
        XCTAssertEqual(ChatClientDeclaration.caps, "ask")
    }

    // MARK: - AskBlock

    private let block = """
    Mình hỏi nhanh nhé.
    [TAPPY_ASK]{"v":1,"questions":[{"id":"party","q":"Đi mấy người?","options":["2 người"," 4 người ","nhóm"]},{"id":"bad","q":"Chỉ một","options":["x"]}]}[/TAPPY_ASK]
    """

    func testAskParsesAndDropsShortQuestions() {
        let r = AskBlock.parse(block)
        XCTAssertEqual(r.text, "Mình hỏi nhanh nhé.")
        XCTAssertEqual(r.questions.count, 1)
        XCTAssertEqual(r.questions[0].options, ["2 người", "4 người", "nhóm"])
    }

    func testAskStreamingPartialIsHidden() {
        let r = AskBlock.parse("Chào\n[TAPPY_ASK]{\"v\":1,\"quest")
        XCTAssertEqual(r.text, "Chào")
        XCTAssertTrue(r.questions.isEmpty)
    }

    func testAskMalformedBlockIsRemoved() {
        let r = AskBlock.parse("Hi [TAPPY_ASK]{oops[/TAPPY_ASK] bye")
        XCTAssertTrue(r.questions.isEmpty)
        XCTAssertFalse(r.text.contains("TAPPY_ASK"))
    }

    func testAskLimitsToThreeQuestionsAndFourOptions() {
        let q = (1...5).map { #"{"id":"q\#($0)","q":"Q\#($0)","options":["a","b","c","d","e"]}"# }.joined(separator: ",")
        let r = AskBlock.parse(#"[TAPPY_ASK]{"v":1,"questions":[\#(q)]}[/TAPPY_ASK]"#)
        XCTAssertEqual(r.questions.count, 3)
        XCTAssertEqual(r.questions[0].options.count, 4)
    }

    func testComposeAnswerJoinsInQuestionOrder() {
        let qs = [AskQuestion(id: "a", q: "A", options: ["1", "2"]), AskQuestion(id: "b", q: "B", options: ["x", "y"])]
        XCTAssertEqual(AskBlock.composeAnswer(qs, chosen: ["b": "y", "a": "1"], free: " thêm "), "1 · y · thêm")
        XCTAssertEqual(AskBlock.composeAnswer(qs, chosen: [:]), "")
    }

    func testContentParserExposesAskAndStripsIt() {
        let parsed = ContentParser.parse(block)
        XCTAssertEqual(parsed.ask.count, 1)
        XCTAssertFalse(parsed.text.contains("TAPPY_ASK"))
    }
}
