import SwiftUI

/// The Chat tab root. New conversation (empty messages) or existing conversation (loaded messages).
struct ChatView: View {
    @AppStateObject private var vm: ChatViewModel
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var localization: LocalizationManager
    @State private var ageScreen = false
    @State private var showVoice = false

    init(deps: AppDependencies, category: String = "general",
         conversationId: String? = nil, savedMessages: [Conversation.ConversationMessage]? = nil) {
        let service = ChatService(api: deps.api, streaming: deps.streaming)
        let session = deps.session
        _vm = AppStateObject(wrappedValue: ChatViewModel(
            service: service, session: session,
            category: category, conversationId: conversationId,
            savedMessages: savedMessages,
            planShare: PlanShareService(api: deps.api, isAuthenticated: { session.state.isAuthenticated }),
            saveDateOfBirth: { [api = deps.api] iso in
                try await ProfileService(api: api).updateDateOfBirth(iso)
            },
            loadAgeStatus: { [api = deps.api] in
                try await ProfileService(api: api).fetchAgeStatus()
            }
        ))
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                if vm.isLoadingConversation {
                    Spacer()
                    TappyLoadingIndicator()
                    Spacer()
                } else if vm.messages.isEmpty && vm.error == nil {
                    ChatEmptyState(
                        category: vm.category,
                        locale: localization.language.rawValue,
                        hasMemory: vm.hasMemory,
                        onQuickPrompt: { vm.sendQuickPrompt($0) }
                    )
                } else {
                    ChatMessageList(
                        messages: vm.messages,
                        isStreaming: vm.isStreaming,
                        activeTool: vm.activeTool,
                        thinkHintIndex: vm.thinkHintIndex,
                        error: vm.error,
                        isAuthenticated: vm.isAuthenticated,
                        locale: localization.language.rawValue,
                        conversationId: vm.conversationId,
                        hasMemory: vm.hasMemory,
                        tts: vm.tts,
                        onRegenerate: { vm.regenerate() },
                        onRetry: { vm.retry() },
                        onFollowup: { vm.sendQuickPrompt($0) },
                        onCopy: { UIPasteboard.general.string = $0 },
                        onShare: { vm.share(messageIndex: $0, lang: localization.language.rawValue) },
                        onLogin: { router.requestLogin() },
                        onLike: { vm.likeFeedback(messageIndex: $0, isActive: $1) },
                        onDislike: { vm.dislikeFeedback(messageIndex: $0, isActive: $1) },
                        onReport: { vm.reportFeedback(messageIndex: $0) },
                        onSavePlaceManual: { vm.savePlaceManual(name: $0) },
                        onSavePlaceFavorite: { vm.savePlaceFavorite(placeId: $0, name: $1, address: $2, type: $3) },
                        onZoomImage: { vm.zoomedImageUrl = $0 },
                        ageSubmitting: vm.ageSubmitting,
                        ageFormError: vm.ageFormError,
                        onDeclareAge: { vm.declareGuestAge($0) },
                        onSubmitDateOfBirth: { d, m, y in Task { await vm.submitDateOfBirth(day: d, month: m, year: y) } },
                        onEditDateOfBirth: { vm.clearAgeFormError() },
                        ageBlocked: AgeBlockedState(isGuest: vm.isGuest, canCorrect: vm.canCorrectAge,
                                                    correcting: vm.ageCorrecting),
                        onStartAgeCorrection: { vm.startAgeCorrection() },
                        onCancelAgeCorrection: { vm.cancelAgeCorrection() },
                        planShare: vm.planShare
                    )
                }

                // DD-011 — device context, visible and revocable. The location was already going
                // out with every turn and appearing nowhere; this states it and offers a way to
                // stop. It requests nothing and grants nothing: the permission model is untouched.
                if vm.locationContextEnabled, vm.hasLocationContext, !vm.isLoadingConversation {
                    HStack(spacing: Spacing.xxs) {
                        Text("📍").accessibilityHidden(true)
                        Text(String(localized: "context.nearYou"))
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                        Button {
                            vm.locationContextEnabled = false
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(TappyColor.textSecondary)
                        }
                        .accessibilityLabel(Text("context.removeLocation"))
                        .minimumTapTarget()
                    }
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.xxs)
                    .background(TappyColor.surface)
                    .clipShape(Capsule())
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Spacing.md)
                }

                if !vm.isLoadingConversation {
                    ChatInputBar(
                        text: $vm.inputText,
                        isStreaming: vm.isStreaming,
                        isListening: vm.voice.isListening,
                        pendingSend: vm.pendingSend,
                        voiceError: vm.voice.error,
                        locale: localization.language.rawValue,
                        onSend: { vm.send() },
                        onStop: { vm.stop() },
                        onToggleVoice: { showVoice = true },
                        onCancelAutoSend: { vm.cancelAutoSend() },
                        onInsertEmoji: { vm.insertEmoji($0) },
                        onNearby: { vm.nearbySearch() },
                        onTonight: { vm.sendQuickPrompt(
                            localization.language.rawValue == "en"
                            ? "Tonight I want a relaxing spa then a nice dinner, 2 people, budget around 800k — plan it for me!"
                            : "Tối nay mình muốn spa thư giãn rồi ăn tối ngon, 2 người, budget khoảng 800k, gợi ý lịch trình giúp mình nhé"
                        ) },
                        onTripPrefill: {
                            vm.inputText = localization.language.rawValue == "en"
                            ? "Itinerary for "
                            : "Lịch trình "
                        },
                        onPriceWatchPrefill: {
                            vm.inputText = localization.language.rawValue == "en"
                            ? "Tappy, track "
                            : "Tappy theo dõi "
                        }
                    )
                    // Blocked under 18: the input is locked (and send() refuses too).
                    .disabled(vm.isAgeBlocked)
                    .opacity(vm.isAgeBlocked ? 0.4 : 1)
                    .accessibilityHint(vm.isAgeBlocked ? Text("chat.age.blocked.title") : Text(verbatim: ""))
                }
            }
            .background(TappyColor.background)

            // Image zoom lightbox
            if let url = vm.zoomedImageUrl {
                ImageZoomView(url: url) {
                    vm.zoomedImageUrl = nil
                }
                .transition(.opacity)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $vm.shareArtifact) { artifact in
            TappyShareSheet(artifact: artifact, lang: localization.language.rawValue, planShare: vm.planShare) {
                vm.shareArtifact = nil
            }
            .presentationDetents([.large])
        }
        // The 18+ gate as its own screen (mockup "Xác nhận bạn đủ 18 tuổi"). Closing it leaves the
        // inline prompt in the message list, which still offers the same fields (and, for a blocked
        // account, the one-time correction).
        // Another screen asked the chat to send something (recommendation "Hỏi Tappy về chỗ này").
        .onChange(of: router.chatSeed) { seed in
            guard let seed, !vm.isStreaming else { return }
            router.chatSeed = nil
            vm.sendQuickPrompt(seed)
        }
        // Signed in from the «sign in to continue» card: the held message goes out now, in place.
        .onChange(of: router.loginCompleted) { _ in vm.resumeAfterLogin() }
        .onChange(of: vm.error) { newError in
            ageScreen = newError?.isAgeGate ?? false
        }
        .fullScreenCover(isPresented: $ageScreen) {
            AgeCheckView(
                isGuest: vm.isGuest,
                blocked: vm.isAgeBlocked,
                submitting: vm.ageSubmitting,
                formError: vm.ageFormError,
                onSubmit: { d, m, y in
                    if vm.isGuest {
                        if let iso = DateOfBirthInput.iso(day: d, month: m, year: y) {
                            vm.declareGuestAge(iso)
                        } else {
                            vm.ageFormError = NSLocalizedString("chat.age.error.invalid", comment: "")
                        }
                    } else {
                        Task { await vm.submitDateOfBirth(day: d, month: m, year: y) }
                    }
                },
                onEdit: { vm.clearAgeFormError() },
                onClose: { ageScreen = false }
            )
        }
        .sheet(isPresented: $vm.showOnboarding) {
            OnboardingSheet { prefs in
                vm.completeOnboarding(prefs: prefs)
            }
            .presentationDetents([.large])
        }
        .fullScreenCover(isPresented: $showVoice) {
            // The listening screen owns its own recogniser. «Gửi» hands over the RECOGNISED text only; while a reply is
            // still streaming it goes into the box instead, so it is never lost and never sent over a running reply.
            VoiceListeningView(
                voice: VoiceInputManager(),
                sendText: { text in
                    if vm.isStreaming { vm.inputText = text } else { vm.sendQuickPrompt(text) }
                },
                close: { showVoice = false }
            )
        }
        .task {
            vm.restorePendingChat()
            if vm.conversationId != nil && vm.messages.isEmpty {
                await vm.loadConversation()
            }
            await vm.fetchInitialData()
            if let seed = router.chatSeed, !vm.isStreaming {
                router.chatSeed = nil
                vm.sendQuickPrompt(seed)
            }
        }
        .onDisappear {
            vm.tts.stop()
            // Leaving the screen releases the microphone but does NOT hand the text on: nothing is auto-sent after the person has left.
            vm.voice.cancelListening()
        }
    }
}
