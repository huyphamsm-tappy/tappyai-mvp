import SwiftUI

/// Chat history, laid out like the web's history (the workspace sidebar `HistorySidebar.tsx`, with the mobile
/// history page's row facts): search field, pill tabs (all / pinned / archived), collapsible day groups
/// (pinned first, today, last 7 days, older), rows with a category icon, title, a "when" line and a ⋯ menu,
/// and a "load more history" button at the end.
struct ChatHistoryView: View {
    let deps: AppDependencies
    /// Called when a conversation is opened from here (the Chat screen's history sheet closes itself with it).
    var onOpen: (() -> Void)? = nil
    @AppEnvironmentState private var router: AppRouter

    @State private var conversations: [ChatHistoryItem] = []
    @State private var loading = true
    @State private var deleteTarget: String?
    @State private var segment: HistorySegment = .all
    @State private var query = ""
    @State private var collapsed: Set<String> = []
    /// The `updated_at` to ask the next, older page from; nil when there is nothing older.
    @State private var nextCursor: String?
    @State private var loadingMore = false

    private var tabItems: [ChatHistoryItem] {
        HistoryFilter.visible(conversations, segment: segment, query: "")
    }

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
            VStack(alignment: .leading, spacing: Spacing.sm) {
                if loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                } else if conversations.isEmpty {
                    startChatEmptyState
                } else {
                    searchField
                    tabs

                    if tabItems.isEmpty {
                        tabEmptyState
                    } else if shown.isEmpty {
                        searchEmptyState
                    } else {
                        let now = Date()
                        ForEach(HistoryFilter.groups(shown, segment: segment, now: now)) { group in
                            groupSection(group)
                        }
                    }
                    if nextCursor != nil { loadMoreButton }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.md)
        }
        .background(TappyColor.background)
        .navigationTitle("history.title")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadData() }
        .alert("history.delete.title", isPresented: Binding(
            get: { deleteTarget != nil },
            set: { if !$0 { deleteTarget = nil } }
        )) {
            Button("history.delete.confirmButton", role: .destructive) {
                if let id = deleteTarget { Task { await deleteConversation(id) } }
            }
            Button("common.cancel", role: .cancel) { deleteTarget = nil }
        } message: {
            Text(deleteMessage)
        }
    }

    private var deleteMessage: String {
        let name = conversations.first { $0.id == deleteTarget }.map(displayTitle) ?? ""
        return String(format: NSLocalizedString("history.delete.body", comment: ""), "\"\(name)\"")
    }

    private func displayTitle(_ conv: ChatHistoryItem) -> String {
        let trimmed = conv.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? NSLocalizedString("history.untitled", comment: "") : trimmed
    }

    // MARK: - Search and tabs

    private var searchField: some View {
        HStack(spacing: Spacing.xs) {
            HStack(spacing: Spacing.xs) {
                Image(systemName: "magnifyingglass")
                    .font(TappyFont.footnote)
                    .foregroundStyle(TappyColor.textSecondary)
                TextField("history.search", text: $query)
                    .font(TappyFont.scaled(.subheadline))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
            }
            .padding(.horizontal, Spacing.sm)
            .frame(minHeight: 44)
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                    .stroke(TappyColor.border, lineWidth: 1)
            )

            Button {
                query = ""
            } label: {
                Image(systemName: "xmark")
                    .font(TappyFont.footnote)
                    .foregroundStyle(TappyColor.textSecondary)
                    .frame(width: 44, height: 44)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                            .stroke(TappyColor.border, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
            .disabled(query.isEmpty)
            .opacity(query.isEmpty ? 0.6 : 1)
            .accessibilityLabel(Text("history.search.clear"))
        }
    }

    private var tabs: some View {
        HStack(spacing: Spacing.xs) {
            tabPill("history.segment.all", icon: nil, value: .all)
            tabPill("history.segment.pinned", icon: "pin", value: .pinned)
            tabPill("history.segment.archived", icon: nil, value: .archived)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }

    private func tabPill(_ key: String, icon: String?, value: HistorySegment) -> some View {
        let active = segment == value
        return Button {
            segment = value
        } label: {
            HStack(spacing: 6) {
                if let icon { Image(systemName: icon).font(TappyFont.caption) }
                Text(LocalizedStringKey(key))
                    .font(TappyFont.scaled(.footnote, weight: active ? .semibold : .medium))
            }
            .foregroundStyle(active ? Color.white : TappyColor.textPrimary)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(active ? TappyColor.primary : TappyColor.surface)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(active ? TappyColor.primary : TappyColor.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    // MARK: - Groups

    @ViewBuilder
    private func groupSection(_ group: HistoryGroup) -> some View {
        let isCollapsed = collapsed.contains(group.id)
        VStack(alignment: .leading, spacing: 6) {
            Button {
                if isCollapsed { collapsed.remove(group.id) } else { collapsed.insert(group.id) }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: isCollapsed ? "chevron.right" : "chevron.down")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                        .frame(width: 14)
                    // Like the web sidebar: only the pinned group shows its count.
                    Text(group.key == .pinned
                         ? "\(NSLocalizedString(group.key.titleKey, comment: "")) (\(group.items.count))"
                         : NSLocalizedString(group.key.titleKey, comment: ""))
                        .font(TappyFont.scaled(.subheadline, weight: .semibold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 4)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: "\(NSLocalizedString(group.key.titleKey, comment: "")) (\(group.items.count)) - \(NSLocalizedString(isCollapsed ? "history.group.expand" : "history.group.collapse", comment: ""))"))

            if !isCollapsed {
                ForEach(group.items) { conv in
                    conversationRow(conv, in: group.key)
                }
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Empty states (web `EmptyState`: icon tile, title, description, one action)

    private func emptyBlock(icon: String, titleKey: String, desc: String?, actionKey: String?, action: (() -> Void)?) -> some View {
        VStack(spacing: Spacing.xs) {
            Image(systemName: icon)
                .font(.system(size: 26))
                .foregroundStyle(TappyColor.textSecondary)
                .frame(width: 64, height: 64)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                .padding(.bottom, 4)
            Text(LocalizedStringKey(titleKey))
                .font(TappyFont.scaled(.subheadline, weight: .bold))
                .foregroundStyle(TappyColor.textPrimary)
                .multilineTextAlignment(.center)
            if let desc {
                Text(desc)
                    .font(TappyFont.footnote)
                    .foregroundStyle(TappyColor.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 280)
            }
            if let actionKey, let action {
                Button(action: action) {
                    Text(LocalizedStringKey(actionKey))
                        .font(TappyFont.scaled(.footnote, weight: .semibold))
                        .foregroundStyle(TappyColor.primary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(TappyColor.primary.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.top, Spacing.xs)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, 40)
    }

    private func startChat() {
        router.popToRoot(on: .chat)
        router.switchTo(.chat)
    }

    private var startChatEmptyState: some View {
        emptyBlock(icon: "bubble.left.and.bubble.right",
                   titleKey: "history.empty.none.title",
                   desc: NSLocalizedString("history.empty.none.desc", comment: ""),
                   actionKey: "history.empty.none.action", action: startChat)
    }

    @ViewBuilder
    private var tabEmptyState: some View {
        switch segment {
        case .all:
            startChatEmptyState
        case .pinned:
            emptyBlock(icon: "pin", titleKey: "history.empty.pinned.title",
                       desc: NSLocalizedString("history.empty.pinned.desc", comment: ""),
                       actionKey: "history.empty.toAll", action: { segment = .all })
        case .archived:
            emptyBlock(icon: "archivebox", titleKey: "history.empty.archived.title",
                       desc: NSLocalizedString("history.empty.archived.desc", comment: ""),
                       actionKey: "history.empty.toAll", action: { segment = .all })
        }
    }

    private var searchEmptyState: some View {
        emptyBlock(icon: "magnifyingglass", titleKey: "history.empty.search.title",
                   desc: String(format: NSLocalizedString("history.empty.search.desc", comment: ""), query.trimmingCharacters(in: .whitespacesAndNewlines)),
                   actionKey: "history.empty.search.action", action: { query = "" })
    }

    private var loadMoreButton: some View {
        Button {
            Task { await loadMore() }
        } label: {
            HStack(spacing: 8) {
                if loadingMore {
                    ProgressView().controlSize(.small)
                    Text("history.more.loading")
                } else {
                    Image(systemName: "chevron.right").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                    Text("history.more.load")
                }
                Spacer(minLength: 0)
            }
            .font(TappyFont.scaled(.subheadline, weight: .medium))
            .foregroundStyle(TappyColor.textPrimary)
            .padding(.horizontal, Spacing.sm)
            .padding(.vertical, Spacing.xs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(loadingMore)
        .padding(.top, 4)
    }

    // MARK: - Row

    @ViewBuilder
    private func conversationRow(_ conv: ChatHistoryItem, in group: HistoryGroupKey) -> some View {
        HStack(spacing: Spacing.xs) {
            Button {
                onOpen?()
                router.push(HomeDestination.conversation(id: conv.id), on: .home)
                router.switchTo(.home)
            } label: {
                HStack(spacing: Spacing.sm) {
                    Text(categoryEmoji[conv.category ?? ""] ?? "💬")
                        .font(.system(size: 20))
                        .frame(width: 40, height: 40)
                        .background(TappyColor.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(displayTitle(conv))
                            .font(TappyFont.scaled(.subheadline, weight: .semibold))
                            .foregroundStyle(TappyColor.textPrimary)
                            .lineLimit(1)
                        let sub = subtitle(conv, in: group)
                        if !sub.isEmpty {
                            Text(sub)
                                .font(TappyFont.caption)
                                .foregroundStyle(TappyColor.textSecondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if conv.isPinned {
                Image(systemName: "star.fill")
                    .font(TappyFont.footnote)
                    .foregroundStyle(Color.orange)
                    .accessibilityLabel(Text("history.pinned.badge"))
            }

            Menu {
                if !conv.isArchived {
                    Button {
                        Task { await setFlags(conv, pinned: !conv.isPinned) }
                    } label: {
                        Label(LocalizedStringKey(conv.isPinned ? "history.unpin" : "history.pin"),
                              systemImage: conv.isPinned ? "pin.slash" : "pin")
                    }
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
                    Label("history.menu.delete", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(TappyFont.scaled(.body))
                    .foregroundStyle(TappyColor.textSecondary)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, 10)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Helpers

    /// The row's second line. The mobile web page shows "{n} messages · {when}"; the sidebar's "when" is the
    /// time of day in the today group, "Updated {ago}" in the pinned group, and "{ago}" in the others.
    private func subtitle(_ conv: ChatHistoryItem, in group: HistoryGroupKey) -> String {
        var parts: [String] = []
        if conv.messageCount > 0 {
            parts.append(String(format: NSLocalizedString("history.messageCount", comment: ""), conv.messageCount))
        }
        if let date = ISO8601Timestamp.date(from: conv.updatedAt) {
            switch group {
            case .today:
                parts.append(Self.timeOfDay(date))
            case .pinned:
                parts.append(String(format: NSLocalizedString("history.row.updated", comment: ""), Self.relativeTime(date)))
            case .sevenDays, .older:
                parts.append(Self.relativeTime(date))
            }
        }
        return parts.joined(separator: " · ")
    }

    private static func timeOfDay(_ date: Date) -> String {
        let df = DateFormatter()
        df.locale = Locale(identifier: "en_GB")
        df.timeZone = HistoryFilter.vietnamCalendar.timeZone
        df.dateFormat = "HH:mm"
        return df.string(from: date)
    }

    /// Web `formatRelativeTime`: just now / minutes / hours / days, then the date from a week on.
    private static func relativeTime(_ date: Date) -> String {
        let minutes = Int((Date().timeIntervalSince(date) / 60).rounded(.down))
        if minutes < 1 { return NSLocalizedString("common.justNow", comment: "") }
        if minutes < 60 { return String(format: NSLocalizedString("time.minutesAgo", comment: ""), minutes) }
        let hours = minutes / 60
        if hours < 24 { return String(format: NSLocalizedString("time.hoursAgo", comment: ""), hours) }
        let days = hours / 24
        if days < 7 { return String(format: NSLocalizedString("time.daysAgo", comment: ""), days) }
        return date.formatted(.dateTime.day(.twoDigits).month(.twoDigits).year().locale(Locale.current))
    }

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
}
