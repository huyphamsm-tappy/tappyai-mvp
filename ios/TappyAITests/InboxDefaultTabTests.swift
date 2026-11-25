import XCTest
@testable import TappyAI

/// The Inbox opens where the unread things are (owner UAT: a red badge and no visible notification).
final class InboxDefaultTabTests: XCTestCase {
    func testOnlyNotificationsUnreadOpensTheNotificationsTab() {
        XCTAssertEqual(InboxContainerView.defaultTab(notificationUnread: 3, messageUnread: 0), .notifications)
    }

    func testUnreadMessagesOpenTheMessagesTab() {
        XCTAssertEqual(InboxContainerView.defaultTab(notificationUnread: 3, messageUnread: 1), .messages)
        XCTAssertEqual(InboxContainerView.defaultTab(notificationUnread: 0, messageUnread: 2), .messages)
    }

    func testNothingUnreadKeepsTheMessagesTab() {
        XCTAssertEqual(InboxContainerView.defaultTab(notificationUnread: 0, messageUnread: 0), .messages)
    }
}
