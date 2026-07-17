import SwiftUI

/// Bottom input bar — matches Web layout: action chips + text field + emoji + mic + send/stop.
struct ChatInputBar: View {
    @Binding var text: String
    let isStreaming: Bool
    let isListening: Bool
    let pendingSend: Bool
    let voiceError: String?
    let locale: String
    let onSend: () -> Void
    let onStop: () -> Void
    let onToggleVoice: () -> Void
    let onCancelAutoSend: () -> Void
    let onInsertEmoji: (String) -> Void
    let onNearby: () -> Void
    let onTonight: () -> Void
    let onTripPrefill: () -> Void
    let onPriceWatchPrefill: () -> Void

    @FocusState private var isFocused: Bool
    @State private var showEmojiPanel = false

    private let emojis = [
        "😀","😄","😂","🤣","😊","😍",
        "🥰","😘","😎","🤩","😋","😅",
        "😳","😬","🙈","🤭","🤔","😏",
        "😢","😭","😞","😤","😡","😱",
        "👍","❤️","🙏","🎉","🔥","💯",
    ]

    var body: some View {
        VStack(spacing: 0) {
            Divider()
                .foregroundStyle(TappyColor.separator)

            VStack(spacing: Spacing.xs) {
                // Action chips row
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.xs) {
                        actionChip(
                            label: locale == "en" ? "📍 Nearby" : "📍 Tìm quanh đây",
                            color: TappyColor.primary,
                            action: onNearby
                        )
                        actionChip(
                            label: locale == "en" ? "🌙 Tappy Tonight" : "🌙 Tappy Tối Nay",
                            color: TappyColor.secondary,
                            action: onTonight
                        )
                        actionChip(
                            label: locale == "en" ? "✈️ Plan a trip" : "✈️ Lên kế hoạch trip",
                            color: Color.blue,
                            action: onTripPrefill
                        )
                        actionChip(
                            label: locale == "en" ? "🎯 Price watch" : "🎯 Theo dõi giá",
                            color: Color.green,
                            action: onPriceWatchPrefill
                        )
                    }
                    .padding(.horizontal, Spacing.md)
                }

                // Voice status
                if isListening {
                    HStack(spacing: Spacing.xs) {
                        Circle()
                            .fill(Color.orange)
                            .frame(width: 6, height: 6)
                        Text("Đang nghe… nói xong Tappy tự gửi (bạn có 2 giây để sửa trước).")
                            .font(.system(size: 11))
                            .foregroundStyle(Color.orange)
                    }
                    .padding(.horizontal, Spacing.md)
                }

                if !isListening && pendingSend {
                    Button(action: onCancelAutoSend) {
                        HStack(spacing: Spacing.xs) {
                            Circle()
                                .fill(Color.orange)
                                .frame(width: 6, height: 6)
                            Text("Đang gửi trong giây lát… chạm để sửa trước khi gửi.")
                                .font(.system(size: 11))
                                .foregroundStyle(Color.orange)
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, Spacing.md)
                }

                if !isListening, let voiceError, !voiceError.isEmpty {
                    Text(voiceError)
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.danger)
                        .padding(.horizontal, Spacing.md)
                }

                // Input row
                HStack(alignment: .bottom, spacing: Spacing.xs) {
                    // Text input
                    TextField(locale == "en" ? "Message TappyAI..." : "Nhắn tin với TappyAI...", text: $text, axis: .vertical)
                        .font(TappyFont.body)
                        .foregroundStyle(TappyColor.textPrimary)
                        .lineLimit(1...6)
                        .padding(.horizontal, Spacing.md)
                        .padding(.vertical, Spacing.sm)
                        .background(TappyColor.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                        .focused($isFocused)
                        .disabled(isStreaming)
                        .submitLabel(.send)
                        .onSubmit {
                            if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                onSend()
                            }
                        }
                        .onChange(of: text) {
                            if pendingSend && isFocused { onCancelAutoSend() }
                        }
                        .onTapGesture {
                            showEmojiPanel = false
                        }

                    // Emoji button
                    Button {
                        showEmojiPanel.toggle()
                        if showEmojiPanel { isFocused = false }
                    } label: {
                        Image(systemName: "face.smiling")
                            .font(.system(size: 18))
                            .foregroundStyle(showEmojiPanel ? TappyColor.secondary : TappyColor.textSecondary)
                            .frame(width: 44, height: 44)
                            .background(showEmojiPanel ? TappyColor.secondary.opacity(0.1) : TappyColor.surface)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                    }
                    .buttonStyle(.plain)

                    // Mic button (orange)
                    Button(action: onToggleVoice) {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(isListening ? .white : Color.orange)
                            .frame(width: 44, height: 44)
                            .background(isListening ? Color.orange : TappyColor.surface)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(isStreaming)

                    // Stop or Send button
                    if isStreaming {
                        Button(action: onStop) {
                            Image(systemName: "stop.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(TappyColor.textPrimary)
                                .frame(width: 44, height: 44)
                                .background(TappyColor.surface)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text("Dừng"))
                    } else {
                        Button(action: onSend) {
                            Image(systemName: "paperplane.fill")
                                .font(.system(size: 16))
                                .foregroundStyle(.white)
                                .frame(width: 44, height: 44)
                                .background(canSend ? TappyColor.primary : TappyColor.primary.opacity(0.4))
                                .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSend)
                        .accessibilityLabel(Text("Gửi"))
                    }
                }
                .padding(.horizontal, Spacing.md)

                // Emoji panel
                if showEmojiPanel {
                    emojiGrid
                        .padding(.horizontal, Spacing.md)
                        .transition(.opacity)
                }
            }
            .padding(.vertical, Spacing.xs)
            .background(TappyColor.background)
        }
    }

    private var emojiGrid: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("Chọn biểu cảm")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(TappyColor.textSecondary)
                .textCase(.uppercase)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 6), spacing: 2) {
                ForEach(emojis, id: \.self) { emoji in
                    Button {
                        onInsertEmoji(emoji)
                    } label: {
                        Text(emoji)
                            .font(.system(size: 22))
                            .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(Spacing.sm)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }

    @ViewBuilder
    private func actionChip(label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(color)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, 6)
                .background(color.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: Radius.pill, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.pill, style: .continuous)
                        .stroke(color.opacity(0.2), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .disabled(isStreaming)
        .opacity(isStreaming ? 0.4 : 1)
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isStreaming
    }
}
