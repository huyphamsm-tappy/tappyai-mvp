import SwiftUI

struct ReviewCommentSheet: View {
    let comments: [ReviewComment]
    let count: Int
    let isLoading: Bool
    let isPosting: Bool
    let isAuthenticated: Bool
    let currentUserId: String?
    let errorMessage: String?
    @Binding var text: String
    let onPost: () -> Void
    let onDelete: (String) -> Void
    let onDismiss: () -> Void

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
                        Text("Chưa có bình luận")
                            .font(TappyFont.headline)
                            .foregroundStyle(TappyColor.textPrimary)
                        Text("Hãy là người đầu tiên bình luận!")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: Spacing.md) {
                            ForEach(comments) { comment in
                                commentRow(comment)
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
                commentInput
            }
            .navigationTitle("Bình luận (\(count))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Đóng", action: onDismiss)
                }
            }
        }
    }

    @ViewBuilder
    private func commentRow(_ comment: ReviewComment) -> some View {
        HStack(alignment: .top, spacing: Spacing.sm) {
            avatar(url: comment.profiles?.avatarUrl, size: 32)

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
                    }
                }

                Text(comment.body)
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textPrimary)
            }
        }
    }

    private var commentInput: some View {
        HStack(spacing: Spacing.sm) {
            TextField("Viết bình luận...", text: $text, axis: .vertical)
                .font(TappyFont.callout)
                .lineLimit(1...3)
                .textFieldStyle(.plain)
                .disabled(!isAuthenticated)

            Button {
                onPost()
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
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return "" }
    let seconds = Int(Date().timeIntervalSince(date))

    if seconds < 60 { return "vừa xong" }
    let minutes = seconds / 60
    if minutes < 60 { return "\(minutes)p" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)g" }
    let days = hours / 24
    if days < 365 { return "\(days)n" }
    return "\(days / 365)y"
}
