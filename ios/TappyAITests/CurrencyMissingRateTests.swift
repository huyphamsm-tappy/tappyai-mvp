import XCTest
@testable import TappyAI

/// Web `crossRate` (src/lib/finance/exchange.ts) never falls back to 1: a missing currency stops the conversion and the card shows
/// `currency.missingRate` for that code. iOS used `rates[code] ?? 1`, which produced a wrong number.
@MainActor
final class CurrencyMissingRateTests: XCTestCase {

    private func makeVM(rates: [String: Double]?, from: String, to: String, amount: String = "100") -> CurrencyViewModel {
        let vm = CurrencyViewModel(service: UtilityToolsService(api: MockAPIClient()))
        vm.rates = rates
        vm.fromCode = from
        vm.toCode = to
        vm.amount = amount
        return vm
    }

    func testMissingToCurrencyYieldsNoNumberAndNamesTheCode() {
        let vm = makeVM(rates: ["USD": 1, "VND": 25000], from: "VND", to: "IDR")
        XCTAssertNil(vm.conversionRate)
        XCTAssertNil(vm.convertedAmount)
        XCTAssertEqual(vm.missingCode, "IDR")
    }

    func testMissingFromCurrencyNamesTheFromCode() {
        let vm = makeVM(rates: ["USD": 1, "VND": 25000], from: "IDR", to: "USD")
        XCTAssertNil(vm.convertedAmount)
        XCTAssertEqual(vm.missingCode, "IDR")
    }

    func testNonPositiveRateCountsAsMissing() {
        let vm = makeVM(rates: ["USD": 1, "ZED": 0], from: "ZED", to: "USD")
        XCTAssertNil(vm.conversionRate)
        XCTAssertEqual(vm.missingCode, "ZED")
    }

    func testUSDAbsentFromTheTableIsMissingToo() {
        // Web requires rates.USD as well; the old code special-cased USD and returned 1/x.
        let vm = makeVM(rates: ["VND": 25000], from: "VND", to: "USD")
        XCTAssertNil(vm.convertedAmount)
        XCTAssertEqual(vm.missingCode, "USD")
    }

    func testCompleteTableConvertsAsBefore() throws {
        let vm = makeVM(rates: ["USD": 1, "VND": 25000, "EUR": 0.5], from: "VND", to: "EUR")
        XCTAssertNil(vm.missingCode)
        XCTAssertEqual(try XCTUnwrap(vm.conversionRate), 0.5 / 25000, accuracy: 1e-12)
        XCTAssertEqual(try XCTUnwrap(vm.convertedAmount), 100 * 0.5 / 25000, accuracy: 1e-9)
    }

    func testNoMissingMessageWithoutAnAmountOrRates() {
        XCTAssertNil(makeVM(rates: ["USD": 1], from: "VND", to: "USD", amount: "0").missingCode)
        XCTAssertNil(makeVM(rates: nil, from: "VND", to: "USD").missingCode)
    }
}
