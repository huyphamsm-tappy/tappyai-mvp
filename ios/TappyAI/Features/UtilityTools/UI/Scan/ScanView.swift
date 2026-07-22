import SwiftUI
import PhotosUI

struct ScanView: View {
    @AppStateObject private var vm: ScanViewModel
    @State private var showPhotoPicker = false
    @State private var showCamera = false
    @State private var photoPickerItem: PhotosPickerItem?

    init(deps: AppDependencies) {
        let service = UtilityToolsService(api: deps.api)
        _vm = AppStateObject(wrappedValue: ScanViewModel(service: service))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.md) {
                imageSection
                if vm.hasImage && !vm.hasResult && !vm.loading {
                    scanButton
                }
                if vm.loading {
                    loadingSection
                }
                if vm.hasResult {
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
        .navigationTitle("📷 Scan văn bản")
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
                Image(systemName: "doc.text.viewfinder")
                Text("Scan văn bản")
            }
            .font(.system(size: 15, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(TappyColor.primary)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Image section

    private var imageSection: some View {
        VStack(spacing: Spacing.md) {
            if let image = vm.selectedImage {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxHeight: 250)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))

                HStack(spacing: Spacing.sm) {
                    pickButton("Chọn ảnh khác", icon: "photo", action: { showPhotoPicker = true })
                    pickButton("Xoá", icon: "xmark", action: { vm.clear() })
                }
            } else {
                VStack(spacing: Spacing.md) {
                    Image(systemName: "doc.text.viewfinder")
                        .font(.system(size: 40))
                        .foregroundStyle(TappyColor.textSecondary)

                    Text("Chụp hoặc chọn ảnh có chữ để scan")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                        .multilineTextAlignment(.center)

                    HStack(spacing: Spacing.sm) {
                        pickButton("Chụp ảnh", icon: "camera", action: { showCamera = true })
                        pickButton("Thư viện", icon: "photo", action: { showPhotoPicker = true })
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

    // MARK: - Loading

    private var loadingSection: some View {
        HStack(spacing: Spacing.sm) {
            ProgressView()
                .tint(TappyColor.primary)
                .scaleEffect(0.8)
            Text("Đang nhận dạng văn bản...")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(Spacing.lg)
        .background(TappyColor.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
    }

    // MARK: - Result

    private var resultSection: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack {
                Text("Văn bản nhận dạng")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TappyColor.textSecondary)
                Spacer()
                Button {
                    UIPasteboard.general.string = vm.extractedText
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 11))
                        Text("Sao chép")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(TappyColor.primary)
                }
                .buttonStyle(.plain)
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
                    Text("Chia sẻ")
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
