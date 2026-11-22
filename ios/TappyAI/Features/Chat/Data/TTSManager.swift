import AVFoundation
import Combine

/// Text-to-speech manager — native equivalent of Web's useTTS hook (window.speechSynthesis).
///
/// Uses AVSpeechSynthesizer with the MESSAGE language decided by the backend. It previously used a
/// hardcoded vi-VN voice, so an English-mode user's English reply was read by a Vietnamese voice.
@MainActor
final class TTSManager: NSObject, AppObservableObject, AVSpeechSynthesizerDelegate {
    @AppPublished var speakingMsgId: String?
    @AppPublished var isPaused: Bool = false
    @AppPublished var elapsed: Int = 0
    @AppPublished var totalSecs: Int = 0
    @AppPublished var speed: Float = 1.0
    /// Localized reason read-aloud could not start; nil when there is nothing to report.
    /// Stopping never sets it — silence is the correct feedback for pressing stop.
    @AppPublished var errorMessage: String?

    /// Asks the backend which language a reply is in. Injected by `ChatViewModel` so this manager
    /// stays free of networking, and so the UI layer does not have to thread a view model through
    /// the message list just to press play.
    var resolveLanguage: ((String) async -> MessageLanguage)?

    private let synth = AVSpeechSynthesizer()
    private var timer: AnyCancellable?
    private var currentText: String = ""
    /// The message language currently being read, set by `speak` and reused by `restartFrom` so
    /// resume/skip/speed never re-derive a voice — or silently fall back to a different language.
    private var currentLocaleTag: String = ""
    private static let cps: Float = 13

    override init() {
        super.init()
        synth.delegate = self
    }

    /// Read-aloud entry point for the UI: resolves the message language, then speaks.
    ///
    /// Pressing play on the message already speaking stops it, and stops WITHOUT asking the
    /// backend — a toggle-off should never cost a request, and never shows an error.
    func speakResolvingLanguage(msgId: String, text: String) {
        if speakingMsgId == msgId {
            stop()
            return
        }
        errorMessage = nil
        guard let resolveLanguage else { return }
        Task { @MainActor in
            switch await resolveLanguage(text) {
            case .speakable(_, let localeTag):
                speak(msgId: msgId, text: text, localeTag: localeTag)
            case .notSpeakable:
                // Tappy has no voice for this language. Say so and leave the text on screen rather
                // than reading it in the wrong one.
                errorMessage = String(localized: "chat.tts.languageUnsupported")
            case .failed:
                // Retryable, and deliberately a different sentence from the one above.
                errorMessage = String(localized: "chat.tts.languageFailed")
            }
        }
    }

    /// Reads `text` aloud in `localeTag`, which is the MESSAGE language decided by the backend —
    /// never the app's UI language, and never a literal. Held for the duration of playback so
    /// `restartFrom` (resume/skip/speed) keeps the same voice instead of re-deriving one.
    func speak(msgId: String, text: String, localeTag: String) {
        if speakingMsgId == msgId {
            stop()
            return
        }
        let clean = Self.stripMarkdown(text)
        guard !clean.isEmpty else { return }
        // No voice for the requested language means stay silent. Substituting another language is
        // the single worst failure here: it reads Vietnamese aloud in English and sounds broken
        // rather than unavailable.
        guard let voice = AVSpeechSynthesisVoice(language: localeTag) else { return }
        synth.stopSpeaking(at: .immediate)
        // 03/11: with the default ambient session, read-aloud was silent whenever the ring/silent switch was on, and a clip from the feed could keep
        // the session. A spoken-audio playback session makes the voice audible; failure to set it must not block reading.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? session.setActive(true)
        currentText = clean
        currentLocaleTag = localeTag
        speakingMsgId = msgId
        isPaused = false
        elapsed = 0
        totalSecs = max(1, Int(ceil(Float(clean.count) / (Self.cps * speed))))

        let utterance = AVSpeechUtterance(string: clean)
        utterance.voice = voice
        utterance.rate = speed * AVSpeechUtteranceDefaultSpeechRate
        synth.speak(utterance)
        startTimer()
    }

