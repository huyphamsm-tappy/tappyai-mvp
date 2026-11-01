import XCTest
@testable import TappyAI

/// The answer's pictures and charts under their sections (Android `ArticleLayoutTest`, web `assignPictures`), and the reply's own pictures where
/// the model wrote them. Pure: the order of the parts is the whole contract.
final class ArticleLayoutTests: XCTestCase {
    private func chart(_ section: String, title: String = "Biểu đồ") -> ResearchChart {
        ResearchChart(section: section, title: title, unit: "", kind: .bar,
                      points: [ChartPoint(label: "A", value: 1, source: 1), ChartPoint(label: "B", value: 2, source: 2)])
    }

    private func picture(_ title: String, _ n: Int = 1) -> DocMediaItem {
        DocMediaItem(title: title, src: "https://example.com/\(n).jpg", source: .web)
    }

    private func text(_ s: String) -> [ReplySegment] { [.text(s)] }

    /// A compact reading of the parts: "B2" two blocks, "C:<section>", "P:<title>", "I3" three inline pictures.
    private func shape(_ parts: [ArticlePart]) -> [String] {
        parts.map { part in
            switch part {
            case .blocks(let blocks): return "B\(blocks.count)"
            case .chart(let c): return "C:\(c.section)"
            case .picture(let p): return "P:\(p.title)"
            case .images(let images): return "I\(images.count)"
            }
        }
    }

    // MARK: - Titles

    func testAHeadingTitleIsItsOwnWordsWithoutNumberEmojiOrTail() {
        XCTAssertEqual(ArticleLayout.headingTitle("1. Hội An: phố cổ"), "Hội An")
        XCTAssertEqual(ArticleLayout.headingTitle("🏖 Đà Nẵng - biển đẹp"), "Đà Nẵng")
        XCTAssertEqual(ArticleLayout.headingTitle("**Giá vé** (2026)"), "Giá vé")
    }

    func testASentenceIsNotATitle() {
        XCTAssertNil(ArticleLayout.headingTitle("Đây là một câu rất dài viết ra như một đoạn văn chứ không phải là một tiêu đề mục"))
        XCTAssertNil(ArticleLayout.headingTitle("A"))
        XCTAssertNil(ArticleLayout.headingTitle(""))
    }

    func testAListItemTitleIsItsBoldLeadOnly() {
        XCTAssertEqual(ArticleLayout.listItemTitle("**Bún bò Huế** - nước dùng đậm"), "Bún bò Huế")
        XCTAssertEqual(ArticleLayout.listItemTitle("2. **Mì Quảng**: sợi vàng"), "Mì Quảng")
        XCTAssertNil(ArticleLayout.listItemTitle("Bún bò Huế - nước dùng đậm"))
        XCTAssertNil(ArticleLayout.listItemTitle("nước dùng **đậm** lắm"))
    }

    func testOnlyHeadingsAndListItemsCarryATitle() {
        XCTAssertEqual(ArticleLayout.title(of: .heading(level: 2, text: "Doanh số")), "Doanh số")
        XCTAssertEqual(ArticleLayout.title(of: .bullet(depth: 0, text: "**Huế** - cố đô")), "Huế")
        XCTAssertEqual(ArticleLayout.title(of: .numbered(n: 1, depth: 0, text: "**Hội An** - phố cổ")), "Hội An")
        XCTAssertNil(ArticleLayout.title(of: .paragraph("**Huế** - cố đô")))
        XCTAssertNil(ArticleLayout.title(of: .rule))
    }

    // MARK: - Placement

    func testAChartGoesRightUnderItsSectionHeadingAndTheRestFollows() {
        let parts = ArticleLayout.place(segments: text("# Báo cáo\n\n## Doanh số\nBYD dẫn đầu.\n\n## Kết luận\nXong."),
                                        media: [], charts: [chart("Doanh số")])
        XCTAssertEqual(shape(parts), ["B2", "C:Doanh số", "B3"])
        guard case .blocks(let first) = parts[0] else { return XCTFail("blocks first") }
        XCTAssertEqual(first.last, .heading(level: 2, text: "Doanh số"), "the chart comes straight after the heading line")
    }

    func testTheMatchIgnoresAccentsCaseAndPunctuation() {
        let parts = ArticleLayout.place(segments: text("## 2. Doanh số:\nChữ"), media: [], charts: [chart("doanh so")])
        XCTAssertEqual(shape(parts), ["B1", "C:doanh so", "B1"])
    }

    func testAPictureGoesUnderTheListItemWhoseBoldLeadItNames() {
        let parts = ArticleLayout.place(segments: text("- **Hội An** - phố cổ\n- **Huế** - cố đô"), media: [picture("Hội An")], charts: [])
        XCTAssertEqual(shape(parts), ["B1", "P:Hội An", "B1"])
    }

    func testAPictureGoesUnderAHeadingToo() {
        let parts = ArticleLayout.place(segments: text("## Đà Nẵng\nBiển đẹp.\n\n## Huế\nCố đô."), media: [picture("Huế")], charts: [])
        XCTAssertEqual(shape(parts), ["B3", "P:Huế", "B1"])
    }

