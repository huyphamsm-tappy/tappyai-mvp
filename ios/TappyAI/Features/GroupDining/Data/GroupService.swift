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
    private let consent: AIConsentCoordinator?

    init(api: APIClient, consent: AIConsentCoordinator? = nil) {
        self.api = api
        self.consent = consent
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
    /// Needs a Tappy account: the newer server answers 401 without one and returns only the group
    /// name to people who are not yet accepted (`state` = `none` / `pending`). Older servers are
    /// unaffected by the extra token.
    func fetchGroup(id: String) async throws -> GroupRoom {
        let endpoint = Endpoint(
            path: "/api/group",
            method: .get,
            query: [URLQueryItem(name: "id", value: id)],
            requiresAuth: true
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
        // I-06: the id comes from a link or a push; it is written into the path, so only a plain id is sent.
        guard DeepLinkHandler.isSafeId(id) else { throw AppError.validation(message: "invalid group id") }
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

    /// What the leader can do with a person in the group (`POST /api/group/{id}/members`).
    enum MemberAction: String, Sendable { case approve, decline, remove }

    /// `memberId` is the id of the MEMBER ROW (what the group read returns as each member's `id`),
    /// never the person's account id.
    func manageMember(groupId: String, memberId: String, action: MemberAction) async throws {
        guard DeepLinkHandler.isSafeId(groupId) else { throw AppError.validation(message: "invalid group id") }
        let payload = try JSONSerialization.data(withJSONObject: ["memberId": memberId, "action": action.rawValue])
        let endpoint = Endpoint(path: "/api/group/\(groupId)/members", method: .post, body: payload, requiresAuth: true)
        _ = try await api.send(endpoint, as: GroupOkResponse.self)
    }

    /// `POST /api/group/{id}/leave` — a member leaves, or a person withdraws a request still waiting.
    func leaveGroup(id: String) async throws {
        guard DeepLinkHandler.isSafeId(id) else { throw AppError.validation(message: "invalid group id") }
        let endpoint = Endpoint(path: "/api/group/\(id)/leave", method: .post, requiresAuth: true)
        _ = try await api.send(endpoint, as: GroupOkResponse.self)
    }

    /// `DELETE /api/group/{id}` — leader only; members, requests, votes and bills go with it.
    func deleteGroup(id: String) async throws {
        guard DeepLinkHandler.isSafeId(id) else { throw AppError.validation(message: "invalid group id") }
        let endpoint = Endpoint(path: "/api/group/\(id)", method: .delete, requiresAuth: true)
        _ = try await api.send(endpoint, as: GroupOkResponse.self)
    }

    /// `POST /api/group/{id}/suggest` — the creator asks the AI for places that suit everyone.
    ///
    /// Creator-only and rate-limited server-side (5/minute) because it is a paid LLM call. The
    /// longer timeout is not optimism: this generates a multi-place answer and routinely takes
    /// longer than the client default, and a client that gives up first bills for a suggestion
    /// nobody sees.
    func requestSuggestion(id: String) async throws -> GroupSuggestionResponse {
        guard DeepLinkHandler.isSafeId(id) else { throw AppError.validation(message: "invalid group id") }
        // App Review 5.1.2(i): the model reads the details of every member who has agreed to it themselves; the server
        // omits the others. The creator still has to agree to their own details being sent.
        if let consent, !(await consent.ensure()) { throw AIConsentStore.blockedError }
        let endpoint = Endpoint(
            path: "/api/group/\(id)/suggest",
            method: .post,
            requiresAuth: true,
            timeout: 60
        )
        return try await api.send(endpoint, as: GroupSuggestionResponse.self)
    }
}
