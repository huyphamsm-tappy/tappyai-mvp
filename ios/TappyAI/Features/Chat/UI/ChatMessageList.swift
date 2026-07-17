import SwiftUI

/// Scrollable message list — renders user and assistant bubbles matching Web layout.
struct ChatMessageList: View {
    let messages: [ChatMessage]
    let isStreaming: Bool
    let activeTool: String?
    let thinkHintIndex: Int
    let error: ChatError?
    let isAuthenticated: Bool
    let locale: String
    let conversationId: String?
    let hasMemory: Bool
    let tts: TTSManager
    let onRegenerate: () -> Void
    let onRetry: () -> Void
    let onFollowup: (String) -> Void
    let onCopy: (String) -> Void
    let onShare: (String) -> Void
    let onLogin: () -> Void
    let onLike: (Int, Bool) -> Void
    let onDislike: (Int, Bool) -> Void
    let onReport: (Int) -> Void
    let onSavePlaceManual: (String) -> Void
    let onSavePlaceFavorite: (String, String, String, String) -> Void
    let onZoomImage: (String) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Spacing.lg) {
                    // Memory indicator while chatting
                    if hasMemory && !messages.isEmpty {
                        HStack(spacing: 4) {
                            Text("🧠")
                                .font(.system(size: 10))
                            Text(locale == "en"
                                 ? "Tappy is using your memory to answer"
                                 : "Tappy đang dùng trí nhớ của bạn để trả lời")
                                .font(.system(size: 11))
                                .foregroundStyle(TappyColor.textSecondary)
                        }
                        .padding(.bottom, Spacing.xs)
                    }

                    ForEach(Array(messages.enumerated()), id: \.element.id) { index, msg in
                        if msg.isUser {
                            UserBubble(content: msg.content)
                        } else {
                            let isLast = index == messages.count - 1
                            let parsed = ContentParser.parse(msg.content)
                            AssistantBubble(
                                msgId: msg.id,
                                messageIndex: index,
                                conversationId: conversationId,
                                content: parsed.text,
                                images: parsed.images,
                                isStreaming: isStreaming && isLast,
                                status: msg.status,
                                ctaButtons: parsed.ctaButtons,
                                plan: parsed.plan,
                                followups: isLast && !isStreaming ? parsed.followups : [],
                                isLastMessage: isLast,
                                tts: tts,
                                onRegenerate: isLast ? onRegenerate : nil,
                                onFollowup: onFollowup,
                                onCopy: { onCopy(parsed.text) },
                                onShare: { onShare(parsed.text) },
                                onLike: { onLike(index, $0) },
                                onDislike: { onDislike(index, $0) },
                                onReport: { onReport(index) },
                                onSavePlaceManual: onSavePlaceManual,
                                onSavePlaceFavorite: onSavePlaceFavorite,
                                onZoomImage: onZoomImage
                            )
                        }
                    }

                    // Thinking indicator
                    if isStreaming && waitingForReply {
                        ThinkingIndicator(
                            activeTool: activeTool,
                            thinkHintIndex: thinkHintIndex,
                            locale: locale
                        )
                    }

                    // Error state
                    if let error, !isStreaming {
                        ChatErrorBanner(
                            error: error,
                            isAuthenticated: isAuthenticated,
                            onRetry: onRetry,
                            onLogin: onLogin
                        )
                    }

                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.md)
            }
            .onChange(of: messages.count) {
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
            .onChange(of: messages.last?.content) {
                if isStreaming {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
        }
    }

    private var waitingForReply: Bool {
        guard let last = messages.last else { return true }
        if last.role == .user { return true }
        return last.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

// MARK: - User Bubble

private struct UserBubble: View {
    let content: String

    var body: some View {
        HStack {
            Spacer(minLength: Spacing.xxl)
            Text(content)
                .font(TappyFont.body)
                .foregroundStyle(.white)
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.sm)
                .background(TappyColor.primary)
                .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        }
    }
}

// MARK: - Assistant Bubble

private struct AssistantBubble: View {
    let msgId: String
    let messageIndex: Int
    let conversationId: String?
    let content: String
    let images: [ParsedImage]
    let isStreaming: Bool
    let status: MessageStatus
    let ctaButtons: [CTAButton]
    let plan: TappyPlan?
    let followups: [String]
    let isLastMessage: Bool
    let tts: TTSManager
    var onRegenerate: (() -> Void)?
    let onFollowup: (String) -> Void
    let onCopy: () -> Void
    let onShare: () -> Void
    let onLike: (Bool) -> Void
    let onDislike: (Bool) -> Void
    let onReport: () -> Void
    let onSavePlaceManual: (String) -> Void
    let onSavePlaceFavorite: (String, String, String, String) -> Void
    let onZoomImage: (String) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.xs) {
            // Avatar
            Text("🤖")
                .font(.system(size: 24))
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: Spacing.xs) {
                // Message text
                if !content.isEmpty {
                    Text(attributedContent)
                        .font(TappyFont.body)
                        .foregroundStyle(TappyColor.textPrimary)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                }

                // Inline image strip
                if !images.isEmpty {
                    ChatImageStrip(images: images, onZoom: onZoomImage)
                }

                // Plan card
                if let plan {
                    TripPlanCardView(plan: plan)
                }

                // Full action bar (not streaming)
                if !isStreaming && !content.isEmpty {
                    MessageActionBar(
                        msgId: msgId,
                        messageIndex: messageIndex,
                        conversationId: conversationId,
                        text: content,
                        isSpeaking: tts.speakingMsgId == msgId,
                        isPaused: tts.isPaused,
                        ttsElapsed: tts.elapsed,
                        ttsTotal: tts.totalSecs,
                        ttsSpeed: tts.speed,
                        onCopy: onCopy,
                        onShare: onShare,
                        onSpeak: { tts.speak(msgId: msgId, text: content) },
                        onTTSPause: { tts.togglePause() },
                        onTTSStop: { tts.stop() },
                        onTTSSkipBack: { tts.skipBack() },
                        onTTSSkipForward: { tts.skipForward() },
                        onTTSSpeedChange: { tts.changeSpeed($0) },
                        onRegenerate: onRegenerate,
                        onLike: onLike,
                        onDislike: onDislike,
                        onReport: onReport
                    )
                }

                // Streaming cursor (blinking ▋ matching Web's streaming-cursor)
                if isStreaming && !content.isEmpty {
                    StreamingCursor()
                }

                // Save place button
                if !isStreaming && !ctaButtons.isEmpty {
                    SavePlaceButton(
                        text: content,
                        buttons: ctaButtons,
                        onSave: onSavePlaceManual
                    )
                }

                // CTA buttons with favorite toggle
                if !ctaButtons.isEmpty {
                    FlowLayout(spacing: Spacing.xs) {
                        ForEach(ctaButtons) { btn in
                            HStack(spacing: 4) {
                                CTAButtonView(button: btn)
                                if btn.type == "internal_booking",
                                   let place = ContentParser.parsePlaceFromUrl(btn.url) {
                                    FavoriteToggle(
                                        placeId: place.placeId,
                                        placeName: place.name,
                                        placeAddress: place.address,
                                        placeType: place.type,
                                        onToggle: onSavePlaceFavorite
                                    )
                                }
                            }
                        }
                    }
                }

                // Follow-up chips
                if !followups.isEmpty {
                    FlowLayout(spacing: Spacing.xs) {
                        ForEach(followups, id: \.self) { f in
                            Button { onFollowup(f) } label: {
                                Text(f)
                                    .font(TappyFont.caption)
                                    .foregroundStyle(TappyColor.textSecondary)
                                    .padding(.horizontal, Spacing.sm)
                                    .padding(.vertical, Spacing.xxs)
                                    .background(TappyColor.surface)
                                    .clipShape(RoundedRectangle(cornerRadius: Radius.pill, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private var attributedContent: AttributedString {
        ContentParser.renderMarkdown(content)
    }
}

// MARK: - Thinking Indicator

private struct ThinkingIndicator: View {
    let activeTool: String?
    let thinkHintIndex: Int
    let locale: String

    private let thinkHintsVi = ["Tappy đang suy nghĩ…", "Đang tìm thông tin…", "Đang tổng hợp câu trả lời…"]
    private let thinkHintsEn = ["Tappy is thinking…", "Looking things up…", "Putting it together…"]

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.xs) {
            Text("🤖")
                .font(.system(size: 24))
                .frame(width: 32, height: 32)

            HStack(spacing: Spacing.xs) {
                HStack(spacing: 3) {
                    ForEach(0..<3) { i in
                        Circle()
                            .fill(TappyColor.textSecondary)
                            .frame(width: 6, height: 6)
                            .opacity(0.6)
                            .animation(.easeInOut(duration: 0.6).repeatForever().delay(Double(i) * 0.2), value: thinkHintIndex)
                    }
                }

                Text(hintText)
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                    .animation(.easeIn(duration: 0.15), value: hintText)
            }
        }
    }

    private var hintText: String {
        if let tool = activeTool, let hint = ToolHints.hint(for: tool, locale: locale) {
            return hint
        }
        let hints = locale == "en" ? thinkHintsEn : thinkHintsVi
        return hints[thinkHintIndex % hints.count]
    }
}

// MARK: - Error Banner

private struct ChatErrorBanner: View {
    let error: ChatError
    let isAuthenticated: Bool
    let onRetry: () -> Void
    let onLogin: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: Spacing.xs) {
            Text("🤖")
                .font(.system(size: 24))
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: Spacing.xs) {
                switch error {
                case .authRequired, .anonLimitReached:
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text(error == .anonLimitReached
                             ? "Bạn đã dùng hết số câu hỏi miễn phí hôm nay. Đăng nhập để tiếp tục trò chuyện với Tappy và mở khoá mọi tính năng!"
                             : "Cần đăng nhập để trò chuyện với Tappy 💬 Tin nhắn của bạn được giữ nguyên — đăng nhập để tiếp tục ngay nhé!")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.primary)
                        Button(action: onLogin) {
                            Text("Đăng nhập để tiếp tục")
                                .font(TappyFont.caption)
                                .foregroundStyle(.white)
                                .padding(.horizontal, Spacing.sm)
                                .padding(.vertical, Spacing.xs)
                                .background(TappyColor.primary)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(Spacing.sm)
                    .background(TappyColor.primary.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

                case .freeLimitReached:
                    Text("Bạn đã dùng hết số tin nhắn miễn phí hôm nay. Hẹn gặp lại bạn vào ngày mai nhé! 🌅")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.secondary)
                        .padding(Spacing.sm)
                        .background(TappyColor.secondary.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))

                case .generic, .offline:
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text(error == .offline
                             ? "Không có kết nối mạng. Kiểm tra và thử lại nhé."
                             : "Mình gặp trục trặc khi trả lời — tin nhắn của bạn vẫn được giữ nguyên. Bạn thử lại nhé?")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.danger)
                        Button(action: onRetry) {
                            HStack(spacing: Spacing.xxs) {
                                Image(systemName: "arrow.counterclockwise")
                                    .font(.caption)
                                Text("Thử lại")
                                    .font(TappyFont.caption)
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, Spacing.xs)
                            .background(TappyColor.danger)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(Spacing.sm)
                    .background(TappyColor.danger.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                }
            }
        }
    }
}

// MARK: - CTA Button

private struct CTAButtonView: View {
    let button: CTAButton

    var body: some View {
        Button {
            guard let url = URL(string: button.url) else { return }
            if button.type != "internal_booking" {
                UIApplication.shared.open(url)
            }
        } label: {
            Text(button.label)
                .font(TappyFont.caption)
                .foregroundStyle(button.primary ? .white : TappyColor.primary)
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.xs)
                .background(button.primary ? TappyColor.primary : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .overlay(
                    button.primary ? nil :
                    RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .stroke(TappyColor.primary.opacity(0.4), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Trip Plan Card

private struct TripPlanCardView: View {
    let plan: TappyPlan

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            ForEach(Array(plan.days.enumerated()), id: \.offset) { _, day in
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    if let title = day.title {
                        Text(title)
                            .font(TappyFont.bodyEmphasis)
                            .foregroundStyle(TappyColor.textPrimary)
                    }
                    if let activities = day.activities {
                        ForEach(Array(activities.enumerated()), id: \.offset) { _, activity in
                            HStack(alignment: .top, spacing: Spacing.xs) {
                                if let time = activity.time {
                                    Text(time)
                                        .font(TappyFont.caption)
                                        .foregroundStyle(TappyColor.textSecondary)
                                        .frame(width: 50, alignment: .leading)
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    if let title = activity.title {
                                        Text(title)
                                            .font(TappyFont.callout)
                                            .foregroundStyle(TappyColor.textPrimary)
                                    }
                                    if let desc = activity.description {
                                        Text(desc)
                                            .font(TappyFont.caption)
                                            .foregroundStyle(TappyColor.textSecondary)
                                    }
                                    if let cost = activity.cost {
                                        Text(cost)
                                            .font(TappyFont.caption)
                                            .foregroundStyle(TappyColor.primary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .padding(Spacing.sm)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}

// MARK: - Streaming Cursor

private struct StreamingCursor: View {
    @State private var visible = true

    var body: some View {
        Text("▋")
            .font(.system(size: 14))
            .foregroundStyle(TappyColor.textPrimary)
            .opacity(visible ? 0.7 : 0)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true)) {
                    visible.toggle()
                }
            }
    }
}

// MARK: - FlowLayout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                                   proposal: .unspecified)
        }
    }

    private struct ArrangeResult {
        let positions: [CGPoint]
        let size: CGSize
    }

    private func arrangeSubviews(proposal: ProposedViewSize, subviews: Subviews) -> ArrangeResult {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
        }

        return ArrangeResult(positions: positions, size: CGSize(width: maxX, height: y + rowHeight))
    }
}
