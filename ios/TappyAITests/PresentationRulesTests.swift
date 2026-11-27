import XCTest
@testable import TappyAI

/// Layout step 3 (owner spec 26/11): the rules that decide which declared blocks are drawn beside an answer, how subjects and pictures are laid
/// out. Each rule is pinned on data written the way the server writes it.
final class PresentationRulesTests: XCTestCase {

    private func compare(_ id: String = "c1") -> PresentationBlock {
        .compare(id: id, title: "So sánh", columns: ["A", "B"], rows: [PresentationBlock.CompareRow(label: "Giá", cells: ["1", "2"])], pick: 1)
    }

    private func profiles(_ id: String = "p1", points: Int = 2) -> PresentationBlock {
        .profiles(id: id, title: nil, items: [PresentationBlock.ProfileItem(name: "X", subtitle: nil,
                                                                             points: (0..<points).map { PresentationBlock.ProfilePoint(lead: nil, text: "điểm \($0)") },
                                                                             sources: [])])
    }

    private func frame(_ blocks: [PresentationBlock]) -> PresentationFrame {
        PresentationFrame(blocks: blocks, links: [:])
    }

    // MARK: Places replace the model's profile and comparison blocks

    func testWithPlacesOnTheAnswerTheProfilesAndTheComparisonStepAside() {
        let framed = PresentationRules.framed(frame([compare(), profiles(), .ask(id: "a1", questions: [])]), hasPlaces: true, textHasTable: false)
        XCTAssertEqual(framed.blocks.map(\.id), ["a1"], "one look, never two: the places are the answer's cards")
    }

    func testWithoutPlacesTheDeclaredBlocksStay() {
        let framed = PresentationRules.framed(frame([compare(), profiles()]), hasPlaces: false, textHasTable: false)
        XCTAssertEqual(framed.blocks.count, 2)
    }

    // MARK: A markdown table in the text replaces the declared comparison only

    func testATableInTheTextReplacesTheDeclaredComparisonButNotTheProfiles() {
        let framed = PresentationRules.framed(frame([compare(), profiles()]), hasPlaces: false, textHasTable: true)
        XCTAssertEqual(framed.blocks.map(\.id), ["p1"])
    }

    func testTheTableCheckFindsAMarkdownTable() {
        XCTAssertTrue(PresentationRules.textHasTable("Giới thiệu.\n| A | B |\n|---|---|\n| 1 | 2 |"))
        XCTAssertFalse(PresentationRules.textHasTable("Chỉ là văn bản thường."))
    }

    // MARK: Subjects as a table

    func testThreeSubjectsWithOnePointEachAreATable() {
        let one = PresentationBlock.ProfileItem(name: "A", subtitle: nil, points: [PresentationBlock.ProfilePoint(lead: nil, text: "x")], sources: [])
        XCTAssertTrue(PresentationRules.profilesAsTable([one, one, one]))
    }

    func testTwoSubjectsOrAMultiPointSubjectAreCards() {
        let one = PresentationBlock.ProfileItem(name: "A", subtitle: nil, points: [PresentationBlock.ProfilePoint(lead: nil, text: "x")], sources: [])
        let many = PresentationBlock.ProfileItem(name: "B", subtitle: nil, points: [PresentationBlock.ProfilePoint(lead: nil, text: "x"),
                                                                                    PresentationBlock.ProfilePoint(lead: nil, text: "y")], sources: [])
        XCTAssertFalse(PresentationRules.profilesAsTable([one, one]))
        XCTAssertFalse(PresentationRules.profilesAsTable([one, one, many]))
    }

    // MARK: Gallery layout by the count of pictures found

    func testTheGalleryLayoutFollowsTheCountOfPictures() {
        XCTAssertEqual(PresentationRules.galleryLayout(pictures: 0), .none, "no picture, nothing drawn")
        XCTAssertEqual(PresentationRules.galleryLayout(pictures: 1), .wide)
        XCTAssertEqual(PresentationRules.galleryLayout(pictures: 2), .pair)
        XCTAssertEqual(PresentationRules.galleryLayout(pictures: 3), .trio)
    }
}
