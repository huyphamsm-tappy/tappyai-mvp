import XCTest
@testable import TappyAI

/// What a reply keeps of the Deep Research annotations (web `ChatInterface`: the card, the charts and the section pictures ride on the
/// message while the tab lives; Android `ChatMessage.research / charts / docMedia`). The fields start empty, so every message built the old
/// way is unchanged, and they are never part of what is saved with the conversation: the server keeps the text alone.
final class ChatMessageAnnotationsTests: XCTestCase {

    private let status = ResearchStatus(title: "Giá vàng", phase: .done, steps: [ResearchStep(title: "Tìm giá", status: .done)], sources: 5,
                                        links: [ResearchLink(id: 1, title: "VnExpress", url: "https://vnexpress.net/a")])
    private let chart = ResearchChart(section: "Giá", title: "Giá vàng", unit: "triệu", kind: .bar,
                                      points: [ChartPoint(label: "2024", value: 1, source: 1), ChartPoint(label: "2025", value: 2, source: 1)])
    private let picture = DocMediaItem(title: "Hội An", src: "https://example.com/a.jpg", source: .web)

    func testAMessageBuiltTheOldWayHasNoResearchChartsOrPictures() {
        let message = ChatMessage(role: .assistant, content: "Xin chào")
        XCTAssertNil(message.research)
        XCTAssertEqual(message.charts, [])
        XCTAssertEqual(message.docMedia, [])
        XCTAssertEqual(ChatMessage(id: "1", role: .user, content: "Hỏi", status: .complete, toolInvocations: [], livePlaces: nil, attachment: nil).charts, [])
    }

    func testTheFieldsAreSetAfterwardsAndCountInEquality() {
        var message = ChatMessage(id: "a", role: .assistant, content: "Báo cáo")
        let plain = message
        message.research = status
        message.charts = [chart]
        message.docMedia = [picture]
        XCTAssertEqual(message.research, status)
        XCTAssertEqual(message.charts, [chart])
        XCTAssertEqual(message.docMedia, [picture])
        XCTAssertNotEqual(message, plain, "a reply with its card is not the reply without it")
    }

    func testTheyAreNeverSavedWithTheConversation() {
        var reply = ChatMessage(id: "a", role: .assistant, content: "Báo cáo")
        reply.research = status
        reply.charts = [chart]
        reply.docMedia = [picture]
        let saved = MessagePayload.saved(from: [ChatMessage(id: "u", role: .user, content: "Giá vàng?"), reply])
        let json = try? JSONEncoder().encode(saved)
        let text = String(decoding: json ?? Data(), as: UTF8.self)
        XCTAssertEqual(saved.map(\.content), ["Giá vàng?", "Báo cáo"])
        XCTAssertFalse(text.contains("vnexpress"), "no source link is saved")
        XCTAssertFalse(text.contains("example.com"), "no picture address is saved")
        XCTAssertFalse(text.contains("phase"), "no card is saved")
    }
}
