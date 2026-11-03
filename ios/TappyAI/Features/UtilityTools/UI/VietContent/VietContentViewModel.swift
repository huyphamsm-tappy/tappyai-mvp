import SwiftUI

@MainActor
final class VietContentViewModel: AppObservableObject {
    @AppPublished var topic = ""
    @AppPublished var platform = "facebook"
    @AppPublished var tone = "youthful"
    @AppPublished var length = "medium"
    @AppPublished var caption = ""
    @AppPublished var hashtags = ""
    @AppPublished var loading = false
    @AppPublished var error: String?
    /// Web `copiedCaption` / `copiedAll`: the Copy buttons read «Đã copy» for two seconds.
    @AppPublished var copiedCaption = false
    @AppPublished var copiedAll = false

    private let service: UtilityToolsService
    /// Web `maxLength={500}` on the topic box.
    static let maxTopicLength = 500
    private var maxTopicLength: Int { Self.maxTopicLength }

    init(service: UtilityToolsService) {
        self.service = service
    }

    var canGenerate: Bool {
        !topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !loading && topic.count <= maxTopicLength
    }

    var charCount: Int { topic.count }
    var isOverLimit: Bool { topic.count > maxTopicLength }

    static let platforms: [(id: String, label: String)] = [
        ("facebook", "Facebook"),
        ("tiktok", "TikTok"),
        ("instagram", "Instagram"),
    ]

    static let tones: [(id: String, label: String)] = [
        ("funny", NSLocalizedString("vietcontent.tone.funny", comment: "")),
        ("emotional", NSLocalizedString("vietcontent.tone.emotional", comment: "")),
        ("youthful", NSLocalizedString("vietcontent.tone.youthful", comment: "")),
        ("inspiring", NSLocalizedString("vietcontent.tone.inspiring", comment: "")),
        ("professional", NSLocalizedString("vietcontent.tone.professional", comment: "")),
    ]

    static let lengths: [(id: String, label: String)] = [
        ("short", NSLocalizedString("vietcontent.length.short", comment: "")),
        ("medium", NSLocalizedString("vietcontent.length.medium", comment: "")),
        ("long", NSLocalizedString("vietcontent.length.long", comment: "")),
    ]

    func generate() async {
        let topicText = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !topicText.isEmpty else { return }

        loading = true
        error = nil
        caption = ""
        hashtags = ""

        do {
            let response = try await service.generateVietContent(
                topic: topicText,
                platform: platform,
                tone: tone,
                length: length
            )
            caption = response.caption
            hashtags = response.hashtags
        } catch let appError as AppError {
            switch appError {
            case .authentication(reason: .anonLimitReached), .authentication(reason: .freeLimitReached):
                error = NSLocalizedString("vietcontent.error.limit", comment: "")
            default:
                error = NSLocalizedString("vietcontent.error.failed", comment: "")
            }
        } catch {
            self.error = NSLocalizedString("vietcontent.error.failed", comment: "")
        }
        loading = false
    }

    /// Web `maxLength`: typing, pasting and the example button can never push the topic past the cap.
    func enforceTopicLimit() {
        if topic.count > Self.maxTopicLength { topic = String(topic.prefix(Self.maxTopicLength)) }
    }

    /// Web VietContentForm.tsx:362 `{platform label} · {tone label}` under the result title.
    var resultSubtitle: String {
        let platformLabel = Self.platforms.first { $0.id == platform }?.label ?? platform
        let toneLabel = Self.tones.first { $0.id == tone }?.label ?? tone
        return "\(platformLabel) · \(toneLabel)"
    }

    /// Web `${result.caption}\n\n${result.hashtags}`.
    var allText: String { caption + "\n\n" + hashtags }

    func copyCaption(write: (String) -> Void = { UIPasteboard.general.string = $0 }, delay: Double = CopyFeedback.seconds) {
        guard !caption.isEmpty else { return }
        CopyFeedback.copy(caption, write: write, flag: { [weak self] in self?.copiedCaption = $0 }, delay: delay)
    }

    func copyAll(write: (String) -> Void = { UIPasteboard.general.string = $0 }, delay: Double = CopyFeedback.seconds) {
        guard !caption.isEmpty else { return }
        CopyFeedback.copy(allText, write: write, flag: { [weak self] in self?.copiedAll = $0 }, delay: delay)
    }

    /// «Viết lại»: Web `handleReset` clears only the result and the error; the topic and the options stay so the user can rewrite.
    func reset() {
        copiedCaption = false
        copiedAll = false
        caption = ""
        hashtags = ""
        error = nil
    }

    func clear() {
        copiedCaption = false
        copiedAll = false
        topic = ""
        caption = ""
        hashtags = ""
        error = nil
    }
}
