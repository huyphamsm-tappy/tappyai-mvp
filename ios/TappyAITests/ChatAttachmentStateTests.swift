import XCTest
@testable import TappyAI

/// The composer's attachment in the view model (web `ChatInterface.tsx` imageFile / attachError / handleSubmit; Android 7b9b967): a chosen
/// file is checked before it is staged, a refused one says why and stages nothing, a staged file is a question by itself, and it is sent
/// once and cleared.
@MainActor
final class ChatAttachmentStateTests: XCTestCase {

    private func attachSession() -> SessionStore {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        return session
    }

    private func makeViewModel(_ streaming: StreamingClient) -> ChatViewModel {
        ChatViewModel(service: ChatService(api: MockAPIClient(), streaming: streaming), session: attachSession())
    }

    private let okReply = ["0:\"Xong\"", "d:{\"finishReason\":\"stop\"}"]
    private let pdfData = Data("%PDF-1.4".utf8)

    private func messageRows(_ streaming: SequencedChatStreaming, at index: Int) throws -> [[String: Any]] {
        let body = try XCTUnwrap(streaming.sentEndpoints[index].body)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        return try XCTUnwrap(object["messages"] as? [[String: Any]])
    }

    func testAPdfWithinTheLimitIsStaged() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.attach(mime: "application/pdf", name: "Hợp đồng.pdf", byteCount: pdfData.count, data: pdfData)
        XCTAssertEqual(vm.stagedAttachment?.kind, .pdf)
        XCTAssertEqual(vm.stagedAttachment?.name, "Hợp đồng.pdf")
        XCTAssertEqual(vm.stagedAttachment?.mime, "application/pdf")
        XCTAssertNil(vm.attachError)
    }

    func testAPhotoIsStaged() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.attach(mime: "image/jpeg", name: "", byteCount: 3, data: Data([0xFF, 0xD8, 0xFF]))
        XCTAssertEqual(vm.stagedAttachment?.kind, .image)
        XCTAssertEqual(vm.stagedAttachment?.name, "photo.jpg")
    }

    func testAPdfOverTheLimitIsRefusedWithTheWebsSentenceAndNothingIsStaged() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.attach(mime: "application/pdf", name: "lon.pdf", byteCount: 3_000_001, data: nil)
        XCTAssertNil(vm.stagedAttachment)
        XCTAssertEqual(vm.attachError, NSLocalizedString("chat.attach.pdfTooLarge", comment: ""))
        XCTAssertFalse((vm.attachError ?? "").isEmpty)
    }

    func testAnUnsupportedTypeIsRefusedWithTheWebsSentence() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.attach(mime: "image/heic", name: "a.heic", byteCount: 10, data: Data([1]))
        XCTAssertNil(vm.stagedAttachment)
        XCTAssertEqual(vm.attachError, NSLocalizedString("chat.attach.unsupported", comment: ""))
    }

    func testAnAcceptedFileThatCouldNotBeReadSaysSo() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.attach(mime: "application/pdf", name: "a.pdf", byteCount: 10, data: nil)
        XCTAssertNil(vm.stagedAttachment)
        XCTAssertEqual(vm.attachError, NSLocalizedString("chat.attach.readFailed", comment: ""))
    }

    func testARefusedFileLeavesTheOneAlreadyChosen() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.attach(mime: "application/pdf", name: "mot.pdf", byteCount: pdfData.count, data: pdfData)
        vm.attach(mime: "application/zip", name: "hai.zip", byteCount: 10, data: Data([1]))
        XCTAssertEqual(vm.stagedAttachment?.name, "mot.pdf")
        XCTAssertNotNil(vm.attachError)
    }

    func testAGoodFileClearsTheEarlierRefusal() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.attach(mime: "application/zip", name: "a.zip", byteCount: 10, data: Data([1]))
        XCTAssertNotNil(vm.attachError)
        vm.attach(mime: "application/pdf", name: "a.pdf", byteCount: pdfData.count, data: pdfData)
        XCTAssertNil(vm.attachError)
    }

    func testRemoveTakesTheFileAndTheSentenceAway() {
        let vm = makeViewModel(SequencedChatStreaming([]))
        vm.attach(mime: "application/pdf", name: "a.pdf", byteCount: pdfData.count, data: pdfData)
        vm.removeAttachment()
        XCTAssertNil(vm.stagedAttachment)
        XCTAssertNil(vm.attachError)
    }

    func testAStagedFileIsSentWithAnEmptyBoxAndThenCleared() async throws {
        let streaming = SequencedChatStreaming([.init(lines: okReply)])
        let vm = makeViewModel(streaming)
        vm.attach(mime: "application/pdf", name: "Hợp đồng.pdf", byteCount: pdfData.count, data: pdfData)
        vm.inputText = ""
        vm.send()
        await waitUntil { !vm.isStreaming && streaming.sentEndpoints.count == 1 }

        XCTAssertEqual(streaming.sentEndpoints.count, 1)
        XCTAssertNil(vm.stagedAttachment, "sent once, then cleared")
        XCTAssertEqual(vm.messages.first?.attachment?.name, "Hợp đồng.pdf")
        let rows = try messageRows(streaming, at: 0)
        XCTAssertEqual(rows[0]["content"] as? String, "")
        let list = try XCTUnwrap(rows[0]["experimental_attachments"] as? [[String: String]])
        XCTAssertEqual(list[0]["contentType"], "application/pdf")
        XCTAssertEqual(list[0]["name"], "Hợp đồng.pdf")
        XCTAssertEqual(list[0]["url"], "data:application/pdf;base64,JVBERi0xLjQ=")
    }

    func testNothingIsSentWithNoTextAndNoFile() async {
        let streaming = SequencedChatStreaming([.init(lines: okReply)])
        let vm = makeViewModel(streaming)
        vm.inputText = "   "
        vm.send()
        XCTAssertTrue(vm.messages.isEmpty)
        XCTAssertTrue(streaming.sentEndpoints.isEmpty)
    }

    func testTheNextQuestionDoesNotSendTheFileAgainAndTheHistoryNamesIt() async throws {
        let streaming = SequencedChatStreaming([.init(lines: okReply), .init(lines: okReply)])
        let vm = makeViewModel(streaming)
        vm.attach(mime: "application/pdf", name: "Hợp đồng.pdf", byteCount: pdfData.count, data: pdfData)
        vm.inputText = "Đọc giúp"
        vm.send()
        await waitUntil { !vm.isStreaming && streaming.sentEndpoints.count == 1 }

        vm.inputText = "Điều 5 nói gì?"
        vm.send()
        await waitUntil { !vm.isStreaming && streaming.sentEndpoints.count == 2 }

        let rows = try messageRows(streaming, at: 1)
        XCTAssertEqual(rows[0]["content"] as? String, "Đọc giúp\n[Attached with this message: Hợp đồng.pdf]")
        XCTAssertNil(rows[0]["experimental_attachments"])
        XCTAssertEqual(rows.last?["content"] as? String, "Điều 5 nói gì?")
        XCTAssertNil(rows.last?["experimental_attachments"])
    }

    func testAQuestionThatWasOnlyAFileIsSavedAsTheNoteNamingIt() {
        let attachment = ChatAttachment(kind: .pdf, name: "Hợp đồng.pdf", mime: "application/pdf", data: pdfData)
        let saved = MessagePayload.saved(from: [
            ChatMessage(role: .user, content: "", attachment: attachment),
            ChatMessage(role: .assistant, content: "Đã đọc."),
            ChatMessage(role: .user, content: "Tóm tắt", attachment: attachment),
        ])
        XCTAssertEqual(saved[0].content, "[Attached with this message: Hợp đồng.pdf]")
        XCTAssertEqual(saved[1].content, "Đã đọc.")
        XCTAssertEqual(saved[2].content, "Tóm tắt")
        XCTAssertTrue(saved.allSatisfy { $0.attachments.isEmpty })
    }
}

