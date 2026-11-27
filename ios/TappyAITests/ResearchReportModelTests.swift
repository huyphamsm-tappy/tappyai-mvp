import XCTest
@testable import TappyAI

/// Layout step 4 (owner spec 26/11, BƯỚC 4): the rules of the research report. The report texts are written the way the server writes them.
final class ResearchReportModelTests: XCTestCase {

    private let report = """
    # Thị trường xe điện
    ## Tổng quan
    Doanh số tăng mạnh trong năm [1](https://vnexpress.net/a) và [2].

    ## Giá bán
    Giá giảm nhẹ.

    ## Nguồn
    1. VnExpress — https://vnexpress.net/a
    2. Dân trí — https://dantri.com.vn/b
    """

    // MARK: Excerpt

    func testTheExcerptIsTheFirstSectionWithoutTheSourcesList() {
        let excerpt = ResearchReportModel.excerpt(report)
        XCTAssertTrue(excerpt.hasPrefix("Doanh số tăng mạnh"))
        XCTAssertFalse(excerpt.contains("VnExpress — https"), "the sources list is not in the excerpt")
        XCTAssertFalse(excerpt.contains("Giá giảm nhẹ"), "only the first section")
    }

    func testTheExcerptHasNoLinksOrCitationMarks() {
        let excerpt = ResearchReportModel.excerpt(report)
        XCTAssertTrue(excerpt.contains("vnexpress.net") == false)
        XCTAssertTrue(excerpt.contains("năm 1"), "the link text stays")
        XCTAssertFalse(excerpt.contains("[2]"))
        XCTAssertFalse(excerpt.contains("[1]"))
    }

    func testAReportWithoutHeadingsGivesItsOpeningLines() {
        XCTAssertEqual(ResearchReportModel.excerpt("Dòng một.\nDòng hai.\n\nNguồn: x"), "Dòng một.\nDòng hai.")
    }

    func testTheExcerptIsCutAtALineBoundaryAtOrBelowTheLimit() {
        let line = String(repeating: "a", count: 300) + "\n"
        let long = String(repeating: line, count: 10)   // 3010 characters
        let excerpt = ResearchReportModel.excerpt("## Mở\n" + long)
        XCTAssertLessThanOrEqual(excerpt.count, ResearchReportModel.excerptLimit)
        XCTAssertTrue(excerpt.allSatisfy { $0 == "a" || $0 == "\n" })
    }

    // MARK: Sources count

    func testTheSourceCountIsTheLargerOfTheLinksAndTheNumberedSourceLines() {
        XCTAssertEqual(ResearchReportModel.sourceCount(report: report, links: 0), 2, "two numbered lines under the sources heading")
        XCTAssertEqual(ResearchReportModel.sourceCount(report: report, links: 5), 5, "the server's link list when it is longer")
        XCTAssertEqual(ResearchReportModel.sourceCount(report: "## Tổng quan\nKhông có nguồn.", links: 0), 0)
    }

    // MARK: Recognition from text (history)

    func testALongReportWithFourSectionsIsARecognisedReport() {
        let body = String(repeating: "Một đoạn nội dung đủ dài để tạo báo cáo. ", count: 200)
        let long = (1...4).map { "## Mục \($0)\n\(body)" }.joined(separator: "\n")
        XCTAssertTrue(ResearchReportModel.isReport(long))
    }

    func testAShortAnswerOrAFewSectionsIsNotAReport() {
        XCTAssertFalse(ResearchReportModel.isReport("## Một\nNgắn."))
        let body = String(repeating: "x", count: 9000)
        XCTAssertFalse(ResearchReportModel.isReport("## A\n" + body + "\n## B\n" + body), "two sections only")
    }

    // MARK: Steps while writing

    func testWhileWritingOnlyFinishedAndRunningStepsAreDrawn() {
        let steps: [(title: String, status: ResearchStepStatus)] = [("a", .done), ("b", .running), ("c", .pending), ("d", .failed)]
        let visible = ResearchReportModel.visibleSteps(steps, phase: .writing, status: { $0.status })
        XCTAssertEqual(visible.map(\.title), ["a", "b"])
    }

    func testOtherPhasesDrawEverySteps() {
        let steps: [(title: String, status: ResearchStepStatus)] = [("a", .pending), ("b", .done)]
        XCTAssertEqual(ResearchReportModel.visibleSteps(steps, phase: .researching, status: { $0.status }).count, 2)
    }

    // MARK: Sections for the content tab

    func testTheSectionsAreTheHeadingsWithTheirBodies() {
        let sections = ResearchReportModel.sections(report)
        // The report's «# » title line is before the first «## » heading, so it is the opening section's text.
        XCTAssertEqual(sections.map(\.title), ["Mở đầu", "Tổng quan", "Giá bán", "Nguồn"])
        XCTAssertTrue(sections[0].body.contains("# Thị trường xe điện"))
        XCTAssertTrue(sections[2].body.contains("Giá giảm nhẹ"))
    }
}
