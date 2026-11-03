import XCTest
@testable import TappyAI

/// A verified StoreKit transaction is `finish()`ed only after the backend accepted it. Finishing first would drop it from
/// StoreKit's redelivery queue, and the person would have paid for a plan that never unlocks (Guideline 3.1.1).
/// Purchase sheet, Restore and `Transaction.updates` all go through `StoreKitProvider.settle`.
@MainActor
final class StoreKitSettleTests: XCTestCase {

    func testFinishesOnlyAfterTheBackendAccepted() async {
        var events: [String] = []
        let settled = await StoreKitProvider.settle(
            sync: { events.append("sync"); return true },
            finish: { events.append("finish") })
        XCTAssertTrue(settled)
        XCTAssertEqual(events, ["sync", "finish"], "sync first, finish second")
    }

    func testNeverFinishesWhenTheBackendRefused() async {
        var events: [String] = []
        let settled = await StoreKitProvider.settle(
            sync: { events.append("sync"); return false },
            finish: { events.append("finish") })
        XCTAssertFalse(settled)
        XCTAssertEqual(events, ["sync"], "the transaction stays unfinished so StoreKit redelivers it")
    }
}
