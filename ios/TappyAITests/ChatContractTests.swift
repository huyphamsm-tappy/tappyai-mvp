import XCTest
@testable import TappyAI

/// R14 chatSessionId + the old `[TAPPY_ASK]` block staying hidden + the client declaration headers.
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
        // The one-brain server reads `card` as "this client draws the decision card"; the ASK block no longer exists.
        XCTAssertEqual(ChatClientDeclaration.caps, "card")
    }

    // MARK: - Old ASK block stays hidden

    private let block = """
    Mình hỏi nhanh nhé.
    [TAPPY_ASK]{"v":1,"questions":[{"id":"party","q":"Đi mấy người?","options":["2 người"," 4 người ","nhóm"]},{"id":"bad","q":"Chỉ một","options":["x"]}]}[/TAPPY_ASK]
    """

    // The one-brain server does not emit the ASK block and no card is drawn for it; an older server that still sends one must
    // not leak its JSON (the block is only hidden, by the marker-residue pass).
    func testAnOldServersAskBlockIsHiddenAndDrawsNothing() {
        let parsed = ContentParser.parse(block)
        XCTAssertEqual(parsed.text, "Mình hỏi nhanh nhé.")
        XCTAssertFalse(parsed.text.contains("TAPPY_ASK"))
        XCTAssertFalse(parsed.text.contains("party"))
    }

    func testAskStreamingPartialIsHidden() {
        let parsed = ContentParser.parse("Chào\n[TAPPY_ASK]{\"v\":1,\"quest")
        XCTAssertEqual(parsed.text, "Chào")
    }

    func testAskMalformedBlockIsRemoved() {
        let parsed = ContentParser.parse("Hi [TAPPY_ASK]{oops[/TAPPY_ASK] bye")
        XCTAssertFalse(parsed.text.contains("TAPPY_ASK"))
        XCTAssertFalse(parsed.text.contains("oops"))
    }
}
