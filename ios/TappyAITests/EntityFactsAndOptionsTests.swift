import XCTest
@testable import TappyAI

/// Layout step 3 leftovers: a subject card's quick facts (Wikidata, through the server) and the option cards of a recommendation.
final class EntityFactsAndOptionsTests: XCTestCase {

    // MARK: - Quick facts

    func testFactsAreReadAndBounded() {
        let long = String(repeating: "x", count: 400)
        let json = """
        {"facts":[{"label":"Sinh","value":"1971"},{"label":"","value":"no label"},{"label":"Mất","value":""},
                  {"label":"Nghề nghiệp","value":"\(long)"}],"wikidata":"https://www.wikidata.org/wiki/Q317521"}
        """
        let facts = EntityFacts.parse(Data(json.utf8))
        XCTAssertEqual(facts.map(\.label), ["Sinh", "Nghề nghiệp"], "a pair missing its label or value is dropped")
        XCTAssertEqual(facts[1].value.count, EntityFacts.maxValue)
    }

    func testAtMostEightFactsAndNotJSONGivesNone() {
        let pairs = (1...12).map { "{\"label\":\"L\($0)\",\"value\":\"V\($0)\"}" }.joined(separator: ",")
        XCTAssertEqual(EntityFacts.parse(Data("{\"facts\":[\(pairs)]}".utf8)).count, 8)
        XCTAssertTrue(EntityFacts.parse(Data("not json".utf8)).isEmpty)
        XCTAssertTrue(EntityFacts.parse(Data("{\"facts\":[]}".utf8)).isEmpty, "a subject with no facts shows no facts row")
    }

    func testWikipediaTitleAndLanguageComeFromTheArticleLink() {
        let vi = EntityFacts.wikiTitle(fromHref: "https://vi.wikipedia.org/wiki/Elon_Musk")
        XCTAssertEqual(vi?.title, "Elon Musk"); XCTAssertEqual(vi?.wiki, "vi")
        let en = EntityFacts.wikiTitle(fromHref: "https://en.wikipedia.org/wiki/Ho_Chi_Minh_City")
        XCTAssertEqual(en?.title, "Ho Chi Minh City"); XCTAssertEqual(en?.wiki, "en")
        let encoded = EntityFacts.wikiTitle(fromHref: "https://vi.wikipedia.org/wiki/Th%C3%A0nh_ph%E1%BB%91_H%E1%BB%93_Ch%C3%AD_Minh")
        XCTAssertEqual(encoded?.title, "Thành phố Hồ Chí Minh")
        XCTAssertNil(EntityFacts.wikiTitle(fromHref: "https://example.com/wiki/Elon_Musk"), "only the two Wikipedias")
        XCTAssertNil(EntityFacts.wikiTitle(fromHref: "https://vi.wikipedia.org/w/index.php?title=X"))
    }

    // MARK: - Subject pictures from Wikipedia

    func testProfilePicturesKeepOnlyWikimediaPicturesByNormalizedName() {
        let json = """
        {"profiles":[
          {"name":"Elon Musk","title":"Elon Musk","image":"https://upload.wikimedia.org/wikipedia/commons/a/a1/x.jpg"},
          {"name":"Tesla","image":"https://evil.example.com/x.jpg"},
          {"name":"SpaceX","image":null}]}
        """
        let images = EntityFacts.profileImages(Data(json.utf8))
        XCTAssertEqual(Array(images.keys), [SubjectImages.key("Elon Musk")], "a picture off the Wikimedia hosts, or none, is left out")
        XCTAssertTrue(EntityFacts.profileImages(Data("nope".utf8)).isEmpty)
    }

    func testReportIntroSectionIsKeyedByOneConstant() {
        let sections = ResearchReportModel.sections("Dẫn nhập\n\n## Mục A\nnội dung")
        XCTAssertEqual(sections.first?.title, ResearchReportModel.introTitle)
        XCTAssertEqual(sections.dropFirst().first?.title, "Mục A")
    }

    // MARK: - Topic banner

    func testTopicBannerIsAClosedListWithItsOwnPictureCount() {
        guard case .topic(let key, let variant)? = parsed("{\"v\":1,\"kind\":\"topic\",\"topic\":\"currency\",\"variant\":2}").first else { return XCTFail("expected a topic") }
        XCTAssertEqual(key, "currency"); XCTAssertEqual(variant, 2)
        // A picture number that does not exist falls back to the first; a topic outside the list is nothing.
        guard case .topic(_, let fallback)? = parsed("{\"v\":1,\"kind\":\"topic\",\"topic\":\"gold\",\"variant\":9}").first else { return XCTFail("expected a topic") }
        XCTAssertEqual(fallback, 0)
        XCTAssertTrue(parsed("{\"v\":1,\"kind\":\"topic\",\"topic\":\"weather\"}").isEmpty)
        XCTAssertEqual(MediaBlocks.topicImageURL(key: "gold", variant: 0)?.lastPathComponent, "topic-gold.webp")
        XCTAssertEqual(MediaBlocks.topicImageURL(key: "gold", variant: 1)?.lastPathComponent, "topic-gold-1.webp")
        XCTAssertNil(MediaBlocks.topicImageURL(key: "gold", variant: 2))
    }

    // MARK: - Options

    private func parsed(_ json: String) -> [MediaBlock] {
        MediaBlocks.parse("Intro\n[TAPPY_MEDIA]\(json)[/TAPPY_MEDIA]").blocks
    }

    func testOptionsBlockIsDecodedWithTheWebsLimits() {
        let json = """
        {"v":1,"kind":"options","title":"Tour Hạ Long","options":[
          {"name":"Tour A","badge":"Rẻ nhất","figure":"1.200.000đ","figureNote":"giá niêm yết, 10/2026","verdict":"Hợp nhóm nhỏ",
           "highlights":["a","b","c","d","e","f"],"extras":["x","y","z","w","v"],"caveat":"Chưa gồm vé","href":"https://example.com/a","linkLabel":"Xem"},
          {"name":"","figure":"nope"},
          {"name":"Tour B","href":"http://insecure.example.com"}]}
        """
        guard case .options(let title, let options)? = parsed(json).first else { return XCTFail("expected an options block") }
        XCTAssertEqual(title, "Tour Hạ Long")
        XCTAssertEqual(options.map(\.name), ["Tour A", "Tour B"], "an option without a name is dropped")
        XCTAssertEqual(options[0].highlights.count, 5)
        XCTAssertEqual(options[0].extras.count, 4)
        XCTAssertEqual(options[0].href, "https://example.com/a")
        XCTAssertNil(options[1].href, "a link must be https")
        XCTAssertNil(options[1].linkLabel)
    }

    func testAtMostSixOptionsAndAnEmptyBlockIsNothing() {
        let many = (1...9).map { "{\"name\":\"O\($0)\"}" }.joined(separator: ",")
        guard case .options(_, let options)? = parsed("{\"v\":1,\"kind\":\"options\",\"options\":[\(many)]}").first else { return XCTFail("expected options") }
        XCTAssertEqual(options.count, 6)
        XCTAssertTrue(parsed("{\"v\":1,\"kind\":\"options\",\"options\":[{\"name\":\"\"}]}").isEmpty)
    }
}
