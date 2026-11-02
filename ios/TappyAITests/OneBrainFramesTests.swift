import XCTest
@testable import TappyAI

/// The one-brain stream's Deep Research annotations, re-checked on the phone the way the web re-checks them
/// (`readResearchStatus` / `readResearchCharts` in src/lib/ai/research/deepResearch.ts, `sanitizeDocMedia` in src/lib/answerDoc/media.ts)
/// and the way Android does (`OneBrainFramesTest`). The server already checked all of it; the client trusts nothing it would show.
/// The sample lines have the shape of the real frames: `tappy.research.v1` and `tappy.research_charts.v1` are discriminated by `type`,
/// `tappy.doc_media.v1` by `kind`.
final class OneBrainFramesTests: XCTestCase {

    // MARK: - Samples

    private func research(phase: String = "researching", steps: String = "[]", links: String? = nil, sources: String = "12") -> String {
        let tail = links.map { ",\"links\":\($0)" } ?? ""
        return "{\"type\":\"tappy.research.v1\",\"title\":\"Giá vàng 2026\",\"phase\":\"\(phase)\",\"steps\":\(steps),\"sources\":\(sources)\(tail)}"
    }

    private func charts(_ list: String) -> String { "{\"type\":\"tappy.research_charts.v1\",\"charts\":\(list)}" }

    private func chart(section: String = "Giá theo năm", title: String = "Giá vàng", unit: String = "triệu đồng", kind: String = "bar",
                       points: String = "[{\"label\":\"2024\",\"value\":76.5,\"source\":1},{\"label\":\"2025\",\"value\":98,\"source\":2}]") -> String {
        "{\"section\":\"\(section)\",\"title\":\"\(title)\",\"unit\":\"\(unit)\",\"kind\":\"\(kind)\",\"points\":\(points)}"
    }

    private func docMedia(v: String = "1", items: String) -> String {
        "{\"kind\":\"tappy.doc_media.v1\",\"v\":\(v),\"items\":\(items)}"
    }

    private func frames(_ elements: String...) -> [StreamFrame] {
        DataStreamLineParser.frames(line: "8:[" + elements.joined(separator: ",") + "]")
    }

