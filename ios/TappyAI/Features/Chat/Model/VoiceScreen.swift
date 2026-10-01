import Combine
import Foundation

/// The listening screen's logic, free of SwiftUI and of the microphone so every exit can be unit-tested.
///
/// Rules (owner, 01/10):
///   • the centre button stops listening and KEEPS the recognised text; «Hủy» stops, drops the text, closes; «Gửi» stops,
///     sends the RECOGNISED text, closes;
///   • the sample sentence under the card is a hint only — it is never text, so it can never be sent or typed into the
///     chat box as if the person had said it; with nothing recognised «Gửi» is dimmed and does nothing;
///   • every way out releases the microphone through the same teardown (`VoiceSession`), and returning to the screen never
///     turns the microphone back on by itself.

/// The recogniser as the screen needs it. `VoiceInputManager` is the real one; the tests use a fake.
@MainActor
protocol VoiceRecognizing: AnyObject {
    var transcript: String { get }
    var isListening: Bool { get }
    var error: String? { get }
    /// Fires on the main queue AFTER any of the three values above changed.
    var changes: AnyPublisher<Void, Never> { get }
    /// Starts listening from an empty box.
    func begin()
    /// Releases the microphone, keeps the text, hands nothing on.
    func halt()
}

enum VoiceScreenRules {
    /// Whether there is recognised text to send. Blank or whitespace is not text.
    static func canSend(_ transcript: String) -> Bool {
        !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func textToSend(_ transcript: String) -> String {
        transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The dim sample sentence shows only while nothing has been recognised.
    static func showsSample(_ transcript: String) -> Bool { !canSend(transcript) }
}

@MainActor
final class VoiceScreenController: ObservableObject {
    @Published private(set) var transcript = ""
    @Published private(set) var isListening = false
    @Published private(set) var error: String?

    private let voice: VoiceRecognizing
    private let sendText: (String) -> Void
    private let close: () -> Void
    private var started = false
    private var finished = false
    private var bag = Set<AnyCancellable>()

    init(voice: VoiceRecognizing, sendText: @escaping (String) -> Void, close: @escaping () -> Void) {
        self.voice = voice
        self.sendText = sendText
        self.close = close
        voice.changes.sink { [weak self] in self?.sync() }.store(in: &bag)
        sync()
    }

    var canSend: Bool { VoiceScreenRules.canSend(transcript) }
    var showsSample: Bool { VoiceScreenRules.showsSample(transcript) }

    private func sync() {
        transcript = voice.transcript
        isListening = voice.isListening
        error = voice.error
    }

    /// The screen appeared. Listening starts ONCE per screen; coming back from the background (or any later appearance)
    /// never starts it again.
    func appear() {
        guard !started, !finished else { return }
        started = true
        voice.begin()
        sync()
    }

    /// The big round button: stop while listening (text stays), listen again when stopped.
    func tapCenter() {
        guard !finished else { return }
        if isListening { voice.halt() } else { voice.begin() }
        sync()
    }

    /// «Hủy» — and «Quay lại»: stop, drop the text, close. Nothing is sent.
    func cancel() {
        guard !finished else { return }
        finished = true
        voice.halt()
        close()
    }

    func back() { cancel() }

    /// «Gửi»: stop, hand over the RECOGNISED text, close. With no recognised text it does nothing at all.
    func send() {
        sync()
        guard !finished, canSend else { return }
        finished = true
        let text = VoiceScreenRules.textToSend(voice.transcript)
        voice.halt()
        sendText(text)
        close()
    }

    /// The app is no longer active: the microphone is released, the screen and its text stay.
    func backgrounded() {
        voice.halt()
        sync()
    }

    /// The view went away by some other route: release the microphone, send nothing.
    func disappeared() {
        voice.halt()
    }
}
