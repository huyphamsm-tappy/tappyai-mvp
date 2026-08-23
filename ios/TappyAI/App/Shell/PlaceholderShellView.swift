import SwiftUI

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
    /// Read as its own environment object so the tab bar re-renders when the count changes.
    /// `deps.unreadNotifications` would compile here and never update — see the store's own note.
    @AppEnvironmentState private var unreadNotifications: UnreadNotificationsStore

    @State private var showAuth = false
    @State private var showSignOut = false
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
                            case .userProfile(let id):
                                UserProfileView(deps: deps, userId: id)
                            case .group(let id):
                                GroupDetailView(deps: deps, groupId: id)
                            case .copyrightPolicy:
                                CopyrightPolicyView()
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
                            #if DEBUG
                            if tab != .explore {
                                ToolbarItem(placement: .navigationBarTrailing) {
                                    Button { showDiagnostics = true } label: { Image(systemName: "ladybug") }
                                        .accessibilityLabel(Text("Diagnostics"))
                                }
                            }
                            #endif
                        }
                }
                .tabItem { Label(LocalizedStringKey(tab.titleKey), systemImage: tab.systemImage) }
                // The inbox lives under Profile (`ProfileDestination.notificationsInbox`), so the
                // badge goes on the tab that reaches it — web puts it on the tab hosting its own
                // inbox for the same reason. `.badge("")` would still draw a dot, so an empty
                // count must yield `nil`, not an empty string.
                .badge(unreadBadgeText(for: tab))
                .tag(tab)
            }
        }
        .fullScreenCover(isPresented: $showAuth) {
            AuthFlowView(repo: deps.authRepository, config: deps.configService) {
                showAuth = false
                // Signing in happens without the scene ever leaving `.active`, so the badge would
                // otherwise stay at zero until the next foregrounding.
                Task { await unreadNotifications.refresh() }
            }
        }
        .confirmationDialog(NSLocalizedString("account.title", comment: ""), isPresented: $showSignOut, titleVisibility: .visible) {
            Button(NSLocalizedString("auth.signOut", comment: ""), role: .destructive) {
                Task {
                    await deps.authRepository.signOut()
                    // Same reason in reverse: no scene transition, and the departing account's
                    // count must not stay on the tab bar for whoever signs in next.
                    unreadNotifications.clear()
                }
            }
            Button(NSLocalizedString("common.cancel", comment: ""), role: .cancel) {}
        }
        #if DEBUG
        .sheet(isPresented: $showDiagnostics) {
            NavigationStack { FoundationDiagnosticsView() }
        }
        #endif
    }

    /// Badge text for one tab, or `nil` for no badge at all.
    ///
    /// Capped at "99+" to match web's `BottomNav`; an uncapped four-digit count would widen the
    /// badge past the tab item. Returning `nil` rather than `""` matters: SwiftUI still renders a
    /// dot for an empty string, so a user with nothing unread would see a permanent marker.
    private func unreadBadgeText(for tab: AppTab) -> String? {
        guard tab == .profile, unreadNotifications.unreadCount > 0 else { return nil }
        return unreadNotifications.unreadCount > 99 ? "99+" : "\(unreadNotifications.unreadCount)"
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
                        TranslateView(deps: deps)
                    case .scan:
                        ScanView(deps: deps)
                    case .scamShield:
                        ScamShieldView(deps: deps)
                    case .vietContent:
                        VietContentView(deps: deps)
                    case .splitBill:
                        SplitBillView()
                    case .fortune:
                        FortuneHubView(deps: deps)
                    case .musicLibrary:
                        MusicLibraryView(deps: deps)
                    case .recommendations:
                        RecommendationsView(deps: deps)
                    case .serviceDetail(let service):
                        ServiceDetailView(service: service, deps: deps)
                    case .favorites:
                        FavoritesView(deps: deps)
                    }
                }
        case .chat:
            ChatView(deps: deps)
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
                        NotificationsInboxView(deps: deps)
                    case .userSearch:
                        UserSearchView(deps: deps)
                    case .groupDining:
                        GroupDiningView(deps: deps)
                    }
                }
        default:
            PlaceholderTabView(tab: tab)
        }
    }

    private func accountTapped() {
        if session.state.isAuthenticated { showSignOut = true } else { showAuth = true }
    }
}
