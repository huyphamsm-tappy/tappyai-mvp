import SwiftUI

/// Where a Messenger conversation lives in navigation. Registered for EVERY tab (like `ReviewsDestination`): a conversation is opened from the
/// Inbox, from another person's profile (on whichever tab the person is) and from a notification link.
enum MessagingDestination: Hashable {
    case thread(id: String)
}

/// The Messages tab of the Inbox: "Tin nhắn mới", a filter, and the conversation list (the web's `MessagesTab` + `ThreadList`).
struct MessagesListView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    @AppStateObject private var vm: MessagesListViewModel
    @State private var showNew = false

    init(deps: AppDependencies) {
        self.deps = deps
        _vm = AppStateObject(wrappedValue: MessagesListViewModel(
            meId: deps.session.userId,
            service: MessagingService(api: deps.api, consent: deps.aiConsent)
        ))
    }

    private var fallbackUser: String { NSLocalizedString("msg.unknownUser", comment: "") }
    private var fallbackGroup: String { NSLocalizedString("msg.unnamedGroup", comment: "") }

    var body: some View {
        VStack(spacing: Spacing.sm) {
            Button { showNew = true } label: {
                Label(NSLocalizedString("msg.new", comment: ""), systemImage: "plus")
                    .font(TappyFont.button)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.sm)
                    .background(TappyColor.primary, in: RoundedRectangle(cornerRadius: 12))
            }
            .accessibilityIdentifier("msg-new")
            .padding(.horizontal, Spacing.md)

            HStack(spacing: Spacing.xs) {
                Image(systemName: "magnifyingglass").foregroundStyle(TappyColor.textSecondary)
                TextField(NSLocalizedString("msg.search", comment: ""), text: $vm.query)
                    .font(TappyFont.callout)
                    .autocorrectionDisabled()
            }
            .padding(Spacing.sm)
            .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, Spacing.md)

            content
        }
        .padding(.top, Spacing.xs)
        .background(TappyColor.background)
        .task { await vm.load() }
        // Realtime's stand-in: the list is re-read on a slow timer while this tab is showing (the task is cancelled when it goes).
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                if Task.isCancelled { break }
                await vm.load()
            }
        }
        .refreshable { await vm.load() }
        .sheet(isPresented: $showNew) {
            NewMessageSheet(deps: deps) { threadId in
                showNew = false
                Task { @MainActor in await vm.load() }
                router.push(MessagingDestination.thread(id: threadId))
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch vm.state {
        case .idle, .loading:
            ProgressView().frame(maxWidth: .infinity, minHeight: 160)
        case .failed:
            TappyErrorState(
                presentation: .init(title: NSLocalizedString("common.loadFailed", comment: ""),
                                    message: NSLocalizedString("common.tryAgainLater", comment: ""), retryable: true),
                onRetry: { Task { await vm.load() } }
            )
            .padding(.top, 40)
        case .loaded:
            let rows = vm.visible(fallbackUser: fallbackUser, fallbackGroup: fallbackGroup)
            if vm.threads.isEmpty {
                TappyEmptyState(systemImage: "bubble.left.and.bubble.right", title: "msg.empty", message: "msg.empty.hint")
                    .padding(.top, 40)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(rows) { thread in
                            row(thread)
                            Divider().padding(.leading, 64)
                        }
                    }
                }
            }
        }
    }

    private func row(_ thread: ChatThreadSummary) -> some View {
        let title = thread.displayTitle(meId: vm.meId, fallback: thread.kind == .group ? fallbackGroup : fallbackUser)
        let preview: String = {
            guard let last = thread.lastMessage else { return NSLocalizedString("msg.noMessages", comment: "") }
            // A picture-only last message has an empty body: the web shows "Đã gửi một ảnh" there.
            return last.body.isEmpty ? NSLocalizedString("msg.photo.preview", comment: "") : last.body
        }()
        return Button {
            router.push(MessagingDestination.thread(id: thread.id))
        } label: {
            HStack(spacing: Spacing.sm) {
                ChatAvatar(url: thread.kind == .group ? nil : thread.counterpart(meId: vm.meId)?.avatarUrl,
                           name: title, group: thread.kind == .group, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(verbatim: title)
                            .font(.system(size: 14.5, weight: thread.unreadCount > 0 ? .semibold : .regular))
                            .foregroundStyle(TappyColor.textPrimary)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text(verbatim: ChatBubbles.timeLabel(thread.lastMessage?.createdAt ?? thread.lastMessageAt, now: Date()))
                            .font(.system(size: 11))
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                    HStack {
                        Text(verbatim: preview)
                            .font(.system(size: 12.5))
                            .foregroundStyle(TappyColor.textSecondary)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        if thread.unreadCount > 0 {
                            Text(verbatim: "\(thread.unreadCount)")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 7).padding(.vertical, 2)
                                .background(TappyColor.primary, in: Capsule())
                        }
                    }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("msg-thread-\(thread.id)")
    }
}

/// A round avatar: the picture, else a group glyph, else the initial.
struct ChatAvatar: View {
    let url: String?
    let name: String
    let group: Bool
    let size: CGFloat

    var body: some View {
        Group {
            if let url, let imageURL = URL(string: url), imageURL.scheme?.lowercased() == "https" {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image): image.resizable().scaledToFill()
                    default: fallback
                    }
                }
            } else {
                fallback
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    private var fallback: some View {
        Circle().fill(TappyColor.primary.opacity(0.15)).overlay(
            Group {
                if group {
                    Image(systemName: "person.2.fill").font(.system(size: size * 0.4)).foregroundStyle(TappyColor.primary)
                } else {
                    Text(verbatim: String(name.trimmingCharacters(in: .whitespaces).first.map { String($0).uppercased() } ?? "?"))
                        .font(.system(size: size * 0.4, weight: .bold)).foregroundStyle(TappyColor.primary)
                }
            }
        )
    }
}

/// The new-conversation flow (the web `NewMessageSheet`).
struct NewMessageSheet: View {
    let onStarted: (String) -> Void
    @AppStateObject private var vm: NewMessageViewModel
    @Environment(\.dismiss) private var dismiss

    init(deps: AppDependencies, onStarted: @escaping (String) -> Void) {
        self.onStarted = onStarted
        _vm = AppStateObject(wrappedValue: NewMessageViewModel(
            search: ReviewsService(api: deps.api),
            service: MessagingService(api: deps.api),
            meId: deps.session.userId
        ))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: Spacing.sm) {
                TextField(NSLocalizedString("msg.findPeople", comment: ""), text: $vm.peopleQuery)
                    .font(TappyFont.callout)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding(Spacing.sm)
                    .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityIdentifier("msg-find-people")

                if vm.selected.count > 1 {
                    TextField(NSLocalizedString("msg.groupName", comment: ""), text: $vm.groupName)
                        .font(TappyFont.callout)
                        .padding(Spacing.sm)
                        .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))
                }

                if vm.peopleQuery.trimmingCharacters(in: .whitespaces).count < NewMessageViewModel.minQuery {
                    Text("msg.searchHint").font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else if vm.searching {
                    ProgressView().frame(maxWidth: .infinity)
                } else if vm.people.isEmpty {
                    Text("msg.noResults").font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(vm.people) { user in
                            Button { vm.toggle(user) } label: {
                                HStack(spacing: Spacing.sm) {
                                    ChatAvatar(url: user.avatarUrl, name: user.displayName, group: false, size: 36)
                                    Text(verbatim: user.displayName).font(TappyFont.callout).foregroundStyle(TappyColor.textPrimary)
                                    Spacer()
                                    Image(systemName: vm.isSelected(user) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(vm.isSelected(user) ? TappyColor.primary : TappyColor.textSecondary)
                                }
                                .padding(.vertical, Spacing.xs)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if vm.startFailed {
                    Text("msg.startFailed").font(TappyFont.footnote).foregroundStyle(TappyColor.danger)
                }

                Button {
                    Task { if let id = await vm.start() { onStarted(id) } }
                } label: {
                    Text(vm.selected.count > 1
                         ? String(format: NSLocalizedString("msg.startChatN", comment: ""), vm.selected.count)
                         : NSLocalizedString("msg.startChat", comment: ""))
                        .font(TappyFont.button).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, Spacing.sm)
                        .background(TappyColor.primary, in: RoundedRectangle(cornerRadius: 12))
                        .opacity(vm.selected.isEmpty || vm.starting ? 0.5 : 1)
                }
                .buttonStyle(.plain)
                .disabled(vm.selected.isEmpty || vm.starting)
                .accessibilityIdentifier("msg-start")
            }
            .padding(Spacing.md)
            .background(TappyColor.background)
            .navigationTitle(Text("msg.new"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(NSLocalizedString("common.close", comment: "")) { dismiss() }
                }
            }
        }
    }
}
