import SwiftUI

/// Full message action bar — matches Web's MessageActionBar.tsx:
/// Copy, Share, Like, Dislike, TTS, Regenerate, More (Copy Plaintext, Report).
struct MessageActionBar: View {
    let msgId: String
    let messageIndex: Int
    let conversationId: String?
    let text: String
    let isSpeaking: Bool
    let isPaused: Bool
    let ttsElapsed: Int
    let ttsTotal: Int
    let ttsSpeed: Float
    let onCopy: () -> Void
    let onShare: () -> Void
    let onSpeak: () -> Void
    let onTTSPause: () -> Void
    let onTTSStop: () -> Void
    let onTTSSkipBack: () -> Void
    let onTTSSkipForward: () -> Void
    let onTTSSpeedChange: (Float) -> Void
    var onRegenerate: (() -> Void)?
    let onLike: (Bool) -> Void
    let onDislike: (Bool) -> Void
    let onReport: () -> Void

    @State private var copyState: CopyState = .idle
    @State private var liked = false
    @State private var disliked = false
    @State private var reportState: ReportState = .idle
    @State private var showMore = false

    private enum CopyState { case idle, copied }
    private enum ReportState { case idle, reported }

    private static let speedOptions: [Float] = [1, 1.5, 2]

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            HStack(spacing: 2) {
                // Copy
                actionButton(
                    icon: copyState == .copied ? "checkmark" : "doc.on.doc",
                    label: copyState == .copied ? "common.copied" : "common.copy",
                    tint: copyState == .copied ? TappyColor.success : nil
                ) {
                    onCopy()
                    copyState = .copied
                    Task { @MainActor in
                        try? await Task.sleep(for: .seconds(2))
                        copyState = .idle
                    }
                }

                // Share
                actionButton(icon: "square.and.arrow.up", label: "common.share") { onShare() }

                // Like
                actionButton(
                    icon: "hand.thumbsup",
                    label: "a11y.chat.like",
                    tint: liked ? Color.green : nil,
                    filled: liked,
                    selected: liked
                ) {
                    liked.toggle()
                    if liked {
                        onLike(true)
                        if disliked { disliked = false; onDislike(false) }
                    } else {
                        onLike(false)
                    }
                }

                // Dislike
                actionButton(
                    icon: "hand.thumbsdown",
                    label: "a11y.chat.dislike",
                    tint: disliked ? Color.red : nil,
                    filled: disliked,
                    selected: disliked
                ) {
                    disliked.toggle()
                    if disliked {
                        onDislike(true)
                        if liked { liked = false; onLike(false) }
                    } else {
                        onDislike(false)
                    }
                }

                // TTS
                actionButton(
                    icon: "speaker.wave.2",
                    label: "a11y.chat.speak",
                    tint: isSpeaking ? TappyColor.primary : nil,
                    selected: isSpeaking
                ) { onSpeak() }

                // Regenerate (last message only)
                if let onRegenerate {
                    actionButton(icon: "arrow.counterclockwise", label: "a11y.chat.regenerate") { onRegenerate() }
                }

                // More menu
                Menu {
                    Button {
                        // the links keep their addresses; the message id is not offered (the web has no such item)
                        UIPasteboard.general.string = TTSManager.stripMarkdown(text, keepLinkAddresses: true)
                    } label: {
                        Label("chat.copyPlaintext", systemImage: "doc.plaintext")
                    }

                    Divider()

                    Button(role: .destructive) {
                        reportState = .reported
                        onReport()
                    } label: {
                        Label(
                            reportState == .reported ? NSLocalizedString("chat.action.reported", comment: "") : NSLocalizedString("chat.action.report", comment: ""),
                            systemImage: "flag"
                        )
                    }
                    .disabled(reportState == .reported)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 12))
                        .foregroundStyle(TappyColor.textSecondary)
                        .minimumTapTarget()
                        .contentShape(Rectangle())
                        .accessibilityLabel(Text("a11y.chat.more"))
                }
            }

            // TTS player bar (visible only when speaking this message)
            if isSpeaking {
                ttsPlayerBar
            }
        }
    }

    @ViewBuilder
    private func actionButton(icon: String, label: LocalizedStringKey, tint: Color? = nil, filled: Bool = false, selected: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: filled ? icon + ".fill" : icon)
                .font(.system(size: 12))
                .foregroundStyle(tint ?? TappyColor.textSecondary)
                .minimumTapTarget()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var ttsPlayerBar: some View {
        HStack(spacing: Spacing.xxs) {
            TappyAvatar(size: 22)
                .accessibilityHidden(true)

            Button(action: onTTSPause) {
                Image(systemName: isPaused ? "play.fill" : "pause.fill")
                    .font(.system(size: 11))
                    .minimumTapTarget()
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(LocalizedStringKey(isPaused ? "a11y.chat.ttsPlay" : "a11y.chat.ttsPause")))

            // «15 / 15»: the visible text is a symbol, the spoken name says what the button does.
            Button(action: onTTSSkipBack) {
                Text("«15")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundStyle(TappyColor.textSecondary)
                    .minimumTapTarget()
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("a11y.chat.ttsBack"))

            Button(action: onTTSSkipForward) {
                Text("15»")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundStyle(TappyColor.textSecondary)
                    .minimumTapTarget()
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("a11y.chat.ttsForward"))

            Text(fmtTime(ttsElapsed))
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(TappyColor.textSecondary)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(TappyColor.separator).frame(height: 3)
                    if ttsTotal > 0 {
                        Capsule()
                            .fill(TappyColor.primary)
                            .frame(width: geo.size.width * min(1, CGFloat(ttsElapsed) / CGFloat(ttsTotal)), height: 3)
                    }
                }
            }
            .frame(height: 3)

            Button {
                let idx = Self.speedOptions.firstIndex(of: ttsSpeed) ?? 0
                onTTSSpeedChange(Self.speedOptions[(idx + 1) % Self.speedOptions.count])
            } label: {
                Text(ttsSpeedText(ttsSpeed))
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .minimumTapTarget()
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("a11y.chat.ttsSpeed"))
            .accessibilityValue(Text(ttsSpeedText(ttsSpeed)))

            Button(action: onTTSStop) {
                Image(systemName: "xmark")
                    .font(.system(size: 10))
                    .foregroundStyle(TappyColor.textSecondary)
                    .minimumTapTarget()
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("a11y.chat.ttsStop"))
        }
        .padding(.horizontal, Spacing.sm)
        .padding(.vertical, Spacing.xxs)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }

    private func fmtTime(_ sec: Int) -> String {
        let m = sec / 60
        let s = sec % 60
        return "\(m):\(String(format: "%02d", s))"
    }
}

/// The reading speed as the player shows and says it: "1x", "1,5x" (vi), "2,0x". The decimal sign follows the reader's locale.
func ttsSpeedText(_ speed: Float, locale: Locale = .current) -> String {
    String(format: speed == 1 ? "%.0fx" : "%.1fx", locale: locale, Double(speed))
}
