import SwiftUI

/// The full-screen listening screen (web «03. Voice / Chat Input Active», in this app's own design language):
/// the waving Tappy, «Tôi đang lắng nghe…», a big round button with purple rings while listening, «Hủy» / «Gửi», and a
/// card at the bottom that shows a dim SAMPLE sentence until the first words are recognised, then the words themselves.
///
/// The sample is a hint drawn as a placeholder: it is not in any model, so it can never be sent or copied into the chat
/// box. The logic and every exit live in `VoiceScreenController`; the microphone is released the same way on each.
struct VoiceListeningView: View {
    @StateObject private var controller: VoiceScreenController
    @Environment(\.scenePhase) private var scenePhase
    @State private var pulse = false

    init(voice: VoiceRecognizing, sendText: @escaping (String) -> Void, close: @escaping () -> Void) {
        _controller = StateObject(wrappedValue: VoiceScreenController(voice: voice, sendText: sendText, close: close))
    }

    private let purple = Color(hex: 0x7C5CFF)
    private let deep = Color(hex: 0x4F2FD6)

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: 0x070B1A), Color(hex: 0x0D1230)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            VStack(spacing: 0) {
                Spacer(minLength: 24)
                Image("TappyWave").resizable().scaledToFit().frame(height: 170)
                    .accessibilityHidden(true)
                Text("voice.listen.title")
                    .font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                    .padding(.top, 14)
                    .accessibilityIdentifier("voice-title")
                Text("voice.listen.subtitle")
                    .font(.system(size: 15)).foregroundStyle(Color(hex: 0xA7B0C8))
                    .multilineTextAlignment(.center).padding(.horizontal, 36).padding(.top, 8)

                Spacer(minLength: 16)
                centreButton
                Spacer(minLength: 16)

                actions.padding(.horizontal, 24)
                transcriptCard.padding(.horizontal, 20).padding(.top, 18).padding(.bottom, 24)
            }
        }
        .onAppear { controller.appear() }
        .onDisappear { controller.disappeared() }
        .onChange(of: scenePhase) { phase in if phase != .active { controller.backgrounded() } }
        .onChange(of: controller.isListening) { listening in
            withAnimation(listening ? .easeInOut(duration: 1.3).repeatForever(autoreverses: true) : .default) { pulse = listening }
        }
        .onAppear { if controller.isListening { pulse = true } }
        .preferredColorScheme(.dark)
    }

    // MARK: Centre button + rings

    private var centreButton: some View {
        Button { controller.tapCenter() } label: {
            ZStack {
                ForEach(0..<3) { i in
                    Circle()
                        .stroke(purple.opacity(controller.isListening ? 0.34 - Double(i) * 0.09 : 0.10), lineWidth: 2)
                        .frame(width: 118 + CGFloat(i) * 38, height: 118 + CGFloat(i) * 38)
                        .scaleEffect(controller.isListening && pulse ? 1.08 : 1)
                        .animation(.easeInOut(duration: 1.3).repeatForever(autoreverses: true).delay(Double(i) * 0.15), value: pulse)
                }
                Circle().fill(LinearGradient(colors: [purple, deep], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 104, height: 104)
                    .shadow(color: purple.opacity(0.55), radius: 18)
                if controller.isListening {
                    RoundedRectangle(cornerRadius: 7).fill(.white).frame(width: 30, height: 30)
                } else {
                    Image(systemName: "mic.fill").font(.system(size: 34)).foregroundStyle(.white)
                }
            }
            .frame(height: 210)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(LocalizedStringKey(controller.isListening ? "voice.listen.stopA11y" : "voice.listen.startA11y")))
        .accessibilityIdentifier("voice-center")
    }

    // MARK: Hủy / Gửi

    private var actions: some View {
        HStack(spacing: 14) {
            Button { controller.cancel() } label: {
                HStack(spacing: 8) {
                    Image(systemName: "xmark").font(.system(size: 15, weight: .semibold))
                    Text("common.cancel").font(.system(size: 16, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .overlay(Capsule().stroke(Color.white.opacity(0.22), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("voice-cancel")

            Button { controller.send() } label: {
                HStack(spacing: 8) {
                    Image(systemName: "paperplane.fill").font(.system(size: 15, weight: .semibold))
                    Text("chat.send").font(.system(size: 16, weight: .semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Capsule().fill(LinearGradient(colors: [purple, deep], startPoint: .leading, endPoint: .trailing)))
                .opacity(controller.canSend ? 1 : 0.4)
            }
            .buttonStyle(.plain)
            .disabled(!controller.canSend)
            .accessibilityIdentifier("voice-send")
        }
    }

    // MARK: Text card

    private var transcriptCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let error = controller.error {
                Text(error)
                    .font(.system(size: 14)).foregroundStyle(Color(hex: 0xFCA5A5))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("voice-error")
            }
            HStack(alignment: .top, spacing: 12) {
                // A listening cue, not a control.
                Image(systemName: "waveform")
                    .font(.system(size: 22)).foregroundStyle(purple)
                    .opacity(controller.isListening && pulse ? 1 : 0.55)
                    .accessibilityHidden(true)
                ZStack(alignment: .topLeading) {
                    if controller.showsSample {
                        Text("voice.listen.sample")
                            .font(.system(size: 16)).foregroundStyle(Color.white.opacity(0.38))
                            .transition(.opacity)
                            .accessibilityIdentifier("voice-sample")
                    } else {
                        Text(controller.transcript)
                            .font(.system(size: 16)).foregroundStyle(.white)
                            .transition(.opacity)
                            .accessibilityIdentifier("voice-transcript")
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
                .animation(.easeIn(duration: 0.25), value: controller.showsSample)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 20).fill(Color.white.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color.white.opacity(0.10), lineWidth: 1))
    }
}
