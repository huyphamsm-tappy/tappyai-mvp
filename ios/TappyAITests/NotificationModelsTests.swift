import XCTest
@testable import TappyAI

/// Locks the ADR-014 unified notifications contract (Production Knowledge Base §4/§5) — one
/// `NotificationDTO` shape declared shared across Web/Android/iOS.
final class NotificationModelsTests: XCTestCase {
    func testDecodesFullContract() throws {
        let json = """
        {"notifications":[{
            "id":"n1","type":"comment","category":"social","title":"Bình luận mới",
            "body":"đã bình luận bài của bạn","actor":{"id":"u1","name":"Huy","avatar":"https://x/a.png"},
            "entityUrl":"/reviews/r1","imageUrl":null,"readAt":null,"createdAt":"2026-08-06T00:00:00.000Z"
        }],"unreadCount":1}
        """
        let response = try ResponseDecoder.json.decode(NotificationsResponse.self, from: Data(json.utf8))
        XCTAssertEqual(response.unreadCount, 1)
        let note = try XCTUnwrap(response.notifications.first)
        XCTAssertEqual(note.type, "comment")
        XCTAssertEqual(note.actor?.name, "Huy")
        XCTAssertTrue(note.isUnread)
    }

    func testReadAtPresentMeansNotUnread() throws {
        let json = """
        {"id":"n1","type":"like","category":"social","title":"T","body":"B","actor":null,
         "entityUrl":null,"imageUrl":null,"readAt":"2026-08-06T01:00:00.000Z","createdAt":"2026-08-06T00:00:00.000Z"}
        """
        let note = try ResponseDecoder.json.decode(NotificationDTO.self, from: Data(json.utf8))
        XCTAssertFalse(note.isUnread)
    }

    /// `actor` is nullable — a system-generated notification (e.g. a milestone) has no actor.
    func testDecodesWithoutActor() throws {
        let json = """
        {"id":"n1","type":"milestone","category":"social","title":"T","body":"B","actor":null,
         "entityUrl":null,"imageUrl":null,"readAt":null,"createdAt":"2026-08-06T00:00:00.000Z"}
        """
        let note = try ResponseDecoder.json.decode(NotificationDTO.self, from: Data(json.utf8))
        XCTAssertNil(note.actor)
    }
}
