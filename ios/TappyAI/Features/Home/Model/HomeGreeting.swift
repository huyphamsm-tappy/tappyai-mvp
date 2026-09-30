import Foundation

/// The Home hero greeting engine — a 1:1 port of the web's canonical implementation
/// (`src/app/page.tsx` HERO_TEXTS for Vietnamese, `src/app/HomeView.tsx` HERO_EN for English) by way
/// of Android `HomeGreeting.kt`.
///
/// Contract, mirrored exactly:
///  - 7 hour slots: [0,5) · [5,9) · [9,11) · [11,14) · [14,17) · [17,20) · [20,24).
///  - Several templates per slot; [5,9) and [17,20) also have weekend variants.
///  - Template = `dayOfMonth % templates.count` — deterministic per day, so web, Android and iOS
///    show the SAME greeting on the same day.
///  - Two lines separated by `\n` (the web's `<br />`).
///
/// Keep the pools byte-identical to web/Android — a copy edit lands on every platform together.
enum HomeGreeting {
    private struct Slot {
        let hours: ClosedRange<Int>
        let vi: [String]
        var viWeekend: [String]? = nil
        let en: [String]
        var enWeekend: [String]? = nil
    }

    private static let slots: [Slot] = [
        Slot(hours: 0...4,
             vi: ["Thức khuya à?\nTappy đây, cần gì không? 🌙",
                  "Đêm muộn rồi —\nnhưng Tappy vẫn sẵn sàng 🌛",
                  "Còn thức à?\nĐặt đồ ăn khuya hay cần gì? 🍜"],
             en: ["Still up? 🌙\nTappy is here — need anything?",
                  "Late night —\nbut Tappy is ready 🌛"]),
        Slot(hours: 5...8,
             vi: ["Chào buổi sáng!\nHôm nay ăn gì ngon đây? ☀️",
                  "Ngày mới bắt đầu —\nTappy sẵn sàng giúp bạn! 🌅",
                  "Sáng sớm rồi,\ncà phê hay bánh mì trước? ☕",
                  "Good morning!\nHôm nay Tappy lo hết cho bạn 😄"],
             viWeekend: ["Sáng cuối tuần đây!\nNghỉ ngơi hay đi đâu vui? ☀️",
                         "Cuối tuần bắt đầu —\nTappy gợi ý chỗ brunch ngon nhé? 🥞",
                         "Chào buổi sáng!\nCuối tuần này kế hoạch gì? 🎉"],
             en: ["Good morning!\nWhat sounds good today? ☀️",
                  "A new day begins —\nTappy is here to help! 🌅"],
             enWeekend: ["Weekend morning!\nRest, or somewhere fun? ☀️",
                         "Weekend’s on —\nwant a good brunch spot? 🥞"]),
        Slot(hours: 9...10,
             vi: ["Buổi sáng đang chạy —\nbạn cần gì từ Tappy? ⚡",
                  "Mid-morning rồi,\ntrưa nay ăn gì nghĩ chưa? 🤔",
                  "Tappy đây!\nHỏi gì cũng được, trả lời liền 🚀"],
             en: ["The morning is rolling —\nwhat do you need? ⚡",
                  "Tappy here!\nAsk anything, instant answers 🚀"]),
        Slot(hours: 11...13,
             vi: ["Đói chưa?\nTappy tìm chỗ ăn trưa ngon ngay! 🍚",
                  "Giờ vàng ăn trưa —\nđể Tappy chọn chỗ hộ nhé 🥢",
                  "Cơm trưa chưa?\nHỏi Tappy trước khi Google nha 😄",
                  "12h rồi —\nra ngoài hay đặt đồ ăn? Tappy lo! 🛵"],
             en: ["Hungry?\nTappy finds a great lunch spot! 🍚",
                  "Lunch o’clock —\nlet Tappy pick for you 🥢"]),
        Slot(hours: 14...16,
             vi: ["Chiều rồi,\ncà phê hay spa thư giãn nhé? ☕",
                  "3h chiều —\nbuồn ngủ hay đi đâu cho tỉnh? 😅",
                  "Buổi chiều của bạn\nsẽ thú vị hơn với Tappy! ✨",
                  "Slump buổi chiều?\nTappy có mấy gợi ý hay đây 💡"],
             en: ["Afternoon —\ncoffee or a relaxing spa? ☕",
                  "Afternoon slump?\nTappy’s got a few ideas 💡"]),
        Slot(hours: 17...19,
             vi: ["Tan làm rồi!\nTối nay ăn gì, đi đâu? 🎊",
                  "Giờ vàng buổi tối —\nTappy gợi ý quán ngon ngay! 🍜",
                  "Công việc xong rồi,\ngiờ là thời gian của bạn! 🥂",
                  "Tối nay có kế hoạch gì?\nTappy lo hết phần tìm kiếm! 😊"],
             viWeekend: ["Tối cuối tuần rồi!\nĐi chơi hay ăn gì ngon? 🎊",
                         "Giờ vàng cuối tuần —\nTappy gợi ý quán ngon ngay! 🍜",
                         "Tối cuối tuần của bạn,\nđi đâu cho đáng? 🥂",
                         "Tối nay có kế hoạch gì?\nTappy lo hết phần tìm kiếm! 😊"],
             en: ["Off work!\nWhere to eat tonight? 🎊",
                  "Prime evening —\nTappy suggests a great spot! 🍜"],
             enWeekend: ["Weekend evening!\nOut, or something tasty? 🎊",
                         "Weekend prime time —\nlet Tappy find a spot! 🍜"]),
        Slot(hours: 20...23,
             vi: ["Tối đẹp thế này\nđi đâu cho đáng? Hỏi Tappy đi 🌃",
                  "Đêm xuống rồi —\năn gì, làm gì, đi đâu? 🌙",
                  "Cuối ngày rồi,\nTappy giúp bạn thư giãn nhé! 🛁",
                  "Tối nay vui không?\nTappy có vài gợi ý hay đây ✨"],
             en: ["Lovely night —\nwhere’s worth going? Ask Tappy 🌃",
                  "End of the day —\nlet Tappy help you unwind! 🛁"]),
    ]

