import Foundation

final class DealsService: Sendable {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    func fetchDeals(lang: String, country: String = "VN") async throws -> [PartnerDeal] {
        let endpoint = Endpoint(
            path: "/api/deals",
            method: .get,
            query: [
                URLQueryItem(name: "lang", value: lang),
                URLQueryItem(name: "country", value: country),
            ],
            requiresAuth: false
        )
        let response = try await api.send(endpoint, as: DealsResponse.self)
        return response.deals
    }

    /// `GET /api/deals/partners?lang=` — the booking partners with a tracked affiliate link, shown when the feed has no deal (web `/deals`).
    /// A failure is an empty list, as on the web: the page then shows its plain empty state.
    func fetchPartnerCards(lang: String) async -> [DealPartnerCard] {
        let endpoint = Endpoint(path: "/api/deals/partners", method: .get,
                                query: [URLQueryItem(name: "lang", value: lang)], requiresAuth: false)
        guard let response = try? await api.send(endpoint, as: DealPartnerCardsResponse.self) else { return [] }
        return response.partners.filter { DealPartnerAllowlist.isAllowed($0.partnerName) }
    }

    /// Fire-and-forget click counter (`POST /api/deals/[id]/click`) — the backend always returns
    /// success and never blocks the outbound link open, so this never throws to the caller.
    func trackClick(dealId: String) async {
        let endpoint = Endpoint(path: "/api/deals/\(dealId)/click", method: .post, requiresAuth: false)
        _ = try? await api.send(endpoint)
    }
}
