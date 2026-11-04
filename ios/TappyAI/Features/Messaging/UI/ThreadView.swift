import SwiftUI
import PhotosUI

/// One conversation — the web `ThreadView` on a phone: the messages as bubbles (mine in the accent fill, theirs on the surface; a group shows the
/// sender's name once per run and a time under the last bubble of a run — `ChatBubbles`, the same rule as the web), pictures, a report menu on
/// other people's messages, and a composer with the attach button. After a refused send the writing area is replaced by one neutral sentence.
struct ThreadView: View {
    let deps: AppDependencies
    @AppEnvironmentState private var router: AppRouter
    @AppStateObject private var vm: ThreadViewModel
    @ObservedObject private var safety: SafetyStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var pickedItem: PhotosPickerItem?
    @State private var safetyTarget: SafetyTarget?
    @State private var blockCheckUserId: String?

    init(deps: AppDependencies, threadId: String) {
        self.deps = deps
        _safety = ObservedObject(wrappedValue: deps.safety)
        _vm = AppStateObject(wrappedValue: ThreadViewModel(
            threadId: threadId,
            meId: deps.session.userId,
            service: MessagingService(api: deps.api, consent: deps.aiConsent)
        ))
    }

    private var isGroup: Bool { vm.thread?.kind == .group }
    private var fallbackUser: String { NSLocalizedString("msg.unknownUser", comment: "") }
    private var title: String {
        vm.thread?.displayTitle(meId: vm.meId, fallback: isGroup ? NSLocalizedString("msg.unnamedGroup", comment: "") : fallbackUser) ?? fallbackUser
    }
    private var other: ChatParticipant? { vm.thread?.counterpart(meId: vm.meId) }

    private var metas: [ChatBubbles.Meta] {
        ChatBubbles.metas(for: vm.messages, meId: vm.meId, group: isGroup, nameOf: { id in
            let name = vm.thread?.participants.first { $0.userId == id }?.fullName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return name.isEmpty ? fallbackUser : name
        })
    }

