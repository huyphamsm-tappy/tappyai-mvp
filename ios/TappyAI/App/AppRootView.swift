import SwiftUI

/// Session-driven root (ADR-002): Splash → (Root Router) → Onboarding | Placeholder Shell.
/// Phase 1 adds the real onboarding branch; feature roots still attach to the shell later.
struct AppRootView: View {
    @AppEnvironmentState private var deps: AppDependencies
    @AppEnvironmentState private var session: SessionStore
    @AppEnvironmentState private var theme: ThemeManager
    @AppEnvironmentState private var localization: LocalizationManager

    var body: some View {
        content
            .preferredColorScheme(theme.preferredColorScheme)
            .environment(\.locale, localization.locale)
            .environment(\.layoutDirection, localization.layoutDirection)
            .animation(.default, value: session.state)
    }

    @ViewBuilder private var content: some View {
        switch session.state {
        case .unknown:
            SplashView()
        case .onboarding:
            OnboardingView(repo: deps.authRepository, config: deps.configService)
        case .anonymous, .authenticated:
            PlaceholderShellView()
        }
    }
}
