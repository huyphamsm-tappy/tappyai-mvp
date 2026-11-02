import SwiftUI

@MainActor
final class TranslateViewModel: AppObservableObject {
    @AppPublished var inputText = ""
    @AppPublished var targetLang = "vi"
    @AppPublished var translation = ""
    @AppPublished var loading = false
    @AppPublished var error: String?
    /// Web `copied` (translate.copied for two seconds after Copy).
    @AppPublished var copied = false

    private let service: UtilityToolsService
    /// Web `MAX_CHARS` (the textarea's maxLength and the route's `too_long` guard).
    static let maxChars = 2000
    private var maxChars: Int { Self.maxChars }

    init(service: UtilityToolsService) {
        self.service = service
    }

    var canTranslate: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !loading
    }

    var charCount: Int { inputText.count }
    var isOverLimit: Bool { charCount > maxChars }

    func translate() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isOverLimit else { return }

        loading = true
        error = nil
        translation = ""   // Web `setTranslation('')`: the previous result goes as soon as a new request starts
        copied = false
        do {
            let response = try await service.translate(text: text, targetLang: targetLang)
            translation = response.translation
        } catch {
            self.error = Self.message(for: error)
        }
        loading = false
    }

    /// Web page.tsx:152-158: a non-OK response shows the server's `message` (else the generic line); a thrown fetch shows the network line.
    static func message(for error: Error) -> String {
        guard let appError = error as? AppError else { return NSLocalizedString("translate.error.failed", comment: "") }
        switch appError {
        case .authentication(reason: .anonLimitReached), .authentication(reason: .freeLimitReached):
            return NSLocalizedString("translate.error.dailyLimit", comment: "")
        case .validation(let message) where !message.isEmpty && message != "Invalid request":
            return message
        case .offline, .network(status: nil, code: _):
            return NSLocalizedString("translate.error.network", comment: "")
        default:
            return NSLocalizedString("translate.error.failed", comment: "")
        }
    }

    /// Web `maxLength={MAX_CHARS}`: typing, pasting and dictation can never push the box past the cap.
    func enforceInputLimit() {
        if inputText.count > Self.maxChars { inputText = String(inputText.prefix(Self.maxChars)) }
    }

    func copyTranslation(write: (String) -> Void = { UIPasteboard.general.string = $0 }, delay: Double = CopyFeedback.seconds) {
        guard !translation.isEmpty else { return }
        CopyFeedback.copy(translation, write: write, flag: { [weak self] in self?.copied = $0 }, delay: delay)
    }

    func clear() {
        inputText = ""
        translation = ""
        error = nil
        copied = false
    }
}