    var body: some View {
        VStack(spacing: 0) {
            messagesArea
            if let failure = vm.failure, failure != .load {
                Text(LocalizedStringKey(failure.messageKey))
                    .font(TappyFont.caption).foregroundStyle(TappyColor.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Spacing.md).padding(.vertical, Spacing.xxs)
                    .accessibilityIdentifier("thread-error")
            }
            Divider()
            composer
        }
        .background(TappyColor.background)
        .navigationTitle(Text(verbatim: title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Report / block the other person of a 1:1 thread (App Store 1.2): only while the server says it has the feature.
            if !isGroup, let other, safety.flags.anyEnabled {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        blockCheckUserId = other.userId
                        safetyTarget = SafetyTarget(kind: .user, targetId: other.userId, authorId: other.userId,
                                                    authorName: title, summary: title)
                    } label: { Image(systemName: "ellipsis") }
                    .accessibilityLabel(Text("safety.menu"))
                    .accessibilityIdentifier("thread-safety")
                }
            }
        }
        .sheet(item: $safetyTarget, onDismiss: afterSafetySheet) { target in
            SafetySheet(target: target, safety: safety) { safetyTarget = nil }
        }
        .task { await vm.start() }
        // The conversation was read: reconcile the tab badge with the server.
        .onDisappear { Task { await deps.notificationCenter.refresh() } }
        // Realtime's stand-in: the newest page is re-read while the screen is showing (cancelled when it goes).
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                if Task.isCancelled { break }
                await vm.poll()
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active { Task { await vm.poll() } }
        }
        .onChange(of: pickedItem) { item in
            guard let item else { return }
            Task { @MainActor in
                let data = try? await item.loadTransferable(type: Data.self)
                await vm.pickPhoto(data: data)
                pickedItem = nil
            }
        }
    }

    /// A block made from this screen closes the conversation (the server stops it too); the person goes back.
    private func afterSafetySheet() {
        if let id = blockCheckUserId, safety.isBlocked(id) { router.pop() }
        blockCheckUserId = nil
    }

    // MARK: Messages

    @ViewBuilder
    private var messagesArea: some View {
        if vm.isLoading && vm.messages.isEmpty {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if vm.failure == .load && vm.messages.isEmpty {
            TappyErrorState(
                presentation: .init(title: NSLocalizedString("msg.error.load", comment: ""),
                                    message: NSLocalizedString("common.tryAgainLater", comment: ""), retryable: true),
                onRetry: { Task { await vm.load() } }
            )
            .frame(maxHeight: .infinity)
        } else if vm.messages.isEmpty {
            Text("msg.noMessages").font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center).padding(Spacing.lg)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 4) {
                        if vm.hasMore {
                            Button { Task { await vm.loadOlder() } } label: {
                                Text(vm.loadingOlder ? "…" : NSLocalizedString("msg.loadOlder", comment: ""))
                                    .font(TappyFont.footnote.weight(.semibold))
                                    .padding(.horizontal, Spacing.sm).padding(.vertical, 6)
                                    .overlay(Capsule().stroke(TappyColor.separator))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("thread-load-older")
                            .padding(.bottom, Spacing.xs)
                        }
                        let all = metas
                        ForEach(Array(vm.messages.enumerated()), id: \.element.id) { index, message in
                            bubble(message, meta: index < all.count ? all[index] : nil)
                                .id(message.id)
                        }
                        Color.clear.frame(height: 1).id("thread-bottom")
                    }
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.md)
                }
                .onChange(of: vm.appendTick) { _ in
                    withAnimation { proxy.scrollTo("thread-bottom", anchor: .bottom) }
                }
                .onAppear { proxy.scrollTo("thread-bottom", anchor: .bottom) }
            }
        }
    }

    @ViewBuilder
    private func bubble(_ message: PeerMessage, meta: ChatBubbles.Meta?) -> some View {
        let mine = message.senderId != nil && message.senderId == vm.meId
        VStack(alignment: mine ? .trailing : .leading, spacing: 2) {
            if let meta, meta.showName, let name = meta.name {
                Text(verbatim: name)
                    .font(.system(size: 11.5, weight: .semibold)).foregroundStyle(TappyColor.textSecondary)
                    .padding(.leading, 6)
            }
            HStack(alignment: .center, spacing: 2) {
                if mine { Spacer(minLength: 40) }
                VStack(alignment: .leading, spacing: 6) {
                    if let media = message.media { MessagePhotoView(messageId: message.id, media: media) }
                    if !message.body.isEmpty {
                        Text(verbatim: message.body)
                            .font(.system(size: 14.5))
                            .foregroundStyle(mine ? Color.white : TappyColor.textPrimary)
                    }
                }
                .padding(.horizontal, message.media != nil && message.body.isEmpty ? 6 : 12)
                .padding(.vertical, message.media != nil && message.body.isEmpty ? 6 : 8)
                .background(mine ? TappyColor.primary : TappyColor.surface, in: RoundedRectangle(cornerRadius: 16))
                .contextMenu {
                    // Report THIS message (only someone else's, and only while the server says it has reports). Blocking the person is the header's job.
                    if !mine, safety.flags.reports, vm.meId != nil {
                        Button {
                            safetyTarget = SafetyTarget(kind: .message, targetId: message.id, authorId: message.senderId,
                                                        authorName: meta?.name, summary: message.body.isEmpty ? nil : message.body)
                        } label: { Label(NSLocalizedString("msg.reportMessage", comment: ""), systemImage: "flag") }
                    }
                }
                if !mine { Spacer(minLength: 40) }
            }
            if let meta, meta.showTime, !meta.time.isEmpty {
                Text(verbatim: meta.time)
                    .font(.system(size: 10.5)).foregroundStyle(TappyColor.textSecondary)
                    .padding(.horizontal, 6)
            }
        }
        .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
        .padding(.bottom, meta?.showTime == true ? 6 : 0)
        .accessibilityIdentifier("msg-bubble-\(message.id)")
    }

    // MARK: Composer

    @ViewBuilder
    private var composer: some View {
        if vm.locked {
            // The same neutral sentence the web shows: the server never says whether it was a block, so neither does this screen.
            Text("msg.error.cannotSend")
                .font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity).padding(Spacing.md)
                .accessibilityIdentifier("composer-locked")
        } else {
            VStack(spacing: Spacing.xs) {
                if vm.photo != nil || vm.uploading {
                    HStack(spacing: Spacing.xs) {
                        if let photo = vm.photo {
                            ZStack(alignment: .topTrailing) {
                                Image(uiImage: photo.preview).resizable().scaledToFill()
                                    .frame(width: 64, height: 64).clipShape(RoundedRectangle(cornerRadius: 12))
                                Button { vm.removePhoto() } label: {
                                    Image(systemName: "xmark.circle.fill").foregroundStyle(.white, .black.opacity(0.6))
                                }
                                .accessibilityLabel(Text("msg.removePhoto"))
                                .accessibilityIdentifier("composer-photo-remove")
                            }
                        }
                        if vm.uploading {
                            ProgressView().controlSize(.small)
                            Text("msg.uploading").font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
                        }
                        Spacer()
                    }
                }
                HStack(alignment: .bottom, spacing: Spacing.xs) {
                    PhotosPicker(selection: $pickedItem, matching: .images) {
                        Image(systemName: "photo.badge.plus")
                            .font(.system(size: 18))
                            .foregroundStyle(TappyColor.textSecondary)
                            .frame(width: 44, height: 44)
                            .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(vm.uploading || vm.sending)
                    .accessibilityLabel(Text("msg.attach"))
                    .accessibilityIdentifier("composer-attach")

                    TextField(NSLocalizedString("msg.composer", comment: ""), text: $vm.draft, axis: .vertical)
                        .lineLimit(1...5)
                        .font(TappyFont.callout)
                        .padding(.horizontal, Spacing.sm).padding(.vertical, 11)
                        .background(TappyColor.surface, in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityIdentifier("composer-field")

                    Button { Task { await vm.send() } } label: {
                        Image(systemName: "paperplane.fill")
                            .font(.system(size: 17)).foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(TappyColor.primary, in: RoundedRectangle(cornerRadius: 12))
                            .opacity(canSend ? 1 : 0.4)
                    }
                    .disabled(!canSend)
                    .accessibilityLabel(Text("msg.send"))
                    .accessibilityIdentifier("composer-send")
                }
            }
            .padding(Spacing.sm)
        }
    }

    private var canSend: Bool {
        (!vm.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.photo != nil) && !vm.sending && !vm.uploading
    }
}
