import Foundation

@MainActor
final class HomeViewModel: AppObservableObject {
    enum LoadState: Equatable { case idle, loading, loaded, failed }

    @AppPublished var suggestedPromptsState: LoadState = .idle
    @AppPublished var recentConversationsState: LoadState = .idle

    @AppPublished var suggestedPrompts: [SuggestedPrompt] = []
    @AppPublished var recentConversations: [ConversationSummary] = []

    private let service: HomeService
    private let session: SessionStore

    init(service: HomeService, session: SessionStore) {
        self.service = service
        self.session = session
    }

    var isAuthenticated: Bool { session.state.isAuthenticated }

    func greeting(locale: String) -> String {
        switch locale {
        case "vi":
            return isAuthenticated ? "Xin chào, bạn 👋" : "Chào mừng đến với TappyAI 👋"
        default:
            return isAuthenticated ? "Hi there 👋" : "Welcome to TappyAI 👋"
        }
    }

    func loadSuggestedPrompts() async {
        suggestedPromptsState = .loading
        do {
            suggestedPrompts = try await service.suggestedPrompts()
            suggestedPromptsState = .loaded
        } catch {
            suggestedPromptsState = Task.isCancelled ? .idle : .failed
        }
    }

    func loadRecentConversations() async {
        guard isAuthenticated else {
            recentConversationsState = .loaded
            return
        }
        recentConversationsState = .loading
        do {
            recentConversations = try await service.conversations()
            recentConversationsState = .loaded
        } catch {
            recentConversationsState = Task.isCancelled ? .idle : .failed
        }
    }

    func refresh() async {
        async let p: () = loadSuggestedPrompts()
        async let c: () = loadRecentConversations()
        _ = await (p, c)
    }
}
