import XCTest
@testable import TappyAI

/// What the chat keeps of a Deep Research turn (web `ChatInterface`: the card, the charts and the section pictures ride on the reply;
/// Android `TurnAnnotations` / `partialReplyMessage`, 63923b6 and 68bca9b). The running turn publishes them for the card to draw live, the
/// reply keeps them when it is built, a Stop or a drop AFTER some text keeps them with the text, and none of it is saved: the server
/// keeps the text alone.
@MainActor
final class ChatResearchStateTests: XCTestCase {

    // MARK: - Frames (the shape of the real ones)

    private func researchFrame(phase: String, steps: String = "[]", links: String = "") -> String {
        "8:[{\"type\":\"tappy.research.v1\",\"title\":\"Giá vàng\",\"phase\":\"\(phase)\",\"steps\":\(steps),\"sources\":4\(links)}]"
    }

    private let chartsFrame = "8:[{\"type\":\"tappy.research_charts.v1\",\"charts\":[{\"section\":\"Giá\",\"title\":\"Giá vàng\",\"unit\":\"triệu\","
        + "\"kind\":\"bar\",\"points\":[{\"label\":\"2024\",\"value\":76.5,\"source\":1},{\"label\":\"2025\",\"value\":98,\"source\":2}]}]}]"
    private let mediaFrame = "8:[{\"kind\":\"tappy.doc_media.v1\",\"v\":1,\"items\":[{\"title\":\"Giá\",\"src\":\"https://example.com/a.jpg\",\"source\":\"web\"}]}]"
    private let doneFrame = "d:{\"finishReason\":\"stop\"}"

    private func signedInSession() -> SessionStore {
        let session = SessionStore(storage: InMemoryTokenStorage())
        session.bootstrap()
        session.didAuthenticate(TestFixtures.tokens(expiresIn: 3600), onboarded: true)
        return session
    }

    private func makeViewModel(_ streaming: StreamingClient, api: APIClient = MockAPIClient()) -> ChatViewModel {
        ChatViewModel(service: ChatService(api: api, streaming: streaming), session: signedInSession())
    }

    private func ask(_ vm: ChatViewModel, _ text: String = "Giá vàng 2026 thế nào?") {
        vm.inputText = text
        vm.send()
    }

    // MARK: - A finished turn

    func testTheFinishedReplyKeepsTheLatestCardTheChartsAndThePictures() async {
        let lines = [researchFrame(phase: "planning"), "0:\"Báo cáo\"", researchFrame(phase: "researching"), chartsFrame, mediaFrame,
                     researchFrame(phase: "done", links: ",\"links\":[{\"id\":1,\"title\":\"VnExpress\",\"url\":\"https://vnexpress.net/a\"}]"), doneFrame]
        let vm = makeViewModel(ScriptedChatStreaming(lines: lines))
        ask(vm)
        await waitUntil { !vm.isStreaming }

        let reply = vm.messages.last
        XCTAssertEqual(reply?.content, "Báo cáo", "the annotations are never part of the text")
        XCTAssertEqual(reply?.status, .complete)
        XCTAssertEqual(reply?.research?.phase, .done, "the latest card is the reply's")
        XCTAssertEqual(reply?.research?.links.map(\.id), [1])
        XCTAssertEqual(reply?.charts.count, 1)
        XCTAssertEqual(reply?.charts.first?.points.count, 2)
        XCTAssertEqual(reply?.docMedia.map(\.title), ["Giá"])
        XCTAssertNil(vm.endNotice)
    }

    func testOneArrayWithProgressAndTheCardGivesBoth() async {
        let both = "8:[{\"kind\":\"tappy.progress.v1\",\"stage\":\"plan\",\"text\":\"Đang lập kế hoạch…\"},"
            + "{\"type\":\"tappy.research.v1\",\"title\":\"T\",\"phase\":\"planning\",\"steps\":[],\"sources\":0}]"
        let vm = makeViewModel(ScriptedChatStreaming(lines: [both, "0:\"Xong\"", doneFrame]))
        ask(vm)
        await waitUntil { !vm.isStreaming }
        XCTAssertEqual(vm.progressHint, "Đang lập kế hoạch…")
        XCTAssertEqual(vm.messages.last?.research?.phase, .planning)
        XCTAssertEqual(vm.messages.last?.content, "Xong")
    }

    func testAnOrdinaryTurnHasNoCardNoChartsNoPictures() async {
        let vm = makeViewModel(ScriptedChatStreaming(lines: ["0:\"Xin chào\"", doneFrame]))
        ask(vm, "Chào")
        await waitUntil { !vm.isStreaming }
        XCTAssertNil(vm.messages.last?.research)
        XCTAssertEqual(vm.messages.last?.charts, [])
        XCTAssertEqual(vm.messages.last?.docMedia, [])
        XCTAssertNil(vm.liveResearch)
    }

    // MARK: - The running turn

