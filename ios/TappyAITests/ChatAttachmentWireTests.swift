import XCTest
@testable import TappyAI

/// A photo or PDF goes to `/api/chat` as the web sends it: `experimental_attachments: [{ url: <data URL>, contentType, name }]` beside the
/// question's text (server: clientInput.ts validateAttachment - the data URL must carry the same type). It is never saved with the
/// conversation, and an earlier question's file is named in the history instead of sent again (Android HistoryCompaction).
@MainActor
final class ChatAttachmentWireTests: XCTestCase {

    private let pdfBytes = Data("%PDF-1.4".utf8)   // base64 JVBERi0xLjQ=

    private func pdf(name: String = "Hợp đồng.pdf") -> ChatAttachment {
        ChatAttachment(id: "a1", kind: .pdf, name: name, mime: "application/pdf", data: pdfBytes)
    }

    private func photo() -> ChatAttachment {
        ChatAttachment(id: "p1", kind: .image, name: "anh.jpg", mime: "image/jpeg", data: Data([0xFF, 0xD8, 0xFF]))
    }

    private func rows(_ payloads: [MessagePayload]) -> [[String: Any]] {
        ChatService.wireMessages(payloads)
    }

    func testTheDataURLCarriesTheAttachmentsOwnType() {
        XCTAssertEqual(pdf().dataURL, "data:application/pdf;base64,JVBERi0xLjQ=")
        XCTAssertTrue(photo().dataURL.hasPrefix("data:image/jpeg;base64,"))
    }

    func testAWirePdfHasUrlContentTypeAndName() {
        XCTAssertEqual(pdf().wireObject, ["url": "data:application/pdf;base64,JVBERi0xLjQ=", "contentType": "application/pdf", "name": "Hợp đồng.pdf"])
    }

    func testANamelessPdfGetsTheServersFallbackName() {
        XCTAssertEqual(pdf(name: "  ").name, "tai-lieu.pdf")
    }

    func testAQuestionWithAPdfSendsExperimentalAttachments() throws {
        let sent = rows([MessagePayload(role: "user", content: "Tóm tắt giúp mình", attachments: [pdf()])])
        let row = try XCTUnwrap(sent.first)
        XCTAssertEqual(row["role"] as? String, "user")
        XCTAssertEqual(row["content"] as? String, "Tóm tắt giúp mình")
        let list = try XCTUnwrap(row["experimental_attachments"] as? [[String: String]])
        XCTAssertEqual(list.count, 1)
        XCTAssertEqual(list[0]["contentType"], "application/pdf")
        XCTAssertEqual(list[0]["name"], "Hợp đồng.pdf")
        XCTAssertEqual(list[0]["url"], "data:application/pdf;base64,JVBERi0xLjQ=")
    }

    func testAPhotoGoesTheSameWay() throws {
        let sent = rows([MessagePayload(role: "user", content: "", attachments: [photo()])])
        let list = try XCTUnwrap(sent[0]["experimental_attachments"] as? [[String: String]])
        XCTAssertEqual(list[0]["contentType"], "image/jpeg")
        XCTAssertTrue(try XCTUnwrap(list[0]["url"]).hasPrefix("data:image/jpeg;base64,"))
    }

    func testATextQuestionHasNoAttachmentsKey() {
        let sent = rows([MessagePayload(role: "user", content: "Xin chào"), MessagePayload(role: "assistant", content: "Chào bạn")])
        for row in sent { XCTAssertNil(row["experimental_attachments"]) }
        XCTAssertEqual(Set(sent[0].keys), ["role", "content"])
    }

    func testAnAttachmentIsNotPartOfAnySavedConversation() throws {
        let payload = MessagePayload(role: "user", content: "Đọc giúp", attachments: [pdf()])
        let data = try JSONEncoder().encode(payload)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(Set(object.keys), ["role", "content"])
        let saved = try JSONEncoder().encode(SaveConversationRequest(title: "t", category: "general", messages: [payload]))
        XCTAssertFalse(String(decoding: saved, as: UTF8.self).contains("base64"))
    }

    func testOnlyTheLatestQuestionCarriesItsFile() {
        let messages = [
            ChatMessage(role: .user, content: "Đọc giúp", attachment: pdf()),
            ChatMessage(role: .assistant, content: "Đã đọc."),
            ChatMessage(role: .user, content: "Điều 5 nói gì?"),
        ]
        let history = MessagePayload.history(from: messages)
        XCTAssertEqual(history[0].content, "Đọc giúp\n[Attached with this message: Hợp đồng.pdf]")
        XCTAssertTrue(history[0].attachments.isEmpty)
        XCTAssertEqual(history[2].content, "Điều 5 nói gì?")
    }

    func testAnEarlierPhotoIsNamedAsAPhoto() {
        let messages = [
            ChatMessage(role: .user, content: "", attachment: photo()),
            ChatMessage(role: .assistant, content: "Đó là một con mèo."),
            ChatMessage(role: .user, content: "Còn gì nữa?"),
        ]
        XCTAssertEqual(MessagePayload.history(from: messages)[0].content, "[Attached with this message: photo]")
    }

    func testTheLatestQuestionKeepsItsFileOnARetry() {
        let messages = [ChatMessage(role: .user, content: "", attachment: pdf())]
        let history = MessagePayload.history(from: messages)
        XCTAssertEqual(history[0].attachments, [pdf()])
        XCTAssertEqual(history[0].content, "")
    }

    func testTheRequestBodyThatReachesTheStreamHasTheAttachment() throws {
        let streaming = SequencedChatStreaming([])
        let service = ChatService(api: MockAPIClient(), streaming: streaming)
        _ = service.chatWithContext(messages: [MessagePayload(role: "user", content: "Tóm tắt", attachments: [pdf()])],
                                    userPreferences: nil, responseStyle: nil)
        let body = try XCTUnwrap(streaming.sentEndpoints.first?.body)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        let rows = try XCTUnwrap(object["messages"] as? [[String: Any]])
        let list = try XCTUnwrap(rows[0]["experimental_attachments"] as? [[String: String]])
        XCTAssertEqual(list[0]["contentType"], "application/pdf")
        XCTAssertEqual(list[0]["url"], "data:application/pdf;base64,JVBERi0xLjQ=")
    }

    func testAMessageListIsComparedWithoutItsBytes() {
        let a = pdf()
        let b = ChatAttachment(id: "a1", kind: .pdf, name: "Hợp đồng.pdf", mime: "application/pdf", data: pdfBytes)
        XCTAssertEqual(a, b)
        XCTAssertNotEqual(a, photo())
    }
}
