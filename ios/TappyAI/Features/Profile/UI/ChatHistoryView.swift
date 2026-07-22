import SwiftUI

struct ChatHistoryView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter

    @State private var conversations: [ChatHistoryItem] = []
    @State private var loading = true
    @State private var deleteTarget: String?

    private let categoryEmoji: [String: String] = [
        "food": "🍜", "travel": "✈️", "spa": "💆", "hotel": "🏨",
        "shopping": "🛍️", "entertainment": "🎉", "general": "💬",
        "weather": "🌤️", "currency": "💱", "translate": "🌐",
    ]

    private var service: ProfileService { ProfileService(api: deps.api) }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.sm) {
                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else if conversations.isEmpty {
                    emptyState
                } else {
                    ForEach(conversations) { conv in
                        conversationRow(conv)
                    }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Lịch sử trò chuyện")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
        .alert("Xóa cuộc trò chuyện này? Không thể hoàn tác.", isPresented: Binding(
            get: { deleteTarget != nil },
            set: { if !$0 { deleteTarget = nil } }
        )) {
            Button("Xóa", role: .destructive) {
                if let id = deleteTarget { Task { await deleteConversation(id) } }
            }
            Button("Huỷ", role: .cancel) { deleteTarget = nil }
        }
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 32))
                .foregroundStyle(TappyColor.textSecondary.opacity(0.4))
            Text("Chưa có cuộc trò chuyện nào")
                .font(.system(size: 14))
                .foregroundStyle(TappyColor.textSecondary)

            Button {
                router.popToRoot(on: .chat)
                router.switchTo(.chat)
            } label: {
                Text("Bắt đầu chat")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, Spacing.lg)
                    .padding(.vertical, 10)
                    .background(TappyColor.primary)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 60)
    }

    // MARK: - Row

    @ViewBuilder
    private func conversationRow(_ conv: ChatHistoryItem) -> some View {
        HStack(spacing: Spacing.md) {
            Button {
                router.push(HomeDestination.conversation(id: conv.id), on: .home)
                router.switchTo(.home)
            } label: {
                HStack(spacing: Spacing.md) {
                    Text(categoryEmoji[conv.category ?? ""] ?? "💬")
                        .font(.system(size: 20))
                        .frame(width: 40, height: 40)
                        .background(TappyColor.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))

                    VStack(alignment: .leading, spacing: 3) {
                        Text(conv.title)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(TappyColor.textPrimary)
                            .lineLimit(1)
                        Text("\(conv.messageCount) tin nhắn · \(relativeTime(conv.updatedAt))")
                            .font(.system(size: 11))
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    Spacer()
                }
            }
            .buttonStyle(.plain)

            Button {
                deleteTarget = conv.id
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 13))
                    .foregroundStyle(TappyColor.textSecondary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
        }
        .padding(Spacing.md)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Helpers

    private func loadData() async {
        do {
            conversations = try await service.fetchConversations()
        } catch {}
        loading = false
    }

    private func deleteConversation(_ id: String) async {
        conversations.removeAll { $0.id == id }
        try? await service.deleteConversation(id)
    }

    private func relativeTime(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return "" }
        let diff = Date().timeIntervalSince(date)
        if diff < 60 { return "vừa xong" }
        if diff < 3600 { return "\(Int(diff/60)) phút trước" }
        if diff < 86400 { return "\(Int(diff/3600)) giờ trước" }
        if diff < 604800 { return "\(Int(diff/86400)) ngày trước" }
        let df = DateFormatter()
        df.locale = Locale(identifier: "vi_VN")
        df.dateFormat = "dd/MM/yyyy"
        return df.string(from: date)
    }
}
