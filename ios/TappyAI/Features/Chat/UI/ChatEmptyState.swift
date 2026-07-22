import SwiftUI

/// Empty chat state — matches Web's empty messages view:
/// mascot + category title + memory chip + mood chips + quick prompts.
struct ChatEmptyState: View {
    let category: String
    let locale: String
    let hasMemory: Bool
    let onQuickPrompt: (String) -> Void

    private var title: String {
        let categories: [(id: String, emoji: String, labelVi: String, labelEn: String)] = [
            ("food", "🍜", "Ăn uống", "Food"),
            ("shopping", "🛍️", "Mua sắm", "Shopping"),
            ("entertainment", "🎭", "Giải trí", "Entertainment"),
            ("travel", "✈️", "Du lịch", "Travel"),
            ("spa", "💆", "Spa", "Spa"),
        ]
        if let cat = categories.first(where: { $0.id == category }) {
            return "\(cat.emoji) \(locale == "en" ? cat.labelEn : cat.labelVi)"
        }
        return "TappyAI"
    }

    private var subtitle: String {
        locale == "en" ? "I can help you find accurate information" : "Tôi có thể giúp bạn tìm thông tin chính xác"
    }

    private var quickPrompts: [String] {
        let vi: [String: [String]] = [
            "food": ["Quán bún bò ngon ở TP.HCM?", "Cafe view đẹp Hà Nội?", "Nhà hàng hải sản tươi sống?"],
            "shopping": ["Trung tâm mua sắm lớn Sài Gòn?", "Mua đồ hiệu uy tín?", "Chợ đêm lưu niệm?"],
            "entertainment": ["Rạp chiếu phim IMAX?", "Quán karaoke bao phòng?", "Bar rooftop view đẹp?"],
            "travel": ["Lịch trình Đà Nẵng 3 ngày 2 người budget 5 triệu", "Lịch trình Phú Quốc 4 ngày 2 người budget 8 triệu", "Lịch trình Hội An 2 ngày cuối tuần budget 3 triệu"],
            "spa": ["Spa massage giá bình dân?", "Nail salon gel tốt?", "Trung tâm dưỡng da uy tín?"],
        ]
        let en: [String: [String]] = [
            "food": ["Good bún bò spots in TP.HCM?", "Cafes with a nice view in Hà Nội?", "Fresh live-seafood restaurants?"],
            "shopping": ["Big shopping malls in Sài Gòn?", "Trusted stores for brand-name goods?", "Night markets for souvenirs?"],
            "entertainment": ["IMAX movie theaters?", "Karaoke places with private rooms?", "Rooftop bars with a great view?"],
            "travel": ["Đà Nẵng itinerary, 3 days, 2 people, 5M budget", "Phú Quốc itinerary, 4 days, 2 people, 8M budget", "Hội An weekend itinerary, 2 days, 3M budget"],
            "spa": ["Affordable massage spas?", "Good gel nail salons?", "Trusted skincare centers?"],
        ]

        let bank = locale == "en" ? en : vi
        if let specific = bank[category] { return specific }

        var vnCal = Calendar(identifier: .gregorian)
        vnCal.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh") ?? .current
        let vnHour = vnCal.component(.hour, from: Date())
        let vnDay = vnCal.component(.weekday, from: Date()) - 1
        let dynamic = DynamicPrompts.get(hour: vnHour, dayOfWeek: vnDay, count: 3)
        return dynamic.map { locale == "en" ? $0.textEn : $0.text }
    }

    private let moods: [(emoji: String, labelVi: String, labelEn: String, promptVi: String, promptEn: String)] = [
        ("😊", "Vui", "Happy",
         "Mình đang vui, Tappy gợi ý chỗ ăn uống hoặc vui chơi gì vibe hay không?",
         "I'm in a great mood — any fun food or hangout spots with a good vibe?"),
        ("😔", "Buồn", "Sad",
         "Mình đang hơi buồn, Tappy gợi ý gì giúp mình cảm thấy tốt hơn không?",
         "I'm feeling a bit down — any suggestions to cheer me up?"),
        ("😤", "Stress", "Stressed",
         "Mình đang stress cần được relax. Gợi ý spa hoặc cafe yên tĩnh gần đây giúp mình?",
         "I'm stressed and need to relax. Any quiet spas or cafes nearby?"),
        ("😴", "Mệt", "Tired",
         "Mình đang rất mệt, muốn đi đâu thư giãn nhẹ nhàng. Tappy gợi ý giúp mình nhé",
         "I'm really tired and want somewhere gentle to unwind. Any suggestions?"),
        ("🥱", "Chán", "Bored",
         "Mình đang chán, không biết làm gì. Tappy gợi ý gì vui và mới lạ không?",
         "I'm bored and don't know what to do. Anything fun and new to try?"),
        ("🤩", "Hứng", "Excited",
         "Mình đang rất hứng khởi, muốn làm gì đó thật đặc biệt. Tappy gợi ý không?",
         "I'm super excited and want to do something special. Any ideas?"),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                Spacer(minLength: Spacing.xxl)

                // Mascot + title + memory chip
                VStack(spacing: Spacing.sm) {
                    Text("🤖")
                        .font(.system(size: 64))
                    Text(title)
                        .font(TappyFont.headline)
                        .foregroundStyle(TappyColor.textPrimary)
                    Text(subtitle)
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                        .multilineTextAlignment(.center)

                    if hasMemory {
                        HStack(spacing: 4) {
                            Text("🧠")
                                .font(.system(size: 10))
                            Text(locale == "en" ? "Tappy remembers your preferences" : "Tappy nhớ sở thích của bạn")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(TappyColor.primary)
                        }
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, 4)
                        .background(TappyColor.primary.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: Radius.pill, style: .continuous))
                    }
                }

                // Mood chips
                VStack(spacing: Spacing.xs) {
                    Text(locale == "en" ? "How are you feeling today?" : "Hôm nay bạn cảm thấy thế nào?")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: Spacing.xs)], spacing: Spacing.xs) {
                        ForEach(moods, id: \.emoji) { mood in
                            Button {
                                onQuickPrompt(locale == "en" ? mood.promptEn : mood.promptVi)
                            } label: {
                                VStack(spacing: Spacing.xxs) {
                                    Text(mood.emoji).font(.title2)
                                    Text(locale == "en" ? mood.labelEn : mood.labelVi)
                                        .font(TappyFont.caption)
                                        .foregroundStyle(TappyColor.textSecondary)
                                }
                                .frame(minWidth: 64, minHeight: 56)
                                .background(TappyColor.surface)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                // Quick prompts
                VStack(spacing: Spacing.xs) {
                    ForEach(quickPrompts, id: \.self) { prompt in
                        Button { onQuickPrompt(prompt) } label: {
                            HStack(spacing: Spacing.xs) {
                                Image(systemName: "sparkles")
                                    .font(.caption)
                                    .foregroundStyle(TappyColor.primary)
                                Text(prompt)
                                    .font(TappyFont.callout)
                                    .foregroundStyle(TappyColor.textPrimary)
                                    .multilineTextAlignment(.leading)
                                Spacer()
                            }
                            .padding(.horizontal, Spacing.md)
                            .padding(.vertical, Spacing.sm)
                            .background(TappyColor.surface)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.bottom, Spacing.lg)
        }
    }
}