    func testTheRunningTurnPublishesTheCardTheChartsAndThePicturesAndClearsThemWhenItEnds() async {
        let gate = TestGate()
        let streaming = SequencedChatStreaming([.init(lines: [researchFrame(phase: "researching"), "0:\"Đang viết\"", chartsFrame, mediaFrame],
                                                      holdAfter: gate)])
        let vm = makeViewModel(streaming)
        ask(vm)
        await waitUntil { vm.liveDocMedia.count == 1 }

        XCTAssertTrue(vm.isStreaming)
        XCTAssertEqual(vm.liveResearch?.phase, .researching)
        XCTAssertEqual(vm.liveCharts.count, 1)
        XCTAssertEqual(vm.liveDocMedia.count, 1)
        XCTAssertEqual(vm.messages.last?.research?.phase, .researching, "the reply already holds what the card shows")

        await gate.open()
        await waitUntil { !vm.isStreaming }
        XCTAssertNil(vm.liveResearch, "when the turn ends the reply holds them")
        XCTAssertEqual(vm.liveCharts, [])
        XCTAssertEqual(vm.liveDocMedia, [])
        XCTAssertEqual(vm.messages.last?.charts.count, 1)
    }

    func testANewTurnStartsWithoutTheLastTurnsCardOrCharts() async {
        let streaming = SequencedChatStreaming([
            .init(lines: [researchFrame(phase: "done"), chartsFrame, mediaFrame, "0:\"Báo cáo\"", doneFrame]),
            .init(lines: ["0:\"Câu trả lời thường\"", doneFrame]),
        ])
        let vm = makeViewModel(streaming)
        ask(vm)
        await waitUntil { !vm.isStreaming }
        ask(vm, "Còn gì nữa?")
        await waitUntil { !vm.isStreaming }

        XCTAssertEqual(vm.messages.count, 4)
        XCTAssertNotNil(vm.messages[1].research, "the first reply keeps its card")
        XCTAssertNil(vm.messages[3].research)
        XCTAssertEqual(vm.messages[3].charts, [])
        XCTAssertEqual(vm.messages[3].docMedia, [])
        XCTAssertNil(vm.liveResearch)
    }

    // MARK: - Stop and errors after some text

    func testStopAfterSomeTextKeepsTheTextTheCardTheChartsAndThePictures() async {
        let gate = TestGate()
        let streaming = SequencedChatStreaming([.init(lines: [researchFrame(phase: "writing"), "0:\"Nửa báo cáo\"", chartsFrame, mediaFrame],
                                                      holdAfter: gate)])
        let vm = makeViewModel(streaming)
        ask(vm)
        await waitUntil { vm.messages.last?.docMedia.count == 1 }

        vm.stop()
        let reply = vm.messages.last
        XCTAssertEqual(reply?.content, "Nửa báo cáo")
        XCTAssertEqual(reply?.status, .complete)
        XCTAssertEqual(reply?.research?.phase, .writing)
        XCTAssertEqual(reply?.charts.count, 1)
        XCTAssertEqual(reply?.docMedia.count, 1)
        XCTAssertNil(vm.liveResearch, "nothing is left running")
        XCTAssertEqual(vm.liveCharts, [])
        await gate.open()
    }

    func testADropAfterSomeTextKeepsTheTextTheCardTheChartsAndThePicturesAndSaysFailed() async {
        let streaming = SequencedChatStreaming([.init(lines: [researchFrame(phase: "writing"), "0:\"Nửa báo cáo\"", chartsFrame, mediaFrame],
                                                      error: AppError.streaming(reason: "connection lost"))])
        let vm = makeViewModel(streaming)
        ask(vm)
        await waitUntil { !vm.isStreaming }

        let reply = vm.messages.last
        XCTAssertEqual(reply?.role, .assistant)
        XCTAssertEqual(reply?.content, "Nửa báo cáo")
        XCTAssertEqual(reply?.status, .failed)
        XCTAssertEqual(reply?.research?.phase, .writing)
        XCTAssertEqual(reply?.charts.count, 1)
        XCTAssertEqual(reply?.docMedia.count, 1)
        XCTAssertNotNil(vm.error)
        XCTAssertNil(vm.liveResearch)
        XCTAssertEqual(vm.liveDocMedia, [])
    }

    func testADropBeforeAnyTextLeavesNoReplyEvenIfTheCardArrived() async {
        let streaming = SequencedChatStreaming([.init(lines: [researchFrame(phase: "researching")], error: AppError.streaming(reason: "connection lost"))])
        let vm = makeViewModel(streaming)
        ask(vm)
        await waitUntil { !vm.isStreaming }

        XCTAssertEqual(vm.messages.map(\.role), [.user], "no empty bubble next to the error")
        XCTAssertNotNil(vm.error)
        XCTAssertNil(vm.liveResearch)
    }

    // MARK: - Not saved

    func testTheCardTheChartsAndThePicturesAreNotSentToTheServerWithTheConversation() async {
        let api = ChatTestAPI { _ in ChatTestJSON.savedConversation(id: "c1") }
        let lines = [researchFrame(phase: "done", links: ",\"links\":[{\"id\":1,\"title\":\"VnExpress\",\"url\":\"https://vnexpress.net/a\"}]"),
                     "0:\"Báo cáo\"", chartsFrame, mediaFrame, doneFrame]
        let vm = makeViewModel(ScriptedChatStreaming(lines: lines), api: api)
        ask(vm)
        await waitUntil { api.bodies(path: "/api/conversations", method: .post).count == 1 }

        let saved = api.bodies(path: "/api/conversations", method: .post)
        XCTAssertEqual(saved.count, 1)
        let body = (saved.first.flatMap { try? JSONSerialization.data(withJSONObject: $0) }).map { String(decoding: $0, as: UTF8.self) } ?? ""
        XCTAssertTrue(body.contains("Báo cáo"), "the text is saved")
        for leak in ["vnexpress", "example.com", "phase", "points", "tappy."] {
            XCTAssertFalse(body.contains(leak), "\(leak) must not be saved")
        }
    }
}
