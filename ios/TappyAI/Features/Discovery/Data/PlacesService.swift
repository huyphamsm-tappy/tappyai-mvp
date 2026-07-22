import Foundation

final class PlacesService: Sendable {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    // MARK: - Favorites

    struct FavoritesResponse: Decodable {
        let favorites: [Favorite]
    }

    func fetchFavorites() async throws -> [Favorite] {
        let endpoint = Endpoint(path: "/api/favorites", method: .get, requiresAuth: true)
        let response = try await api.send(endpoint, as: FavoritesResponse.self)
        return response.favorites
    }

    func savePlace(placeId: String, placeName: String, placeAddress: String, placeType: String) async throws {
        let body: [String: Any] = [
            "placeId": placeId,
            "placeName": placeName,
            "placeAddress": placeAddress,
            "placeType": placeType,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        let endpoint = Endpoint(path: "/api/favorites", method: .post, body: data, requiresAuth: true)
        _ = try await api.send(endpoint)
    }

    func deletePlace(placeId: String) async throws {
        let endpoint = Endpoint(
            path: "/api/favorites",
            method: .delete,
            query: [URLQueryItem(name: "placeId", value: placeId)],
            requiresAuth: true
        )
        _ = try await api.send(endpoint)
    }

    // MARK: - Saved Reviews

    struct SavedReviewsResponse: Decodable {
        let reviews: [SavedReview]
    }

    func fetchSavedReviews() async throws -> [SavedReview] {
        let endpoint = Endpoint(path: "/api/reviews/saved", method: .get, requiresAuth: true)
        let response = try await api.send(endpoint, as: SavedReviewsResponse.self)
        return response.reviews
    }

    // MARK: - Recommendations

    struct RecommendationsResponse: Decodable {
        let recommendations: [Recommendation]
        let explanation: [String]?
        let personalized: Bool?
    }

    func fetchRecommendations() async throws -> RecommendationsResponse {
        let endpoint = Endpoint(path: "/api/recommendations", method: .get, requiresAuth: true)
        return try await api.send(endpoint, as: RecommendationsResponse.self)
    }

    // MARK: - Bookings

    struct BookingsResponse: Decodable {
        let bookings: [Booking]
    }

    func fetchBookings(serviceId: String) async throws -> [Booking] {
        let endpoint = Endpoint(
            path: "/api/bookings",
            method: .get,
            query: [URLQueryItem(name: "serviceId", value: serviceId)],
            requiresAuth: true
        )
        let response = try await api.send(endpoint, as: BookingsResponse.self)
        return response.bookings
    }

    func fetchBookings() async throws -> [Booking] {
        let endpoint = Endpoint(path: "/api/bookings", method: .get, requiresAuth: true)
        let response = try await api.send(endpoint, as: BookingsResponse.self)
        return response.bookings
    }

    struct CreateBookingRequest: Encodable {
        let serviceId: String
        let serviceName: String
        let serviceType: String
        let date: String
        let time: String?
        let guests: Int
        let name: String
        let phone: String
        let notes: String?
        let placeId: String?
    }

    func createBooking(_ request: CreateBookingRequest) async throws {
        let endpoint = Endpoint(
            path: "/api/bookings",
            method: .post,
            body: try ResponseDecoder.jsonEncoder.encode(request),
            requiresAuth: true
        )
        _ = try await api.send(endpoint)
    }

    // MARK: - Community Reviews (for service detail)

    struct TappyReviewsResponse: Decodable {
        let reviews: [TappyReview]
    }

    func fetchPlaceReviews(placeId: String) async throws -> [TappyReview] {
        let endpoint = Endpoint(
            path: "/api/reviews",
            method: .get,
            query: [URLQueryItem(name: "placeId", value: placeId), URLQueryItem(name: "limit", value: "8")],
            requiresAuth: true
        )
        guard let response = try? await api.send(endpoint, as: TappyReviewsResponse.self) else {
            return []
        }
        return response.reviews
    }
}
