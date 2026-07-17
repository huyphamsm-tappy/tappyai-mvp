import SwiftUI
import UniformTypeIdentifiers

struct MusicUploadView: View {
    @AppStateObject private var vm: MusicUploadViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var showFilePicker = false

    private let deps: AppDependencies
    private let onUploadComplete: ((String) -> Void)?

    init(deps: AppDependencies, onUploadComplete: ((String) -> Void)? = nil) {
        self.deps = deps
        self.onUploadComplete = onUploadComplete
        let service = MusicService(api: deps.api)
        _vm = AppStateObject(wrappedValue: MusicUploadViewModel(
            service: service, session: deps.session
        ))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.lg) {
                    infoHeader
                    filePicker
                    formFields
                    rightsConsent
                    if let error = vm.error {
                        errorBanner(error)
                    }
                    submitButton
                }
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.lg)
            }
            .background(TappyColor.background)
            .navigationTitle("Đăng nhạc gốc")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Huỷ") { dismiss() }
                }
            }
            .fileImporter(
                isPresented: $showFilePicker,
                allowedContentTypes: audioContentTypes,
                allowsMultipleSelection: false
            ) { result in
                handleFileImport(result)
            }
            .onChange(of: vm.uploadedTrackId) { trackId in
                if let trackId {
                    onUploadComplete?(trackId)
                    dismiss()
                }
            }
        }
    }

    // MARK: - Info header

    private var infoHeader: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "music.note")
                .font(.system(size: 16))
                .foregroundStyle(TappyColor.textSecondary)
            Text("Original Sound — nhạc do chính bạn tạo/sở hữu")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
        }
    }

    // MARK: - File picker button

    private var filePicker: some View {
        Button {
            showFilePicker = true
        } label: {
            VStack(spacing: Spacing.sm) {
                if vm.fileData != nil {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(.green)
                } else {
                    Image(systemName: "icloud.and.arrow.up")
                        .font(.system(size: 28))
                        .foregroundStyle(TappyColor.textSecondary)
                }
                Text(vm.fileData != nil ? vm.fileName : "Chọn file nhạc (mp3, m4a, wav… tối đa 20MB)")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(TappyColor.textSecondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.xl)
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg)
                    .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [8, 4]))
                    .foregroundStyle(TappyColor.border)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Form fields

    private var formFields: some View {
        VStack(spacing: Spacing.sm) {
            TextField("Tên bài hát *", text: $vm.title)
                .font(TappyFont.callout)
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, 12)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.md)
                        .stroke(TappyColor.border, lineWidth: 1)
                )
                .onChange(of: vm.title) { newValue in
                    if newValue.count > MusicUploadLimits.maxTitleLength {
                        vm.title = String(newValue.prefix(MusicUploadLimits.maxTitleLength))
                    }
                }

            TextField("Nghệ sĩ (tùy chọn)", text: $vm.artist)
                .font(TappyFont.callout)
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, 12)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.md)
                        .stroke(TappyColor.border, lineWidth: 1)
                )
                .onChange(of: vm.artist) { newValue in
                    if newValue.count > MusicUploadLimits.maxTitleLength {
                        vm.artist = String(newValue.prefix(MusicUploadLimits.maxTitleLength))
                    }
                }
        }
    }

    // MARK: - Rights consent (mandatory, matches Web)

    private var rightsConsent: some View {
        Button {
            vm.rights.toggle()
        } label: {
            HStack(alignment: .top, spacing: Spacing.sm) {
                Image(systemName: vm.rights ? "checkmark.square.fill" : "square")
                    .font(.system(size: 18))
                    .foregroundStyle(vm.rights ? TappyColor.primary : TappyColor.textSecondary)

                Text("Tôi xác nhận **tôi sở hữu hoặc có đầy đủ quyền** với bản nhạc này, và cho phép TappyAI cùng người dùng khác sử dụng nó trong video của họ. Tôi hiểu việc đăng nhạc vi phạm bản quyền có thể bị gỡ và chịu trách nhiệm pháp lý. Xem Chính sách bản quyền.")
                    .font(.system(size: 12))
                    .foregroundStyle(Color(red: 0.5, green: 0.35, blue: 0))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(Spacing.md)
            .background(Color.orange.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg)
                    .stroke(Color.orange.opacity(0.2), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Error

    private func errorBanner(_ message: String) -> some View {
        Text(message)
            .font(TappyFont.callout)
            .foregroundStyle(.red)
    }

    // MARK: - Submit button

    private var submitButton: some View {
        Button {
            Task { await vm.submit() }
        } label: {
            HStack(spacing: Spacing.sm) {
                if vm.busy {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.8)
                    Text("Đang đăng…")
                        .font(.system(size: 14, weight: .semibold))
                } else {
                    Text("Đăng Original Sound")
                        .font(.system(size: 14, weight: .semibold))
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(vm.canSubmit ? TappyColor.primary : TappyColor.primary.opacity(0.4))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
        .disabled(!vm.canSubmit)
    }

    // MARK: - File import handling

    private var audioContentTypes: [UTType] {
        [.audio, .mp3, .mpeg4Audio, .wav, .aiff]
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            guard url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }
            do {
                let data = try Data(contentsOf: url)
                vm.setFile(data: data, name: url.lastPathComponent)
            } catch {
                vm.error = "Không thể đọc file"
            }
        case .failure:
            vm.error = "Không thể chọn file"
        }
    }
}
