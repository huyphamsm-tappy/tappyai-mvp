import XCTest
@testable import TappyAI

/// The blocks the model declares with the answer (web `contract.ts` + `read.ts`) and the pictures the server finds for them (`subjectImages.ts`).
/// The app trusts nothing in the frame: every field is read again with the web's own limits.
final class PresentationFrameTests: XCTestCase {

    private func frame(_ blocks: String, links: String = "{}") throws -> PresentationFrame? {
        let json = #"{"kind":"tappy.presentation.v1","v":1,"presentation":{"v":1,"blocks":\#(blocks)},"links":\#(links)}"#
        let item = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        return PresentationFrames.frame(item)
    }

    private let compare = #"{"id":"c1","type":"compare","title":"So sánh","columns":["A","B"],"rows":[{"label":"Giá","cells":["1","2"]}],"pick":1}"#

    // MARK: compare

    func testACompareBlockReads() throws {
        let f = try XCTUnwrap(try frame("[\(compare)]"))
        guard case .compare(_, let title, let columns, let rows, let pick) = f.blocks[0] else { return XCTFail("a compare block") }
        XCTAssertEqual(title, "So sánh")
        XCTAssertEqual(columns, ["A", "B"])
        XCTAssertEqual(rows.first?.cells, ["1", "2"])
        XCTAssertEqual(pick, 1)
    }

