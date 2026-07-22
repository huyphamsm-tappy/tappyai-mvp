import Foundation

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

    private let service: UtilityToolsService
    private let maxTopicLength = 500

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
        ("funny", "Hài hước"),
        ("emotional", "Xúc cảm"),
        ("youthful", "Trẻ trung"),
        ("inspiring", "Truyền cảm hứng"),
        ("professional", "Chuyên nghiệp"),
    ]

    static let lengths: [(id: String, label: String)] = [
        ("short", "Ngắn"),
        ("medium", "Vừa"),
        ("long", "Dài"),
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
                error = "Bạn đã hết lượt tạo nội dung hôm nay"
            default:
                error = "Không thể tạo nội dung. Vui lòng thử lại."
            }
        } catch {
            self.error = "Không thể tạo nội dung. Vui lòng thử lại."
        }
        loading = false
    }

    func clear() {
        topic = ""
        caption = ""
        hashtags = ""
        error = nil
    }
}
