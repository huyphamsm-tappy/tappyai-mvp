import SwiftUI

// MARK: - Greeting

struct HomeGreetingSection: View {
    let greeting: String
    let isAuthenticated: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: Spacing.xxs) {
                Text(greeting)
                    .font(TappyFont.title)
                    .foregroundStyle(TappyColor.textPrimary)
                Text("Tappy có thể giúp gì cho bạn?")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
            }
            Spacer()
            if isAuthenticated {
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(TappyColor.primary)
            }
        }
    }
}

// MARK: - Search

struct HomeSearchSection: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: Spacing.sm) {
                Image(systemName: TappyIcon.search)
                    .foregroundStyle(TappyColor.textSecondary)
                Text("Hỏi TappyAI bất cứ điều gì...")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
                Spacer()
                Image(systemName: "mic")
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .padding(Spacing.sm)
            .frame(minHeight: 44)
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        .tappyAccessibleButton("Tìm kiếm")
    }
}

// MARK: - Categories

struct HomeCategorySection: View {
    let onSelect: (String) -> Void

    private let categories: [(emoji: String, key: String, labelVi: String)] = [
        ("🍜", "food", "Ăn uống"),
        ("🛍️", "shopping", "Mua sắm"),
        ("🎭", "entertainment", "Giải trí"),
        ("✈️", "travel", "Du lịch"),
        ("💆", "spa", "Spa"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            SectionHeader(title: "Khám phá theo lĩnh vực")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.xs) {
                    ForEach(categories, id: \.key) { cat in
                        Button { onSelect(cat.key) } label: {
                            CategoryPill(emoji: cat.emoji, label: cat.labelVi)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

// MARK: - Quick Actions

struct HomeQuickActionsSection: View {
    let onSelect: (HomeDestination) -> Void

    private let actions: [(icon: String, label: String, dest: HomeDestination)] = [
        ("dollarsign.circle", "Tỷ giá", .currency),
        ("globe", "Dịch", .translate),
        ("doc.text.viewfinder", "Scan", .scan),
        ("pencil.line", "Viết", .vietContent),
        ("divide.circle", "Chia bill", .splitBill),
        ("sparkles", "Bói", .fortune),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            SectionHeader(title: "🛠️ Công cụ tiện ích")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 80), spacing: Spacing.sm)], spacing: Spacing.sm) {
                ForEach(actions, id: \.label) { action in
                    Button { onSelect(action.dest) } label: {
                        QuickActionTile(icon: action.icon, label: action.label)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - AI Entry

struct HomeAIEntrySection: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            TappyCard {
                HStack(spacing: Spacing.md) {
                    Text("🤖")
                        .font(.system(size: 36))
                    VStack(alignment: .leading, spacing: Spacing.xxs) {
                        Text("Hỏi Tappy")
                            .font(TappyFont.headline)
                            .foregroundStyle(TappyColor.textPrimary)
                        Text("Trợ lý AI cho cuộc sống hàng ngày")
                            .font(TappyFont.footnote)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
        }
        .buttonStyle(.plain)
        .tappyAccessibleButton("Hỏi Tappy")
    }
}

// MARK: - Suggested Prompts

struct HomeSuggestedPromptsSection: View {
    let state: HomeViewModel.LoadState
    let prompts: [SuggestedPrompt]
    let onSelect: (String) -> Void
    var onRetry: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            SectionHeader(title: "Gợi ý hôm nay")
            switch state {
            case .idle, .loading:
                HStack(spacing: Spacing.xs) {
                    ForEach(0..<3, id: \.self) { _ in
                        TappySkeleton(cornerRadius: Radius.pill)
                            .frame(width: 120, height: 36)
                    }
                }
            case .loaded:
                if prompts.isEmpty {
                    TappyEmptyState(
                        systemImage: "lightbulb",
                        title: "Gợi ý sẽ xuất hiện ở đây"
                    )
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Spacing.xs) {
                            ForEach(prompts) { prompt in
                                Button { onSelect(prompt.text) } label: {
                                    HStack(spacing: Spacing.xxs) {
                                        if let emoji = prompt.emoji {
                                            Text(emoji)
                                        }
                                        Text(prompt.text)
                                            .font(TappyFont.callout)
                                            .foregroundStyle(TappyColor.textPrimary)
                                    }
                                    .padding(.horizontal, Spacing.sm)
                                    .padding(.vertical, Spacing.xs)
                                    .frame(minHeight: 36)
                                    .background(TappyColor.surface)
                                    .clipShape(RoundedRectangle(cornerRadius: Radius.pill, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            case .failed:
                TappyErrorState(
                    presentation: .init(title: "Không tải được", message: "Thử lại sau.", retryable: true),
                    onRetry: onRetry
                )
            }
        }
    }
}

// MARK: - Recent Conversations

struct HomeRecentConversationsSection: View {
    let state: HomeViewModel.LoadState
    let isAuthenticated: Bool
    let conversations: [ConversationSummary]
    let onSelect: (String) -> Void
    let onNewChat: () -> Void
    var onSeeAll: (() -> Void)?
    var onRetry: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            if isAuthenticated && !conversations.isEmpty {
                HStack {
                    Text("Trò chuyện gần đây")
                        .font(TappyFont.headline)
                        .foregroundStyle(TappyColor.textPrimary)
                    Spacer()
                    if let onSeeAll {
                        Button(action: onSeeAll) {
                            Text("Xem tất cả")
                                .font(TappyFont.caption)
                                .foregroundStyle(TappyColor.primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                SectionHeader(title: "Trò chuyện gần đây")
            }

            if !isAuthenticated {
                TappyEmptyState(
                    systemImage: "bubble.left.and.bubble.right",
                    title: "Đăng nhập để lưu lịch sử trò chuyện của bạn"
                )
            } else {
                switch state {
                case .idle, .loading:
                    VStack(spacing: Spacing.xs) {
                        ForEach(0..<2, id: \.self) { _ in
                            TappySkeleton().frame(height: 56)
                        }
                    }
                case .loaded:
                    if conversations.isEmpty {
                        TappyEmptyState(
                            systemImage: "bubble.left.and.bubble.right",
                            title: "Bắt đầu trò chuyện đầu tiên với TappyAI!",
                            actionTitle: "Chat ngay",
                            action: onNewChat
                        )
                    } else {
                        VStack(spacing: Spacing.xs) {
                            ForEach(conversations.prefix(5)) { convo in
                                Button { onSelect(convo.id) } label: {
                                    ConversationRow(conversation: convo)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                case .failed:
                    TappyErrorState(
                        presentation: .init(title: "Không tải được", message: "Thử lại sau.", retryable: true),
                        onRetry: onRetry
                    )
                }
            }
        }
    }
}

// MARK: - Recommendations Card (static navigational card — matches Web)

struct HomeRecommendationsCard: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: Spacing.md) {
                Image(systemName: "sparkles")
                    .font(.system(size: 20))
                    .foregroundStyle(TappyColor.primary)
                    .frame(width: 44, height: 44)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                VStack(alignment: .leading, spacing: Spacing.xxs) {
                    Text("✨ Gợi ý cho bạn")
                        .font(TappyFont.bodyEmphasis)
                        .foregroundStyle(TappyColor.textPrimary)
                    Text("Địa điểm hợp gu, cá nhân hóa")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .padding(Spacing.md)
            .background(TappyColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        .tappyAccessibleButton("Xem gợi ý cho bạn")
    }
}

// MARK: - Row components

private struct ConversationRow: View {
    let conversation: ConversationSummary

    var body: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 18))
                .foregroundStyle(TappyColor.primary)
                .frame(width: 40, height: 40)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            VStack(alignment: .leading, spacing: Spacing.xxs) {
                Text(conversation.title ?? "Hội thoại")
                    .font(TappyFont.bodyEmphasis)
                    .foregroundStyle(TappyColor.textPrimary)
                    .lineLimit(1)
                HStack(spacing: 0) {
                    Text("\(conversation.messageCount) tin nhắn")
                    if let date = conversation.updatedAt {
                        Text(" · ")
                        Text(date, style: .relative)
                    }
                }
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
                .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)
        }
        .padding(Spacing.sm)
        .frame(minHeight: 56)
        .background(TappyColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .tappyAccessibleButton("Mở hội thoại")
    }
}

// MARK: - Shared primitives

struct SectionHeader: View {
    let title: LocalizedStringKey

    init(title: LocalizedStringKey) { self.title = title }

    var body: some View {
        Text(title)
            .font(TappyFont.headline)
            .foregroundStyle(TappyColor.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CategoryPill: View {
    let emoji: String
    let label: String

    var body: some View {
        HStack(spacing: Spacing.xs) {
            Text(emoji).font(.footnote)
            Text(label).font(TappyFont.callout)
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.xs)
        .frame(minHeight: 36)
        .background(TappyColor.surface)
        .foregroundStyle(TappyColor.textPrimary)
        .clipShape(RoundedRectangle(cornerRadius: Radius.pill, style: .continuous))
    }
}

struct QuickActionTile: View {
    let icon: String
    let label: String

    var body: some View {
        VStack(spacing: Spacing.xs) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundStyle(TappyColor.primary)
                .frame(width: 48, height: 48)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
            Text(label)
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textPrimary)
                .lineLimit(1)
        }
        .frame(minHeight: 80)
    }
}