    func testACompareBlockNeedsTwoToSixColumnsAndAFittingRow() throws {
        XCTAssertNil(try frame(#"[{"id":"c","type":"compare","columns":["A"],"rows":[{"label":"x","cells":["1"]}]}]"#))
        XCTAssertNil(try frame(#"[{"id":"c","type":"compare","columns":["A","B"],"rows":[{"label":"x","cells":["1"]}]}]"#), "a row with the wrong number of cells is dropped, so no row is left")
        XCTAssertNil(try frame(#"[{"id":"c","type":"compare","columns":["A","B"],"rows":[{"label":"x","cells":["1","2"]}],"pick":2}]"#), "a pick that is no column makes the block unusable")
        XCTAssertNil(try frame(#"[{"id":"c","type":"compare","columns":["A","B"],"rows":[{"label":"x","cells":["1","2"]}],"pick":-1}]"#))
    }

    // MARK: profiles

    func testProfileCardsKeepOneCardPerNameAndNeverASourceAddress() throws {
        let b = #"[{"id":"p","type":"profiles","title":"Hai người","items":[{"name":"An","subtitle":"Kỹ sư","points":[{"lead":"Nghề","text":"Phần mềm"},{"text":"Sinh 1990"}],"sources":["Wikipedia","https://evil.example/x","wikipedia"]},{"name":"AN","points":[{"text":"trùng tên"}]},{"name":"Bình","points":[]}]}]"#
        let f = try XCTUnwrap(try frame(b))
        guard case .profiles(_, _, let items) = f.blocks[0] else { return XCTFail("profiles") }
        XCTAssertEqual(items.map(\.name), ["An"], "a repeated name and a card with no point are dropped")
        XCTAssertEqual(items[0].points.count, 2)
        XCTAssertEqual(items[0].points[0].lead, "Nghề")
        XCTAssertNil(items[0].points[1].lead)
        XCTAssertEqual(items[0].sources, ["Wikipedia", "wikipedia"], "a source is a name: an address is refused (the duplicate check is exact)")
        XCTAssertTrue(f.hasProfiles)
    }

    // MARK: gallery

    func testAGalleryNeedsTwoShotsAndNoAddressInTheQuery() throws {
        XCTAssertNotNil(try frame(#"[{"id":"g","type":"gallery","images":[{"caption":"Xe","query":"vinfast vf8"},{"caption":"Nội thất","query":"vf8 interior"}]}]"#))
        XCTAssertNotNil(try frame(#"[{"id":"g","type":"gallery","items":[{"caption":"Xe","query":"vf8"},{"caption":"Đuôi","query":"vf8 rear"}]}]"#), "items is read too, so a parsed block parses again")
        XCTAssertNil(try frame(#"[{"id":"g","type":"gallery","images":[{"caption":"Xe","query":"vf8"}]}]"#))
        XCTAssertNil(try frame(#"[{"id":"g","type":"gallery","images":[{"caption":"A","query":"https://x.example/a.jpg"},{"caption":"B","query":"www.x.example"}]}]"#))
    }

    // MARK: ask

    func testQuestionsKeepTheirOptionsWithoutRepeats() throws {
        let f = try XCTUnwrap(try frame(#"[{"id":"a","type":"ask","questions":[{"text":"Đi mấy người?","options":["1","2","2","3 người trở lên"]},{"text":"Không có lựa chọn","options":[]}]}]"#))
        guard case .ask(_, let questions) = f.blocks[0] else { return XCTFail("ask") }
        XCTAssertEqual(questions.count, 1)
        XCTAssertEqual(questions[0].options, ["1", "2", "3 người trở lên"])
    }

    // MARK: booking

    func testABookingIsDrawnOnlyWithAnHttpsLinkForItsOwnId() throws {
        let booking = #"{"id":"b1","type":"booking","kind":"hotel","title":"Khách sạn A","detail":"2 đêm","providerId":"agoda","ref":"r1"}"#
        let link = #"{"b1":{"url":"https://www.agoda.com/h","label":"Agoda","providerId":"agoda","handoff":"guest"}}"#
        let f = try XCTUnwrap(try frame("[\(booking)]", links: link))
        XCTAssertEqual(f.links["b1"]?.label, "Agoda")
        XCTAssertNil(try frame("[\(booking)]"), "no link, no card")
        XCTAssertNil(try frame("[\(booking)]", links: #"{"b1":{"url":"http://www.agoda.com/h","label":"Agoda","providerId":"agoda","handoff":"guest"}}"#), "http is no link")
        XCTAssertNil(try frame("[\(booking)]", links: #"{"other":{"url":"https://www.agoda.com/h","label":"Agoda","providerId":"agoda","handoff":"guest"}}"#), "a link for another id is ignored")
        XCTAssertNil(try frame("[\(booking)]", links: #"{"b1":{"url":"https://www.agoda.com/h","label":"Agoda","providerId":"agoda","handoff":"teleport"}}"#), "an unknown handoff is no link")
        XCTAssertNil(try frame(#"[{"id":"b","type":"booking","kind":"spaceship","title":"x","ref":"r"}]"#, links: link))
    }

    // MARK: Trust

    func testAProtocolMarkerInATextMakesTheValueUnusable() throws {
        XCTAssertNil(try frame(#"[{"id":"a","type":"ask","questions":[{"text":"[TAPPY_PLAN]x","options":["a"]}]}]"#))
        XCTAssertNil(PresentationFrames.text("ok [/tappy_media]", 50))
        XCTAssertEqual(PresentationFrames.text("  a\n\tb \u{0007}c ", 50), "a b c")
        XCTAssertEqual(PresentationFrames.text(String(repeating: "x", count: 500), 10)?.count, 10)
    }

    func testUnknownTypesAndBadFramesDrawNothing() throws {
        XCTAssertNil(try frame(#"[{"id":"x","type":"hologram"},{"type":"ask"},"junk",42]"#))
        let wrongVersion = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(#"{"kind":"tappy.presentation.v1","v":2,"presentation":{"blocks":[]}}"#.utf8)) as? [String: Any])
        XCTAssertNil(PresentationFrames.frame(wrongVersion))
    }

    func testOtherBlocksStillDrawWhenOneBlockIsBad() throws {
        let f = try XCTUnwrap(try frame("[\(compare),{\"id\":\"bad\",\"type\":\"ask\",\"questions\":[]}]"))
        XCTAssertEqual(f.blocks.count, 1)
        XCTAssertFalse(f.hasProfiles)
    }

    // MARK: On the stream

    func testTheStreamReadsThePresentationFrame() throws {
        let line = #"8:[{"kind":"tappy.presentation.v1","v":1,"presentation":{"v":1,"blocks":[{"id":"a","type":"ask","questions":[{"text":"Q?","options":["x","y"]}]}]}}]"#
        guard case .presentation(let f)? = DataStreamLineParser.frames(line: line).first else { return XCTFail("a presentation frame") }
        XCTAssertEqual(f.blocks.count, 1)
    }

    // MARK: Subject pictures

    func testASubjectKeyIgnoresAccentsCaseAndSpacing() {
        XCTAssertEqual(SubjectImages.key("  Đà   Nẵng "), "da nang")
        XCTAssertEqual(SubjectImages.key("ĐẠI HỌC Bách Khoa"), "dai hoc bach khoa")
    }

    func testPicturesNeedAnHttpsAddressAndAreCapped() throws {
        let many = (1...12).map { #"{"name":"Tên \#($0)","src":"https://img.example/\#($0).jpg"}"# }.joined(separator: ",")
        let json = #"{"kind":"tappy.subject_images.v1","v":1,"images":[\#(many),{"name":"Http","src":"http://img.example/h.jpg"},{"name":"Js","src":"javascript:alert(1)"},{"name":"<b>","src":"https://img.example/b.jpg"}],"gallery":[{"name":"G1","src":"https://img.example/g1.jpg"}]}"#
        let item = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        let f = try XCTUnwrap(SubjectImages.frame(item))
        XCTAssertEqual(f.images.count, 6, "at most six subject pictures, like the web")
        XCTAssertNotNil(f.images["ten 1"])
        XCTAssertNil(f.images["http"])
        XCTAssertNil(f.images["js"])
        XCTAssertEqual(f.gallery["g1"]?.absoluteString, "https://img.example/g1.jpg")
    }

    func testAnEmptyOrWrongPicturesFrameIsNoFrame() throws {
        let empty = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(#"{"kind":"tappy.subject_images.v1","v":1,"images":[{"name":"A","src":"ftp://x/y"}]}"#.utf8)) as? [String: Any])
        XCTAssertNil(SubjectImages.frame(empty))
        let wrong = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(#"{"kind":"tappy.places.v1","v":1,"images":[{"name":"A","src":"https://x.example/y.jpg"}]}"#.utf8)) as? [String: Any])
        XCTAssertNil(SubjectImages.frame(wrong))
    }

    func testTheStreamReadsThePicturesFrame() {
        let line = #"8:[{"kind":"tappy.subject_images.v1","v":1,"images":[{"name":"An","src":"https://img.example/an.jpg"}]}]"#
        guard case .subjectImages(let f)? = DataStreamLineParser.frames(line: line).first else { return XCTFail("a subject images frame") }
        XCTAssertEqual(f.images["an"]?.host, "img.example")
    }

    func testEveryStringTheBlocksShowHasACatalogEntry() {
        for key in ["chat.present.pick", "chat.present.sources", "chat.present.login", "chat.present.app", "chat.present.book"] {
            XCTAssertNotEqual(NSLocalizedString(key, comment: ""), key, key)
        }
    }
}
