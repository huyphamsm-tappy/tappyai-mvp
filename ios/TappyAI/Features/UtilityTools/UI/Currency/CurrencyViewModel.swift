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

    var conversionRate: Double? {
        guard let rates else { return nil }
        let fromRate = rates[fromCode] ?? 1
        let toRate = rates[toCode] ?? 1
        if fromCode == "USD" { return toRate }
        if toCode == "USD" { return 1.0 / fromRate }
        return toRate / fromRate
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
