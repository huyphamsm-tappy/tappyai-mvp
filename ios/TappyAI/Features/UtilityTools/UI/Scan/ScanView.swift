import SwiftUI
import PhotosUI

struct ScanView: View {
    @AppStateObject private var vm: ScanViewModel
    @State private var showPhotoPicker = false
    @State private var showCamera = false
    @State private var photoPickerItem: PhotosPickerItem?

    init(deps: AppDependencies) {
        let service = UtilityToolsService(api: deps.api, consent: deps.aiConsent)
        _vm = AppStateObject(wrappedValue: ScanViewModel(service: service))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                ToolHeroCard(eyebrow: NSLocalizedString("scan.heroEyebrow", comment: ""),
                             title: [NSLocalizedString("scan.heroTitle1", comment: ""), NSLocalizedString("scan.heroTitle2", comment: "")],
                             subtitle: NSLocalizedString("scan.heroBody", comment: ""),
                             chips: [NSLocalizedString("scan.capCapture", comment: ""), NSLocalizedString("scan.capLangs", comment: "")],
                             mascot: "TappySearching", identifier: "scan-hero")
                if vm.hasImage {
                    imageSection     // «Ảnh đã chọn» card with the picture and «Bỏ ảnh này»
                } else {
                    // Web: two big action cards, camera first, then the library
                    ToolActionCard(symbol: "camera.fill", tint: Color(hex: 0x007AFF),
                                   title: NSLocalizedString("scan.cameraTitle", comment: ""), detail: NSLocalizedString("scan.cameraDesc", comment: ""),
                                   cta: NSLocalizedString("scan.cameraCta", comment: ""), identifier: "scan-camera") { showCamera = true }
                    ToolActionCard(symbol: "photo.on.rectangle", tint: Color(hex: 0xFF9500),
                                   title: NSLocalizedString("scan.galleryTitle", comment: ""), detail: NSLocalizedString("scan.galleryDesc", comment: ""),
                                   cta: NSLocalizedString("scan.galleryCta", comment: ""), identifier: "scan-gallery") { showPhotoPicker = true }
                }
                if vm.showsScanButton {
                    scanButton
                }
                if vm.hasResult {
                    resultSection
                }
                // Web renders the formats card on every state of the page (`data-scan-formats`), the tips only before a result.
                ToolInfoCard(title: NSLocalizedString("scan.formatsTitle", comment: ""),
                             detail: NSLocalizedString("scan.formatsDesc", comment: ""),
                             badges: ScanViewModel.supportedFormats, identifier: "scan-formats")
                if !vm.hasImage && !vm.hasResult {
                    ToolInfoCard(title: NSLocalizedString("scan.tipsTitle", comment: ""),
                                 rows: [("sun.max", NSLocalizedString("scan.tipLightTitle", comment: ""), NSLocalizedString("scan.tipLightDesc", comment: "")),
                                        ("viewfinder", NSLocalizedString("scan.tipAngleTitle", comment: ""), NSLocalizedString("scan.tipAngleDesc", comment: "")),
                                        ("sparkle.magnifyingglass", NSLocalizedString("scan.tipSharpTitle", comment: ""), NSLocalizedString("scan.tipSharpDesc", comment: "")),
                                        ("character.book.closed", NSLocalizedString("scan.tipLangTitle", comment: ""), NSLocalizedString("scan.tipLangDesc", comment: ""))],
                                 note: String(format: NSLocalizedString("scan.tipLimit", comment: ""), 20), identifier: "scan-tips")
                }
                if let error = vm.error {
                    errorBanner(error)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle(NSLocalizedString("scan.title", comment: ""))
        .navigationBarTitleDisplayMode(.inline)
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoPickerItem, matching: .images)
        .onChange(of: photoPickerItem) { item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    vm.setImage(image)
                }
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraCapture(
                onCapture: { image in vm.setImage(image) },
                onDismiss: { showCamera = false }
            )
        }
    }

    // MARK: - Scan button

    private var scanButton: some View {
        Button {
            Task { await vm.scan() }
        } label: {
            HStack(spacing: Spacing.sm) {
                if vm.loading {
                    ProgressView().tint(.white)
                    Text(NSLocalizedString("scan.scanning", comment: ""))
                } else {
                    Image(systemName: "doc.text.viewfinder")
                    Text(NSLocalizedString("scan.scanButton", comment: ""))
                }
            }
            .font(.system(size: 15, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(TappyColor.primary)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
        .disabled(!vm.canScan)
        .opacity(vm.canScan ? 1 : 0.5)
        .accessibilityIdentifier("scan-submit")
    }

    // MARK: - Image section

    private var imageSection: some View {
        VStack(spacing: Spacing.md) {
            if let image = vm.selectedImage {
                Text(NSLocalizedString("scan.previewLabel", comment: "")).font(TappyFont.caption.weight(.bold)).textCase(.uppercase)
                    .foregroundStyle(TappyColor.textSecondary).frame(maxWidth: .infinity, alignment: .leading)
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxHeight: 250)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))

                HStack(spacing: Spacing.sm) {
                    pickButton(NSLocalizedString("scan.pickAnother", comment: ""), icon: "photo", action: { showPhotoPicker = true })
                    pickButton(NSLocalizedString("common.clear", comment: ""), icon: "xmark", action: { vm.clear() })
                }
            } else {
                VStack(spacing: Spacing.md) {
                    Image(systemName: "doc.text.viewfinder")
                        .font(.system(size: 40))
                        .foregroundStyle(TappyColor.textSecondary)

                    Text(NSLocalizedString("scan.emptyHint", comment: ""))
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                        .multilineTextAlignment(.center)

                    HStack(spacing: Spacing.sm) {
                        pickButton(NSLocalizedString("scan.takePhoto", comment: ""), icon: "camera", action: { showCamera = true })
                        pickButton(NSLocalizedString("scan.library", comment: ""), icon: "photo", action: { showPhotoPicker = true })
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.xxl)
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

    private func pickButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Spacing.xs) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                Text(title)
                    .font(.system(size: 13, weight: .medium))
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
            .background(TappyColor.primary.opacity(0.1))
            .foregroundStyle(TappyColor.primary)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Result

    private var resultSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                Text(NSLocalizedString("scan.recognizedText", comment: ""))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
                Spacer()
                Button {
                    vm.copyResult()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: vm.copied ? "checkmark" : "doc.on.doc")
                            .font(.system(size: 11))
                        Text(NSLocalizedString(vm.copied ? "scan.copied" : "scan.copy", comment: ""))
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(TappyColor.primary)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("scan-copy")
            }

            Text(vm.extractedText)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)
                .textSelection(.enabled)

            Button {
                let av = UIActivityViewController(activityItems: [vm.extractedText], applicationActivities: nil)
                guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                      let root = windowScene.windows.first?.rootViewController else { return }
                root.present(av, animated: true)
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 11))
                    Text(NSLocalizedString("common.share", comment: ""))
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundStyle(TappyColor.primary)
                .padding(.horizontal, Spacing.sm)
                .padding(.vertical, Spacing.xs)
                .background(TappyColor.primary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            }
            .buttonStyle(.plain)
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

// MARK: - Camera capture

struct CameraCapture: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    let onDismiss: () -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraCapture
        init(_ parent: CameraCapture) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.onCapture(image)
            }
            parent.onDismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.onDismiss()
        }
    }
}
