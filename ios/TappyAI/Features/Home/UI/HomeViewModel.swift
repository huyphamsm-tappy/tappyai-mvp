import Foundation

/// Home's data (Android `HomeViewModel`): the display name for the hero, and four rails over
/// EXISTING endpoints — recommendations, deals, community videos, recent chats. Home is a
/// launchpad: every rail fails quietly to "nothing to show" instead of an error screen.
@MainActor
final class HomeViewModel: AppObservableObject {
    enum Rail<T> { case loading, loaded([T]), empty }

    @AppPublished var userName: String?
    @AppPublished var recommendations: Rail<Recommendation> = .loading
    @AppPublished var deals: Rail<PartnerDeal> = .loading
    @AppPublished var videos: Rail<Review> = .loading
    @AppPublished var recent: Rail<ConversationSummary> = .loading

    private let home: HomeService
    private let places: PlacesService
    private let dealsService: DealsService
    private let reviews: ReviewsService
    private let profile: ProfileService
    private let session: SessionStore

    static let recentLimit = 5
    static let dealsLimit = 6
    static let recommendationsLimit = 8
    static let videoLimit = 8

    init(home: HomeService, places: PlacesService, deals: DealsService, reviews: ReviewsService,
         profile: ProfileService, session: SessionStore) {
        self.home = home; self.places = places; self.dealsService = deals
        self.reviews = reviews; self.profile = profile; self.session = session
    }

    var isAuthenticated: Bool { session.state.isAuthenticated }

    func refresh(lang: String) async {
        async let a: () = loadName()
        async let b: () = loadRecommendations()
        async let c: () = loadDeals(lang: lang)
        async let d: () = loadVideos()
        async let e: () = loadRecent()
        _ = await (a, b, c, d, e)
    }

    func loadName() async {
        guard isAuthenticated else { userName = nil; return }
        let name = (try? await profile.fetchProfile())?.fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        userName = (name?.isEmpty == false) ? name : nil
    }

    func loadRecommendations() async {
        let items = (try? await places.fetchRecommendations())?.recommendations ?? []
        recommendations = Self.rail(Array(items.prefix(Self.recommendationsLimit)))
    }

    func loadDeals(lang: String) async {
        let items = (try? await dealsService.fetchDeals(lang: lang)) ?? []
        deals = Self.rail(Array(items.prefix(Self.dealsLimit)))
    }

    /// The trending feed narrowed to clips that can be shown (Android: video + a thumbnail or media).
    func loadVideos() async {
        let feed = (try? await reviews.fetchFeed(page: 0, sort: .trending, following: false))?.reviews ?? []
        videos = Self.rail(Array(Self.playableVideos(feed).prefix(Self.videoLimit)))
    }

    func loadRecent() async {
        guard isAuthenticated else { recent = .empty; return }
        let items = (try? await home.conversations()) ?? []
        recent = Self.rail(Array(items.prefix(Self.recentLimit)))
    }

    nonisolated static func playableVideos(_ reviews: [Review]) -> [Review] {
        reviews.filter { r in
            r.contentType == "video" && !((r.thumbnail ?? "").isEmpty && (r.mediaUrl ?? "").isEmpty)
        }
    }

    private static func rail<T>(_ items: [T]) -> Rail<T> { items.isEmpty ? .empty : .loaded(items) }
}
