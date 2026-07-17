import AVFoundation
import Combine

/// Text-to-speech manager — native equivalent of Web's useTTS hook (window.speechSynthesis).
/// Uses AVSpeechSynthesizer with vi-VN voice.
@MainActor
final class TTSManager: NSObject, AppObservableObject, AVSpeechSynthesizerDelegate {
    @AppPublished var speakingMsgId: String?
    @AppPublished var isPaused: Bool = false
    @AppPublished var elapsed: Int = 0
    @AppPublished var totalSecs: Int = 0
    @AppPublished var speed: Float = 1.0

    private let synth = AVSpeechSynthesizer()
    private var timer: AnyCancellable?
    private var currentText: String = ""
    private static let cps: Float = 13

    override init() {
        super.init()
        synth.delegate = self
    }

    func speak(msgId: String, text: String) {
        if speakingMsgId == msgId {
            stop()
            return
        }
        let clean = Self.stripMarkdown(text)
        guard !clean.isEmpty else { return }
        synth.stopSpeaking(at: .immediate)
        currentText = clean
        speakingMsgId = msgId
        isPaused = false
        elapsed = 0
        totalSecs = max(1, Int(ceil(Float(clean.count) / (Self.cps * speed))))

        let utterance = AVSpeechUtterance(string: clean)
        utterance.voice = AVSpeechSynthesisVoice(language: "vi-VN")
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
        utterance.voice = AVSpeechSynthesisVoice(language: "vi-VN")
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

    static func stripMarkdown(_ text: String) -> String {
        var s = text
        s = s.replacingOccurrences(of: "\\*\\*(.*?)\\*\\*", with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: "\\*(.*?)\\*", with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: "#{1,3}\\s", with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "\\[([^\\]]+)\\]\\([^)]+\\)", with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: "https?://\\S+", with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "\\[CTA_BUTTONS\\][\\s\\S]*?\\[/CTA_BUTTONS\\]", with: "", options: [.regularExpression, .caseInsensitive])
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
