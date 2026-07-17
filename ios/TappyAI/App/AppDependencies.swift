import SwiftUI
import Supabase

/// Composition root — the single place that wires concrete implementations together at launch
/// (pragmatic DI, ADR-001/008). Exposes the app-scoped stores injected into the SwiftUI environment,
/// and registers cross-cutting services in `DIContainer` for non-View code.
@MainActor
final class AppDependencies: AppObservableObject {
    let env: AppEnvironment
    let session: SessionStore
    let router: AppRouter
    let theme: ThemeManager
    let localization: LocalizationManager
    let api: APIClient
    let streaming: StreamingClient
    let deepLinks: DeepLinkHandler
    let entitlements: EntitlementService
    let paymentProvider: StoreKitProvider
    let supabase: SupabaseClient
    let authService: AuthService
    let authRepository: AuthRepository
    let configService: AppConfigService
    let notificationManager: NotificationManager

    init(env: AppEnvironment = .current) {
        self.env = env

        // Infrastructure + auth engine first, so SessionStore can delegate refresh to the SDK.
        let supabase = SupabaseClientProvider.make(env)
        let authService = SupabaseAuthService(supabase: supabase)

        // SessionStore is the single JWT authority; refresh is SDK-backed (ADR-004/005).
        let session = SessionStore(storage: KeychainTokenStorage(),
                                   refresher: SupabaseTokenRefreshing(auth: authService))
        let interceptor = AuthInterceptor(provider: SessionAuthProvider(session: session))
        let api = URLSessionAPIClient(baseURL: env.apiBaseURL, auth: interceptor)

        let configService = AppConfigService(api: api)

        self.supabase = supabase
        self.authService = authService
        self.session = session
        self.api = api
        self.configService = configService
        self.streaming = URLSessionStreamingClient(baseURL: env.apiBaseURL, auth: interceptor)
        let router = AppRouter()
        let deepLinks = DeepLinkHandler()
        self.router = router
        self.theme = ThemeManager()
        self.localization = LocalizationManager()
        self.deepLinks = deepLinks
        self.entitlements = ServerEntitlementService(api: api)
        self.paymentProvider = StoreKitProvider(api: api)
        self.notificationManager = NotificationManager(api: api, deepLinks: deepLinks, router: router)

        // Auth feature wiring (Phase 1).
        let webAuth = WebAuthenticator()
        self.authRepository = AuthRepository(
            auth: authService,
            anon: AnonymousSessionService(api: api, auth: authService),
            gate: ProfileGateService(supabase: supabase),
            onboarding: OnboardingService(api: api),
            zalo: ZaloAuthController(apiBaseURL: env.apiBaseURL, webAuth: webAuth, callbackScheme: "tappyai"),
            webAuth: webAuth,
            session: session
        )

        registerServices()
        AppLogger.app.info("Dependencies composed (env=\(env.kind.rawValue))")
    }

    private func registerServices() {
        let c = DIContainer.shared
        c.register(APIClient.self, instance: api)
        c.register(StreamingClient.self, instance: streaming)
        c.register(EntitlementService.self, instance: entitlements)
        c.register(SupabaseClient.self, instance: supabase)
        c.register(AppConfigService.self, instance: configService)
        c.register(NotificationManager.self, instance: notificationManager)
    }

    /// Fast, synchronous launch routing (F12): read Keychain, pick the root, no blocking network.
    /// Then asynchronously reconcile with the SDK session / obtain an anonymous session (survey §6).
    func bootstrap() {
        AppLogger.performance.measure("bootstrap") { session.bootstrap() }
        Task { await authRepository.reconcileOnLaunch() }
        Task { await notificationManager.registerIfAuthorized() }
    }

    func handleDeepLink(_ urlOrPath: String) {
        if let target = deepLinks.target(for: urlOrPath) { router.handle(target) }
    }
}