    func testAChartWinsItsSectionAndTheSectionsPictureIsNotShown() {
        let parts = ArticleLayout.place(segments: text("## Giá\nChữ"), media: [picture("Giá")], charts: [chart("Giá")])
        XCTAssertEqual(shape(parts), ["B1", "C:Giá", "B1"], "no picture anywhere, not even at the end")
    }

    func testEachChartAndPictureIsPlacedOnce() {
        let parts = ArticleLayout.place(segments: text("## Huế\na\n\n## Huế\nb"), media: [picture("Huế")], charts: [chart("Huế")])
        XCTAssertEqual(shape(parts), ["B1", "C:Huế", "B3"])
        let twoPictures = ArticleLayout.place(segments: text("## Huế\na"), media: [picture("Huế", 1), picture("Huế", 2)], charts: [])
        XCTAssertEqual(shape(twoPictures), ["B1", "P:Huế", "B1", "P:Huế"], "the second picture has no second heading: it goes last")
        let onePicture = ArticleLayout.place(segments: text("## Huế\na\n\n## Huế\nb"), media: [picture("Huế")], charts: [])
        XCTAssertEqual(shape(onePicture), ["B1", "P:Huế", "B3"], "one picture, two headings of that name: under the first only")
    }

    func testWhatMatchesNothingComesLastChartsBeforePictures() {
        let parts = ArticleLayout.place(segments: text("## A\nx"), media: [picture("Không có")], charts: [chart("Cũng không")])
        XCTAssertEqual(shape(parts), ["B2", "C:Cũng không", "P:Không có"])
    }

    func testWithNothingToPlaceTheTextIsOneBlocksPart() {
        let parts = ArticleLayout.place(segments: text("## A\n- b\n- c\n\nd"), media: [], charts: [])
        XCTAssertEqual(shape(parts), ["B4"])
    }

    func testEmptySegmentsGiveNoParts() {
        XCTAssertEqual(ArticleLayout.place(segments: [], media: [], charts: []), [])
        XCTAssertEqual(ArticleLayout.place(segments: [.text("   ")], media: [], charts: []), [])
    }

    func testPicturesWrittenInTheTextStayWhereTheyAreBetweenItsPieces() {
        let image = ParsedImage(alt: "a", url: "https://example.com/a.png")
        let parts = ArticleLayout.place(segments: [.text("Trước"), .images([image, image]), .text("Sau")], media: [], charts: [])
        XCTAssertEqual(shape(parts), ["B1", "I2", "B1"])
    }

    func testASectionInALaterPieceStillGetsItsChart() {
        let image = ParsedImage(alt: "a", url: "https://example.com/a.png")
        let parts = ArticleLayout.place(segments: [.text("Mở đầu"), .images([image]), .text("## Doanh số\nx")], media: [], charts: [chart("Doanh số")])
        XCTAssertEqual(shape(parts), ["B1", "I1", "B1", "C:Doanh số", "B1"])
    }

    func testTheOrderOfTwoChartsFollowsTheOrderOfTheirSectionsNotOfTheList() {
        let parts = ArticleLayout.place(segments: text("## Một\na\n\n## Hai\nb"), media: [], charts: [chart("Hai"), chart("Một")])
        XCTAssertEqual(shape(parts), ["B1", "C:Một", "B2", "C:Hai", "B1"])
    }

    // MARK: - needsLayout

    func testPlainProseWithItsPicturesAtTheEndKeepsTheOldDrawing() {
        let image = ParsedImage(alt: "a", url: "https://example.com/a.png")
        XCTAssertFalse(ArticleLayout.needsLayout(segments: text("Chỉ chữ thường.\n\nHai đoạn."), media: [], charts: []))
        XCTAssertFalse(ArticleLayout.needsLayout(segments: [.text("Chữ"), .images([image])], media: [], charts: []))
        XCTAssertFalse(ArticleLayout.needsLayout(segments: [], media: [], charts: []))
    }

    func testLayoutIsNilForPlainProseAndThePlacementOtherwise() {
        XCTAssertNil(ArticleLayout.layout(segments: text("Chỉ chữ."), media: [], charts: []))
        let parts = ArticleLayout.layout(segments: text("## Doanh số\nx"), media: [], charts: [chart("Doanh số")])
        XCTAssertEqual(parts.map(shape), ["B1", "C:Doanh số", "B1"])
        XCTAssertEqual(ArticleLayout.layout(segments: text("# T\nx"), media: [], charts: []).map(shape), ["B2"])
    }

    func testStructureAChartASectionPictureOrAPictureInTheMiddleNeedTheLayout() {
        let image = ParsedImage(alt: "a", url: "https://example.com/a.png")
        XCTAssertTrue(ArticleLayout.needsLayout(segments: text("## T\nx"), media: [], charts: []))
        XCTAssertTrue(ArticleLayout.needsLayout(segments: text("- a\n- b"), media: [], charts: []))
        XCTAssertTrue(ArticleLayout.needsLayout(segments: text("| a |\n|---|\n| 1 |"), media: [], charts: []))
        XCTAssertTrue(ArticleLayout.needsLayout(segments: text("Chữ"), media: [], charts: [chart("x")]))
        XCTAssertTrue(ArticleLayout.needsLayout(segments: text("Chữ"), media: [picture("x")], charts: []))
        XCTAssertTrue(ArticleLayout.needsLayout(segments: [.images([image]), .text("Sau")], media: [], charts: []))
    }
}