    private func readResearch(_ json: String) -> ResearchStatus? {
        guard let object = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] else { return nil }
        return OneBrainFrames.research(object)
    }

    private func readCharts(_ json: String) -> [ResearchChart] {
        guard let object = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] else { return [] }
        return OneBrainFrames.charts(object)
    }

    private func readDocMedia(_ json: String) -> [DocMediaItem] {
        guard let object = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] else { return [] }
        return OneBrainFrames.docMedia(object)
    }

    // MARK: - The research card

    func testAResearchFrameIsReadByItsTypeField() {
        let steps = "[{\"title\":\"Tìm giá hiện tại\",\"status\":\"done\"},{\"title\":\"So sánh theo năm\",\"status\":\"running\"},{\"title\":\"Viết\",\"status\":\"pending\"}]"
        let links = "[{\"id\":1,\"title\":\"VnExpress\",\"url\":\"https://vnexpress.net/gia-vang\"}]"
        let list = frames(research(phase: "writing", steps: steps, links: links, sources: "9"))
        XCTAssertEqual(list.count, 1)
        guard case let .research(status)? = list.first else { return XCTFail("expected a research frame") }
        XCTAssertEqual(status.title, "Giá vàng 2026")
        XCTAssertEqual(status.phase, .writing)
        XCTAssertEqual(status.sources, 9)
        XCTAssertEqual(status.steps.map(\.title), ["Tìm giá hiện tại", "So sánh theo năm", "Viết"])
        XCTAssertEqual(status.steps.map(\.status), [.done, .running, .pending])
        XCTAssertEqual(status.links, [ResearchLink(id: 1, title: "VnExpress", url: "https://vnexpress.net/gia-vang")])
    }

    func testEveryPhaseAndStepStatusIsKnownAndAnyOtherIsNot() {
        for phase in ["planning", "researching", "writing", "done", "failed"] {
            XCTAssertNotNil(readResearch(research(phase: phase)), phase)
        }
        XCTAssertNil(readResearch(research(phase: "thinking")), "a phase this version does not know is not a frame")
        XCTAssertNil(readResearch("{\"type\":\"tappy.research.v1\",\"sources\":3}"), "no phase, no frame")
        let steps = "[{\"title\":\"a\",\"status\":\"pending\"},{\"title\":\"b\",\"status\":\"running\"},{\"title\":\"c\",\"status\":\"done\"},"
            + "{\"title\":\"d\",\"status\":\"failed\"},{\"title\":\"e\",\"status\":\"skipped\"},{\"status\":\"done\"},{\"title\":\"g\"},\"x\",7]"
        XCTAssertEqual(readResearch(research(steps: steps))?.steps.map(\.title), ["a", "b", "c", "d"],
                       "a step with an unknown status, no title, no status, or not an object is dropped alone")
    }

    func testAtMostSevenStepsAndFortyLinksAreKept() {
        let steps = "[" + (1...10).map { "{\"title\":\"Bước \($0)\",\"status\":\"done\"}" }.joined(separator: ",") + "]"
        let links = "[" + (1...50).map { "{\"id\":\($0),\"title\":\"Nguồn \($0)\",\"url\":\"https://example.com/p/\($0)\"}" }.joined(separator: ",") + "]"
        let status = readResearch(research(steps: steps, links: links))
        XCTAssertEqual(status?.steps.count, 7)
        XCTAssertEqual(status?.steps.last?.title, "Bước 7")
        XCTAssertEqual(status?.links.count, 40)
        XCTAssertEqual(status?.links.last?.id, 40)
    }

    func testALinkThatIsNotSafeOrIsAnAiProductPageIsDroppedAlone() {
        let links = "[{\"id\":1,\"title\":\"ok\",\"url\":\"https://vnexpress.net/a\"},"
            + "{\"id\":2,\"title\":\"http\",\"url\":\"http://vnexpress.net/b\"},"
            + "{\"id\":3,\"title\":\"local\",\"url\":\"https://localhost/c\"},"
            + "{\"id\":4,\"title\":\"ai\",\"url\":\"https://chatgpt.com/share/abc\"},"
            + "{\"id\":5,\"title\":\"ai2\",\"url\":\"https://www.aihay.vn/hoi-dap/1\"},"
            + "{\"id\":\"6\",\"title\":\"id as text\",\"url\":\"https://vnexpress.net/f\"},"
            + "{\"id\":7,\"url\":\"https://vnexpress.net/g\"},"
            + "{\"id\":8,\"title\":\"no url\"},"
            + "{\"id\":9,\"title\":\"ok too\",\"url\":\"https://vi.wikipedia.org/wiki/Hà_Nội\"}]"
        XCTAssertEqual(readResearch(research(links: links))?.links.map(\.id), [1, 9])
    }

    func testAMissingOrWrongTypedSourceCountIsZeroAndTheTitleIsOptional() {
        XCTAssertEqual(readResearch("{\"type\":\"tappy.research.v1\",\"phase\":\"planning\"}"),
                       ResearchStatus(title: "", phase: .planning, steps: [], sources: 0, links: []))
        XCTAssertEqual(readResearch(research(sources: "-3"))?.sources, 0)
        XCTAssertEqual(readResearch(research(sources: "\"12\""))?.sources, 0, "a string is not a count")
        XCTAssertEqual(readResearch(research(sources: "true"))?.sources, 0, "a boolean is not a count")
    }

    // MARK: - Charts

    func testAChartsFrameIsReadByItsTypeField() {
        let list = frames(charts("[" + chart(kind: "line") + "]"))
        guard case let .charts(read)? = list.first else { return XCTFail("expected a charts frame") }
        XCTAssertEqual(read.count, 1)
        XCTAssertEqual(read[0].section, "Giá theo năm")
        XCTAssertEqual(read[0].title, "Giá vàng")
        XCTAssertEqual(read[0].unit, "triệu đồng")
        XCTAssertEqual(read[0].kind, .line)
        XCTAssertEqual(read[0].points, [ChartPoint(label: "2024", value: 76.5, source: 1), ChartPoint(label: "2025", value: 98, source: 2)])
    }

    func testAChartKindOtherThanLineIsABarChart() {
        XCTAssertEqual(readCharts(charts("[" + chart(kind: "pie") + "]")).first?.kind, .bar)
        XCTAssertEqual(readCharts(charts("[" + chart(kind: "bar") + "]")).first?.kind, .bar)
    }

    func testAChartNeedsTwoPointsAndKeepsAtMostTwelveAndFourCharts() {
        let one = "[{\"label\":\"2024\",\"value\":1,\"source\":1}]"
        XCTAssertEqual(readCharts(charts("[" + chart(points: one) + "]")), [], "one point is not a chart")
        let many = "[" + (1...15).map { "{\"label\":\"M\($0)\",\"value\":\($0),\"source\":1}" }.joined(separator: ",") + "]"
        XCTAssertEqual(readCharts(charts("[" + chart(points: many) + "]")).first?.points.count, 12)
        let six = "[" + (1...6).map { chart(title: "Biểu đồ \($0)") }.joined(separator: ",") + "]"
        XCTAssertEqual(readCharts(charts(six)).map(\.title), ["Biểu đồ 1", "Biểu đồ 2", "Biểu đồ 3", "Biểu đồ 4"])
    }

    func testAPointWithoutItsLabelItsFiniteValueOrItsSourceIsDroppedAlone() {
        let points = "[{\"label\":\"a\",\"value\":1,\"source\":1},{\"value\":2,\"source\":1},{\"label\":\"c\",\"source\":1},"
            + "{\"label\":\"d\",\"value\":\"4\",\"source\":1},{\"label\":\"e\",\"value\":5},{\"label\":\"f\",\"value\":true,\"source\":1},"
            + "{\"label\":\"g\",\"value\":7,\"source\":2},3]"
        let read = readCharts(charts("[" + chart(points: points) + "]"))
        XCTAssertEqual(read.first?.points.map(\.label), ["a", "g"])
    }

    func testAChartWithoutASectionOrATitleIsDroppedAlone() {
        let noSection = "{\"title\":\"t\",\"unit\":\"u\",\"kind\":\"bar\",\"points\":[{\"label\":\"a\",\"value\":1,\"source\":1},{\"label\":\"b\",\"value\":2,\"source\":1}]}"
        let noTitle = "{\"section\":\"s\",\"unit\":\"u\",\"kind\":\"bar\",\"points\":[{\"label\":\"a\",\"value\":1,\"source\":1},{\"label\":\"b\",\"value\":2,\"source\":1}]}"
        let read = readCharts(charts("[\(noSection),\(noTitle),\(chart(title: "Giữ lại")),\"x\"]"))
        XCTAssertEqual(read.map(\.title), ["Giữ lại"])
    }

    func testChartTextIsCleanedAndCut() {
        let long = String(repeating: "x", count: 100)
        let read = readCharts(charts("[" + chart(section: "  Giá   theo\\nnăm ", title: long, unit: long) + "]")).first
        XCTAssertEqual(read?.section, "Giá theo năm")
        XCTAssertEqual(read?.title.count, 80)
        XCTAssertEqual(read?.unit.count, 24)
    }

    func testAChartsFrameWithNoUsableChartIsNotAFrame() {
        let list = frames(charts("[]"))
        guard list.count == 1, case .unknown = list[0] else { return XCTFail("an empty chart list must not become a frame") }
    }

    // MARK: - Section pictures

    func testADocMediaFrameIsReadByItsKindField() {
        let items = "[{\"title\":\"Hội An\",\"src\":\"https://upload.wikimedia.org/a.jpg\",\"source\":\"wikipedia\"},"
            + "{\"title\":\"Đà Nẵng\",\"src\":\"https://example.com/b.jpg\",\"source\":\"web\"}]"
        guard case let .docMedia(read)? = frames(docMedia(items: items)).first else { return XCTFail("expected a doc media frame") }
        XCTAssertEqual(read, [DocMediaItem(title: "Hội An", src: "https://upload.wikimedia.org/a.jpg", source: .wikipedia),
                              DocMediaItem(title: "Đà Nẵng", src: "https://example.com/b.jpg", source: .web)])
    }

    func testADocMediaNeedsVersionOneAndKeepsOnlySafeHttpsPictures() {
        let items = "[{\"title\":\"ok\",\"src\":\"https://example.com/ok.jpg\"},"
            + "{\"title\":\"http\",\"src\":\"http://example.com/h.jpg\"},"
            + "{\"title\":\"private\",\"src\":\"https://192.168.1.5/p.jpg\"},"
            + "{\"title\":\"ai\",\"src\":\"https://chatgpt.com/img.png\"},"
            + "{\"title\":\"\",\"src\":\"https://example.com/notitle.jpg\"},"
            + "{\"title\":\"nosrc\"}]"
        XCTAssertEqual(readDocMedia(docMedia(items: items)).map(\.title), ["ok"])
        XCTAssertEqual(readDocMedia(docMedia(items: items)).first?.source, .web, "any source other than wikipedia is web")
        XCTAssertEqual(readDocMedia(docMedia(v: "2", items: items)), [], "a version this client does not know is not read")
        XCTAssertEqual(readDocMedia("{\"kind\":\"tappy.doc_media.v1\",\"items\":\(items)}"), [], "no version, no pictures")
    }

    func testADocMediaKeepsAtMostEightPicturesAndCleansTheTitle() {
        let items = "[" + (1...10).map { "{\"title\":\"Mục \($0)\",\"src\":\"https://example.com/\($0).jpg\"}" }.joined(separator: ",") + "]"
        XCTAssertEqual(readDocMedia(docMedia(items: items)).count, 8)
        let dirty = "[{\"title\":\" <b>Hội</b>   An \",\"src\":\"https://example.com/a.jpg\"}]"
        XCTAssertEqual(readDocMedia(docMedia(items: dirty)).first?.title, "b Hội /b An")
        let longSrc = "https://example.com/" + String(repeating: "a", count: 2100)
        XCTAssertEqual(readDocMedia(docMedia(items: "[{\"title\":\"x\",\"src\":\"\(longSrc)\"}]")), [], "an address over 2048 characters is dropped")
    }

    func testADocMediaWithNoUsablePictureIsNotAFrame() {
        let list = frames(docMedia(items: "[{\"title\":\"x\",\"src\":\"http://example.com/x.jpg\"}]"))
        guard list.count == 1, case .unknown = list[0] else { return XCTFail("no usable picture must not become a frame") }
    }

    // MARK: - One array, many kinds

    func testResearchChartsPicturesAndProgressRideOneArrayAndOneStrangeFrameDoesNotBreakTheRest() {
        let progress = "{\"kind\":\"tappy.progress.v1\",\"stage\":\"reading\",\"text\":\"Đang đọc nguồn…\"}"
        let strange = "{\"type\":\"tappy.research.v9\",\"phase\":\"warp\"}"
        let list = frames(progress, strange, research(phase: "done"), charts("[" + chart() + "]"),
                          docMedia(items: "[{\"title\":\"x\",\"src\":\"https://example.com/x.jpg\"}]"))
        XCTAssertEqual(list.count, 4)
        guard list.count == 4 else { return }
        XCTAssertEqual(list[0], .progress(stage: "reading", text: "Đang đọc nguồn…"))
        guard case let .research(status) = list[1] else { return XCTFail("research second") }
        XCTAssertEqual(status.phase, .done)
        guard case .charts = list[2] else { return XCTFail("charts third") }
        guard case .docMedia = list[3] else { return XCTFail("doc media fourth") }
    }

    // MARK: - isSafeHttpsUrl (web src/lib/security/urlGuard.ts)

    func testOnlyHttpsToAPublicHostIsSafe() {
        for url in ["https://vnexpress.net/a?b=1#c", "HTTPS://Example.com/x", "https://sub.example.co.uk:8443/p", "https://8.8.8.8/x",
                    "https://vi.wikipedia.org/wiki/Hà_Nội", "https://172.32.0.1/x", "https://100.63.0.1/x"] {
            XCTAssertTrue(OneBrainFrames.isSafeHttpsUrl(url), url)
        }
        for url in ["http://example.com", "ftp://example.com", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "//example.com/x",
                    "example.com", "", "https://", "https:///path", "not a url", "https://exa mple.com/x"] {
            XCTAssertFalse(OneBrainFrames.isSafeHttpsUrl(url), url)
        }
    }

    func testCredentialsInternalNamesAndPrivateAddressesAreNotSafe() {
        for url in ["https://user:pass@example.com/x", "https://user@example.com/x", "https://example.com@evil.example/x",
                    "https://localhost/x", "https://localhost:3000/x", "https://app.localhost/x", "https://printer.local/x", "https://db.internal/x",
                    "https://127.0.0.1/x", "https://0.0.0.0/x", "https://10.1.2.3/x", "https://172.16.0.1/x", "https://172.31.255.255/x",
                    "https://192.168.0.1/x", "https://169.254.169.254/latest/meta-data", "https://100.64.0.1/x", "https://100.127.0.1/x",
                    "https://[::1]/x", "https://[fc00::1]/x", "https://[fd12::1]/x", "https://[fe80::1]/x", "https://[::ffff:127.0.0.1]/x",
                    "https://2130706433/x", "https://0x7f.0.0.1/x", "https://localhost./x"] {
            XCTAssertFalse(OneBrainFrames.isSafeHttpsUrl(url), url)
        }
    }

    func testAnotherAiProductsPageIsNeverSafe() {
        for url in ["https://chatgpt.com/share/x", "https://claude.ai/share/x", "https://www.perplexity.ai/search/x", "https://aihay.vn/a",
                    "https://gemini.google.com/share/x"] {
            XCTAssertFalse(OneBrainFrames.isSafeHttpsUrl(url), url)
        }
        XCTAssertTrue(OneBrainFrames.isSafeHttpsUrl("https://openai.com/index/x"), "a company's own site stays a source")
    }
}
