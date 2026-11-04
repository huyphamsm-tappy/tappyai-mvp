import XCTest
import UIKit
@testable import TappyAI

/// iOS Messenger follows the web release 2026-11-04 (b5cd20e): sender names and times on bubbles, pictures, the device's own copy of pictures,
/// the idempotent send, the unread badge, message links. The pure rules, driven for real — the fixtures are the web's own wire shapes
/// (`src/lib/messaging/types.ts`, the `[id]/messages` route).
final class MessengerParityTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try ResponseDecoder.json.decode(T.self, from: Data(json.utf8))
    }

    private func msg(_ id: String, _ sender: String?, _ at: String, body: String = "x") -> ChatMessage {
        ChatMessage(id: id, threadId: "t", senderId: sender, body: body, createdAt: at)
    }

    private let now = ISO8601Timestamp.date(from: "2026-11-04T12:00:00+07:00")!

    private func metas(_ messages: [ChatMessage], group: Bool = true) -> [ChatBubbles.Meta] {
        ChatBubbles.metas(for: messages, meId: "me", group: group, nameOf: { $0 == "a" ? "An" : "Bình" }, now: now)
    }

    // MARK: Bubbles

    func testARunShowsTheNameOnceAtItsStartAndTheTimeOnceAtItsEnd() {
        let r = metas([msg("1", "a", "2026-11-04T10:00:00+07:00"), msg("2", "a", "2026-11-04T10:01:00+07:00"), msg("3", "a", "2026-11-04T10:02:00+07:00")])
        XCTAssertEqual(r.map(\.showName), [true, false, false])
        XCTAssertEqual(r.map(\.showTime), [false, false, true])
        XCTAssertEqual(r[2].time, "10:02")
        XCTAssertEqual(r[0].name, "An")
    }

    func testAGapOfFiveMinutesOrAChangeOfSenderStartsANewRun() {
        let r = metas([msg("1", "a", "2026-11-04T10:00:00+07:00"), msg("2", "a", "2026-11-04T10:05:00+07:00"), msg("3", "b", "2026-11-04T10:05:30+07:00")])
        XCTAssertEqual(r.map(\.showName), [true, true, true], "exactly five minutes is a new run (the gap must be LESS than five)")
        XCTAssertEqual(r.map(\.showTime), [true, true, true])
    }

    func testMyOwnMessagesAndEveryMessageOfADirectThreadCarryNoNameButStillATime() {
        let mine = metas([msg("1", "me", "2026-11-04T10:00:00+07:00")])
        XCTAssertFalse(mine[0].showName)
        XCTAssertNil(mine[0].name)
        XCTAssertTrue(mine[0].showTime)
        let direct = metas([msg("1", "a", "2026-11-04T10:00:00+07:00")], group: false)
        XCTAssertFalse(direct[0].showName)
        XCTAssertEqual(direct[0].name, "An")
    }

    func testAnUnreadableTimestampGivesAnEmptyTimeAndNeverCrashes() {
        let r = metas([msg("1", "a", "not a date")])
        XCTAssertEqual(r[0].time, "")
        XCTAssertTrue(r[0].showName)
    }

    func testTheTimeLabelIsVietnamTime() {
        XCTAssertEqual(ChatBubbles.timeLabel("2026-11-04T07:50:00Z", now: now), "14:50")
        XCTAssertEqual(ChatBubbles.timeLabel("2026-11-03T07:50:00Z", now: now), "03/11 14:50")
        XCTAssertEqual(ChatBubbles.timeLabel("2026-11-03T17:05:00Z", now: now), "00:05", "00:05 on the 4th in Vietnam: midnight is 00, never 24")
        XCTAssertEqual(ChatBubbles.timeLabel("", now: now), "")
    }

    // MARK: Wire shapes

    func testAMessageWithAPictureDecodesItsLinkSizeAndExpiry() throws {
        let page = try decode(ChatMessagesPage.self, """
        {"messages":[
          {"id":"m1","threadId":"t","senderId":"u","body":"","createdAt":"2026-11-04T01:00:00Z","media":{"type":"image","url":"https://s/x?token=1","width":800,"height":600}},
          {"id":"m2","threadId":"t","senderId":"u","body":"hi","createdAt":"2026-11-04T01:01:00Z","media":null},
          {"id":"m3","threadId":"t","senderId":"u","body":"old","createdAt":"2026-09-01T01:01:00Z","media":{"type":"image","url":null,"width":10,"height":20,"expired":true}},
          {"nope":1}
        ],"hasMore":true}
        """)
        XCTAssertEqual(page.messages.map(\.id), ["m1", "m2", "m3"], "a malformed row is skipped, not the whole page")
        XCTAssertTrue(page.hasMore)
        XCTAssertEqual(page.messages[0].media?.url, "https://s/x?token=1")
        XCTAssertEqual(page.messages[0].media?.width, 800)
        XCTAssertEqual(page.messages[0].media?.expired, false)
        XCTAssertNil(page.messages[1].media)
        XCTAssertNil(page.messages[2].media?.url, "an expired picture has no link")
        XCTAssertEqual(page.messages[2].media?.expired, true)
        XCTAssertEqual(page.messages[0].body, "", "a picture-only message has an empty body")
    }

    func testAThreadSummaryDecodesAndTitlesTheWayTheWebDoes() throws {
        let list = try decode(ChatThreadsResponse.self, """
        {"threads":[
          {"id":"t1","kind":"direct","title":null,"lastMessageAt":"2026-09-17T09:00:00+07:00","lastMessage":{"body":"Đi ăn không?","senderId":"u2","createdAt":"2026-09-17T09:00:00+07:00"},"unreadCount":2,
           "participants":[{"userId":"me","fullName":"Huy","avatarUrl":null},{"userId":"u2","fullName":"Lan Nguyễn","avatarUrl":"https://cdn/lan.png"}]},
          {"id":"t2","kind":"group","title":"Nhóm cuối tuần","lastMessageAt":"2026-09-16T09:00:00+07:00","lastMessage":null,"unreadCount":0,
           "participants":[{"userId":"me","fullName":"Huy"},{"userId":"u2","fullName":"Lan Nguyễn"},{"userId":"u3","fullName":null}]}
        ]}
        """).threads
        XCTAssertEqual(list.count, 2)
        XCTAssertEqual(list[0].unreadCount, 2)
        XCTAssertEqual(list[0].counterpart(meId: "me")?.userId, "u2")
        XCTAssertEqual(list[0].displayTitle(meId: "me", fallback: "Người dùng"), "Lan Nguyễn")
        XCTAssertNil(list[1].lastMessage, "a thread with no messages yet is a real thread")
        XCTAssertNil(list[1].counterpart(meId: "me"), "a group has no counterpart")
        XCTAssertEqual(list[1].displayTitle(meId: "me", fallback: "Nhóm"), "Nhóm cuối tuần")
        XCTAssertEqual(list[1].participants.count, 3)
        let nameless = ChatThreadSummary(id: "t", kind: .direct, participants: [ChatParticipant(userId: "me"), ChatParticipant(userId: "u", fullName: "  ")])
        XCTAssertEqual(nameless.displayTitle(meId: "me", fallback: "Người dùng"), "Người dùng")
    }

    func testTheSendBodyIsTheWebs() throws {
        func json(_ data: Data) throws -> [String: Any] { try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any]) }
        let text = try json(ChatWire.sendBody(body: "  hi  ", clientId: "c1", media: nil))
        XCTAssertEqual(text["body"] as? String, "hi")
        XCTAssertEqual(text["clientId"] as? String, "c1")
        XCTAssertNil(text["media"])
        XCTAssertNil(text["senderId"], "no sender id: the server pins the bearer")
        let pic = try json(ChatWire.sendBody(body: "", clientId: "c2", media: UploadedPhoto(path: "t/u/f.webp", width: 800, height: 600)))
        XCTAssertEqual(pic["body"] as? String, "")
        let media = try XCTUnwrap(pic["media"] as? [String: Any])
        XCTAssertEqual(media["path"] as? String, "t/u/f.webp")
        XCTAssertEqual(media["width"] as? Int, 800)
        let long = try json(ChatWire.sendBody(body: String(repeating: "a", count: 5000), clientId: nil, media: nil))
        XCTAssertEqual((long["body"] as? String)?.count, ChatLimits.maxBody)
    }

    func testStartBodiesAreTheWebs() throws {
        let direct = try XCTUnwrap(JSONSerialization.jsonObject(with: ChatWire.startBody(userIds: ["u2"], title: "ignored")) as? [String: Any])
        XCTAssertEqual(direct["kind"] as? String, "direct")
        XCTAssertEqual(direct["userId"] as? String, "u2")
        XCTAssertNil(direct["title"])
        let group = try XCTUnwrap(JSONSerialization.jsonObject(with: ChatWire.startBody(userIds: ["u2", "u3"], title: " Đi chơi ")) as? [String: Any])
        XCTAssertEqual(group["kind"] as? String, "group")
        XCTAssertEqual(group["userIds"] as? [String], ["u2", "u3"])
        XCTAssertEqual(group["title"] as? String, "Đi chơi")
    }

    func testTheMultipartBodyCarriesOneFilePart() {
        let body = ChatWire.multipartBody(file: Data([1, 2, 3]), mimeType: "image/jpeg", boundary: "B")
        let text = String(decoding: body, as: UTF8.self)
        XCTAssertTrue(text.hasPrefix("--B\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n"))
        XCTAssertTrue(text.hasSuffix("\r\n--B--\r\n"))
    }

    // MARK: Refusals — neutral, never "blocked"

    func testA404LocksTheWritingAreaAndSaysTheNeutralSentence() {
        let f = ChatFailure.forSend(AppError.network(status: 404, code: nil))
        XCTAssertEqual(f, .locked)
        XCTAssertTrue(f.locksComposer)
        XCTAssertEqual(f.messageKey, "msg.error.cannotSend")
        XCTAssertFalse(NSLocalizedString(f.messageKey, comment: "").lowercased().contains("block"))
        XCTAssertFalse(NSLocalizedString(f.messageKey, comment: "").lowercased().contains("chặn"))
    }

    func testA429SaysToSlowDownAndDoesNotLock() {
        let f = ChatFailure.forSend(AppError.network(status: 429, code: "rate_limit"))
        XCTAssertEqual(f, .tooFast)
        XCTAssertFalse(f.locksComposer)
        XCTAssertEqual(ChatFailure.forSend(AppError.network(status: 500, code: nil)), .send)
        XCTAssertEqual(ChatFailure.forSend(AppError.offline), .send)
    }

    func testEveryRefusalOfAnUploadSaysWhy() {
        XCTAssertEqual(ChatFailure.forUpload(AppError.network(status: 422, code: nil)), .photoBlocked)
        XCTAssertEqual(ChatFailure.forUpload(AppError.network(status: 503, code: nil)), .photoScanUnavailable)
        XCTAssertEqual(ChatFailure.forUpload(AppError.network(status: 429, code: "rate_limit")), .tooFast)
        XCTAssertEqual(ChatFailure.forUpload(AppError.network(status: 404, code: nil)), .locked)
        XCTAssertEqual(ChatFailure.forUpload(AppError.validation(message: "x")), .photoType)
        XCTAssertEqual(ChatFailure.forUpload(AppError.authentication(reason: .aiConsentRequired(message: nil))), .photoConsent)
        XCTAssertEqual(ChatFailure.forUpload(AppError.network(status: 500, code: nil)), .photoUpload)
    }

    func testEveryFailureHasACatalogEntry() {
        let all: [ChatFailure] = [.load, .send, .locked, .tooFast, .photoType, .photoTooLarge, .photoBlocked, .photoScanUnavailable, .photoConsent, .photoUpload]
        for f in all { XCTAssertNotEqual(NSLocalizedString(f.messageKey, comment: ""), f.messageKey, f.messageKey) }
        let keys = ["msg.inbox.title", "msg.tab.messages", "msg.tab.notifications", "msg.new", "msg.search", "msg.empty", "msg.empty.hint", "msg.noMessages",
                    "msg.composer", "msg.send", "msg.unknownUser", "msg.unnamedGroup", "msg.findPeople", "msg.searchHint", "msg.noResults", "msg.startChat",
                    "msg.startChatN", "msg.groupName", "msg.startFailed", "msg.loadOlder", "msg.attach", "msg.removePhoto", "msg.uploading", "msg.photo.alt",
                    "msg.photo.unavailable", "msg.photo.expired", "msg.photo.preview", "msg.reportMessage", "msg.message", "notif.newMessages"]
        for key in keys { XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key) }
    }

    // MARK: The unread badge

    func testTheBadgeCountsAMessageOnceWithOrWithoutMessageNotifications() {
        XCTAssertEqual(ChatUnread.badgeTotal(notificationUnread: 3, unread: ChatUnread(messages: 4, messageNotifications: 0)), 7)
        XCTAssertEqual(ChatUnread.badgeTotal(notificationUnread: 5, unread: ChatUnread(messages: 9, messageNotifications: 2)), 3 + 9)
        XCTAssertEqual(ChatUnread.badgeTotal(notificationUnread: 1, unread: ChatUnread(messages: 0, messageNotifications: 4)), 0, "never negative")
        XCTAssertEqual(ChatUnread.badgeTotal(notificationUnread: 0, unread: .zero), 0)
    }

    func testTheUnreadAnswerDecodesAndNeverTrustsANegative() throws {
        let d = try decode(ChatUnread.self, #"{"messages":3,"messageNotifications":1}"#)
        XCTAssertEqual(d, ChatUnread(messages: 3, messageNotifications: 1))
        XCTAssertEqual(try decode(ChatUnread.self, "{}"), .zero)
        XCTAssertEqual(try decode(ChatUnread.self, #"{"messages":-4}"#).messages, 0)
    }

    // MARK: Message links

    func testAMessageNotificationsLinkNamesItsConversation() {
        let id = "bae913d2-584d-4110-8f83-5f976a6b8f24"
        XCTAssertEqual(ChatLinks.threadId(fromPathOrURL: "/profile/notifications?tab=messages&thread=\(id)"), id)
        XCTAssertEqual(ChatLinks.threadId(fromPathOrURL: "https://www.tappyai.com/profile/notifications?tab=messages&thread=\(id)"), id)
        XCTAssertEqual(ChatLinks.threadId(fromPathOrURL: "/profile/notifications?thread=\(id)"), id)
        XCTAssertNil(ChatLinks.threadId(fromPathOrURL: "/profile/5118a493-fa98-4d22-ab78-f86f53dcb93b"), "the profile of a person is not a conversation")
        XCTAssertNil(ChatLinks.threadId(fromPathOrURL: "/profile/notifications?tab=messages"))
        XCTAssertNil(ChatLinks.threadId(fromPathOrURL: "/profile/notifications?thread=../../etc"), "not a plain id")
        XCTAssertNil(ChatLinks.threadId(fromPathOrURL: "/reviews/abc"))
        XCTAssertNil(ChatLinks.threadId(fromPathOrURL: ""))
    }

    func testTheDeepLinkHandlerOpensTheConversationNotAGenericTab() {
        let id = "bae913d2-584d-4110-8f83-5f976a6b8f24"
        let handler = DeepLinkHandler()
        XCTAssertEqual(handler.target(for: "/profile/notifications?tab=messages&thread=\(id)"), .messageThread(id: id))
        XCTAssertEqual(handler.target(for: "https://www.tappyai.com/profile/notifications?tab=messages&thread=\(id)"), .messageThread(id: id))
        XCTAssertEqual(handler.target(for: "/profile/notifications"), .tab(.profile), "no thread: the Profile tab, as before")
        XCTAssertEqual(handler.target(for: "/users/abc"), .userProfile(id: "abc"), "other links are unchanged")
    }

    // MARK: A notification's collapsed message count

    func testACollapsedMessageNotificationCarriesItsCount() throws {
        let rows = try decode(NotificationsResponse.self, """
        {"notifications":[
          {"id":"n1","type":"message","category":"social","title":"An","body":"Đã gửi cho bạn một tin nhắn","entityUrl":"/profile/notifications?tab=messages&thread=t1","readAt":null,"createdAt":"2026-11-04T01:00:00Z","data":{"count":3}},
          {"id":"n2","type":"like","category":"social","title":"x","body":"y","createdAt":"2026-11-04T01:00:00Z","data":{"count":9}},
          {"id":"n3","type":"message","category":"social","title":"An","body":"b","createdAt":"2026-11-04T01:00:00Z","data":{"count":0}},
          {"id":"n4","type":"message","category":"social","title":"An","body":"b","createdAt":"2026-11-04T01:00:00Z"}
        ],"unreadCount":4}
        """).notifications
        XCTAssertEqual(rows.map(\.messageCount), [3, nil, nil, nil], "only a message row with a count of 1 or more has one")
        XCTAssertEqual(NotificationsInboxView.bodyText(for: rows[0]), String(format: NSLocalizedString("notif.newMessages", comment: ""), 3))
        XCTAssertEqual(NotificationsInboxView.bodyText(for: rows[1]), "y")
    }

    // MARK: The device's own copy of pictures

    private func tempBase() throws -> URL {
        let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("chatphotos-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func testAPictureIsSavedByMessageIdAndReadBack() throws {
        let base = try tempBase()
        XCTAssertFalse(ChatPhotoFiles.has(base: base, messageId: "m1"))
        XCTAssertTrue(ChatPhotoFiles.save(base: base, messageId: "m1", data: Data([1, 2, 3])))
        XCTAssertTrue(ChatPhotoFiles.has(base: base, messageId: "m1"))
        XCTAssertEqual(try Data(contentsOf: try XCTUnwrap(ChatPhotoFiles.load(base: base, messageId: "m1"))), Data([1, 2, 3]))
        XCTAssertNil(ChatPhotoFiles.load(base: base, messageId: "other"))
    }

    func testAnEmptyOrOversizedBodyOrAnUnsafeIdSavesNothing() throws {
        let base = try tempBase()
        XCTAssertFalse(ChatPhotoFiles.save(base: base, messageId: "m1", data: Data()))
        XCTAssertFalse(ChatPhotoFiles.save(base: base, messageId: "m1", data: Data(count: ChatPhotoFiles.maxCopyBytes + 1)))
        for bad in ["../x", "a/b", "", "m 1", String(repeating: "x", count: 65)] {
            XCTAssertFalse(ChatPhotoFiles.save(base: base, messageId: bad, data: Data([1])), bad)
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: ChatPhotoFiles.directory(in: base).path), "nothing was written")
    }

    func testSigningOutRemovesEverySavedCopy() throws {
        let base = try tempBase()
        ChatPhotoFiles.save(base: base, messageId: "m1", data: Data([1]))
        ChatPhotoFiles.save(base: base, messageId: "m2", data: Data([2]))
        ChatPhotoFiles.clearAll(base: base)
        XCTAssertFalse(ChatPhotoFiles.has(base: base, messageId: "m1"))
        XCTAssertFalse(ChatPhotoFiles.has(base: base, messageId: "m2"))
        ChatPhotoFiles.clearAll(base: base)   // clearing nothing is fine
    }

    // MARK: Preparing a picked picture

    func testTheScaleKeepsTheLongestSideUnderTheLimit() {
        XCTAssertEqual(ChatPhotoPrep.scale(forLongestSide: 1000), 1)
        XCTAssertEqual(ChatPhotoPrep.scale(forLongestSide: 2048), 1)
        XCTAssertEqual(ChatPhotoPrep.scale(forLongestSide: 4096), 0.5, accuracy: 0.0001)
        XCTAssertEqual(ChatPhotoPrep.scale(forLongestSide: 0), 1)
    }

    func testPrepareTurnsAPictureIntoAnAcceptableJPEGAndRefusesNonImages() throws {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 2000))
        let png = renderer.pngData { ctx in
            UIColor.orange.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 3000, height: 2000))
        }
        let prepared = try XCTUnwrap(ChatPhotoPrep.prepare(png))
        XCTAssertEqual(Array(prepared.jpeg.prefix(2)), [0xFF, 0xD8], "a JPEG")
        XCTAssertLessThanOrEqual(prepared.jpeg.count, ChatLimits.maxPhotoBytes)
        XCTAssertLessThanOrEqual(max(prepared.preview.size.width, prepared.preview.size.height), ChatLimits.maxPhotoSide)
        XCTAssertNil(ChatPhotoPrep.prepare(Data("not a picture".utf8)))
    }

    // MARK: The report target

    func testAMessageReportGoesToTheMessageRoute() {
        XCTAssertEqual(SafetyService.reportPath(kind: .message, targetId: "m-1"), "/api/messaging/messages/m-1/report")
    }
}
