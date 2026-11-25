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
        XCTAssertTrue((room.members ?? []).isEmpty)
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
        XCTAssertTrue((room.pendingRequests ?? []).isEmpty)
        XCTAssertTrue(room.suggestionOptions.isEmpty)
        XCTAssertNil(room.votes)
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

    // MARK: G5–G6

    func testRoomReadsCardsVotesAndDecision() throws {
        let room = try decode("""
        {"state":"member","id":"g1","name":"A","chosen_option":"b",
         "suggestion_options":[
           {"id":"a","name":"Quán A","address":"1 Lê Lợi","rating":4.5,"why":"Hợp ngân sách","maps_link":"https://maps.example/a"},
           {"id":"b","name":"Quán B","rating":"4.2","why":"Gần"},
           {"id":"c"}],
         "votes":{"counts":{"a":1,"b":2},"voted":3,"participants":4,"majority":"b","allVoted":false,"mine":"a"}}
        """)
        XCTAssertEqual(room.suggestionOptions.map(\.id), ["a", "b"], "a card with no name is dropped, not the room")
        XCTAssertEqual(room.suggestionOptions[0].mapsLink, "https://maps.example/a")
        XCTAssertEqual(room.suggestionOptions[1].rating, 4.2)
        XCTAssertEqual(room.chosenCard?.name, "Quán B")
        XCTAssertEqual(room.votes?.counts["b"], 2)
        XCTAssertEqual(room.votes?.mine, "a")
        XCTAssertFalse(room.votes?.isTie ?? true)
    }

    func testTieNeedsEveryoneVotedAndNoMajority() throws {
        let tie = try ResponseDecoder.json.decode(GroupVotes.self, from: Data(#"{"counts":{"a":1,"b":1},"voted":2,"participants":2,"majority":null,"allVoted":true}"#.utf8))
        XCTAssertTrue(tie.isTie)
        let open = try ResponseDecoder.json.decode(GroupVotes.self, from: Data(#"{"counts":{},"voted":1,"participants":3,"majority":null,"allVoted":false}"#.utf8))
        XCTAssertFalse(open.isTie)
    }

    func testHugeVoteNumbersCannotCrash() throws {
        let v = try ResponseDecoder.json.decode(GroupVotes.self, from: Data(#"{"voted":1e30,"participants":99999999999999999999}"#.utf8))
        XCTAssertEqual(v.voted, 0)
        XCTAssertEqual(v.participants, 0)
    }

    func testSuggestionResponseCarriesCards() throws {
        let r = try ResponseDecoder.json.decode(GroupSuggestionResponse.self, from: Data(#"{"suggestion":"x","options":[{"id":"a","name":"A"}]}"#.utf8))
        XCTAssertEqual(r.options.count, 1)
        let plain = try ResponseDecoder.json.decode(GroupSuggestionResponse.self, from: Data(#"{"suggestion":"x"}"#.utf8))
        XCTAssertTrue(plain.options.isEmpty)
    }

    func testNewSuggestionClearsVoteAndDecision() throws {
        let room = try decode(#"{"id":"g1","chosen_option":"a","suggestion_options":[{"id":"a","name":"A"}],"votes":{"voted":1}}"#)
        let next = room.withNewSuggestion("t", cards: [GroupCard(id: "z", name: "Z")])
        XCTAssertNil(next.chosenOption)
        XCTAssertNil(next.votes)
        XCTAssertEqual(next.suggestionOptions.map(\.id), ["z"])
    }

    func testVoteAndChooseCallsAndSafeIds() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"ok":true,"chosen":null}"#.utf8)
        let service = GroupService(api: api)
        _ = try await service.vote(groupId: "g1", optionId: "a")
        _ = try await service.choose(groupId: "g1", optionId: "a")
        XCTAssertEqual(api.sentEndpoints.map(\.path), ["/api/group/g1/vote", "/api/group/g1/choose"])
        XCTAssertTrue(api.sentEndpoints.allSatisfy { $0.requiresAuth && $0.method == .post })
        do { _ = try await service.vote(groupId: "g1", optionId: "../x"); XCTFail("must refuse") } catch {}
        XCTAssertEqual(api.sentEndpoints.count, 2)
    }

    func testUnsafeIdIsNeverWrittenIntoThePath() async {
        let api = MockAPIClient()
        do { try await GroupService(api: api).deleteGroup(id: "../x"); XCTFail("must refuse") } catch {}
        XCTAssertTrue(api.sentEndpoints.isEmpty)
    }
}
