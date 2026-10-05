import SwiftUI

struct ReviewCommentSheet: View {
    let comments: [ReviewComment]
    let count: Int
    let isLoading: Bool
    let isPosting: Bool
    let isAuthenticated: Bool
    let currentUserId: String?
    let errorMessage: String?
    /// Report a comment / block its author (App Store 1.2) — the ⋯ on someone else's comment.
    @ObservedObject var safety: SafetyStore
    @Binding var text: String
    let onPost: () -> Void
    let onDelete: (String) -> Void
    /// Web comment actions: reply (one level of thread) and one reaction per person.
    var replyingTo: ReviewComment? = nil
    var onReply: (ReviewComment?) -> Void = { _ in }
    var onReact: (ReviewComment, CommentReaction) -> Void = { _, _ in }
    let onDismiss: () -> Void

    /// First comment asks for the Terms (App Store 1.2); both comment entry points use this sheet.
    @State private var askTerms = false
    @State private var safetyTarget: SafetyTarget?
    private let consent = TermsConsent()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if isLoading && comments.isEmpty {
                    Spacer()
                    TappyLoadingIndicator()
                    Spacer()
                } else if comments.isEmpty {
                    Spacer()
                    VStack(spacing: Spacing.sm) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 40))
                            .foregroundStyle(TappyColor.textSecondary)
                        Text("review.comments.empty")
                            .font(TappyFont.headline)
                            .foregroundStyle(TappyColor.textPrimary)
                        Text(NSLocalizedString("review.comments.beFirst", comment: ""))
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: Spacing.md) {
                            ForEach(CommentActions.threaded(safety.visible(comments) { $0.userId }), id: \.comment.id) { entry in
                                commentRow(entry.comment, isReply: entry.isReply)
                            }
                        }
                        .padding(.horizontal, Spacing.md)
                        .padding(.top, Spacing.sm)
                    }
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.danger)
                        .padding(.horizontal, Spacing.md)
                        .padding(.vertical, Spacing.xxs)
                }

                Divider()
                if let replyingTo {
                    HStack {
                        Text(String(format: NSLocalizedString("review.comments.replyingTo", comment: ""), replyingTo.displayName))
                            .font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary).lineLimit(1)
                        Spacer()
                        Button { onReply(nil) } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(TappyColor.textSecondary) }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("comment-reply-cancel")
                    }
                    .padding(.horizontal, Spacing.md).padding(.vertical, Spacing.xxs)
                    .background(TappyColor.surface)
                }
                commentInput
            }
            .navigationTitle("Bình luận (\(count))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(NSLocalizedString("common.close", comment: ""), action: onDismiss)
                }
            }
        }
        .sheet(item: $safetyTarget) { target in
            SafetySheet(target: target, safety: safety) { safetyTarget = nil }
                .presentationDetents([.large])
        }
        .sheet(isPresented: $askTerms) {
            TermsConsentSheet(
                onAccept: {
                    consent.accept()
                    askTerms = false
                    onPost()
                },
                onCancel: { askTerms = false }
            )
        }
    }

    @ViewBuilder
    private func commentRow(_ comment: ReviewComment, isReply: Bool = false) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            avatar(url: comment.profiles?.avatarUrl, size: isReply ? 26 : 32)

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(comment.displayName)
                        .font(TappyFont.footnote.weight(.semibold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Text(ago(comment.createdAt))
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    Spacer()
                    if comment.userId == currentUserId {
                        Button {
                            onDelete(comment.id)
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 12))
                                .foregroundStyle(TappyColor.danger)
                        }
                        .buttonStyle(.plain)
                    } else if isAuthenticated, safety.flags.anyEnabled {
                        Button {
                            safetyTarget = SafetyTarget(kind: .comment, targetId: comment.id, authorId: comment.userId,
                                                        authorName: comment.displayName, summary: comment.body)
                        } label: {
                            Image(systemName: "ellipsis").font(.system(size: 13)).foregroundStyle(TappyColor.textSecondary)
                                .padding(.horizontal, 4)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text("safety.menu"))
                        .accessibilityIdentifier("comment-safety-" + comment.id)
                    }
                }

                Text(comment.body)
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
                commentActions(comment)
            }
        }
        .padding(.leading, isReply ? Spacing.xl : 0)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("comment-" + comment.id)
    }

    /// Reply, the reaction picker and what people reacted with (Web `ReviewCommentButton` / `…/reactions`).
    @ViewBuilder
    private func commentActions(_ comment: ReviewComment) -> some View {
        HStack(spacing: Spacing.md) {
            if isAuthenticated {
                Button { onReply(comment) } label: {
                    Text("review.comments.reply").font(TappyFont.caption.weight(.semibold)).foregroundStyle(TappyColor.textSecondary)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("comment-reply-" + comment.id)

                Menu {
                    ForEach(CommentReaction.allCases) { reaction in
                        Button { onReact(comment, reaction) } label: { Text(reaction.emoji) }
                    }
                } label: {
                    Text(comment.myReaction.flatMap { CommentReaction(rawValue: $0)?.emoji } ?? "🙂")
                        .font(.system(size: 14))
                        .frame(minWidth: 28, minHeight: 28)
                }
                .accessibilityLabel(Text("review.comments.react"))
                .accessibilityIdentifier("comment-react-" + comment.id)
            }
            // What was chosen, most popular first; the caller's own is marked.
            ForEach(comment.reactions.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }, id: \.key) { item in
                if let reaction = CommentReaction(rawValue: item.key) {
                    Text("\(reaction.emoji) \(item.value)")
                        .font(TappyFont.caption)
                        .foregroundStyle(comment.myReaction == item.key ? TappyColor.primary : TappyColor.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var commentInput: some View {
        HStack(spacing: Spacing.sm) {
            TextField(NSLocalizedString("review.comments.placeholder", comment: ""), text: $text, axis: .vertical)
                .font(TappyFont.callout)
                .lineLimit(1...3)
                .textFieldStyle(.plain)
                .disabled(!isAuthenticated)

            Button {
                consent.postOrAsk(ask: { askTerms = true }, post: onPost)
            } label: {
                if isPosting {
                    ProgressView()
                        .tint(TappyColor.primary)
                        .frame(width: 24, height: 24)
                } else {
                    Image(systemName: "paperplane.fill")
                        .foregroundStyle(
                            text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !isAuthenticated
                                ? TappyColor.textSecondary
                                : TappyColor.primary
                        )
                }
            }
            .buttonStyle(.plain)
            .disabled(
                text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || !isAuthenticated
                || isPosting
                || text.count > 300
            )
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm)
        .background(TappyColor.surface)
    }

    @ViewBuilder
    private func avatar(url: String?, size: CGFloat) -> some View {
        if let url, let imageURL = URL(string: url) {
            AsyncImage(url: imageURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                default:
                    defaultAvatar(size: size)
                }
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            defaultAvatar(size: size)
        }
    }

    private func defaultAvatar(size: CGFloat) -> some View {
        Circle()
            .fill(TappyColor.surface)
            .frame(width: size, height: size)
            .overlay(
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.45))
                    .foregroundStyle(TappyColor.textSecondary)
            )
    }
}

// MARK: - Relative time (matches Web ago())

func ago(_ iso: String) -> String {
    guard let date = ISO8601Timestamp.date(from: iso) else { return "" }
    let seconds = Int(Date().timeIntervalSince(date))

    if seconds < 60 { return NSLocalizedString("common.justNow", comment: "") }
    let minutes = seconds / 60
    // Said in words, as the web does («49 ngày trước»): the bare «49n» read as a number plus a stray letter.
    func fmt(_ key: String, _ n: Int) -> String { String(format: NSLocalizedString(key, comment: ""), n) }
    if minutes < 60 { return fmt("time.minutesAgo", minutes) }
    let hours = minutes / 60
    if hours < 24 { return fmt("time.hoursAgo", hours) }
    let days = hours / 24
    if days < 30 { return fmt("time.daysAgo", days) }
    if days < 365 { return fmt("time.monthsAgo", days / 30) }
    return fmt("time.yearsAgo", days / 365)
}
