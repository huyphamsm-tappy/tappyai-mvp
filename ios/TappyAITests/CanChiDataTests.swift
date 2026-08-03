import XCTest
@testable import TappyAI

/// Golden vectors for the canonical Can Chi / Nạp Âm engine. The identical vector list is asserted
/// by web (`src/lib/boi/canChiEngine.test.ts`) and Android
/// (`android/app/src/test/java/com/tappyai/app/fortune/tuvi/FortuneCanChiEngineTest.kt`) — any
/// change must be made on all three platforms.
final class CanChiDataTests: XCTestCase {

    private struct Vector {
        let year: Int
        let heavenlyStem: String
        let earthlyBranch: String
        let canChi: String
        let napAm: String
        let element: String
    }

    private let vectors: [Vector] = [
        Vector(year: 1984, heavenlyStem: "Giáp", earthlyBranch: "Tý", canChi: "Giáp Tý", napAm: "Hải Trung Kim", element: "Kim"),
        Vector(year: 1985, heavenlyStem: "Ất", earthlyBranch: "Sửu", canChi: "Ất Sửu", napAm: "Hải Trung Kim", element: "Kim"),
        Vector(year: 1986, heavenlyStem: "Bính", earthlyBranch: "Dần", canChi: "Bính Dần", napAm: "Lư Trung Hỏa", element: "Hỏa"),
        Vector(year: 1990, heavenlyStem: "Canh", earthlyBranch: "Ngọ", canChi: "Canh Ngọ", napAm: "Lộ Bàng Thổ", element: "Thổ"),
        Vector(year: 2000, heavenlyStem: "Canh", earthlyBranch: "Thìn", canChi: "Canh Thìn", napAm: "Bạch Lạp Kim", element: "Kim"),
        Vector(year: 2020, heavenlyStem: "Canh", earthlyBranch: "Tý", canChi: "Canh Tý", napAm: "Bích Thượng Thổ", element: "Thổ"),
        Vector(year: 1924, heavenlyStem: "Giáp", earthlyBranch: "Tý", canChi: "Giáp Tý", napAm: "Hải Trung Kim", element: "Kim"),
        Vector(year: 2045, heavenlyStem: "Ất", earthlyBranch: "Sửu", canChi: "Ất Sửu", napAm: "Hải Trung Kim", element: "Kim"),
    ]

    func test_tables_have10Stems12Branches30NapAmEntries() {
        XCTAssertEqual(CanChiEngine.heavenlyStems.count, 10)
        XCTAssertEqual(CanChiEngine.earthlyBranches.count, 12)
        XCTAssertEqual(CanChiEngine.napAm.count, 30)
    }

    func test_everyNapAmEntry_carriesAValidElementAlongsideItsName() {
        for entry in CanChiEngine.napAm {
            XCTAssertFalse(entry.name.isEmpty)
            XCTAssertTrue(CanChiEngine.elements.contains(entry.element))
        }
    }

    // Locks the table's element SEQUENCE itself, so a future typo in one row (e.g. the wrong
    // element paired with a napAm name) is caught even though name+element already live together.
    func test_the30NapAmEntries_followTheCanonicalElementCycle() {
        let expectedCycle = [
            "Kim", "Hỏa", "Mộc", "Thổ", "Kim", "Hỏa", "Thủy", "Thổ", "Kim", "Mộc",
            "Thủy", "Thổ", "Hỏa", "Mộc", "Thủy", "Kim", "Hỏa", "Mộc", "Thổ", "Kim",
            "Hỏa", "Thủy", "Thổ", "Kim", "Mộc", "Thủy", "Thổ", "Hỏa", "Mộc", "Thủy",
        ]
        XCTAssertEqual(CanChiEngine.napAm.map { $0.element }, expectedCycle)
    }

    func test_getAstrologyProfile_matchesGoldenVectors() {
        for v in vectors {
            let r = CanChiEngine.profile(v.year)
            XCTAssertEqual(r.heavenlyStem, v.heavenlyStem, "\(v.year) heavenlyStem")
            XCTAssertEqual(r.earthlyBranch, v.earthlyBranch, "\(v.year) earthlyBranch")
            XCTAssertEqual(r.canChi, v.canChi, "\(v.year) canChi")
            XCTAssertEqual(r.napAm, v.napAm, "\(v.year) napAm")
            XCTAssertEqual(r.element, v.element, "\(v.year) element")
        }
    }

    func test_1985_isAtSuuHaiTrungKimKim_regressionLastDigitRuleReturnedMoc() {
        let r = CanChiEngine.profile(1985)
        XCTAssertEqual(r.heavenlyStem, "Ất")
        XCTAssertEqual(r.earthlyBranch, "Sửu")
        XCTAssertEqual(r.canChi, "Ất Sửu")
        XCTAssertEqual(r.napAm, "Hải Trung Kim")
        XCTAssertEqual(r.element, "Kim")
        XCTAssertNotEqual(r.element, "Mộc")
    }

    func test_repeatsWithAPeriodOf60Years() {
        for year in 1900...2100 {
            XCTAssertEqual(CanChiEngine.profile(year), CanChiEngine.profile(year + 60))
        }
    }

    func test_yieldsNonEmptyFieldsAndAValidElement_forEveryYearInA60YearSpan() {
        for year in 1960..<2020 {
            let r = CanChiEngine.profile(year)
            XCTAssertFalse(r.heavenlyStem.isEmpty)
            XCTAssertFalse(r.earthlyBranch.isEmpty)
            XCTAssertEqual(r.canChi, "\(r.heavenlyStem) \(r.earthlyBranch)")
            XCTAssertFalse(r.napAm.isEmpty)
            XCTAssertTrue(CanChiEngine.elements.contains(r.element))
        }
    }

    func test_coversAll60StemBranchPairsAndAll30NapAm_acrossOneCycle() {
        var pairs = Set<String>()
        var napAms = Set<String>()
        for year in 1984..<2044 {
            let r = CanChiEngine.profile(year)
            pairs.insert(r.canChi)
            napAms.insert(r.napAm)
        }
        XCTAssertEqual(pairs.count, 60)
        XCTAssertEqual(napAms.count, 30)
    }

    func test_isTotal_forYearsBeforeAD4_noNegativeModuloCrash() {
        let r = CanChiEngine.profile(-1)
        XCTAssertTrue(CanChiEngine.elements.contains(r.element))
        XCTAssertEqual(r.canChi, CanChiEngine.profile(59).canChi)
    }

    func test_getNguHanh_nowReturnsTheNapAmElement() {
        for v in vectors {
            XCTAssertEqual(CanChiData.getNguHanh(v.year), v.element)
        }
    }

    func test_the12BranchZodiacList_stillAgreesWithTheEngineBranch() {
        for year in 1960..<2020 {
            XCTAssertEqual(CanChiData.getByYear(year).nameVi, CanChiEngine.profile(year).earthlyBranch)
        }
    }
}
