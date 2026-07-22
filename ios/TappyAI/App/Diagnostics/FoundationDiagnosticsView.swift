import SwiftUI

/// A DEBUG-only diagnostics screen — NOT a product feature and NEVER the app root. It is presented
/// as a sheet from the shell in DEBUG builds only (see `PlaceholderShellView`). It exercises the
/// DesignSystem, theme/language switching, and shows session/env/entitlement state so the Phase 0
/// foundation can be verified on-device. It expects to be embedded in a `NavigationStack` by its
/// presenter (it does not create its own).
struct FoundationDiagnosticsView: View {
    @AppEnvironmentState private var deps: AppDependencies
    @AppEnvironmentState private var session: SessionStore
    @AppEnvironmentState private var theme: ThemeManager
    @AppEnvironmentState private var localization: LocalizationManager

    @State private var entitlement: Entitlement = .free
    @State private var showSheet = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                statusCard
                themeControls
                languageControls
                componentsShowcase
                stateShowcase
            }
            .padding(Spacing.md)
        }
        .background(TappyColor.background)
        .navigationTitle("Diagnostics")
        .navigationBarTitleDisplayMode(.inline)
        .task { entitlement = await deps.entitlements.current() }
        .tappyBottomSheet(isPresented: $showSheet) {
            VStack(spacing: Spacing.md) {
                Text("Bottom sheet (native detents)").font(TappyFont.headline)
                Button("common.retry") { showSheet = false }.buttonStyle(.tappy(.primary))
            }
            .padding(Spacing.lg)
        }
    }

    private var statusCard: some View {
        TappyCard {
            VStack(alignment: .leading, spacing: Spacing.xs) {
                row("Environment", deps.env.kind.rawValue)
                row("API base", deps.env.apiBaseURL.absoluteString)
                row("Supabase", deps.env.supabaseURL.absoluteString)
                row("Session", String(describing: session.state))
                row("Entitlement", entitlement.rawValue)
                row("Language", localization.language.displayName)
            }
        }
    }

    private var themeControls: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Theme").font(TappyFont.headline)
            Picker("Theme", selection: $theme.mode) {
                ForEach(ThemeMode.allCases) { Text($0.rawValue.capitalized).tag($0) }
            }
            .pickerStyle(.segmented)
        }
    }

    private var languageControls: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Language").font(TappyFont.headline)
            HStack {
                ForEach(AppLanguage.allCases) { lang in
                    Button(lang.displayName) { localization.setLanguage(lang) }
                        .buttonStyle(.tappy(localization.language == lang ? .primary : .tertiary))
                }
            }
        }
    }

    private var componentsShowcase: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Components").font(TappyFont.headline)
            Button("Primary") {}.buttonStyle(.tappy(.primary))
            Button("Secondary") {}.buttonStyle(.tappy(.secondary))
            Button("Show bottom sheet") { showSheet = true }.buttonStyle(.tappy(.tertiary))
        }
    }

    private var stateShowcase: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("States").font(TappyFont.headline)
            TappyCard { TappyEmptyState(systemImage: TappyIcon.empty, title: "Nothing here yet") }
            TappyCard {
                TappyErrorState(presentation: ErrorPresenter.present(.offline), onRetry: {})
            }
            HStack(spacing: Spacing.sm) {
                TappySkeleton().frame(height: 48)
                TappySkeleton().frame(height: 48)
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).font(TappyFont.footnote).foregroundStyle(TappyColor.textSecondary)
            Spacer()
            Text(value).font(TappyFont.footnote).foregroundStyle(TappyColor.textPrimary)
                .multilineTextAlignment(.trailing)
        }
    }
}
