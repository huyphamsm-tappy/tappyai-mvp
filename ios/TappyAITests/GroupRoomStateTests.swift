import XCTest
@testable import TappyAI

/// Group dining, slice G1: the web now answers a group read by who is asking (state), and the
/// reader must see that state, the waiting requests and the picture without breaking on a server
/// that does not send them yet.
final class GroupRoomStateTests: XCTestCase {
    private func decode(_ json: String) throws -> GroupRoom {
        try ResponseDecoder.json.decode(GroupRoom.self, from: Data(json.utf8))
    }

    func testPendingPersonGetsOnlyNameAndState() throws {
        let room = try decode(#"{"state":"pending","id":"g1","name":"Lẩu tối nay"}"#)
        XCTAssertEqual(room.state, "pending")
        XCTAssertTrue(room.isPendingForMe)
        XCTAssertNil(room.members)
        XCTAssertEqual(room.name, "Lẩu tối nay")
    }

    func testCreatorSeesPendingRequestsAndPicture() throws {
        let room = try decode("""
        {"state":"creator","id":"g1","name":"A","creator_id":"u1","avatar_url":"https://x.example/a.jpg",
         "members":[{"id":"m1","name":"Lan","area":"Q1"}],
         "pendingRequests":[{"id":"m2","name":"Minh","area":"Q3"}]}
        """)
        XCTAssertEqual(room.state, "creator")
        XCTAssertEqual(room.creatorId, "u1")
        XCTAssertEqual(room.avatarUrl, "https://x.example/a.jpg")
        XCTAssertEqual(room.members?.count, 1)
        XCTAssertEqual(room.pendingRequests?.first?.name, "Minh")
        XCTAssertFalse(room.isPendingForMe)
    }

    func testOldServerWithoutStateStillDecodes() throws {
        let room = try decode(#"{"id":"g1","name":"A","members":[{"id":"m1","name":"Lan"}]}"#)
        XCTAssertNil(room.state)
        XCTAssertNil(room.pendingRequests)
        XCTAssertEqual(room.members?.count, 1)
    }

    func testJoinResponseReadsPending() throws {
        let r = try ResponseDecoder.json.decode(JoinGroupResponse.self, from: Data(#"{"ok":true,"pending":true}"#.utf8))
        XCTAssertEqual(r.pending, true)
    }

    func testWithSuggestionKeepsTheRest() throws {
        let room = try decode(#"{"state":"creator","id":"g1","name":"A","members":[{"id":"m1","name":"Lan"}]}"#)
        let next = room.withSuggestion("Quán X")
        XCTAssertEqual(next.suggestion, "Quán X")
        XCTAssertEqual(next.state, "creator")
        XCTAssertEqual(next.members?.count, 1)
    }

    func testFetchGroupRequiresAuth() async throws {
        // The web answers 401 without an account; the call must carry the token.
        let source = try String(contentsOfFile: #file.replacingOccurrences(of: "TappyAITests/GroupRoomStateTests.swift", with: "TappyAI/Features/GroupDining/Data/GroupService.swift"))
        guard let start = source.range(of: "func fetchGroup") else { return XCTFail("fetchGroup missing") }
        let body = source[start.lowerBound...].prefix(400)
        XCTAssertTrue(body.contains("requiresAuth: true"))
    }
}
