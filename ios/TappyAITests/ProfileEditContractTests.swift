import XCTest
@testable import TappyAI

/// Profile edit: the cover section follows the GET shape (Web edit/page.tsx `profile.cover_url !== undefined`), and the bio travels
/// PATCH -> reload -> render through the service exactly as the server answers (iOS invents nothing).
final class ProfileEditContractTests: XCTestCase {

    private func decode(_ json: String) throws -> UserProfile {
        try ResponseDecoder.json.decode(UserProfile.self, from: Data(json.utf8))
    }

    // MARK: cover gate

    func testProductionShapeHasNoCoverKeyAndHidesTheCoverSection() throws {
        let p = try decode(#"{"full_name":"An","avatar_url":"","email":"an@example.com","bio":"","language":null,"onboarded":true}"#)
        XCTAssertFalse(p.supportsCover)
        XCTAssertNil(p.coverUrl)
    }

    func testP7ShapeWithNullCoverOffersTheSectionWithNoPicture() throws {
        let p = try decode(#"{"full_name":"An","avatar_url":"","email":"an@example.com","bio":"","cover_url":null}"#)
        XCTAssertTrue(p.supportsCover, "null means the column exists: the section is offered")
        XCTAssertNil(p.coverUrl)
    }

    func testP7ShapeWithACover() throws {
        let p = try decode(#"{"full_name":"An","avatar_url":"","email":"","bio":"","cover_url":"https://x/c.jpg"}"#)
        XCTAssertTrue(p.supportsCover)
        XCTAssertEqual(p.coverUrl, "https://x/c.jpg")
    }

    func testAMemberwiseProfileDoesNotClaimCoverSupport() {
        XCTAssertFalse(UserProfile(fullName: "", avatarUrl: "", email: "", bio: "").supportsCover)
    }

    // MARK: bio save -> reload -> render

    /// A server that persists what PATCH sent (what p7 does) or ignores it (what production does for bearer metadata writes).
    private final class StatefulProfileAPI: APIClient, @unchecked Sendable {
        var persists: Bool
        private(set) var bio = "old bio"
        private(set) var requests: [Endpoint] = []
        init(persists: Bool) { self.persists = persists }

        func send(_ endpoint: Endpoint) async throws -> Data {
            requests.append(endpoint)
            if endpoint.method == .patch, persists,
               let body = endpoint.body,
               let obj = try JSONSerialization.jsonObject(with: body) as? [String: Any],
               let b = obj["bio"] as? String { bio = b }
            return Data(#"{"ok":true}"#.utf8)
        }
        func send<T: Decodable>(_ endpoint: Endpoint, as type: T.Type) async throws -> T {
            requests.append(endpoint)
            let object: [String: Any] = ["full_name": "An", "avatar_url": "", "email": "an@example.com", "bio": bio]
            let json = try JSONSerialization.data(withJSONObject: object)
            return try ResponseDecoder.json.decode(T.self, from: json)
        }
    }

    func testSavedBioIsWhatTheNextGetReturnsWhenTheServerPersists() async throws {
        let api = StatefulProfileAPI(persists: true)
        let service = ProfileService(api: api)
        try await service.updateProfile(fullName: "An", bio: "Mê ẩm thực Đà Nẵng")
        let patch = try XCTUnwrap(api.requests.first)
        XCTAssertEqual(patch.method, .patch)
        XCTAssertEqual(patch.path, "/api/profile")
        XCTAssertTrue(patch.requiresAuth)
        let sent = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(patch.body)) as? [String: String])
        XCTAssertEqual(sent["bio"], "Mê ẩm thực Đà Nẵng")
        XCTAssertEqual(sent["full_name"], "An")

        let reloaded = try await service.fetchProfile()
        XCTAssertEqual(reloaded.bio, "Mê ẩm thực Đà Nẵng")
    }

    func testWhenTheServerIgnoresTheWriteTheReloadShowsTheServerState() async throws {
        // Production ignores bearer metadata writes (external). The app must show what GET returns, never the typed text.
        let api = StatefulProfileAPI(persists: false)
        let service = ProfileService(api: api)
        try await service.updateProfile(fullName: "An", bio: "typed but not stored")
        let reloaded = try await service.fetchProfile()
        XCTAssertEqual(reloaded.bio, "old bio")
    }
}
