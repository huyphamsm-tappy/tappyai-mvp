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
        let api = MockAPIClient()
        api.stubbed = Data(#"{"id":"g1","state":"member"}"#.utf8)
        _ = try await GroupService(api: api).fetchGroup(id: "g1")
        XCTAssertEqual(api.sentEndpoints.first?.requiresAuth, true)
    }

    // MARK: G2–G4

    func testLeaderAnswerSendsMemberRowIdAndAction() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"ok":true}"#.utf8)
        try await GroupService(api: api).manageMember(groupId: "g1", memberId: "row-9", action: .approve)
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.path, "/api/group/g1/members")
        XCTAssertEqual(sent.method, .post)
        XCTAssertTrue(sent.requiresAuth)
        let body = try XCTUnwrap(sent.body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] })
        XCTAssertEqual(body, ["memberId": "row-9", "action": "approve"])
    }

    func testLeaveAndDeleteUseTheRightCalls() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"ok":true}"#.utf8)
        let service = GroupService(api: api)
        try await service.leaveGroup(id: "g1")
        try await service.deleteGroup(id: "g1")
        XCTAssertEqual(api.sentEndpoints.map(\.path), ["/api/group/g1/leave", "/api/group/g1"])
        XCTAssertEqual(api.sentEndpoints.map(\.method), [.post, .delete])
        XCTAssertTrue(api.sentEndpoints.allSatisfy(\.requiresAuth))
    }

    func testUnsafeIdIsNeverWrittenIntoThePath() async {
        let api = MockAPIClient()
        do { try await GroupService(api: api).deleteGroup(id: "../x"); XCTFail("must refuse") } catch {}
        XCTAssertTrue(api.sentEndpoints.isEmpty)
    }
}