    /// The heading for `hour` (0–23, local), weekend flag and day of month. An unknown hour falls
    /// back to the morning slot, as the web does.
    static func heroText(hour: Int, isWeekend: Bool, dayOfMonth: Int, english: Bool) -> String {
        let slot = slots.first { $0.hours.contains(hour) } ?? slots[1]
        let texts = english
            ? ((isWeekend ? slot.enWeekend : nil) ?? slot.en)
            : ((isWeekend ? slot.viWeekend : nil) ?? slot.vi)
        let n = texts.count
        return texts[((dayOfMonth % n) + n) % n]
    }

    /// The heading for `date` in `calendar` (the user's clock).
    static func heroText(at date: Date, calendar: Calendar = .current, english: Bool) -> String {
        let c = calendar.dateComponents([.hour, .day, .weekday], from: date)
        let weekend = c.weekday == 1 || c.weekday == 7
        return heroText(hour: c.hour ?? 8, isWeekend: weekend, dayOfMonth: c.day ?? 1, english: english)
    }
}

/// What the hero prints (Android `HeroGreeting`): the V3 welcome line over the engine's two lines,
/// which are used verbatim — the name never gets spliced into a template.
struct HeroGreeting: Equatable {
    let welcome: String
    let title: String
    let supporting: String?

    /// `named` formats the welcome for a real name, `generic` is the guest line. A nil or blank
    /// name means the guest welcome — never "Hi nil", never an invented name.
    static func make(engineText: String, userName: String?, named: (String) -> String, generic: () -> String) -> HeroGreeting {
        let parts = engineText.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
        let title = parts.first.map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
        let rest = parts.count > 1 ? parts[1].trimmingCharacters(in: .whitespaces) : ""
        let name = userName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let welcome = (name?.isEmpty == false) ? named(name!) : generic()
        return HeroGreeting(welcome: welcome, title: title, supporting: rest.isEmpty ? nil : rest)
    }
}

/// "Gợi ý cho bạn" card art — the web's `assignCardArt` (Android `assignInspireArt`): a card takes
/// its category's scene if still free, else the next free scene from its position, and repeats
/// only when there are more cards than scenes. Presentation art, never a claim about the prompt.
enum HomeInspireArt {
    /// Web `ART_POOL` order. Files: `Resources/HomeInspire/home_inspire_<name>.webp`.
    static let pool = ["food", "travel", "shopping", "spa", "entertainment"]

    static func assign(_ categories: [String], pool: [String] = pool) -> [String] {
        var out = [String?](repeating: nil, count: categories.count)
        var used = Set<String>()
        for (i, category) in categories.enumerated() where pool.contains(category) && !used.contains(category) {
            out[i] = category
            used.insert(category)
        }
        for i in categories.indices where out[i] == nil {
            for step in pool.indices {
                let candidate = pool[(i + step) % pool.count]
                if !used.contains(candidate) { out[i] = candidate; used.insert(candidate); break }
            }
            if out[i] == nil { out[i] = pool[i % pool.count] }
        }
        return out.map { $0! }
    }
}
