import SwiftUI
import Combine

/// The application shell — the real navigation architecture (ADR-002): a 5-tab `TabView` with a
/// `NavigationStack` per tab, driven by `AppRouter`. Future feature roots attach here.
///
/// Phase 1 adds a **temporary account entry** (person toolbar button) so the auth flow is reachable
/// and testable — it is auth surface only, NOT the Profile feature. It is replaced when Profile /
/// login-gated actions land in later phases. Diagnostics stays DEBUG-only.
struct PlaceholderShellView: View {
    @AppEnvironmentState private var deps: AppDependencies
    @AppEnvironmentState private var session: SessionStore
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var notificationCenter: NotificationCenterStore

    @State private var showSignOut = false
    @State private var showHistory = false
    /// Bumped by «Cuộc trò chuyện mới»: the Chat tab root is rebuilt with an empty conversation.
    @State private var chatEpoch = 0
    @State private var showDiagnostics = false

    var body: some View {
        TabView(selection: $router.selectedTab) {
            ForEach(AppTab.allCases) { tab in
                NavigationStack(path: router.path(for: tab)) {
                    tabRoot(for: tab)
                        // Registered for EVERY tab, on purpose. A review detail is opened from
                        // Explore, from Profile (favourites, my posts) and from Home; a public
                        // profile is opened from a review's author row, from people search and
                        // from a comment. A destination registered on one tab's root can only be
                        // pushed on that tab — which is how Deals ended up unreachable — and the
                        // back stack should stay inside the tab the user was already in.
                        .navigationDestination(for: ReviewsDestination.self) { dest in
                            switch dest {
                            case .reviewDetail(let id):
                                ReviewDetailView(deps: deps, reviewId: id)
                            case .clipViewer(let seedId, let start):
                                ReviewsFeedView(deps: deps, seed: ClipSeed(posts: ClipSeedStore.posts(for: seedId), start: start))
                            case .userProfile(let id):
                                UserProfileView(deps: deps, userId: id)
                            case .group(let id):
                                GroupDetailView(deps: deps, groupId: id)
                            case .copyrightPolicy:
                                CopyrightPolicyView()
                            }
                        }
                        // A Messenger conversation, registered for EVERY tab for the same reason: it opens from the Inbox, from another
                        // person's profile (on whichever tab the person is) and from a notification link.
                        .navigationDestination(for: MessagingDestination.self) { dest in
                            switch dest {
                            case .thread(let id):
                                ThreadView(deps: deps, threadId: id)
                            }
                        }
                        .navigationTitle(tab == .explore ? "" : LocalizedStringKey(tab.titleKey))
                        .navigationBarTitleDisplayMode(.inline)
                        .navigationBarHidden(tab == .explore)
                        .toolbar {
                            if tab != .explore {
                                ToolbarItem(placement: .navigationBarLeading) {
                                    Button { accountTapped() } label: {
                                        Image(systemName: session.state.isAuthenticated
                                              ? "person.crop.circle.fill" : "person.crop.circle")
                                    }
                                    .accessibilityLabel(Text(NSLocalizedString("account.title", comment: "")))
                                }
                            }
                            // The Chat screen carries the web's two chat-workspace actions (the web's history sidebar sits beside the chat):
                            // «Lịch sử trò chuyện» (a sheet with the history) and «Cuộc trò chuyện mới».
                            if tab == .chat {
                                ToolbarItemGroup(placement: .navigationBarTrailing) {
                                    Button { chatEpoch += 1 } label: { Image(systemName: "square.and.pencil") }
                                        .accessibilityLabel(Text("chat.new"))
                                        .accessibilityIdentifier("chat-new")
                                    Button { showHistory = true } label: { Image(systemName: "clock.arrow.circlepath") }
                                        .accessibilityLabel(Text("history.title"))
                                        .accessibilityIdentifier("chat-history")
                                }
                            }
                            // The bell (owner UAT: «thông báo có 2 tin nhưng vào xem không biết xem ở đâu»): the red number was
                            // on the Profile tab and the list two taps deeper. Now every tab has a bell with the same number that
                            // opens the Inbox directly (Android has the bell on Home; the web has it in the header).
                            if tab != .explore && session.state.isAuthenticated {
                                ToolbarItem(placement: .navigationBarTrailing) {
                                    Button { openInbox() } label: {
                                        Image(systemName: "bell.fill")
                                            .overlay(alignment: .topTrailing) {
                                                if notificationCenter.badgeCount > 0 {
                                                    Text(notificationCenter.badgeCount > 99 ? "99+" : "\(notificationCenter.badgeCount)")
                                                        .font(.system(size: 10, weight: .bold))
                                                        .foregroundStyle(.white)
                                                        .padding(.horizontal, 4)
                                                        .frame(minWidth: 16, minHeight: 16)
                                                        .background(Capsule().fill(Color.red))
                                                        .offset(x: 9, y: -8)
                                                }
                                            }
                                    }
                                    .accessibilityLabel(Text("notif.bell"))
                                    .accessibilityValue(Text(verbatim: notificationCenter.badgeCount > 0 ? "\(notificationCenter.badgeCount)" : ""))
                                    .accessibilityIdentifier("inbox-bell")
                                }
                            }
                            #if DEBUG
                            if tab != .explore && !UITestLaunch.isAppStoreShot {
                                ToolbarItem(placement: .navigationBarTrailing) {
                                    Button { showDiagnostics = true } label: { Image(systemName: "ladybug") }
                                        .accessibilityLabel(Text("Diagnostics"))
                                }
                            }
                            #endif
                        }
                }
                .tabItem { Label(LocalizedStringKey(tab.titleKey), systemImage: tab.systemImage) }
                // The inbox lives under Profile; 0 hides the badge. The count is the app-level store's (it keeps updating off that screen).
                // 2026-11-04: it counts the unread MESSAGES too, once each (web `badgeTotal`).
                .badge(tab == .profile ? notificationCenter.badgeCount : 0)
                .tag(tab)
            }
        }
        .onChange(of: session.state.isAuthenticated) { signedIn in
            if !signedIn { router.resetAfterSignOut() }
        }
        .modifier(AIConsentSheet(consent: deps.aiConsent))
        .sheet(isPresented: $showHistory) {
            NavigationStack {
                ChatHistoryView(deps: deps, onOpen: { showHistory = false })
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("common.close") { showHistory = false }
                        }
                    }
            }
        }
        // «Có bản mới»: the App Store lists a newer version (suggest), or the server requires one (require).
        .appUpdatePrompt(config: deps.configService)
        // Sends any AI-consent decision the server has not accepted yet (after sign-in, or after a failed send), and each
        // new decision as it is made.
        .task(id: session.state.isAuthenticated) {
            await AIConsentSync.flush(api: deps.api, signedIn: session.state.isAuthenticated)
        }
        // The unread badge follows who is signed in: counts on sign-in and on launch, drops to 0 and lets go of the live channel on sign-out.
        .task(id: session.state.isAuthenticated) {
            await notificationCenter.sessionChanged()
            if session.state.isAuthenticated { await deps.paymentProvider.retryUnfinished() }
        }
        .onReceive(NotificationCenter.default.publisher(for: AIConsentStore.didChange)) { _ in
            Task { await AIConsentSync.flush(api: deps.api, signedIn: session.state.isAuthenticated) }
        }
        .fullScreenCover(isPresented: $router.showLogin) {
            AuthFlowView(repo: deps.authRepository, config: deps.configService) { router.loginFinished(signedIn: session.state.isAuthenticated) }
        }
        .alert(Text("auth.sessionExpired.title"), isPresented: Binding(
            get: { session.notice == .sessionExpired },
            set: { if !$0 { session.clearNotice() } }
        )) {
            Button { session.clearNotice(); router.requestLogin() } label: { Text("auth.signIn") }
            Button(role: .cancel) { session.clearNotice() } label: { Text("common.close") }
        } message: {
            Text("auth.sessionExpired.message")
        }
        .confirmationDialog(NSLocalizedString("account.title", comment: ""), isPresented: $showSignOut, titleVisibility: .visible) {
            Button(NSLocalizedString("auth.signOut", comment: ""), role: .destructive) { Task { await deps.authRepository.signOut() } }
            Button(NSLocalizedString("common.cancel", comment: ""), role: .cancel) {}
        }
        #if DEBUG
        .sheet(isPresented: $showDiagnostics) {
            NavigationStack { FoundationDiagnosticsView() }
        }
        #endif
    }

    @ViewBuilder
    private func tabRoot(for tab: AppTab) -> some View {
        switch tab {
        case .home:
            HomeView(deps: deps)
                .navigationDestination(for: HomeDestination.self) { dest in
                    switch dest {
                    case .conversation(let id):
                        ChatView(deps: deps, conversationId: id)
                    case .currency:
                        CurrencyView(deps: deps)
                    case .translate:
                        // Hidden by ProductFlags.showTranslate (owner decision 2026-10-25): nothing to show.
                        if ProductFlags.showTranslate { TranslateView(deps: deps) } else { EmptyView() }
                    case .scan:
                        ScanView(deps: deps)
                    case .scamShield:
                        ScamShieldView(deps: deps)
                    case .vietContent:
                        // Hidden by ProductFlags.showVietContent (owner decision 2026-10-25): nothing to show.
                        if ProductFlags.showVietContent { VietContentView(deps: deps) } else { EmptyView() }
                    case .splitBill:
                        SplitBillView()
                    case .fortune:
                        FortuneHubView(deps: deps)
                    case .recommendations:
                        RecommendationsView(deps: deps)
                    case .serviceDetail(let service):
                        ServiceDetailView(service: service, deps: deps)
                    case .favorites:
                        FavoritesView(deps: deps)
                    case .smartTools:
                        SmartToolsView()
                    case .groupDining:
                        GroupDiningView(deps: deps)
                    case .categoryChat(let category):
                        ChatView(deps: deps, category: category)
                    }
                }
        case .chat:
            // A new `id` builds a fresh ChatView and view model: «Cuộc trò chuyện mới».
            ChatView(deps: deps).id(chatEpoch)
        case .explore:
            ReviewsFeedView(deps: deps)
        // C31 — Deals had NO case here, so a top-level tab every user can press fell through to
        // `default:` and rendered "Coming soon", while a complete DealsView + DealsService +
        // DealsViewModel sat in the tree with zero references. One missing line.
        case .deals:
            DealsView(deps: deps)
        case .profile:
            ProfileMainView(deps: deps)
                .navigationDestination(for: ProfileDestination.self) { dest in
                    switch dest {
                    case .accountMenu:
                        AccountMenuView(deps: deps)
                    case .account:
                        AccountView(deps: deps)
                    case .editProfile:
                        EditProfileView(deps: deps)
                    case .settings:
                        ProfileSettingsView(deps: deps)
                    case .history:
                        ChatHistoryView(deps: deps)
                    case .bookings:
                        BookingsView(deps: deps)
                    case .preferences:
                        PreferencesView(deps: deps)
                    case .favorites:
                        FavoritesView(deps: deps)
                    case .priceWatches:
                        PriceWatchesView(deps: deps)
                    case .tappyKnows:
                        TappyKnowsView(deps: deps)
                    case .integrations:
                        IntegrationsView(deps: deps)
                    case .notifications:
                        NotificationsSettingsView(deps: deps)
                    case .subscription:
                        SubscriptionView(deps: deps)
                    case .privacy:
                        PrivacyPolicyView()
                    case .terms:
                        TermsOfServiceView()
                    case .howToUse:
                        HowToUseView()
                    case .myPosts:
                        MyPostsView(deps: deps)
                    case .notificationsInbox:
                        // "Tin nhắn | Thông báo", like the web Inbox.
                        InboxContainerView(deps: deps)
                    case .userSearch:
                        UserSearchView(deps: deps)
                    case .planner:
                        PlannerView(deps: deps)
                    case .social:
                        SocialView(deps: deps)
                    case .groupDining:
                        GroupDiningView(deps: deps)
                    case .blockedAccounts:
                        BlockedAccountsView(deps: deps)
                    case .moderationNotices:
                        ModerationNoticesView(deps: deps)
                    }
                }
        default:
            PlaceholderTabView(tab: tab)
        }
    }

    /// The bell: the Inbox ("Tin nhắn | Thông báo") on the Profile stack, from whichever tab the person is on.
    private func openInbox() {
        router.popToRoot(on: .profile)
        router.switchTo(.profile)
        router.push(ProfileDestination.notificationsInbox, on: .profile)
    }

    private func accountTapped() {
        if session.state.isAuthenticated { showSignOut = true } else { router.requestLogin() }
    }
}
