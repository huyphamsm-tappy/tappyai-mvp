import AVFoundation
import SwiftUI

struct TranslateView: View {
    @AppStateObject private var vm: TranslateViewModel
    @AppStateObject private var tts = TTSManager()
    @AppStateObject private var voice = VoiceInputManager()

    init(deps: AppDependencies) {
        let service = UtilityToolsService(api: deps.api, consent: deps.aiConsent)
        _vm = AppStateObject(wrappedValue: TranslateViewModel(service: service))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                ToolHeroCard(eyebrow: NSLocalizedString("translate.heroEyebrow", comment: ""),
                             title: [NSLocalizedString("translate.heroTitle1", comment: ""), NSLocalizedString("translate.heroTitle2", comment: "")],
                             subtitle: String(format: NSLocalizedString("translate.heroBody", comment: ""), supportedLanguages.count) + "\n" + NSLocalizedString("translate.heroSubtitle", comment: ""),
                             mascot: "TappySpeaking", identifier: "translate-hero")
                inputSection
                languagePicker
                translateButton
                if !vm.translation.isEmpty {
                    resultSection
                }
                if let error = vm.error {
                    errorBanner(error)
                }
                Text(NSLocalizedString("translate.footerTip", comment: ""))
                    .font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary).multilineTextAlignment(.center)
                    .accessibilityIdentifier("translate-footer-tip")
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .onAppear { voice.onTranscript = { vm.inputText = $0 } }
        .onDisappear { tts.stop(); voice.cancelListening() }
        .navigationTitle(NSLocalizedString("translate.title", comment: ""))
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Input

    private var inputSection: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(NSLocalizedString("translate.inputHeading", comment: ""))
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)

            ZStack(alignment: .topLeading) {
                if vm.inputText.isEmpty {
                    Text(NSLocalizedString("translate.inputPlaceholder", comment: ""))
                        .font(TappyFont.body)
                        .foregroundStyle(TappyColor.textSecondary.opacity(0.5))
                        .padding(.horizontal, Spacing.md)
                        .padding(.vertical, 12)
                }
                TextEditor(text: $vm.inputText)
                    .font(TappyFont.body)
                    .foregroundStyle(TappyColor.textPrimary)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 120)
                    .padding(.horizontal, Spacing.sm)
                    .padding(.vertical, Spacing.xs)
                    .onChange(of: vm.inputText) { _ in vm.enforceInputLimit() }
            }
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg)
                    .stroke(vm.isOverLimit ? Color.red : TappyColor.border, lineWidth: 1)
            )

            HStack {
                Text("\(vm.charCount)/\(TranslateViewModel.maxChars)")
                    .font(TappyFont.caption)
                    .foregroundStyle(vm.isOverLimit ? .red : TappyColor.textSecondary)
                Spacer()
                // Web `data-tr-voice`: dictate into the box (the app language is what you speak)
                Button {
                    if voice.isListening { voice.stopListening() } else { voice.startListening(existingText: vm.inputText) }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: voice.isListening ? "mic.fill" : "mic")
                        Text(NSLocalizedString(voice.isListening ? "voice.stopListening" : "voice.micHint", comment: ""))
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(voice.isListening ? Color.orange : TappyColor.primary)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("translate-voice")
                if !vm.inputText.isEmpty {
                    Button(NSLocalizedString("common.clear", comment: "")) { vm.clear() }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Language picker

    private var languagePicker: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(NSLocalizedString("translate.targetHeading", comment: ""))
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary)

            Picker("", selection: $vm.targetLang) {
                ForEach(supportedLanguages) { lang in
                    Text(lang.name).tag(lang.code)
                }
            }
            .pickerStyle(.menu)
            .tint(TappyColor.textPrimary)

            // Web `translate.sourceAuto`
            Text(NSLocalizedString("translate.sourceAuto", comment: "")).font(TappyFont.caption).foregroundStyle(TappyColor.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Translate button

    private var translateButton: some View {
        Button {
            Task { await vm.translate() }
        } label: {
            HStack(spacing: Spacing.sm) {
                if vm.loading {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.8)
                    Text(NSLocalizedString("translate.translating", comment: ""))
                } else {
                    Image(systemName: "text.bubble")
                    Text(NSLocalizedString("translate.action", comment: ""))
                }
            }
            .font(.system(size: 15, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(vm.canTranslate ? TappyColor.primary : TappyColor.primary.opacity(0.4))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
        .disabled(!vm.canTranslate)
    }

    // MARK: - Result

    private var resultSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                Text(String(format: NSLocalizedString("translate.result", comment: ""), supportedLanguages.first { $0.code == vm.targetLang }?.name ?? vm.targetLang))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
                Spacer()
                Button {
                    vm.copyTranslation()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: vm.copied ? "checkmark" : "doc.on.doc")
                            .font(.system(size: 11))
                        Text(NSLocalizedString(vm.copied ? "translate.copied" : "common.copy", comment: ""))
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(TappyColor.primary)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("translate-copy")
            }

            Text(vm.translation)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)
                .textSelection(.enabled)

            // Web `translate.readAloud` / `stopSpeaking`
            Button { toggleReadAloud() } label: {
                HStack(spacing: 4) {
                    Image(systemName: tts.speakingMsgId == Self.speechId ? "stop.fill" : "speaker.wave.2")
                        .font(.system(size: 11))
                    Text(NSLocalizedString(tts.speakingMsgId == Self.speechId ? "translate.stopSpeaking" : "translate.readAloud", comment: ""))
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundStyle(TappyColor.primary)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("translate-read-aloud")
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
    }

    // MARK: - Read aloud

    private static let speechId = "translate-result"

    private func toggleReadAloud() {
        if tts.speakingMsgId == Self.speechId { tts.stop(); return }
        let code = vm.targetLang.lowercased()
        let tag = VoiceLocale.tag(for: code)
            ?? AVSpeechSynthesisVoice.speechVoices().first { $0.language.lowercased().hasPrefix(code) }?.language
        guard let tag else { return }   // no voice for this language on the phone: nothing is read in the wrong one
        tts.speak(msgId: Self.speechId, text: vm.translation, localeTag: tag)
    }

    // MARK: - Error

    private func errorBanner(_ message: String) -> some View {
        Text(message)
            .font(TappyFont.callout)
            .foregroundStyle(.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.md)
            .background(Color.red.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    }
}
