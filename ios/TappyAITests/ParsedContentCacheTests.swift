import XCTest
@testable import TappyAI

/// Parsing a long reply on every body pass was the lag of a streaming report (audit #8): a finished reply is parsed once, the one that is
/// streaming at most every ~50 ms (or at a line break), and the final text always. The clock is a parameter, so these tests never wait.
final class ParsedContentCacheTests: XCTestCase {
    private var calls: [String] = []

    private func makeCache(interval: TimeInterval = 0.05, capacity: Int = 200) -> ParsedContentCache {
        calls = []
        return ParsedContentCache(minStreamInterval: interval, capacity: capacity) { [unowned self] content in
            self.calls.append(content)
            return ParsedContent(text: content, ctaButtons: [], plan: nil, followups: [], images: [])
        }
    }

    func testAFinishedReplyIsParsedOnceHoweverOftenTheListIsDrawn() {
        let cache = makeCache()
        for step in 0..<5 {
            XCTAssertEqual(cache.parsed(id: "a", content: "xong", isStreaming: false, now: Double(step)).text, "xong")
        }
        XCTAssertEqual(calls.count, 1)
    }

    func testAFinishedReplyWhoseTextChangedIsParsedAgainAtOnce() {
        let cache = makeCache()
        _ = cache.parsed(id: "a", content: "một", isStreaming: false, now: 0)
        XCTAssertEqual(cache.parsed(id: "a", content: "một hai", isStreaming: false, now: 0.001).text, "một hai")
        XCTAssertEqual(calls.count, 2)
    }

    func testAStreamingReplyIsParsedAtMostOnceEveryIntervalAndTheOldResultStandsInBetween() {
        let cache = makeCache()
        XCTAssertEqual(cache.parsed(id: "a", content: "Xin", isStreaming: true, now: 0).text, "Xin")
        XCTAssertEqual(cache.parsed(id: "a", content: "Xin chào", isStreaming: true, now: 0.010).text, "Xin", "inside the interval: the last result")
        XCTAssertEqual(cache.parsed(id: "a", content: "Xin chào bạn", isStreaming: true, now: 0.040).text, "Xin")
        XCTAssertEqual(calls.count, 1)
        XCTAssertTrue(cache.hasPendingRefresh, "the view is told to draw again once the words pause")
        XCTAssertEqual(cache.parsed(id: "a", content: "Xin chào bạn nhé", isStreaming: true, now: 0.060).text, "Xin chào bạn nhé")
        XCTAssertEqual(calls.count, 2)
        XCTAssertFalse(cache.hasPendingRefresh)
    }

    func testALineBreakIsParsedAtOnceEvenInsideTheInterval() {
        let cache = makeCache()
        _ = cache.parsed(id: "a", content: "Dòng một", isStreaming: true, now: 0)
        XCTAssertEqual(cache.parsed(id: "a", content: "Dòng một\n", isStreaming: true, now: 0.001).text, "Dòng một\n")
        XCTAssertEqual(calls.count, 2)
    }

    func testTheFinalTextIsAlwaysParsedEvenRightAfterAThrottledPass() {
        let cache = makeCache()
        _ = cache.parsed(id: "a", content: "Một", isStreaming: true, now: 0)
        XCTAssertEqual(cache.parsed(id: "a", content: "Một hai", isStreaming: true, now: 0.01).text, "Một")
        XCTAssertEqual(cache.parsed(id: "a", content: "Một hai", isStreaming: false, now: 0.011).text, "Một hai", "the stream ended: the last words are on screen")
        XCTAssertFalse(cache.hasPendingRefresh)
        _ = cache.parsed(id: "a", content: "Một hai", isStreaming: false, now: 5)
        XCTAssertEqual(calls.count, 2, "and it is kept")
    }

    func testTheSameTextWhileStreamingIsNotParsedAgainAndLeavesNothingPending() {
        let cache = makeCache()
        _ = cache.parsed(id: "a", content: "Một", isStreaming: true, now: 0)
        _ = cache.parsed(id: "a", content: "Một", isStreaming: true, now: 1)
        XCTAssertEqual(calls.count, 1)
        XCTAssertFalse(cache.hasPendingRefresh)
    }

    func testAReplyThatBecameShorterIsAnotherReplyAndIsParsedAtOnce() {
        let cache = makeCache()
        _ = cache.parsed(id: "a", content: "Một câu khá dài", isStreaming: true, now: 0)
        XCTAssertEqual(cache.parsed(id: "a", content: "Mới", isStreaming: true, now: 0.001).text, "Mới", "answer again restarts the text")
    }

    func testAClockThatWentBackwardsDoesNotFreezeTheText() {
        let cache = makeCache()
        _ = cache.parsed(id: "a", content: "Một", isStreaming: true, now: 100)
        XCTAssertEqual(cache.parsed(id: "a", content: "Một hai", isStreaming: true, now: 50).text, "Một hai")
    }

    func testEachMessageHasItsOwnEntry() {
        let cache = makeCache()
        XCTAssertEqual(cache.parsed(id: "a", content: "A", isStreaming: false, now: 0).text, "A")
        XCTAssertEqual(cache.parsed(id: "b", content: "B", isStreaming: false, now: 0).text, "B")
        XCTAssertEqual(cache.parsed(id: "a", content: "A", isStreaming: false, now: 1).text, "A")
        XCTAssertEqual(calls, ["A", "B"])
    }

    func testTheOldestEntryLeavesWhenTheCacheIsFull() {
        let cache = makeCache(capacity: 2)
        for id in ["a", "b", "c"] { _ = cache.parsed(id: id, content: id, isStreaming: false, now: 0) }
        XCTAssertEqual(calls, ["a", "b", "c"])
        _ = cache.parsed(id: "c", content: "c", isStreaming: false, now: 1)
        _ = cache.parsed(id: "b", content: "b", isStreaming: false, now: 1)
        XCTAssertEqual(calls.count, 3, "the two newest are kept")
        _ = cache.parsed(id: "a", content: "a", isStreaming: false, now: 1)
        XCTAssertEqual(calls.count, 4, "the oldest was dropped and is parsed again")
    }

    func testTheDefaultParserIsContentParser() {
        let cache = ParsedContentCache()
        let content = "## Tiêu đề\n- một\n\n![A](https://cdn.example/a.png)"
        XCTAssertEqual(cache.parsed(id: "a", content: content, isStreaming: false, now: 0), ContentParser.parse(content))
    }
}
