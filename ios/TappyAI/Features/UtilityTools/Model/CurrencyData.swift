import Foundation

struct CurrencyInfo: Identifiable {
    let code: String
    let name: String
    let flag: String
    let decimals: Int

    var id: String { code }
}

let supportedCurrencies: [CurrencyInfo] = [
    CurrencyInfo(code: "VND", name: "Việt Nam Đồng", flag: "🇻🇳", decimals: 0),
    CurrencyInfo(code: "USD", name: "US Dollar", flag: "🇺🇸", decimals: 2),
    CurrencyInfo(code: "EUR", name: "Euro", flag: "🇪🇺", decimals: 2),
    CurrencyInfo(code: "JPY", name: "Nhật Yên", flag: "🇯🇵", decimals: 0),
    CurrencyInfo(code: "KRW", name: "Won Hàn Quốc", flag: "🇰🇷", decimals: 0),
    CurrencyInfo(code: "GBP", name: "Bảng Anh", flag: "🇬🇧", decimals: 2),
    CurrencyInfo(code: "AUD", name: "Đô Úc", flag: "🇦🇺", decimals: 2),
    CurrencyInfo(code: "SGD", name: "Đô Singapore", flag: "🇸🇬", decimals: 2),
    CurrencyInfo(code: "THB", name: "Baht Thái", flag: "🇹🇭", decimals: 2),
    CurrencyInfo(code: "CNY", name: "Nhân dân tệ", flag: "🇨🇳", decimals: 2),
    CurrencyInfo(code: "HKD", name: "Đô Hồng Kông", flag: "🇭🇰", decimals: 2),
    CurrencyInfo(code: "TWD", name: "Đô Đài Loan", flag: "🇹🇼", decimals: 0),
]

let fallbackRates: [String: Double] = [
    "USD": 1, "VND": 25400, "EUR": 0.92, "JPY": 157, "KRW": 1380,
    "GBP": 0.79, "AUD": 1.53, "SGD": 1.34, "THB": 35.5, "CNY": 7.25,
    "HKD": 7.82, "TWD": 32.2,
]
