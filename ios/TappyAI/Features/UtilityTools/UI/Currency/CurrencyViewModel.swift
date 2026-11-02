import Foundation

@MainActor
final class CurrencyViewModel: AppObservableObject {
    @AppPublished var rates: [String: Double]?
    @AppPublished var rateDate: String?
    @AppPublished var isFallback = false
    @AppPublished var loading = true
    @AppPublished var amount = "1000000"
    @AppPublished var fromCode = "VND"
    @AppPublished var toCode = "USD"

    private let service: UtilityToolsService

    init(service: UtilityToolsService) {
        self.service = service
    }

    func loadRates() async {
        loading = true
        do {
            let response = try await service.fetchRates()
            rates = response.rates
            rateDate = response.date
            isFallback = response.fallback
        } catch {
            rates = fallbackRates
            isFallback = true
        }
        loading = false
    }

    func swap() {
        let temp = fromCode
        fromCode = toCode
        toCode = temp
    }

    var numAmount: Double {
        Double(amount.replacingOccurrences(of: "[^0-9.]", with: "", options: .regularExpression)) ?? 0
    }

    var convertedAmount: Double? {
        guard let rates, numAmount > 0 else { return nil }
        let rate = conversionRate
        guard let rate else { return nil }
        return numAmount * rate
    }

    /// Cross rate A -> USD -> B, as Web `crossRate` (src/lib/finance/exchange.ts). A missing or non-positive
    /// rate yields nil and `missingCode`; it never silently falls back to 1.
    var conversionRate: Double? {
        guard let rates else { return nil }
        guard let fromRate = Self.validRate(rates[fromCode]), let toRate = Self.validRate(rates[toCode]) else { return nil }
        return toRate / fromRate
    }

    /// The first currency (from, then to) that has no usable rate, once rates are loaded and an amount is entered
    /// (Web: `missingCode`, shown as `currency.missingRate`). Nil when the conversion can be computed.
    var missingCode: String? {
        guard let rates, numAmount > 0 else { return nil }
        if Self.validRate(rates[fromCode]) == nil { return fromCode }
        if Self.validRate(rates[toCode]) == nil { return toCode }
        return nil
    }

    private static func validRate(_ v: Double?) -> Double? {
        guard let v, v.isFinite, v > 0 else { return nil }
        return v
    }

    var fromCurrency: CurrencyInfo {
        supportedCurrencies.first { $0.code == fromCode } ?? supportedCurrencies[0]
    }

    var toCurrency: CurrencyInfo {
        supportedCurrencies.first { $0.code == toCode } ?? supportedCurrencies[1]
    }

    var formattedDate: String? {
        guard let rateDate else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss Z"
        guard let date = formatter.date(from: rateDate) else { return nil }
        let outFmt = DateFormatter()
        outFmt.dateFormat = "dd/MM/yyyy"
        return outFmt.string(from: date)
    }
}
