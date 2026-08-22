import Foundation

/// Group dining — `/api/group`, the same four calls the web and Android make.
///
/// 🚨 Every write here is `requiresAuth: true` AND is refused server-side for an ANONYMOUS
/// session (`refuseAnonymousSocialWrite`). Those are two different things: an anonymous session is
/// authenticated — it carries a real token — but it is not an account, and creating a room or
/// joining one writes a person's budget and dietary restrictions into a group other people can
/// read. The client must not treat "has a token" as "may write"; `GroupDiningViewModel` checks for
/// a real account before offering the controls, and the server refuses regardless.
struct GroupService: Sendable {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    /// `POST /api/group` — create a room.
    func createGroup(name: String) async throws -> CreatedGroup {
        let payload = try JSONSerialization.data(withJSONObject: ["name": name])
        let endpoint = Endpoint(
            path: "/api/group",
            method: .post,
            body: payload,
            requiresAuth: true
        )
        return try await api.send(endpoint, as: CreatedGroup.self)
    }

    /// `GET /api/group?id=` — the room and its members.
    ///
    /// Public by design: a room is shared as a link, and everyone who opens that link has to be
    /// able to see who is already in before deciding to join. Nothing private is returned — the
    /// fields are the answers people gave in order to be pooled.
    func fetchGroup(id: String) async throws -> GroupRoom {
        let endpoint = Endpoint(
            path: "/api/group",
            method: .get,
            query: [URLQueryItem(name: "id", value: id)]
        )
        return try await api.send(endpoint, as: GroupRoom.self)
    }

    /// `POST /api/group/{id}/join`.
    ///
    /// Snake-case keys are sent EXPLICITLY. The response decoder converts snake to camel on the
    /// way in, but nothing converts on the way out, so a camelCase body would reach the server as
    /// fields it does not read — `food_preferences` would silently arrive empty and the AI would
    /// suggest for a group whose preferences it was never told.
    func joinGroup(id: String, form: GroupJoinForm) async throws -> JoinGroupResponse {
        let payload = try JSONSerialization.data(withJSONObject: [
            "name": form.name,
            "budget": form.budget,
            "food_preferences": form.foodPreferences,
            "dietary_restrictions": form.dietaryRestrictions,
            "area": form.area,
        ])
        let endpoint = Endpoint(
            path: "/api/group/\(id)/join",
            method: .post,
            body: payload,
            requiresAuth: true
        )
        return try await api.send(endpoint, as: JoinGroupResponse.self)
    }

    /// `POST /api/group/{id}/suggest` — the creator asks the AI for places that suit everyone.
    ///
    /// Creator-only and rate-limited server-side (5/minute) because it is a paid LLM call. The
    /// longer timeout is not optimism: this generates a multi-place answer and routinely takes
    /// longer than the client default, and a client that gives up first bills for a suggestion
    /// nobody sees.
    func requestSuggestion(id: String) async throws -> GroupSuggestionResponse {
        let endpoint = Endpoint(
            path: "/api/group/\(id)/suggest",
            method: .post,
            requiresAuth: true,
            timeout: 60
        )
        return try await api.send(endpoint, as: GroupSuggestionResponse.self)
    }
}
