import Speech
import AVFoundation
import Combine
import UIKit

/// What a voice session has switched on, and the ONE list of things to switch off — so every way out (send, cancel,
/// back, the app leaving the foreground, a failed start, the recogniser finishing) releases the microphone the same way.
///
/// Pure value type: the manager performs the returned actions; the unit tests drive it directly.
struct VoiceSession: Equatable {
    enum Action: Equatable {
        case endAudio, stopEngine, removeTap, cancelTask, deactivateSession
        /// Hands the dictated text on, at most once per session.
        case deliverFinal(String)
    }

    private(set) var sessionActive = false
    private(set) var tapInstalled = false
    private(set) var engineStarted = false
    private(set) var recognizing = false
    private(set) var finalDelivered = false

    /// Anything still holding the microphone or the recogniser.
    var isHolding: Bool { sessionActive || tapInstalled || engineStarted || recognizing }

    mutating func activatedSession() { sessionActive = true }
    mutating func installedTap() { tapInstalled = true }
    mutating func startedEngine() { engineStarted = true }
    mutating func startedRecognition() { recognizing = true; finalDelivered = false }

    /// Releases everything held, in the order that is safe (stop input, then the tap, then the task, then the session).
    /// `deliverFinal` hands over the dictated text — once: a second teardown, or the recogniser's own end after a stop,
    /// never delivers it again. Idempotent: with nothing held it returns no actions.
    mutating func teardown(deliverFinal: Bool, transcript: String) -> [Action] {
        var actions: [Action] = []
        if recognizing { actions.append(.endAudio) }
        if engineStarted { actions.append(.stopEngine) }
        if tapInstalled { actions.append(.removeTap) }
        if recognizing { actions.append(.cancelTask) }
        if sessionActive { actions.append(.deactivateSession) }
        sessionActive = false; tapInstalled = false; engineStarted = false; recognizing = false
        if deliverFinal, !finalDelivered, !transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            actions.append(.deliverFinal(transcript))
            finalDelivered = true
        }
        return actions
    }
}

/// Voice input — native equivalent of Web's SpeechRecognition API.
/// Uses SFSpeechRecognizer + AVAudioEngine for live dictation into the chat input.
///
/// Exits (all go through `VoiceSession.teardown`):
///   • `stopListening()`  — the user tapped the mic again («Gửi»): the text is handed on (the chat auto-sends it);
///   • `cancelListening()` — leaving the screen, the app resigning active, a failed start: the mic is released and the
///     text stays in the input box, but nothing is handed on, so nothing is sent behind the user's back;
///   • the recogniser finishing or failing on its own — hands the text on once.
@MainActor
final class VoiceInputManager: AppObservableObject {
    @AppPublished var isListening: Bool = false
    @AppPublished var transcript: String = ""
    @AppPublished var error: String?

    private var recognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    private var baseText: String = ""
    private var session = VoiceSession()
    private var bag = Set<AnyCancellable>()

    var onTranscript: ((String) -> Void)?
    var onFinished: ((String) -> Void)?

