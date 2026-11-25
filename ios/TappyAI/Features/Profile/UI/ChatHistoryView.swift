import SwiftUI

struct ChatHistoryView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter

    @State private var conversations: [ChatHistoryItem] = []
    @State private var loading = true
    @State private var deleteTarget: String?
    @State private var segment: HistorySegment = .all
    @State private var query = ""
    /// The `updated_at` to ask the next, older page from; nil when there is nothing older.
    @State private var nextCursor: String?
    @State private var loadingMore = false

    private var shown: [ChatHistoryItem] {
        HistoryFilter.visible(conversations, segment: segment, query: query)
    }

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
                    Picker("history.title", selection: $segment) {
                        Text("history.segment.all").tag(HistorySegment.all)
                        Text("history.segment.pinned").tag(HistorySegment.pinned)
                        Text("history.segment.archived").tag(HistorySegment.archived)
                    }
                    .pickerStyle(.segmented)
                    TappyTextField(titleKey: "history.search", text: $query)

                    if shown.isEmpty {
                        Text("history.noMatch")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textSecondary)
                            .padding(.top, Spacing.lg)
                    }
                    ForEach(shown) { conv in
                        conversationRow(conv)
                            .onAppear {
                                // Older pages load as the end of the list comes into view.
                                if conv.id == conversations.last?.id { Task { await loadMore() } }
                            }
                    }
                    if loadingMore { ProgressView().frame(maxWidth: .infinity) }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("history.title")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
        .alert("history.delete.confirm", isPresented: Binding(
            get: { deleteTarget != nil },
            set: { if !$0 { deleteTarget = nil } }
        )) {
            Button("common.delete", role: .destructive) {
                if let id = deleteTarget { Task { await deleteConversation(id) } }
            }
            Button("common.cancel", role: .cancel) { deleteTarget = nil }
        }
    }

    // MARK: - Empty

    private var emptyState: some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 32))
                .foregroundStyle(TappyColor.textSecondary.opacity(0.4))
            Text("history.empty")
                .font(.system(size: 14))
                .foregroundStyle(TappyColor.textSecondary)

            Button {
                router.popToRoot(on: .chat)
                router.switchTo(.chat)
            } label: {
                Text("memory.startChat")
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

            Menu {
                Button {
                    Task { await setFlags(conv, pinned: !conv.isPinned) }
                } label: {
                    Label(LocalizedStringKey(conv.isPinned ? "history.unpin" : "history.pin"),
                          systemImage: conv.isPinned ? "pin.slash" : "pin")
                }
                Button {
                    Task { await setFlags(conv, archived: !conv.isArchived) }
                } label: {
                    Label(LocalizedStringKey(conv.isArchived ? "history.restore" : "history.archive"),
                          systemImage: conv.isArchived ? "tray.and.arrow.up" : "archivebox")
                }
                Button(role: .destructive) {
                    deleteTarget = conv.id
                } label: {
                    Label("common.delete", systemImage: "trash")
                }
            } label: {
                Image(systemName: conv.isPinned ? "pin.fill" : "ellipsis")
                    .font(.system(size: 13))
                    .foregroundStyle(TappyColor.textSecondary)
                    .frame(width: 32, height: 32)
            }
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
            let page = try await service.fetchConversations()
            conversations = page
            nextCursor = HistoryFilter.nextCursor(lastPage: page, all: page, pageSize: ProfileService.conversationPageSize)
        } catch {}
        loading = false
    }

    private func loadMore() async {
        guard let cursor = nextCursor, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        guard let page = try? await service.fetchConversations(before: cursor) else { return }
        let known = Set(conversations.map(\.id))
        conversations += page.filter { !known.contains($0.id) }
        nextCursor = HistoryFilter.nextCursor(lastPage: page, all: conversations, pageSize: ProfileService.conversationPageSize)
    }

    /// Optimistic: the list changes at once and goes back if the server refuses.
    private func setFlags(_ conv: ChatHistoryItem, pinned: Bool? = nil, archived: Bool? = nil) async {
        guard let index = conversations.firstIndex(where: { $0.id == conv.id }) else { return }
        let before = conversations[index]
        if let pinned { conversations[index].isPinned = pinned }
        if let archived { conversations[index].isArchived = archived }
        do {
            try await service.setConversationFlags(id: conv.id, pinned: pinned, archived: archived)
        } catch {
            if let i = conversations.firstIndex(where: { $0.id == conv.id }) { conversations[i] = before }
        }
    }

    private func deleteConversation(_ id: String) async {
        conversations.removeAll { $0.id == id }
        try? await service.deleteConversation(id)
    }

    private func relativeTime(_ iso: String) -> String {
        guard let date = ISO8601Timestamp.date(from: iso) else { return "" }
        let diff = Date().timeIntervalSince(date)
        if diff < 60 { return NSLocalizedString("common.justNow", comment: "") }
        if diff < 3600 { return "\(Int(diff/60)) phút trước" }
        if diff < 86400 { return "\(Int(diff/3600)) giờ trước" }
        if diff < 604800 { return "\(Int(diff/86400)) ngày trước" }
        let df = DateFormatter()
        df.locale = Locale(identifier: "vi_VN")
        df.dateFormat = "dd/MM/yyyy"
        return df.string(from: date)
    }
}
