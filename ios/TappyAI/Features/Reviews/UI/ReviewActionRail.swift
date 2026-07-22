import SwiftUI

struct ReviewActionRail: View {
    let review: Review
    let isAuthenticated: Bool
    let isPlaying: Bool
    let onLike: () -> Void
    let onComment: () -> Void
    let onSave: () -> Void
    let onShare: () -> Void
    var onMusicTap: (() -> Void)?

    private var isUploadVideo: Bool {
        review.contentType == "video"
            && (review.sourceType == "upload" || review.sourceType == nil)
            && review.mediaUrl != nil
    }

    var body: some View {
        VStack(spacing: Spacing.lg) {
            railButton(
                icon: review.likedByMe ? "heart.fill" : "heart",
                label: formatCount(review.likeCount),
                tint: review.likedByMe ? .red : TappyColor.feedTextPrimary,
                action: onLike
            )

            railButton(
                icon: "bubble.right",
                label: formatCount(review.commentCount),
                tint: TappyColor.feedTextPrimary,
                action: onComment
            )

            railButton(
                icon: review.savedByMe ? "bookmark.fill" : "bookmark",
                label: "Lưu",
                tint: review.savedByMe ? TappyColor.secondary : TappyColor.feedTextPrimary,
                action: onSave
            )

            railButton(
                icon: "arrowshape.turn.up.right",
                label: "",
                tint: TappyColor.feedTextPrimary,
                action: onShare
            )

            if isUploadVideo {
                ReviewMusicDisc(music: review.music, isPlaying: isPlaying, onTap: onMusicTap)
            }
        }
    }

    @ViewBuilder
    private func railButton(icon: String, label: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: icon)
                    .font(.system(size: 26))
                    .foregroundStyle(tint)
                if !label.isEmpty {
                    Text(label)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(TappyColor.feedTextPrimary)
                }
            }
        }
        .buttonStyle(.plain)
        .minimumTapTarget()
    }

    private func formatCount(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 1000 { return String(format: "%.1fK", Double(n) / 1000) }
        if n > 0 { return "\(n)" }
        return ""
    }
}
