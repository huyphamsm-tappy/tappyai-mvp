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

    @State private var showAuth = false
    @State private var showSignOut = false
    @State private var showDiagnostics = false

    var body: some View {
        TabView(selection: $router.selectedTab) {
            ForEach(AppTab.allCases) { tab in
                NavigationStack(path: router.path(for: tab)) {
                    tabRoot(for: tab)
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
                                    .accessibilityLabel(Text("Tài khoản"))
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
                .tag(tab)
            }
        }
        .fullScreenCover(isPresented: $showAuth) {
            AuthFlowView(repo: deps.authRepository, config: deps.configService) { showAuth = false }
        }
        .confirmationDialog("Tài khoản", isPresented: $showSignOut, titleVisibility: .visible) {
            Button("Đăng xuất", role: .destructive) { Task { await deps.authRepository.signOut() } }
            Button("Huỷ", role: .cancel) {}
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
                        TranslateView(deps: deps)
                    case .scan:
                        ScanView(deps: deps)
                    case .vietContent:
                        VietContentView(deps: deps)
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
                    }
                }
        case .chat:
            ChatView(deps: deps)
        case .explore:
            ReviewsFeedView(deps: deps)
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
