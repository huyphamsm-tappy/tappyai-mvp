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
                actionButton(icon: "square.and.arrow.up") { onShare() }

                // Like
                actionButton(
                    icon: "hand.thumbsup",
                    tint: liked ? Color.green : nil,
                    filled: liked
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
                    tint: disliked ? Color.red : nil,
                    filled: disliked
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
                    tint: isSpeaking ? TappyColor.primary : nil
                ) { onSpeak() }

                // Regenerate (last message only)
                if let onRegenerate {
                    actionButton(icon: "arrow.counterclockwise") { onRegenerate() }
                }

                // More menu
                Menu {
                    Button {
                        UIPasteboard.general.string = TTSManager.stripMarkdown(text)
                    } label: {
                        Label("Copy Plaintext", systemImage: "doc.plaintext")
                    }

                    Button {
                        UIPasteboard.general.string = msgId
                    } label: {
                        Label("Copy ID", systemImage: "number")
                    }

                    Divider()

                    Button(role: .destructive) {
                        reportState = .reported
                        onReport()
                    } label: {
                        Label(
                            reportState == .reported ? "Đã báo cáo" : "Báo cáo lỗi",
                            systemImage: "flag"
                        )
                    }
                    .disabled(reportState == .reported)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 12))
                        .foregroundStyle(TappyColor.textSecondary)
                        .frame(minWidth: 28, minHeight: 28)
                }
            }

            // TTS player bar (visible only when speaking this message)
            if isSpeaking {
                ttsPlayerBar
            }
        }
    }

    @ViewBuilder
    private func actionButton(icon: String, tint: Color? = nil, filled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: filled ? icon + ".fill" : icon)
                .font(.system(size: 12))
                .foregroundStyle(tint ?? TappyColor.textSecondary)
                .frame(minWidth: 28, minHeight: 28)
        }
        .buttonStyle(.plain)
    }

    private var ttsPlayerBar: some View {
        HStack(spacing: Spacing.xxs) {
            Text("🤖").font(.system(size: 16))

            Button(action: onTTSPause) {
                Image(systemName: isPaused ? "play.fill" : "pause.fill")
                    .font(.system(size: 11))
            }
            .buttonStyle(.plain)
            .frame(width: 24, height: 24)

            Button(action: onTTSSkipBack) {
                Text("«15")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .buttonStyle(.plain)
            .frame(width: 28, height: 24)

            Button(action: onTTSSkipForward) {
                Text("15»")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .buttonStyle(.plain)
            .frame(width: 28, height: 24)

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
                Text("\(ttsSpeed, specifier: ttsSpeed == 1 ? "%.0f" : "%.1f")x")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
            .buttonStyle(.plain)

            Button(action: onTTSStop) {
                Image(systemName: "xmark")
                    .font(.system(size: 10))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .buttonStyle(.plain)
            .frame(width: 24, height: 24)
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
