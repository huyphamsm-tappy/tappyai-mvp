import SwiftUI

struct HomeView: View {
    @AppStateObject private var vm: HomeViewModel
    @AppEnvironmentState private var router: AppRouter
    @AppEnvironmentState private var localization: LocalizationManager

    init(deps: AppDependencies) {
        let service = HomeService(api: deps.api)
        _vm = AppStateObject(wrappedValue: HomeViewModel(service: service, session: deps.session))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                HomeGreetingSection(
                    greeting: vm.greeting(locale: localization.language.rawValue),
                    isAuthenticated: vm.isAuthenticated
                )

                HomeSearchSection {
                    router.switchTo(.chat)
                }

                HomeCategorySection { _ in
                    router.switchTo(.chat)
                }

                HomeAIEntrySection {
                    router.switchTo(.chat)
                }

                HomeQuickActionsSection { dest in
                    router.push(dest, on: .home)
                }

                HomeSuggestedPromptsSection(
                    state: vm.suggestedPromptsState,
                    prompts: vm.suggestedPrompts,
                    onSelect: { _ in router.switchTo(.chat) },
                    onRetry: { Task { await vm.loadSuggestedPrompts() } }
                )

                HomeRecentConversationsSection(
                    state: vm.recentConversationsState,
                    isAuthenticated: vm.isAuthenticated,
                    conversations: vm.recentConversations,
                    onSelect: { id in router.push(HomeDestination.conversation(id: id), on: .home) },
                    onNewChat: { router.switchTo(.chat) },
                    onSeeAll: { router.switchTo(.profile) },
                    onRetry: { Task { await vm.loadRecentConversations() } }
                )

                HomeRecommendationsCard {
                    router.push(HomeDestination.recommendations, on: .home)
                }
            }
            .padding(Spacing.md)
        }
        .background(TappyColor.background)
        .refreshable { await vm.refresh() }
        .task { await vm.refresh() }
    }
}
