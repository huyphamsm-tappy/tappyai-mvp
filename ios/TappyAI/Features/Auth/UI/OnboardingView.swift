import SwiftUI

@MainActor
final class OnboardingViewModel: AppObservableObject {
    enum LoadState: Equatable { case loading, loaded, failed }

    @AppPublished var loadState: LoadState = .loading
    @AppPublished var interestOptions: [(id: String, label: String)] = []
    @AppPublished var cityOptions: [String] = []

    @AppPublished var step = 1
    @AppPublished var selectedInterests: Set<String> = []
    @AppPublished var city = ""
    @AppPublished var isWorking = false
    @AppPublished var errorMessage: String?

    private let repo: AuthRepository
    private let config: AppConfigService

    init(repo: AuthRepository, config: AppConfigService) {
        self.repo = repo
        self.config = config
    }

    func loadOptions() async {
        loadState = .loading
        let locale = LocalizationManager.currentLanguageCode
        do {
            interestOptions = try await config.onboardingInterests(locale: locale)
            cityOptions = try await config.onboardingCities()
            loadState = .loaded
        } catch {
            AppLogger.network.info("onboarding config load failed")
            loadState = .failed
        }
    }

    func toggle(_ id: String) {
        if selectedInterests.contains(id) { selectedInterests.remove(id) } else { selectedInterests.insert(id) }
    }

    /// Both steps are cosmetically skippable; the server always sets `onboarded=true` (survey §1.9).
    func finish() async {
        isWorking = true; errorMessage = nil
        defer { isWorking = false }
        do {
            try await repo.submitOnboarding(interests: Array(selectedInterests), city: city)
        } catch let e as AppError {
            errorMessage = ErrorPresenter.present(e).message
        } catch {
            errorMessage = ErrorPresenter.present(.unexpected(message: error.localizedDescription)).message
        }
    }
}

/// Shown at the app root when `SessionStore.state == .onboarding` (first-time auth). Not a Profile
/// feature — it is the auth-gated onboarding step (survey §1.7/§1.9).
struct OnboardingView: View {
    @AppStateObject private var vm: OnboardingViewModel

    init(repo: AuthRepository, config: AppConfigService) {
        _vm = AppStateObject(wrappedValue: OnboardingViewModel(repo: repo, config: config))
    }

    var body: some View {
        Group {
            switch vm.loadState {
            case .loading:
                VStack { Spacer(); TappyLoadingIndicator(); Spacer() }
                    .frame(maxWidth: .infinity)
            case .failed:
                TappyErrorState(
                    presentation: .init(title: NSLocalizedString("onboarding.error.configTitle", comment: ""),
                                        message: NSLocalizedString("onboarding.error.configBody", comment: ""),
                                        retryable: true),
                    onRetry: { Task { await vm.loadOptions() } }
                )
            case .loaded:
                loadedContent
            }
        }
        .background(TappyColor.background)
        .task { await vm.loadOptions() }
    }

    private var loadedContent: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            progressHeader
            if vm.step == 1 { interestsStep } else { cityStep }
            Spacer()
            if let error = vm.errorMessage {
                Text(error).font(TappyFont.footnote).foregroundStyle(TappyColor.danger)
            }
            footer
        }
        .padding(Spacing.md)
        .overlay { if vm.isWorking { TappyLoadingIndicator() } }
    }

    /// Brand mark, a 2-segment progress bar and the real counter "Bước 1/2" (owner 2026-09-28: the
    /// counter shows the steps this wizard really has — Android `OnboardingScreen.ProgressBar`).
    private var progressHeader: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image("TappyAILogo").resizable().scaledToFit().frame(width: 40, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityHidden(true)
                (Text("Tappy").foregroundColor(TappyColor.textPrimary) + Text("AI").foregroundColor(TappyColor.primary))
                    .font(.system(size: 19, weight: .black))
            }
            HStack(spacing: 6) {
                ForEach(1...2, id: \.self) { s in
                    Capsule().fill(s <= vm.step ? TappyColor.primary : TappyColor.border).frame(height: 4)
                }
            }
            Text(String(format: NSLocalizedString("onboarding.stepCounter", comment: ""), vm.step, 2))
                .font(.system(size: 12, weight: .medium)).foregroundStyle(TappyColor.textSecondary)
                .accessibilityIdentifier("onboarding-step-counter")
        }
    }

    private var interestsStep: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(NSLocalizedString("onboarding.interests.title", comment: "")).font(TappyFont.largeTitle).foregroundStyle(TappyColor.textPrimary)
            Text(NSLocalizedString("onboarding.interests.subtitle", comment: "")).font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary)
            FlowChips(options: vm.interestOptions.map { ($0.id, $0.label) },
                      selected: vm.selectedInterests) { vm.toggle($0) }
        }
    }

    private var cityStep: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text(NSLocalizedString("onboarding.city.title", comment: "")).font(TappyFont.largeTitle).foregroundStyle(TappyColor.textPrimary)
            TappyTextField(titleKey: "onboarding.city.field", text: $vm.city)
            FlowChips(options: vm.cityOptions.map { ($0, $0) },
                      selected: Set([vm.city])) { vm.city = $0 }
        }
    }

    private var footer: some View {
        HStack(spacing: Spacing.sm) {
            Button(NSLocalizedString("common.skip", comment: "")) { Task { await advanceOrFinish() } }.buttonStyle(.tappy(.tertiary))
            Button(vm.step == 1 ? NSLocalizedString("common.continue", comment: "") : NSLocalizedString("common.done", comment: "")) { Task { await advanceOrFinish() } }
                .buttonStyle(.tappy(.primary))
        }
    }

    private func advanceOrFinish() async {
        if vm.step == 1 { vm.step = 2 } else { await vm.finish() }
    }
}

/// Simple wrapping chip selector used by onboarding.
private struct FlowChips: View {
    let options: [(id: String, label: String)]
    let selected: Set<String>
    let onTap: (String) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: Spacing.xs)], alignment: .leading, spacing: Spacing.xs) {
            ForEach(options, id: \.id) { option in
                let isOn = selected.contains(option.id)
                Text(option.label)
                    .font(TappyFont.callout)
                    .padding(.horizontal, Spacing.sm).padding(.vertical, Spacing.xs)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(isOn ? TappyColor.primary : TappyColor.surface)
                    .foregroundStyle(isOn ? TappyColor.onPrimary : TappyColor.textPrimary)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.pill, style: .continuous))
                    .onTapGesture { onTap(option.id) }
            }
        }
    }
}
