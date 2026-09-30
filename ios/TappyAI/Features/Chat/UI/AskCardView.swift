import SwiftUI

/// The consult ASK turn — port of Android `AskCard` / web `AskCard.tsx`: 2–3 questions, each with its
/// own chips. One tap per question selects (tap again to clear); "Gửi" sends what was chosen, joined
/// " · " (`AskBlock.composeAnswer`) — a partial answer is fine. A free-text box covers anything the
/// chips do not.
struct AskCardView: View {
    let questions: [AskQuestion]
    let onSend: (String) -> Void

    @State private var chosen: [String: String] = [:]
    @State private var free = ""

    private var answer: String { AskBlock.composeAnswer(questions, chosen: chosen, free: free) }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.md) {
            ForEach(questions) { q in
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(q.q)
                        .font(TappyFont.body.weight(.medium))
                        .foregroundStyle(TappyColor.textPrimary)
                    ChatFlowLayout(spacing: Spacing.xs) {
                        ForEach(q.options, id: \.self) { option in
                            chip(option, on: chosen[q.id] == option) {
                                if chosen[q.id] == option { chosen[q.id] = nil } else { chosen[q.id] = option }
                            }
                        }
                    }
                }
            }
            HStack(spacing: Spacing.xs) {
                TextField(NSLocalizedString("chat.ask.freeHint", comment: ""), text: $free)
                    .font(TappyFont.body)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.xs)
                    .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .stroke(TappyColor.border, lineWidth: 1))
                    .accessibilityIdentifier("ask-free-text")
                Button {
                    onSend(answer)
                } label: {
                    Text(NSLocalizedString("chat.ask.send", comment: ""))
                        .font(TappyFont.body.weight(.semibold))
                        .foregroundStyle(TappyColor.onPrimary)
                        .padding(.horizontal, Spacing.md)
                        .padding(.vertical, Spacing.xs)
                        .background(TappyColor.primary)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(answer.isEmpty)
                .opacity(answer.isEmpty ? 0.4 : 1)
                .accessibilityIdentifier("ask-send")
            }
        }
        .padding(Spacing.sm)
        .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
            .stroke(TappyColor.border, lineWidth: 1))
        .accessibilityIdentifier("ask-card")
    }

    private func chip(_ text: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(TappyFont.caption.weight(.medium))
                .foregroundStyle(on ? TappyColor.onPrimary : TappyColor.textPrimary)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, Spacing.xxs)
                .background(on ? TappyColor.primary : TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.pill, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
