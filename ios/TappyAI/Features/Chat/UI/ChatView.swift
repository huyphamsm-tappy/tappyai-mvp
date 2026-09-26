import SwiftUI

/// The Chat tab root. New conversation (empty messages) or existing conversation (loaded messages).
struct ChatView: View {
    @AppStateObject private var vm: ChatViewModel
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var localization: LocalizationManager

    init(deps: AppDependencies, category: String = "general",
         conversationId: String? = nil, savedMessages: [Conversation.ConversationMessage]? = nil) {
        let service = ChatService(api: deps.api, streaming: deps.streaming)
        let session = deps.session
        _vm = AppStateObject(wrappedValue: ChatViewModel(
            service: service, session: session,
            category: category, conversationId: conversationId,
            savedMessages: savedMessages,
            planShare: PlanShareService(api: deps.api, isAuthenticated: { session.state.isAuthenticated })
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
                        onLogin: { vm.stashPendingChat(); router.switchTo(.profile) },
                        onLike: { vm.likeFeedback(messageIndex: $0, isActive: $1) },
                        onDislike: { vm.dislikeFeedback(messageIndex: $0, isActive: $1) },
                        onReport: { vm.reportFeedback(messageIndex: $0) },
                        onSavePlaceManual: { vm.savePlaceManual(name: $0) },
                        onSavePlaceFavorite: { vm.savePlaceFavorite(placeId: $0, name: $1, address: $2, type: $3) },
                        onZoomImage: { vm.zoomedImageUrl = $0 }
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
                        onToggleVoice: { vm.toggleVoice() },
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
        .sheet(isPresented: $vm.showOnboarding) {
            OnboardingSheet { prefs in
                vm.completeOnboarding(prefs: prefs)
            }
            .presentationDetents([.large])
        }
        .task {
            vm.restorePendingChat()
            if vm.conversationId != nil && vm.messages.isEmpty {
                await vm.loadConversation()
            }
            await vm.fetchInitialData()
        }
        .onDisappear {
            vm.tts.stop()
            vm.voice.stopListening()
        }
    }
}
