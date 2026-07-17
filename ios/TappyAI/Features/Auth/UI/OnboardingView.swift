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
        let locale = LocalizationManager().currentLanguage
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
                    presentation: .init(title: "Không tải được cấu hình",
                                        message: "Kiểm tra kết nối mạng rồi thử lại.",
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

    private var interestsStep: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Bạn quan tâm điều gì?").font(TappyFont.largeTitle).foregroundStyle(TappyColor.textPrimary)
            Text("Chọn vài mục để Tappy gợi ý tốt hơn.").font(TappyFont.callout).foregroundStyle(TappyColor.textSecondary)
            FlowChips(options: vm.interestOptions.map { ($0.id, $0.label) },
                      selected: vm.selectedInterests) { vm.toggle($0) }
        }
    }

    private var cityStep: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Bạn ở thành phố nào?").font(TappyFont.largeTitle).foregroundStyle(TappyColor.textPrimary)
            TappyTextField(titleKey: "Thành phố", text: $vm.city)
            FlowChips(options: vm.cityOptions.map { ($0, $0) },
                      selected: Set([vm.city])) { vm.city = $0 }
        }
    }

    private var footer: some View {
        HStack(spacing: Spacing.sm) {
            Button("Bỏ qua") { Task { await advanceOrFinish() } }.buttonStyle(.tappy(.tertiary))
            Button(vm.step == 1 ? "Tiếp tục" : "Hoàn tất") { Task { await advanceOrFinish() } }
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