/// The pure parts of preparing a photo (shrinking it, and the server's bound on its data URL).
final class AttachmentPreparerTests: XCTestCase {

    func testAPhotoLargerThanTheLimitIsShrunkKeepingItsShape() {
        let size = AttachmentPreparer.fittedSize(width: 4000, height: 3000, maxSide: 1600)
        XCTAssertEqual(size.width, 1600)
        XCTAssertEqual(size.height, 1200)
        let tall = AttachmentPreparer.fittedSize(width: 1000, height: 4000, maxSide: 1600)
        XCTAssertEqual(tall.width, 400)
        XCTAssertEqual(tall.height, 1600)
    }

    func testASmallPhotoIsNeverEnlarged() {
        let size = AttachmentPreparer.fittedSize(width: 800, height: 600, maxSide: 1600)
        XCTAssertEqual(size.width, 800)
        XCTAssertEqual(size.height, 600)
    }

    func testTheDataURLLengthIsTheHeaderPlusFourThirdsOfTheBytes() {
        XCTAssertEqual(AttachmentPreparer.dataURLLength(byteCount: 0, mime: "image/jpeg"), "data:image/jpeg;base64,".count)
        XCTAssertEqual(AttachmentPreparer.dataURLLength(byteCount: 3, mime: "image/jpeg"), "data:image/jpeg;base64,".count + 4)
        XCTAssertEqual(AttachmentPreparer.dataURLLength(byteCount: 4, mime: "image/jpeg"), "data:image/jpeg;base64,".count + 8)
        // 3 MB of PDF is inside the server's 4 100 000-character PDF bound, as the web's own comment says
        XCTAssertLessThanOrEqual(AttachmentPreparer.dataURLLength(byteCount: 3_000_000, mime: "application/pdf"), 4_100_000)
    }

    func testTheServersImageBoundIsEightMillionCharacters() {
        XCTAssertEqual(AttachmentPreparer.maxImageDataURLChars, 8_000_000)
    }
}
