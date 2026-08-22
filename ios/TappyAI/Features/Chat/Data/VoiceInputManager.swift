import Speech
import AVFoundation

/// Voice input — native equivalent of Web's SpeechRecognition API.
/// Uses SFSpeechRecognizer + AVAudioEngine for live dictation into the chat input.
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

    var onTranscript: ((String) -> Void)?
    var onFinished: ((String) -> Void)?

    /// Dictation listens in the APP language — you speak the language you chose to work in. This is
    /// deliberately NOT the message language: read-aloud follows the reply, input follows the user.
    /// Defaults to the app's current UI language rather than a hardcoded locale.
    init(appLanguage: String = LocalizationManager.currentLanguageCode) {
        recognizer = SFSpeechRecognizer(
            locale: Locale(identifier: VoiceLocale.inputTag(forAppLanguage: appLanguage))
        )
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
                    self.startRecognition()
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

    func stopListening() {
        audioEngine.stop()
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        isListening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        let final = transcript
        if !final.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            onFinished?(final)
        }
    }

    private func startRecognition() {
        guard let recognizer, recognizer.isAvailable else {
            error = NSLocalizedString("voice.error.unavailable", comment: "")
            return
        }

        recognitionTask?.cancel()
        recognitionTask = nil

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            self.error = NSLocalizedString("voice.error.micStart", comment: "")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
        }

        do {
            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            self.error = NSLocalizedString("voice.error.micStartRetry", comment: "")
            return
        }

        isListening = true
        transcript = baseText

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let result {
                    let text = self.baseText + result.bestTranscription.formattedString
                    self.transcript = text
                    self.onTranscript?(text)
                }
                if error != nil || result?.isFinal == true {
                    self.audioEngine.stop()
                    inputNode.removeTap(onBus: 0)
                    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                    self.isListening = false
                    if let e = error as NSError?, e.domain == "kAFAssistantErrorDomain" && e.code == 1110 {
                        self.error = NSLocalizedString("voice.error.nothingHeard", comment: "")
                    }
                    let final = self.transcript
                    if !final.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        self.onFinished?(final)
                    }
                }
            }
        }
    }
}