    /// Dictation listens in the APP language — you speak the language you chose to work in. This is
    /// deliberately NOT the message language: read-aloud follows the reply, input follows the user.
    /// Defaults to the app's current UI language rather than a hardcoded locale.
    init(appLanguage: String = LocalizationManager.currentLanguageCode) {
        recognizer = SFSpeechRecognizer(
            locale: Locale(identifier: VoiceLocale.inputTag(forAppLanguage: appLanguage))
        )
        // The app stops being the active one (home gesture, app switcher, a call, Control Centre): the microphone must
        // not stay open behind it.
        NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)
            .sink { [weak self] _ in Task { @MainActor [weak self] in self?.cancelListening() } }
            .store(in: &bag)
    }

    /// Re-targets the recogniser when the user switches app language mid-session. Not called while
    /// listening — the caller stops first, so an in-flight recognition is never re-pointed.
    func updateAppLanguage(_ appLanguage: String) {
        recognizer = SFSpeechRecognizer(
            locale: Locale(identifier: VoiceLocale.inputTag(forAppLanguage: appLanguage))
        )
    }

    func startListening(existingText: String) {
        error = nil
        baseText = existingText.trimmingCharacters(in: .whitespaces)
        if !baseText.isEmpty { baseText += " " }

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            Task { @MainActor [weak self] in
                guard let self else { return }
                switch status {
                case .authorized:
                    self.ensureMicrophonePermission { self.startRecognition() }
                case .denied, .restricted:
                    self.error = NSLocalizedString("voice.error.micPermission", comment: "")
                case .notDetermined:
                    self.error = NSLocalizedString("voice.error.speechPermission", comment: "")
                @unknown default:
                    self.error = NSLocalizedString("voice.error.generic", comment: "")
                }
            }
        }
    }

    /// Speech permission is asked above; the MICROPHONE has its own. Without it the engine starts and records silence,
    /// so the person would sit in «listening» hearing nothing — ask, and say so when it is refused.
    private func ensureMicrophonePermission(then start: @escaping @MainActor () -> Void) {
        let audio = AVAudioSession.sharedInstance()
        switch audio.recordPermission {
        case .granted: start()
        case .denied: error = NSLocalizedString("voice.error.micPermission", comment: "")
        case .undetermined:
            audio.requestRecordPermission { granted in
                Task { @MainActor [weak self] in
                    if granted { start() } else { self?.error = NSLocalizedString("voice.error.micPermission", comment: "") }
                }
            }
        @unknown default: error = NSLocalizedString("voice.error.generic", comment: "")
        }
    }

    /// «Gửi»: stop and hand the text on.
    func stopListening() { finish(deliverFinal: true) }

    /// Leave without sending: release the microphone, keep the text in the input box.
    func cancelListening() { finish(deliverFinal: false) }

    private func finish(deliverFinal: Bool) {
        let wasListening = isListening
        let actions = session.teardown(deliverFinal: deliverFinal && wasListening, transcript: transcript)
        perform(actions)
        recognitionRequest = nil
        recognitionTask = nil
        isListening = false
    }

    private func perform(_ actions: [VoiceSession.Action]) {
        for action in actions {
            switch action {
            case .endAudio: recognitionRequest?.endAudio()
            case .stopEngine: audioEngine.stop()
            case .removeTap: audioEngine.inputNode.removeTap(onBus: 0)
            case .cancelTask: recognitionTask?.cancel()
            case .deactivateSession:
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            case .deliverFinal(let text): onFinished?(text)
            }
        }
    }

    private func startRecognition() {
        guard let recognizer, recognizer.isAvailable else {
            error = NSLocalizedString("voice.error.unavailable", comment: "")
            return
        }
        // A previous session still holding anything is released first, so a start never stacks a second tap.
        finish(deliverFinal: false)

        let audio = AVAudioSession.sharedInstance()
        do {
            try audio.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audio.setActive(true, options: .notifyOthersOnDeactivation)
            session.activatedSession()
        } catch {
            self.error = NSLocalizedString("voice.error.micStart", comment: "")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)   // harmless when none is installed
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
        }
        session.installedTap()

        do {
            audioEngine.prepare()
            try audioEngine.start()
            session.startedEngine()
        } catch {
            // Every exit releases the tap and the session — nothing is left holding the microphone.
            finish(deliverFinal: false)
            self.error = NSLocalizedString("voice.error.micStartRetry", comment: "")
            return
        }

        isListening = true
        transcript = baseText
        session.startedRecognition()

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor [weak self] in
                guard let self, self.session.recognizing else { return }   // a session already torn down: ignore
                if let result {
                    let text = self.baseText + result.bestTranscription.formattedString
                    self.transcript = text
                    self.onTranscript?(text)
                }
                if error != nil || result?.isFinal == true {
                    if let e = error as NSError?, e.domain == "kAFAssistantErrorDomain" && e.code == 1110 {
                        self.error = NSLocalizedString("voice.error.nothingHeard", comment: "")
                    }
                    self.finish(deliverFinal: true)
                }
            }
        }
    }
}

// The listening screen talks to the recogniser through `VoiceRecognizing` (see `VoiceScreen.swift`).
extension VoiceInputManager: VoiceRecognizing {
    var changes: AnyPublisher<Void, Never> {
        // `objectWillChange` fires BEFORE the value changes; hopping to the next main-queue turn lets the screen read the new one.
        objectWillChange.map { _ in () }.receive(on: DispatchQueue.main).eraseToAnyPublisher()
    }

    func begin() { startListening(existingText: transcript) }

    func halt() { cancelListening() }
}
