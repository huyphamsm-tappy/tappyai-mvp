import SwiftUI

/// Shows the update notice on top of the app (see `AppUpdate`). Asks the App Store when the app opens and whenever it
/// comes back to the foreground after at least 6 hours; a «Để sau» silences that version for 24 hours.
struct AppUpdatePrompt: ViewModifier {
    let config: AppConfigService

    @Environment(\.scenePhase) private var scenePhase
    @State private var decision: UpdateDecision = .none
    private let memory = AppUpdateMemory()
    /// Do not ask the store more often than this.
    private static let recheck: TimeInterval = 6 * 3600

    private var suggested: StoreRelease? {
        if case .suggest(let release) = decision { return release }
        return nil
    }

    private var required: StoreRelease? {
        if case .require(let release) = decision { return release }
        return nil
    }

    func body(content: Content) -> some View {
        content
            .task { await check(force: false) }
            .onChange(of: scenePhase) { phase in
                if phase == .active { Task { await check(force: false) } }
            }
            .alert(Text("update.title"), isPresented: Binding(get: { suggested != nil }, set: { if !$0, let release = suggested { memory.snooze(version: release.version); decision = .none } })) {
                Button("update.now") { if let release = suggested { open(release) } }
                Button("update.later", role: .cancel) {}
            } message: {
                Text(String(format: NSLocalizedString("update.message", comment: ""), suggested?.version ?? ""))
            }
            .fullScreenCover(isPresented: Binding(get: { required != nil }, set: { _ in })) {
                if let release = required { requiredNotice(release) }
            }
    }

    private func requiredNotice(_ release: StoreRelease) -> some View {
        VStack(spacing: Spacing.md) {
            Image(systemName: "arrow.down.app.fill").font(.system(size: 54)).foregroundStyle(TappyColor.primary)
            Text("update.required.title").font(TappyFont.title).multilineTextAlignment(.center)
            Text(String(format: NSLocalizedString("update.required.message", comment: ""), release.version))
                .font(TappyFont.body).foregroundStyle(TappyColor.textSecondary).multilineTextAlignment(.center)
            Button("update.now") { open(release) }
                .buttonStyle(.tappy(.primary))
        }
        .padding(Spacing.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(TappyColor.background.ignoresSafeArea())
        .onChange(of: scenePhase) { phase in
            // Back from the store: ask again, so the notice goes away once the update is installed.
            if phase == .active { Task { await check(force: true) } }
        }
    }

    private func open(_ release: StoreRelease) { UIApplication.shared.open(release.url) }

    private func check(force: Bool) async {
        if !force, let last = memory.lastChecked, Date().timeIntervalSince(last) < Self.recheck, decision == .none { return }
        guard let bundleId = Bundle.main.bundleIdentifier,
              let installed = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String else { return }
        let store = await AppUpdate.fetchLatest(bundleId: bundleId)
        memory.markChecked()
        let minimum = (try? await config.config())?.flags.iosMinVersion
        decision = AppUpdate.decide(installed: installed, store: store, minimum: minimum,
                                    snoozedVersion: memory.snoozedVersion, snoozedAt: memory.snoozedAt, now: Date())
    }
}

extension View {
    /// The update notice (suggest / require). Applied once at the root of the signed-in app.
    func appUpdatePrompt(config: AppConfigService) -> some View { modifier(AppUpdatePrompt(config: config)) }
}
