import XCTest
@testable import TappyAI

/// Web `fitPersons` / `enterCustomMode` / `addPerson` (src/app/(app)/split-bill/page.tsx).
final class SplitBillRowsTests: XCTestCase {

    private let name: (Int) -> String = { "P\($0)" }

    private func rows(_ ids: [Int]) -> [SplitPerson] {
        ids.map { SplitPerson(id: $0, name: "n\($0)", amount: "\($0)00") }
    }

    func testEnteringByItemFitsTheRowsToThePeopleCount() {
        // people went 2 -> 5 in equal mode; the list still has the two initial rows.
        let fitted = SplitBillRows.fit(rows([1, 2]), to: 5, name: name)
        XCTAssertEqual(fitted.map(\.id), [1, 2, 3, 4, 5])
        XCTAssertEqual(fitted.map(\.name), ["n1", "n2", "P3", "P4", "P5"])
        XCTAssertEqual(fitted[0].amount, "100", "existing rows keep their amounts")
        XCTAssertEqual(fitted[4].amount, "")
    }

    func testGrowthContinuesFromTheHighestIdNotTheRowIndex() {
        // a row (id 2) was removed earlier: ids 1, 3 remain. New ids must not collide with 3.
        let fitted = SplitBillRows.fit(rows([1, 3]), to: 4, name: name)
        XCTAssertEqual(fitted.map(\.id), [1, 3, 4, 5])
        XCTAssertEqual(Set(fitted.map(\.id)).count, fitted.count)
        XCTAssertEqual(fitted.map(\.name), ["n1", "n3", "P3", "P4"], "default names count rows, as Web")
    }

    func testShrinkDropsRowsFromTheEnd() {
        XCTAssertEqual(SplitBillRows.fit(rows([1, 2, 3, 4]), to: 2, name: name).map(\.id), [1, 2])
    }

    func testSameCountIsUnchanged() {
        let r = rows([1, 2])
        XCTAssertEqual(SplitBillRows.fit(r, to: 2, name: name), r)
    }

    func testAddPersonUsesMaxPlusOne() {
        let added = SplitBillRows.adding(to: rows([1, 5]), name: name)
        XCTAssertEqual(added.map(\.id), [1, 5, 6])
        XCTAssertEqual(added.last?.name, "P3")
    }

    func testDefaultNameIsLocalised() throws {
        let path = try XCTUnwrap(Bundle.main.path(forResource: "vi", ofType: "lproj"))
        let value = Bundle(path: path)?.localizedString(forKey: "splitbill.personDefaultName", value: "MISSING", table: nil)
        XCTAssertEqual(value, "Người %d")
    }
}
