import SwiftUI

/// The V3 Home — iOS follows Android's approved layout (owner L12, 30/09), not the web's:
///
///   hero → ask bar → 6 quick suggestions → recommendations rail → discover banner →
///   Scam Shield → deals → community videos → categories → suggestions → recent activity →
///   Smart Tools
///
/// 🚨 HOME IS NOT CHAT. Every entry point switches to Chat (optionally with a prompt through
/// `router.chatSeed`) or pushes an existing screen — nothing streams a reply here.
struct HomeView: View {
    @AppStateObject private var vm: HomeViewModel
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var localization: LocalizationManager

    init(deps: AppDependencies) {
        _vm = AppStateObject(wrappedValue: HomeViewModel(
            home: HomeService(api: deps.api), places: PlacesService(api: deps.api),
            deals: DealsService(api: deps.api), reviews: ReviewsService(api: deps.api),
            profile: ProfileService(api: deps.api), session: deps.session))
    }

    private var hero: HeroGreeting {
        let english = localization.language.rawValue != "vi"
        return HeroGreeting.make(
            engineText: HomeGreeting.heroText(at: Date(), english: english),
            userName: vm.userName,
            named: { String(format: NSLocalizedString("home.v3.greetingNamed", comment: ""), $0) },
            generic: { NSLocalizedString("home.v3.greetingGeneric", comment: "") })
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 20) {
                    HomeGreetingSection(hero: hero)
                    HomeAskBar { router.switchTo(.chat) }
                }
                HomeSuggestedPromptsSection(onOpenChat: { router.switchTo(.chat) }) { action in
                    switch action.target {
                    case .chat(let key): ask(NSLocalizedString(key, comment: ""))
                    case .destination(let dest): router.push(dest, on: .home)
                    }
                }
                if case .loaded(let recs) = vm.recommendations {
                    HomeRecommendationsSection(items: recs) { router.push(HomeDestination.recommendations, on: .home) }
                }
                HomeDiscoverBanner { router.switchTo(.deals) }
                HomeScamShieldSection { router.push(HomeScamShieldSection.destination, on: .home) }
                HomeDealsSection(rail: vm.deals) { router.switchTo(.deals) }
                if case .loaded(let videos) = vm.videos {
                    HomeVideosSection(videos: videos) { router.switchTo(.explore) }
                }
                HomeCategoriesSection { router.push(HomeDestination.categoryChat($0), on: .home) }
                HomeSuggestionsSection { ask($0) }
                HomeRecentConversationsSection(rail: vm.recent, language: localization.language.rawValue) {
                    router.push(HomeDestination.conversation(id: $0), on: .home)
                }
                HomeQuickActionsSection(onOpen: { router.push($0.destination, on: .home) },
                                      onSeeAll: { router.push(HomeDestination.smartTools, on: .home) })
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .frame(maxWidth: 720)
            .frame(maxWidth: .infinity)
        }
        .background(HomeV3.background.ignoresSafeArea())
        .refreshable { await vm.refresh(lang: localization.language.rawValue) }
        .task { await vm.refresh(lang: localization.language.rawValue) }
    }

    /// Opens Chat and sends `prompt` there (the chat view consumes `chatSeed`).
    private func ask(_ prompt: String) {
        router.chatSeed = prompt
        router.switchTo(.chat)
    }
}
