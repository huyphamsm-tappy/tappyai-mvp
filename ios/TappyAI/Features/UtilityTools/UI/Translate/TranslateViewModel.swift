import Foundation

@MainActor
final class TranslateViewModel: AppObservableObject {
    @AppPublished var inputText = ""
    @AppPublished var targetLang = "vi"
    @AppPublished var translation = ""
    @AppPublished var loading = false
    @AppPublished var error: String?

    private let service: UtilityToolsService
    private let maxChars = 2000

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
        do {
            let response = try await service.translate(text: text, targetLang: targetLang)
            translation = response.translation
        } catch let appError as AppError {
            switch appError {
            case .authentication(reason: .anonLimitReached), .authentication(reason: .freeLimitReached):
                error = NSLocalizedString("translate.error.dailyLimit", comment: "")
            default:
                error = NSLocalizedString("translate.error.failed", comment: "")
            }
        } catch {
            self.error = NSLocalizedString("translate.error.failed", comment: "")
        }
        loading = false
    }

    func clear() {
        inputText = ""
        translation = ""
        error = nil
    }
}
