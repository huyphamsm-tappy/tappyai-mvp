import SwiftUI

/// Empty chat state — matches Web's empty messages view: mascot + brand title + memory chip + mood chips + quick prompts.
/// One welcome for every entry point (the one-brain server decides what a question is about; the old per-field titles and
/// prompt banks are gone). Its words come from the String Catalog in the app's language (`ChatWelcome`).
struct ChatEmptyState: View {
    let locale: String
    let hasMemory: Bool
    let onQuickPrompt: (String) -> Void

    /// Three general prompts for this hour and weekday (web `getDynamicPrompts(hour, day, null, null, 3)`).
    private var quickPrompts: [String] {
        var vnCal = Calendar(identifier: .gregorian)
        vnCal.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh") ?? .current
        let vnHour = vnCal.component(.hour, from: Date())
        let vnDay = vnCal.component(.weekday, from: Date()) - 1
        let dynamic = DynamicPrompts.get(hour: vnHour, dayOfWeek: vnDay, count: 3)
        return dynamic.map { locale == "en" ? $0.textEn : $0.text }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.lg) {
                Spacer(minLength: Spacing.xxl)

                // Mascot + title + memory chip
                VStack(spacing: Spacing.sm) {
                    TappyAvatar(size: 88)
                    Text(ChatWelcome.title)
                        .font(TappyFont.headline)
                        .foregroundStyle(TappyColor.textPrimary)
                    Text(ChatWelcome.text("chat.welcome.subtitle", language: locale))
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                        .multilineTextAlignment(.center)

                    if hasMemory {
                        HStack(spacing: 4) {
                            Text("🧠")
                                .font(.system(size: 10))
                            Text(ChatWelcome.text("chat.welcome.memory", language: locale))
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
                    Text(ChatWelcome.text("chat.welcome.moodQuestion", language: locale))
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: Spacing.xs)], spacing: Spacing.xs) {
                        ForEach(ChatWelcome.moods, id: \.id) { mood in
                            Button {
                                onQuickPrompt(ChatWelcome.moodPrompt(mood, language: locale))
                            } label: {
                                VStack(spacing: Spacing.xxs) {
                                    Text(mood.emoji).font(.title2)
                                    Text(ChatWelcome.moodLabel(mood, language: locale))
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
