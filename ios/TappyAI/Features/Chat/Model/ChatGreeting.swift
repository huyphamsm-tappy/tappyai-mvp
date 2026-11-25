import Foundation

/// The one line the empty chat opens with — the web's `homeGreeting.ts` + `home.greet.*` (owner 20/11: a greeting by the
/// time the person has, never a menu of moods or questions). Pure: the view gives it the device's clock and the name.
/// Same day parts, same weekend rule, same variant pick, same words as the web dictionary (`presentation.ts` 217-235).
enum ChatGreeting {
    enum DayPart: String, CaseIterable { case dawn, noon, afternoon, evening, night, weekend }

    static let variants = 3

    /// Morning 5-10, midday 11-13, afternoon 14-17, evening 18-22, night 23-4 (local hours).
    static func dayPart(hour: Int) -> DayPart {
        let h = ((hour % 24) + 24) % 24
        switch h {
        case 5...10: return .dawn
        case 11...13: return .noon
        case 14...17: return .afternoon
        case 18...22: return .evening
        default: return .night
        }
    }

    /// Saturday and Sunday, until the evening, use the weekend lines. `weekday` is 1 (Sunday) … 7 (Saturday).
    /// The variant is chosen by the date so the line does not flicker on every visit.
    static func key(hour: Int, weekday: Int, dayOfYear: Int) -> (part: DayPart, variant: Int) {
        let part = dayPart(hour: hour)
        let weekend = (weekday == 1 || weekday == 7) && part != .evening && part != .night
        return (weekend ? .weekend : part, (dayOfYear + hour) % variants)
    }

    static func line(at date: Date, calendar: Calendar = .current, english: Bool, name: String?) -> String {
        let hour = calendar.component(.hour, from: date)
        let weekday = calendar.component(.weekday, from: date)
        let day = calendar.ordinality(of: .day, in: .year, for: date) ?? 1
        let pick = key(hour: hour, weekday: weekday, dayOfYear: day)
        let text = english ? en[pick.part]![pick.variant] : vi[pick.part]![pick.variant]
        return withName(text, name: name, english: english)
    }

    /// The name to greet by: the LAST word of the profile's name ("Nguyễn Văn An" → "An"). Nothing when there is no name,
    /// when it looks like an address or holds digits or symbols, or when the word is very long.
    static func givenName(of full: String?) -> String? {
        guard let trimmed = full?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        if trimmed.contains(where: { "@_/\\<>{}[]|".contains($0) || $0.isNumber }) { return nil }
        guard let last = trimmed.split(whereSeparator: \.isWhitespace).last, (1...20).contains(last.count) else { return nil }
        return String(last)
    }

    /// "Huy ơi, chào buổi sáng! …": the first letter of the line goes to lower case after the name.
    static func withName(_ line: String, name: String?, english: Bool) -> String {
        guard let name, !name.isEmpty, let first = line.first else { return line }
        let lowered = String(first).lowercased() + line.dropFirst()
        return english ? "\(name), \(lowered)" : "\(name) ơi, \(lowered)"
    }

    // The web's words (presentation.ts:218-235).
    static let vi: [DayPart: [String]] = [
        .dawn: ["Chào buổi sáng! Hôm nay mình giúp gì được cho bạn?", "Buổi sáng tốt lành, hôm nay bắt đầu từ đâu nhỉ?", "Cà phê sáng cùng Tappy nhé?"],
        .noon: ["Trưa rồi, bạn ăn gì chưa nào?", "Giờ nghỉ trưa, bạn muốn hỏi mình điều gì không?", "Chào buổi trưa! Hôm nay mình giúp gì được đây?"],
        .afternoon: ["Chiều rồi, bạn cần mình giúp gì không?", "Trà chiều cùng Tappy nhé?", "Chào buổi chiều! Bạn đang nghĩ đến chuyện gì?"],
        .evening: ["Tối rồi, hôm nay của bạn thế nào?", "Chào buổi tối! Tối nay mình làm gì cho vui nhỉ?", "Buổi tối thư thả, bạn muốn trò chuyện về điều gì?"],
        .night: ["Khuya rồi, bạn vẫn còn thức à? Mình ở đây.", "Đêm khuya rồi, kể mình nghe chuyện gì nào?", "Chào cú đêm! Mình giúp gì được cho bạn?"],
        .weekend: ["Cuối tuần rồi, hôm nay bạn định làm gì?", "Cuối tuần thư thả, mình cùng tìm chỗ nào hay ho nhé?", "Chào cuối tuần! Bạn muốn nghỉ ngơi hay đi chơi?"],
    ]

    static let en: [DayPart: [String]] = [
        .dawn: ["Good morning! What can I help with today?", "A good morning to you. Where shall we start today?", "Morning coffee with Tappy?"],
        .noon: ["It is midday. Have you eaten yet?", "Lunch break. Anything you would like to ask?", "Good midday! What can I do for you?"],
        .afternoon: ["Good afternoon. Is there something I can help with?", "Afternoon tea with Tappy?", "Good afternoon! What is on your mind?"],
        .evening: ["Good evening. How was your day?", "Good evening! What shall we do tonight?", "A calm evening. What would you like to talk about?"],
        .night: ["It is late. Still up? I am here.", "Late at night. What is on your mind?", "Hello, night owl! How can I help?"],
        .weekend: ["It is the weekend. What are you up to today?", "A slow weekend. Shall we find somewhere nice?", "Happy weekend! Rest or go out?"],
    ]
}
