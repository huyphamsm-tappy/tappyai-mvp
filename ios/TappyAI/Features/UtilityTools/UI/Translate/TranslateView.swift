import SwiftUI

struct TranslateView: View {
    @AppStateObject private var vm: TranslateViewModel

    init(deps: AppDependencies) {
        let service = UtilityToolsService(api: deps.api)
        _vm = AppStateObject(wrappedValue: TranslateViewModel(service: service))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                inputSection
                languagePicker
                translateButton
                if !vm.translation.isEmpty {
                    resultSection
                }
                if let error = vm.error {
                    errorBanner(error)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
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
            }
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg)
                    .stroke(vm.isOverLimit ? Color.red : TappyColor.border, lineWidth: 1)
            )

            HStack {
                Text("\(vm.charCount)/2000")
                    .font(TappyFont.caption)
                    .foregroundStyle(vm.isOverLimit ? .red : TappyColor.textSecondary)
                Spacer()
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
                Text(NSLocalizedString("translate.result", comment: ""))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
                Spacer()
                Button {
                    UIPasteboard.general.string = vm.translation
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 11))
                        Text(NSLocalizedString("common.copy", comment: ""))
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(TappyColor.primary)
                }
                .buttonStyle(.plain)
            }

            Text(vm.translation)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)
                .textSelection(.enabled)
        }
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.xl)
                .stroke(TappyColor.border, lineWidth: 1)
        )
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
