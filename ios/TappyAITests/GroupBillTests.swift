import XCTest
@testable import TappyAI

/// Group dining, slice G7: the bill of a meal. The server computes the split; the app reads it,
/// writes the payer's input, and must not trap on odd numbers.
final class GroupBillTests: XCTestCase {
    private let billJSON = """
    {"payerKey":"leader","payerName":"Lan","totalVnd":900000,"tipVnd":0,
     "items":[{"name":"Bia","amountVnd":120000,"forId":"m1"},{"name":"","amountVnd":5,"forId":""}],
     "excluded":["m2"],"paid":{"m1":true},"myKey":"leader","isPayer":true,
     "settlement":{"sharedVnd":780000,"shares":[
        {"id":"leader","name":"Lan","personalVnd":0,"dueVnd":390000},
        {"id":"m1","name":"Minh","personalVnd":120000,"dueVnd":510000},
        {"id":"m2","name":"Hà","personalVnd":0,"dueVnd":0}],
      "transfers":[{"fromId":"m1","toId":"leader","amountVnd":510000}]}}
    """

    func testBillIsReadAsTheServerComputedIt() throws {
        let bill = try ResponseDecoder.json.decode(GroupBill.self, from: Data(billJSON.utf8))
        XCTAssertEqual(bill.totalVnd, 900_000)
        XCTAssertTrue(bill.isPayer)
        XCTAssertEqual(bill.items.count, 1, "an item with no owner is dropped, not the bill")
        XCTAssertEqual(bill.excluded, ["m2"])
        XCTAssertEqual(bill.paid["m1"], true)
        XCTAssertEqual(bill.settlement?.shares.map(\.dueVnd), [390_000, 510_000, 0])
    }

    func testRoomCarriesBillPeopleAndMyKey() throws {
        let room = try ResponseDecoder.json.decode(GroupRoom.self, from: Data("""
        {"id":"g1","state":"creator","people":[{"key":"leader","name":"Lan"},{"key":"m1","name":"Minh"}],
         "myKey":"leader","bill":\(billJSON)}
        """.utf8))
        XCTAssertEqual(room.people.map(\.key), ["leader", "m1"])
        XCTAssertEqual(room.myKey, "leader")
        XCTAssertNotNil(room.bill)
    }

    func testServerWithoutTheBillMigrationStillReadsTheRoom() throws {
        let room = try ResponseDecoder.json.decode(GroupRoom.self, from: Data(#"{"id":"g1","state":"member"}"#.utf8))
        XCTAssertNil(room.bill)
        XCTAssertTrue(room.people.isEmpty)
    }

    func testPayerWhoLeftLeavesNoSettlement() throws {
        let bill = try ResponseDecoder.json.decode(GroupBill.self, from: Data(#"{"payerKey":null,"totalVnd":1,"isPayer":false}"#.utf8))
        XCTAssertNil(bill.settlement)
    }

    func testHugeAmountsCannotCrash() throws {
        let bill = try ResponseDecoder.json.decode(GroupBill.self, from: Data(#"{"totalVnd":1e300,"tipVnd":99999999999999999999}"#.utf8))
        XCTAssertEqual(bill.totalVnd, 0)
        XCTAssertEqual(bill.tipVnd, 0)
    }

    func testMoneyIsWrittenTheVietnameseWay() {
        XCTAssertEqual(GroupMoney.text(1_250_000), "1.250.000 ₫")
        XCTAssertEqual(GroupMoney.text(0), "0 ₫")
        XCTAssertEqual(GroupMoney.text(999), "999 ₫")
    }

    func testTypedAmountsAreReadLeniently() {
        XCTAssertEqual(GroupMoney.parse("1.250.000"), 1_250_000)
        XCTAssertEqual(GroupMoney.parse("1 250 000 đ"), 1_250_000)
        XCTAssertNil(GroupMoney.parse(""))
        XCTAssertNil(GroupMoney.parse("abc"))
        XCTAssertNil(GroupMoney.parse("1000000001"), "above the web's cap")
        XCTAssertNil(GroupMoney.parse("99999999999999999999"))
    }

    func testGroupPictureIsOneMultipartPartNamedAvatar() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"ok":true}"#.utf8)
        try await GroupService(api: api).uploadAvatar(groupId: "g1", jpeg: Data([0xFF, 0xD8, 0xFF]))
        let sent = try XCTUnwrap(api.sentEndpoints.first)
        XCTAssertEqual(sent.path, "/api/group/g1/avatar")
        XCTAssertEqual(sent.method, .post)
        XCTAssertTrue(sent.contentType?.hasPrefix("multipart/form-data; boundary=") == true)
        let text = String(decoding: try XCTUnwrap(sent.body), as: UTF8.self)
        XCTAssertTrue(text.contains(#"name="avatar""#))
        do { try await GroupService(api: api).uploadAvatar(groupId: "g1", jpeg: Data(count: GroupService.maxAvatarBytes + 1)); XCTFail("too large") } catch {}
        XCTAssertEqual(api.sentEndpoints.count, 1, "an oversized photo is refused before any request")
    }

    func testTheDestinationCityIsReadFromMemory() throws {
        let m = try ResponseDecoder.json.decode(UserMemory.self, from: Data(#"{"discovery_city":"Đà Nẵng","location_base":"Hà Nội"}"#.utf8))
        XCTAssertEqual(m.discoveryCity, "Đà Nẵng")
        XCTAssertEqual(m.locationBase, "Hà Nội", "where they live stays apart from where they are going")
    }

    func testBillCallsMatchTheRoute() async throws {
        let api = MockAPIClient()
        api.stubbed = Data(#"{"ok":true}"#.utf8)
        let service = GroupService(api: api)
        let draft = GroupService.BillDraft(
            totalVnd: 900_000, tipVnd: 0,
            items: [GroupBill.Item(name: "Bia", amountVnd: 120_000, forId: "m1")], excluded: ["m2"])
        _ = try await service.saveBill(groupId: "g1", draft: draft)
        _ = try await service.markPaid(groupId: "g1", memberKey: "m1", paid: true)
        try await service.deleteBill(groupId: "g1")
        XCTAssertEqual(api.sentEndpoints.map(\.method), [.put, .patch, .delete])
        XCTAssertTrue(api.sentEndpoints.allSatisfy { $0.path == "/api/group/g1/bill" && $0.requiresAuth })
        let put = try XCTUnwrap(api.sentEndpoints[0].body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })
        XCTAssertEqual(put["totalVnd"] as? Int, 900_000)
        XCTAssertEqual(put["excluded"] as? [String], ["m2"])
        let item = try XCTUnwrap((put["items"] as? [[String: Any]])?.first)
        XCTAssertEqual(item["forId"] as? String, "m1")
        XCTAssertEqual(item["amountVnd"] as? Int, 120_000)
        let patch = try XCTUnwrap(api.sentEndpoints[1].body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })
        XCTAssertEqual(patch["memberKey"] as? String, "m1")
        XCTAssertEqual(patch["paid"] as? Bool, true)
    }
}
