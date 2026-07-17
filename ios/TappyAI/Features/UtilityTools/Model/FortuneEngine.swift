import Foundation

enum FortunePeriod: String, CaseIterable {
    case day, week, month

    var label: String {
        switch self {
        case .day: return "Hôm nay"
        case .week: return "Tuần này"
        case .month: return "Tháng này"
        }
    }
}

struct FortuneBanks {
    let love: [String]
    let career: [String]
    let money: [String]
    let health: [String]
    let luckyNumbers: [Int]
    let luckyColors: [String]
}

struct FortuneReading {
    let periodLabel: String
    let love: String
    let career: String
    let money: String
    let health: String
    let score: Int
    let luckyNumber: Int
    let luckyColor: String
}

enum FortuneEngine {
    static func getVNNow() -> Date {
        Date(timeIntervalSinceNow: 7 * 3600)
    }

    static func getPeriodKey(_ period: FortunePeriod) -> String {
        let vn = getVNNow()
        let cal = Calendar(identifier: .iso8601)
        let comps = cal.dateComponents(in: TimeZone(identifier: "Asia/Ho_Chi_Minh")!, from: vn)
        let y = comps.year!
        let m = comps.month!
        let d = comps.day!

        switch period {
        case .day:
            return "\(y)-\(String(format: "%02d", m))-\(String(format: "%02d", d))"
        case .week:
            let w = cal.component(.weekOfYear, from: vn)
            return "\(y)-W\(String(format: "%02d", w))"
        case .month:
            return "\(y)-\(String(format: "%02d", m))"
        }
    }

    static func hashString(_ s: String) -> Int {
        var h: Int32 = 5381
        for char in s.unicodeScalars {
            h = (h &* 33) &+ Int32(char.value)
        }
        return Int(abs(h))
    }

    static func pick<T>(_ seed: String, salt: String, from arr: [T]) -> T {
        let h = hashString("\(seed)|\(salt)")
        return arr[h % arr.count]
    }

    static func pickInRange(_ seed: String, salt: String, min: Int, max: Int) -> Int {
        let h = hashString("\(seed)|\(salt)")
        return min + (h % (max - min + 1))
    }

    static func generateFortune(subjectId: String, period: FortunePeriod, banks: FortuneBanks) -> FortuneReading {
        let key = getPeriodKey(period)
        let seed = "\(subjectId)|\(key)"

        return FortuneReading(
            periodLabel: period.label,
            love: pick(seed, salt: "love", from: banks.love),
            career: pick(seed, salt: "career", from: banks.career),
            money: pick(seed, salt: "money", from: banks.money),
            health: pick(seed, salt: "health", from: banks.health),
            score: pickInRange(seed, salt: "score", min: 3, max: 5),
            luckyNumber: pick(seed, salt: "number", from: banks.luckyNumbers),
            luckyColor: pick(seed, salt: "color", from: banks.luckyColors)
        )
    }

    static func generateYearFortune(subjectId: String, birthYear: Int, targetYear: Int) -> YearFortuneReading {
        let seed = "\(subjectId)|year-\(targetYear)"
        let subjectIdx = ((birthYear - 4) % 12 + 12) % 12
        let yearIdx = ((targetYear - 4) % 12 + 12) % 12
        let diff = (yearIdx - subjectIdx + 12) % 12
        let compat = YEAR_COMPAT[diff] ?? YearCompat(label: "—", note: "")

        return YearFortuneReading(
            periodLabel: "Năm \(targetYear) (\(YEAR_ANIMALS[yearIdx]))",
            love: pick(seed, salt: "love", from: YEAR_BANKS.love),
            career: pick(seed, salt: "career", from: YEAR_BANKS.career),
            money: pick(seed, salt: "money", from: YEAR_BANKS.money),
            health: pick(seed, salt: "health", from: YEAR_BANKS.health),
            score: pickInRange(seed, salt: "score", min: 3, max: 5),
            luckyNumber: pick(seed, salt: "number", from: YEAR_BANKS.luckyNumbers),
            luckyColor: pick(seed, salt: "color", from: YEAR_BANKS.luckyColors),
            yearAnimal: YEAR_ANIMALS[yearIdx],
            compatLabel: compat.label,
            compatNote: compat.note
        )
    }

    static func generateMonthlyBreakdown(subjectId: String, birthYear: Int, birthMonth: Int, birthDay: Int, targetYear: Int) -> [MonthlyFortune] {
        let vnMonths = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"]
        return (0..<12).map { i in
            let month = i + 1
            let seed = "\(subjectId)|by\(birthYear)|bm\(birthMonth)|bd\(birthDay)|y\(targetYear)|m\(month)"
            return MonthlyFortune(
                month: month,
                monthName: vnMonths[i],
                love: pick(seed, salt: "love", from: MONTH_BANKS.love),
                career: pick(seed, salt: "career", from: MONTH_BANKS.career),
                money: pick(seed, salt: "money", from: MONTH_BANKS.money),
                health: pick(seed, salt: "health", from: MONTH_BANKS.health),
                note: pick(seed, salt: "note", from: MONTH_BANKS.note),
                score: pickInRange(seed, salt: "score", min: 2, max: 5)
            )
        }
    }

    static func generateLifeStages(subjectId: String, birthMonth: Int, birthDay: Int) -> [LifeStage] {
        STAGE_DEFS.map { def in
            guard let banks = STAGE_BANKS_DATA[def.key] else {
                return LifeStage(label: def.label, ageRange: def.ageRange, emoji: def.emoji, fate: "", career: "", love: "")
            }
            let seed = "\(subjectId)|bm\(birthMonth)|bd\(birthDay)|stage-\(def.key)"
            return LifeStage(
                label: def.label,
                ageRange: def.ageRange,
                emoji: def.emoji,
                fate: pick(seed, salt: "fate", from: banks.fate),
                career: pick(seed, salt: "career", from: banks.career),
                love: pick(seed, salt: "love", from: banks.love)
            )
        }
    }
}

struct YearFortuneReading {
    let periodLabel: String
    let love: String
    let career: String
    let money: String
    let health: String
    let score: Int
    let luckyNumber: Int
    let luckyColor: String
    let yearAnimal: String
    let compatLabel: String
    let compatNote: String
}

struct MonthlyFortune: Identifiable {
    let month: Int
    let monthName: String
    let love: String
    let career: String
    let money: String
    let health: String
    let note: String
    let score: Int

    var id: Int { month }
}

struct LifeStage: Identifiable {
    let label: String
    let ageRange: String
    let emoji: String
    let fate: String
    let career: String
    let love: String

    var id: String { label }
}
