import Combine
import XCTest
@testable import TappyAI

/// The listening screen: every exit (Hủy, Gửi, Quay lại, nền, lỗi) releases the microphone, only «Gửi» hands text on, and
/// the sample sentence is never text.
@MainActor
final class VoiceScreenTests: XCTestCase {

    @MainActor
    final class FakeVoice: VoiceRecognizing {
        var transcript = "" { didSet { subject.send() } }
        var isListening = false { didSet { subject.send() } }
        var error: String? { didSet { subject.send() } }
        private let subject = PassthroughSubject<Void, Never>()
        var changes: AnyPublisher<Void, Never> { subject.eraseToAnyPublisher() }
        private(set) var begins = 0
        private(set) var halts = 0
        func begin() { begins += 1; if error == nil { isListening = true } }
        func halt() { halts += 1; isListening = false }
    }

    private var sent: [String] = []
    private var closed = 0

    private func make(_ voice: FakeVoice) -> VoiceScreenController {
        sent = []; closed = 0
        return VoiceScreenController(voice: voice, sendText: { [unowned self] in sent.append($0) }, close: { [unowned self] in closed += 1 })
    }

    // MARK: Hủy / Quay lại

    func testCancelReleasesTheMicrophoneAndSendsNothing() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear(); voice.transcript = "tìm quán cà phê"
        c.cancel()
        XCTAssertEqual(voice.halts, 1)
        XCTAssertFalse(voice.isListening)
        XCTAssertEqual(sent, [], "«Hủy» drops the words")
        XCTAssertEqual(closed, 1)
    }

    func testBackIsACancel() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear(); voice.transcript = "xin chào"
        c.back()
        XCTAssertEqual(sent, [])
        XCTAssertEqual(closed, 1)
        XCTAssertFalse(voice.isListening)
    }

    func testClosingTwiceDoesNothingTheSecondTime() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear(); c.cancel(); c.cancel(); c.back()
        XCTAssertEqual(closed, 1)
    }

    // MARK: Gửi

    func testSendStopsAndHandsOverTheRecognisedTextOnce() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear(); voice.transcript = "  tìm quán cà phê yên tĩnh \n"
        c.send(); c.send()
        XCTAssertEqual(sent, ["tìm quán cà phê yên tĩnh"], "trimmed, once")
        XCTAssertEqual(voice.halts, 1)
        XCTAssertEqual(closed, 1)
    }

    func testSendWithNothingRecognisedDoesNothingAtAll() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear()
        XCTAssertFalse(c.canSend)
        c.send()
        voice.transcript = "   \n "
        XCTAssertFalse(c.canSend, "whitespace is not text")
        c.send()
        XCTAssertEqual(sent, [])
        XCTAssertEqual(closed, 0, "the screen stays; the person can still speak or cancel")
        XCTAssertTrue(voice.isListening)
    }

    func testTheSampleSentenceIsNeverText() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear()
        XCTAssertTrue(c.showsSample, "before any words: the dim sample is shown")
        XCTAssertEqual(c.transcript, "", "…but it is not the transcript")
        c.send()
        XCTAssertEqual(sent, [], "so «Gửi» has nothing to send")
        voice.transcript = "xin chào"
        XCTAssertFalse(c.showsSample, "the first words replace the sample")
        XCTAssertTrue(c.canSend)
        XCTAssertEqual(NSLocalizedString("voice.listen.sample", comment: "").isEmpty, false)
    }

    // MARK: The big button

    func testTheCentreButtonStopsAndKeepsTheText_thenListensAgain() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear(); voice.transcript = "một hai"
        c.tapCenter()
        XCTAssertFalse(voice.isListening)
        XCTAssertEqual(c.transcript, "một hai", "the text stays")
        XCTAssertEqual(closed, 0)
        c.tapCenter()
        XCTAssertTrue(voice.isListening)
        XCTAssertEqual(voice.begins, 2)
    }

    // MARK: Nền / quay lại màn

    func testBackgroundReleasesTheMicrophoneButKeepsTheScreenAndTheText() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear(); voice.transcript = "đang nói dở"
        c.backgrounded()
        XCTAssertFalse(voice.isListening)
        XCTAssertEqual(c.transcript, "đang nói dở")
        XCTAssertEqual(closed, 0)
        XCTAssertEqual(sent, [], "nothing is sent behind the person's back")
    }

    func testComingBackNeverTurnsTheMicrophoneOnByItself() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear(); c.backgrounded()
        c.appear(); c.appear()   // the view appears again after the background
        XCTAssertEqual(voice.begins, 1, "listening started once; returning does not restart it")
        XCTAssertFalse(voice.isListening)
    }

    func testDisappearingByAnyOtherRouteReleasesTheMicrophoneAndSendsNothing() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear(); voice.transcript = "abc"
        c.disappeared()
        XCTAssertFalse(voice.isListening)
        XCTAssertEqual(sent, [])
    }

    // MARK: Lỗi

    func testAPermissionErrorIsShownAndNothingHangs() {
        let voice = FakeVoice(); voice.error = "Cần cấp quyền micro"
        let c = make(voice)
        c.appear()
        XCTAssertEqual(c.error, "Cần cấp quyền micro")
        XCTAssertFalse(c.isListening, "no listening state is faked")
        XCTAssertFalse(c.canSend)
        c.cancel()
        XCTAssertEqual(closed, 1, "the person can always leave")
    }

    func testAnErrorThatArrivesLaterReachesTheScreen() {
        let voice = FakeVoice(); let c = make(voice)
        c.appear()
        voice.error = "Không khởi động được micro."
        voice.isListening = false
        XCTAssertEqual(c.error, "Không khởi động được micro.")
        XCTAssertFalse(c.isListening)
    }

    // MARK: Rules + catalogue

    func testRules() {
        XCTAssertFalse(VoiceScreenRules.canSend(""))
        XCTAssertFalse(VoiceScreenRules.canSend(" \n\t"))
        XCTAssertTrue(VoiceScreenRules.canSend("a"))
        XCTAssertEqual(VoiceScreenRules.textToSend("  a b \n"), "a b")
        XCTAssertTrue(VoiceScreenRules.showsSample(" "))
    }

    func testEveryStringTheScreenShowsHasACatalogEntry() {
        for key in ["voice.listen.title", "voice.listen.subtitle", "voice.listen.sample", "voice.listen.stopA11y",
                    "voice.listen.startA11y", "common.cancel", "chat.send"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
