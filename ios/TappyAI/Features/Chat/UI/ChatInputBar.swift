import SwiftUI
import UIKit

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
    /// «📍 Gần bạn ✕»: the device-context chip lives WITH the input (right above the box), not floating above the list.
    var showNearYou = false
    var onRemoveNearYou: () -> Void = {}
    /// The answer mode in use and what the "+" menu offers (web `ChatInterface.tsx`): only Deep Research is an item. A menu with
    /// nothing to offer and no attach action draws no "+".
    var mode: ChatMode = .auto
    var menuModes: [ChatMode] = []
    var onSelectMode: (ChatMode) -> Void = { _ in }
    var onClearMode: () -> Void = {}
    /// Adding a photo (camera or library) or a file. Nil = this build cannot attach yet: the items are not shown.
    var onAttach: ((ChatAttachSource) -> Void)? = nil
    /// The photo or PDF chosen for the next question (shown above the box, with a button to remove it), and why the last one was refused.
    var stagedAttachment: ChatAttachment? = nil
    var attachError: String? = nil
    var onRemoveAttachment: () -> Void = {}

    @FocusState private var isFocused: Bool

    /// Editing ends BEFORE the turn starts: once a reply is streaming the field is disabled, and a SwiftUI focus change made on a disabled field
    /// does not reach UIKit (CI run 37326705659: the keyboard was still up over the error card). Resigning the first responder here, while the
    /// field is still enabled, is what actually closes the keyboard.
    private func sendAndEndEditing() {
        isFocused = false
        UIApplication.shared.dismissKeyboard()
        onSend()
    }

    private let emojis = [
        "😀","😄","😂","🤣","😊","😍",
        "🥰","😘","😎","🤩","😋","😅",
        "😳","😬","🙈","🤭","🤔","😏",
        "😢","😭","😞","😤","😡","😱",
        "👍","❤️","🙏","🎉","🔥","💯",
    ]

    var body: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(ChatTheme.border)
                .frame(height: 1)

            VStack(spacing: Spacing.xs) {
                // The row of action chips (Gần bạn / Tối nay / Lên kế hoạch / Theo dõi giá) is gone: the web hides it
                // (ChatInterface.tsx `ACTION_CHIPS_VISIBLE`, owner 19/11) and the owner asked for no suggested questions
                // and a bigger chat area (UAT 25/11). The callbacks stay as parameters; the composer does not draw them.

                if showNearYou {
                    HStack(spacing: Spacing.xxs) {
                        Text("📍").accessibilityHidden(true)
                        Text(String(localized: "context.nearYou"))
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                        Button(action: onRemoveNearYou) {
                            Image(systemName: "xmark")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(TappyColor.textSecondary)
                        }
                        .accessibilityLabel(Text("context.removeLocation"))
                        .minimumTapTarget()
                    }
                    .padding(.horizontal, Spacing.sm)
                    .background(TappyColor.surface)
                    .clipShape(Capsule())
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Spacing.md)
                }

                // Voice status
                if isListening {
                    HStack(spacing: Spacing.xs) {
                        Circle()
                            .fill(Color.orange)
                            .frame(width: 6, height: 6)
                        Text("chat.voice.listening")
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
                            Text("chat.voice.sendingSoon")
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

                // The mode in use, with its ×: back to Auto.
                if let modeKey = mode.titleKey {
                    modeChip(titleKey: modeKey)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Spacing.md)
                }

                // The chosen photo or PDF, and why a refused file was not taken.
                if let stagedAttachment {
                    StagedAttachmentCard(attachment: stagedAttachment, onRemove: onRemoveAttachment)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Spacing.md)
                }
                if let attachError, !attachError.isEmpty {
                    Text(attachError)
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Spacing.md)
                        .accessibilityIdentifier("chat-attach-error")
                }

                // Input row
                HStack(alignment: .bottom, spacing: Spacing.xs) {
                    if showsPlusMenu { plusMenu }

                    // Text input
                    TextField("chat.input.placeholder", text: $text, axis: .vertical)
                        .font(TappyFont.body)
                        .foregroundStyle(ChatTheme.text)
                        .lineLimit(1...8)
                        .padding(.vertical, 12)
                        .frame(minHeight: 44)
                        .focused($isFocused)
                        .accessibilityIdentifier("chat-input")
                        .disabled(isStreaming)
                        .submitLabel(.send)
                        .onSubmit {
                            if canSend {
                                sendAndEndEditing()
                            }
                        }
                        .onChange(of: text) { _ in
                            if pendingSend && isFocused { onCancelAutoSend() }
                        }
                        // The field is DISABLED while a reply streams, and a disabled field keeps the first responder: the keyboard stayed up
                        // over the conversation through the whole turn and over the error card when it failed (UAT build 129). Sending ends editing.
                        .onChange(of: isStreaming) { streaming in
                            if streaming { isFocused = false }
                        }

                    // The emoji button and its panel are gone (owner UAT 25/11: «thừa», and tapping elsewhere did not close the
                    // panel). The phone keyboard has its own emoji key.

                    // Mic button (orange)
                    Button(action: onToggleVoice) {
                        Image(systemName: "mic.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(isListening ? .white : Color.orange)
                            .frame(width: 44, height: 44)
                            .background(isListening ? Color.orange : Color.clear)
                            .clipShape(Circle())
                            .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(isStreaming)
                    // While listening the same button stops listening: its name says which.
                    .accessibilityLabel(Text(LocalizedStringKey(isListening ? "voice.stopListening" : "a11y.chat.mic")))

                    // Stop or Send button
                    if isStreaming {
                        Button(action: onStop) {
                            Image(systemName: "stop.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(ChatTheme.background)
                                .frame(width: 44, height: 44)
                                .background(ChatTheme.text)
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text("chat.stop"))
                    } else {
                        Button(action: sendAndEndEditing) {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 44, height: 44)
                                .background(canSend ? ChatTheme.userBubble : ChatTheme.userBubble.opacity(0.4))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSend)
                        .accessibilityLabel(Text("chat.send"))
                        .accessibilityIdentifier("chat-send")
                    }
                }
                // ONE capsule like ChatGPT: «+», the text, the microphone and the round send button inside a single rounded
                // field, taller and nearly full width (owner UAT 25/11: «khung chat nhỏ quá, làm giống ChatGPT»).
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .frame(minHeight: 60)
                .background(ChatTheme.panel)
                .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(ChatTheme.border, lineWidth: 1))
                .padding(.horizontal, Spacing.sm)
                .padding(.bottom, 2)
            }
            .padding(.vertical, Spacing.xs)
            .background(ChatTheme.background)
        }
    }

    private var showsPlusMenu: Bool { onAttach != nil || !menuModes.isEmpty }

    /// «+» beside the box: attach (when this build can) and the modes the plan offers, the one in use ticked.
    private var plusMenu: some View {
        Menu {
            if let onAttach {
                // Three direct items, no second dialog (the old dialog + two pickers on one view lost the photo picker).
                if CameraPicker.isAvailable {
                    Button { onAttach(.camera) } label: {
                        Label(NSLocalizedString("chat.attach.camera", comment: ""), systemImage: "camera")
                    }
                }
                Button { onAttach(.photo) } label: {
                    Label(NSLocalizedString("chat.attach.pickPhoto", comment: ""), systemImage: "photo")
                }
                Button { onAttach(.file) } label: {
                    Label(NSLocalizedString("chat.attach.pickFile", comment: ""), systemImage: "doc")
                }
                .accessibilityHint(Text("chat.composer.attachHint"))
            }
            ForEach(menuModes, id: \.self) { item in
                if let key = item.titleKey {
                    Button {
                        onSelectMode(item)
                    } label: {
                        if mode == item {
                            Label(NSLocalizedString(key, comment: ""), systemImage: "checkmark")
                        } else {
                            Text(NSLocalizedString(key, comment: ""))
                        }
                    }
                    .accessibilityAddTraits(mode == item ? .isSelected : [])
                    .accessibilityHint(Text(LocalizedStringKey(item.hintKey ?? "")))
                }
            }
        } label: {
            // Inside the composer capsule (ChatGPT's layout): no box of its own.
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .regular))
                .foregroundStyle(ChatTheme.text)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .disabled(isStreaming)
        .opacity(isStreaming ? 0.4 : 1)
        .accessibilityLabel(Text("chat.composer.plus"))
        .accessibilityAddTraits(.isButton)
    }

    /// «Nghiên cứu sâu ✕»: states the mode and turns it off.
    private func modeChip(titleKey: String) -> some View {
        HStack(spacing: Spacing.xxs) {
            Text(LocalizedStringKey(titleKey))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(TappyColor.secondary)
                .padding(.leading, Spacing.sm)
            Button(action: onClearMode) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("chat.mode.off"))
            .minimumTapTarget()
        }
        .background(TappyColor.secondary.opacity(0.1))
        .clipShape(Capsule())
        .accessibilityElement(children: .contain)
    }

    private var emojiGrid: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text("chat.pickEmoji")
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
                            .frame(minWidth: 44, minHeight: 44)
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
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
                .fixedSize()   // never «Lên kế hoạch tri…»: the row scrolls, the label does not truncate
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

    /// Text, or a chosen photo / PDF (a question by itself, as on the web), and no reply streaming.
    private var canSend: Bool {
        (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || stagedAttachment != nil) && !isStreaming
    }
}

extension ChatMode {
    /// The catalog key of the mode's name where the composer shows one (the menu item and the chip). Only Deep Research is a
    /// choice; Auto, Chat, Web and Think have no name there.
    var titleKey: String? {
        switch self {
        case .deep: return "chat.mode.deep"
        case .auto, .chat, .web, .think: return nil
        }
    }

    /// The catalog key of the mode's one-line hint, read by VoiceOver on the menu item.
    var hintKey: String? {
        switch self {
        case .deep: return "chat.mode.deepHint"
        case .auto, .chat, .web, .think: return nil
        }
    }
}
