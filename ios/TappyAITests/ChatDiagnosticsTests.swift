import XCTest
@testable import TappyAI

/// The diagnostics that will say what a frozen chat was doing (UAT 26/11), and the rule that keeps a long streaming reply from using the main thread.
@MainActor
final class ChatDiagnosticsTests: XCTestCase {

    func testAMainThreadThatStopsAnsweringLeavesALineInTheDiagnostics() async {
        let watch = MainThreadStallWatch()
        watch.start()
        // Block THIS (the main) thread for 3 s, as a frozen screen does; the watch runs on a background task and must notice.
        Thread.sleep(forTimeInterval: 3.0)
        // The watch writes on its own schedule (and CI runs are slow): wait for the lines to appear, up to 10 s, rather than a fixed pause.
        var text = ""
        for _ in 0..<100 {
            text = DiagnosticSnapshot.shared.snapshot()
            if text.contains("main thread stalled over 1.5 s") && text.contains("main thread answered again after") { break }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        watch.stop()
        XCTAssertTrue(text.contains("main thread stalled over 1.5 s"), "the stall must be written while the main thread is blocked")
        XCTAssertTrue(text.contains("main thread answered again after"), "and how long it lasted, once it answers again")
    }

    func testAStreamSummaryHasCountsAndSizesOnly() {
        let activity = StreamActivity()
        activity.counted(line: "0:\"một câu bí mật của người dùng\"")
        activity.countedFrame(.text("một câu bí mật của người dùng"))
        activity.textBegan()
        let summary = activity.summary()
        XCTAssertTrue(summary.contains("lines=1"))
        XCTAssertTrue(summary.contains("frames=1"))
        XCTAssertTrue(summary.contains("text=true"))
        XCTAssertFalse(summary.contains("bí mật"), "the diagnostics never carry the text of a conversation")
    }

    func testTheParseIntervalGrowsWithTheLengthOfTheReply() {
        let cache = ParsedContentCache()
        XCTAssertEqual(cache.streamInterval(forLength: 500), 0.05, accuracy: 0.0001, "a short reply is parsed as often as before")
        XCTAssertEqual(cache.streamInterval(forLength: 3000), 0.05, accuracy: 0.0001)
        XCTAssertEqual(cache.streamInterval(forLength: 9000), 0.15, accuracy: 0.0001)
        XCTAssertEqual(cache.streamInterval(forLength: 200_000), 0.4, accuracy: 0.0001, "never slower than 0.4 s")
    }
}
