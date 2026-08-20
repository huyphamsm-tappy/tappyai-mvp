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

    /// Fire-and-forget click counter (`POST /api/deals/[id]/click`) — the backend always returns
    /// success and never blocks the outbound link open, so this never throws to the caller.
    func trackClick(dealId: String) async {
        let endpoint = Endpoint(path: "/api/deals/\(dealId)/click", method: .post, requiresAuth: false)
        _ = try? await api.send(endpoint)
    }
}