    func togglePause() {
        if isPaused {
            synth.continueSpeaking()
            isPaused = false
            startTimer()
        } else {
            synth.pauseSpeaking(at: .word)
            isPaused = true
            stopTimer()
        }
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
        stopTimer()
        speakingMsgId = nil
        isPaused = false
        elapsed = 0
        totalSecs = 0
    }

    func skipBack() {
        guard speakingMsgId != nil else { return }
        let newChar = max(0, Int(Float(max(0, elapsed - 15)) * Self.cps * speed))
        restartFrom(charOffset: newChar)
    }

    func skipForward() {
        guard speakingMsgId != nil else { return }
        let newChar = min(currentText.count - 1, Int(Float(elapsed + 15) * Self.cps * speed))
        restartFrom(charOffset: max(0, newChar))
    }

    private func restartFrom(charOffset: Int) {
        synth.stopSpeaking(at: .immediate)
        stopTimer()

        let idx = currentText.index(currentText.startIndex, offsetBy: min(charOffset, currentText.count))
        let slice = String(currentText[idx...])
        guard !slice.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            stop()
            return
        }

        elapsed = max(0, Int(ceil(Float(charOffset) / (Self.cps * speed))))
        totalSecs = max(1, Int(ceil(Float(currentText.count) / (Self.cps * speed))))

        let utterance = AVSpeechUtterance(string: slice)
        // The language this playback started with — not a literal, and not re-decided mid-scrub.
        utterance.voice = AVSpeechSynthesisVoice(language: currentLocaleTag)
        utterance.rate = speed * AVSpeechUtteranceDefaultSpeechRate
        synth.speak(utterance)
        startTimer()
    }

    func changeSpeed(_ newSpeed: Float) {
        let oldSpeed = speed
        speed = newSpeed
        if speakingMsgId != nil {
            let currentChar = Int(Float(elapsed) * Self.cps * oldSpeed)
            restartFrom(charOffset: min(currentChar, currentText.count - 1))
        }
    }

    // MARK: - AVSpeechSynthesizerDelegate

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            stopTimer()
            speakingMsgId = nil
            isPaused = false
            elapsed = 0
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard !synth.isSpeaking else { return }
            stopTimer()
            speakingMsgId = nil
            isPaused = false
        }
    }

    // MARK: - Private

    private func startTimer() {
        stopTimer()
        timer = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in self?.elapsed += 1 }
    }

    private func stopTimer() {
        timer?.cancel()
        timer = nil
    }

    /// The text without its markdown marks. For SPEECH (the default) a link is its label and a bare address is dropped (nobody wants a
    /// URL read aloud); for COPYING plain text (`keepLinkAddresses`) an address stays ("label (https://…)"), because losing it loses
    /// the source. Emphasis follows CommonMark in short: no space inside its edges and not inside a word, so "5 * 3 * 2", "2*3*4"
    /// and a "* " bullet keep their stars. Review 02/11.
    static func stripMarkdown(_ text: String, keepLinkAddresses: Bool = false) -> String {
        var s = text
        s = s.replacingOccurrences(of: #"\*\*(?!\s)(.+?)(?<!\s)\*\*"#, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: #"(?<![\w*])\*(?![\s*])([^*\n]+?)(?<!\s)\*(?![\w*])"#, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: #"(?m)^#{1,6}[ \t]+"#, with: "", options: .regularExpression)
        // an address may hold one level of brackets ("…/Foo_(bar)")
        s = s.replacingOccurrences(
            of: #"\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)"#,
            with: keepLinkAddresses ? "$1 ($2)" : "$1",
            options: .regularExpression)
        if !keepLinkAddresses {
            s = s.replacingOccurrences(of: #"https?://\S+"#, with: "", options: .regularExpression)
        }
        s = s.replacingOccurrences(of: "\\[CTA_BUTTONS\\][\\s\\S]*?\\[/CTA_BUTTONS\\]", with: "", options: [.regularExpression, .caseInsensitive])
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
