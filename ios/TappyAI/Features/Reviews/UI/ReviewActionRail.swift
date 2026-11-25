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
    /// Opens "who likes this" from the like count; nil keeps the count inside the like button.
    var onShowLikers: (() -> Void)?

    private var isUploadVideo: Bool {
        review.contentType == "video"
            && (review.sourceType == "upload" || review.sourceType == nil)
            && review.mediaUrl != nil
    }

    var body: some View {
        VStack(spacing: Spacing.lg) {
            if let onShowLikers, review.likeCount > 0 {
                // The count is its own target (web): the heart toggles, the number lists who likes it.
                VStack(spacing: 2) {
                    railButton(
                        icon: review.likedByMe ? "heart.fill" : "heart",
                        label: "",
                        tint: review.likedByMe ? .red : TappyColor.feedTextPrimary,
                        action: onLike
                    )
                    Button(action: onShowLikers) {
                        Text(formatCount(review.likeCount))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(TappyColor.feedTextPrimary)
                            .frame(minWidth: 44, minHeight: 20)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("likers.title"))
                    .accessibilityIdentifier("review-likers")
                }
            } else {
                railButton(
                    icon: review.likedByMe ? "heart.fill" : "heart",
                    label: formatCount(review.likeCount),
                    tint: review.likedByMe ? .red : TappyColor.feedTextPrimary,
                    action: onLike
                )
            }

            railButton(
                icon: "bubble.right",
                label: formatCount(review.commentCount),
                tint: TappyColor.feedTextPrimary,
                id: "review-comments",
                action: onComment
            )

            railButton(
                icon: review.savedByMe ? "bookmark.fill" : "bookmark",
                label: NSLocalizedString("common.save", comment: ""),
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
                // Hidden with `ProductFlags.showMusic`: the disc is the entry point to the sound
                // page, so while Music is hidden a clip carries no music affordance at all.
                if ProductFlags.showMusic {
                    ReviewMusicDisc(music: review.music, isPlaying: isPlaying, onTap: onMusicTap)
                }
            }
        }
    }

    @ViewBuilder
    private func railButton(icon: String, label: String, tint: Color, id: String? = nil, action: @escaping () -> Void) -> some View {
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
        .accessibilityIdentifier(id ?? "review-rail-" + icon)
    }

    private func formatCount(_ n: Int) -> String {
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 1000 { return String(format: "%.1fK", Double(n) / 1000) }
        if n > 0 { return "\(n)" }
        return ""
    }
}
