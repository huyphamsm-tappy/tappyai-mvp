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
            // ── P4-11 · AI-FIRST HOME (DD-002 / OD-1) ────────────────────────────
            //
            // Order mirrors web and Android after V3's reorder: ask Tappy, then the suggestions
            // that turn a vague need into a question worth asking, then Continue, then the tools.
            // The quick actions and the recommendations card used to sit between the entry point
            // and the suggestions, so the conversation you were in the middle of came last.
            //
            // 🚨 HOME IS NOT CHAT. Every entry point here calls `router.switchTo(.chat)` or pushes
            // a destination — nothing renders a thread or streams a reply in place. Home is a
            // door, not a room.
            //
            // 🚨 NO TOOL WAS REMOVED (DD-002). Quick actions and the recommendations card are both
            // still here; they moved below the assistant, they did not go.
            VStack(alignment: .leading, spacing: Spacing.lg) {
                HomeGreetingSection(
                    greeting: vm.greeting(locale: localization.language.rawValue),
                    isAuthenticated: vm.isAuthenticated
                )

                // Ask Tappy — the primary action.
                HomeSearchSection {
                    router.switchTo(.chat)
                }

                HomeAIEntrySection {
                    router.switchTo(.chat)
                }

                // Contextual suggestions: the shortest path from "I need something" to a question.
                HomeSuggestedPromptsSection(
                    state: vm.suggestedPromptsState,
                    prompts: vm.suggestedPrompts,
                    onSelect: { _ in router.switchTo(.chat) },
                    onRetry: { Task { await vm.loadSuggestedPrompts() } }
                )

                HomeCategorySection { _ in
                    router.switchTo(.chat)
                }

                // Continue — a returning user mostly resumes.
                HomeRecentConversationsSection(
                    state: vm.recentConversationsState,
                    isAuthenticated: vm.isAuthenticated,
                    conversations: vm.recentConversations,
                    onSelect: { id in router.push(HomeDestination.conversation(id: id), on: .home) },
                    onNewChat: { router.switchTo(.chat) },
                    onSeeAll: { router.switchTo(.profile) },
                    onRetry: { Task { await vm.loadRecentConversations() } }
                )

                // "For You" (ND-001) is a discovery/content preview on EXISTING V3-available
                // sources. iOS has none wired, and the approved behaviour when nothing can fill
                // the section is to HIDE it — never to pad it with placeholder content. So there
                // is deliberately nothing here rather than an empty shell.

                // ── Tools ────────────────────────────────────────────────────────
                // De-emphasised, never removed.
                HomeQuickActionsSection { dest in
                    router.push(dest, on: .home)
                }

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
