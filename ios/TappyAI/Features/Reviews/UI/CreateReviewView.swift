import SwiftUI
import PhotosUI

struct CreateReviewView: View {
    @AppStateObject private var vm: CreateReviewViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var photoSelection: [PhotosPickerItem] = []
    @State private var videoSelection: PhotosPickerItem?

    private let preselectedSoundId: String?
    private let prefilledPlaceId: String?
    private let prefilledPlaceName: String?

    init(deps: AppDependencies, preselectedSoundId: String? = nil, prefilledPlaceId: String? = nil, prefilledPlaceName: String? = nil) {
        self.preselectedSoundId = preselectedSoundId
        self.prefilledPlaceId = prefilledPlaceId
        self.prefilledPlaceName = prefilledPlaceName
        let service = CreateReviewService(api: deps.api)
        _vm = AppStateObject(wrappedValue: CreateReviewViewModel(
            service: service, session: deps.session, prefilledPlaceId: prefilledPlaceId, prefilledPlaceName: prefilledPlaceName
        ))
    }

    var body: some View {
        if vm.success {
            successScreen
        } else {
            composerScreen
        }
    }

    // MARK: - Success screen

    private var successScreen: some View {
        VStack(spacing: Spacing.md) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(TappyColor.success)
            Text("Đã đăng bài!")
                .font(TappyFont.title)
                .foregroundStyle(TappyColor.textPrimary)
            Text("Cảm ơn bạn đã chia sẻ")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(TappyColor.background.ignoresSafeArea())
        .task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            dismiss()
        }
    }

    // MARK: - Composer

    private var composerScreen: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Spacing.md) {
                    mediaModeTabs
                    mediaSection
                    hashtagChips
                    bodyInput
                    Divider().foregroundStyle(TappyColor.border)
                    placeSection
                    ratingSection
                    musicSection
                    errorBanner
                    Spacer().frame(height: Spacing.xxl)
                }
                .padding(.horizontal, Spacing.md)
                .padding(.top, Spacing.sm)
            }
            .background(TappyColor.background.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text("Bài viết mới")
                        .font(TappyFont.bodyEmphasis)
                        .foregroundStyle(TappyColor.textPrimary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { vm.submit() } label: {
                        if vm.submitting {
                            ProgressView()
                                .tint(.white)
                                .frame(width: 50, height: 32)
                                .background(TappyColor.primary.opacity(0.6))
                                .clipShape(Capsule())
                        } else {
                            Text("Đăng")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, Spacing.lg)
                                .padding(.vertical, Spacing.xs)
                                .background(vm.canPost && !vm.isUploading ? TappyColor.primary : TappyColor.textSecondary.opacity(0.3))
                                .clipShape(Capsule())
                        }
                    }
                    .disabled(!vm.canPost || vm.submitting || vm.isUploading)
                }
            }
            .sheet(isPresented: $vm.musicPickerOpen) {
                MusicPickerView(vm: vm)
            }
            .onAppear {
                if let soundId = preselectedSoundId {
                    vm.selectMusic(MusicSelection(trackId: soundId, startSec: 0, volume: 1.0))
                }
            }
            .onChange(of: photoSelection) { newValue in
                guard !newValue.isEmpty else { return }
                vm.handlePhotoItems(newValue)
                photoSelection = []
            }
            .onChange(of: videoSelection) { newValue in
                guard let item = newValue else { return }
                vm.handleVideoItem(item)
                videoSelection = nil
            }
        }
    }

    // MARK: - Media mode tabs

    private var mediaModeTabs: some View {
        HStack(spacing: Spacing.xxs) {
            mediaTab("Ảnh", icon: "camera", mode: .photo)
            mediaTab("Video", icon: "video", mode: .video)
            mediaTab("Link", icon: "link", mode: .url)
        }
        .padding(Spacing.xxs)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    }

    private func mediaTab(_ title: String, icon: String, mode: MediaMode) -> some View {
        Button {
            vm.switchMediaMode(mode)
        } label: {
            HStack(spacing: Spacing.xxs) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Spacing.sm)
            .background(vm.mediaMode == mode ? TappyColor.background : Color.clear)
            .foregroundStyle(vm.mediaMode == mode ? TappyColor.textPrimary : TappyColor.textSecondary)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            .shadow(color: vm.mediaMode == mode ? .black.opacity(0.05) : .clear, radius: 2, y: 1)
        }
        .buttonStyle(.plain)
        .disabled(vm.isUploading)
    }

    // MARK: - Media sections

    @ViewBuilder
    private var mediaSection: some View {
        switch vm.mediaMode {
        case .photo: photoSection
        case .video: videoSection
        case .url: urlSection
        }
    }

    // MARK: - Photo section

    private var photoSection: some View {
        VStack(spacing: Spacing.sm) {
            if vm.photoURLs.isEmpty {
                PhotosPicker(
                    selection: $photoSelection,
                    maxSelectionCount: UploadLimits.maxPhotosPerReview,
                    matching: .images
                ) {
                    VStack(spacing: Spacing.sm) {
                        if vm.photoUploading {
                            ProgressView()
                                .tint(TappyColor.primary)
                        } else {
                            Image(systemName: "camera")
                                .font(.system(size: 36))
                                .foregroundStyle(TappyColor.textSecondary)
                            Text("Thêm ảnh")
                                .font(TappyFont.callout)
                                .foregroundStyle(TappyColor.textSecondary)
                            Text("Tối đa \(UploadLimits.maxPhotosPerReview) ảnh")
                                .font(TappyFont.caption)
                                .foregroundStyle(TappyColor.textSecondary.opacity(0.6))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 200)
                    .background(
                        RoundedRectangle(cornerRadius: Radius.xl)
                            .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [8]))
                            .foregroundStyle(TappyColor.border)
                    )
                }
                .disabled(vm.photoUploading)
            } else {
                photoGrid
            }
        }
    }

    private var photoGrid: some View {
        let columns = vm.photoURLs.count == 1
            ? [GridItem(.flexible())]
            : vm.photoURLs.count == 2
                ? [GridItem(.flexible()), GridItem(.flexible())]
                : [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

        return VStack(spacing: Spacing.xs) {
            LazyVGrid(columns: columns, spacing: Spacing.xs) {
                ForEach(Array(vm.photoURLs.enumerated()), id: \.offset) { index, url in
                    ZStack(alignment: .topTrailing) {
                        AsyncImage(url: URL(string: url)) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().aspectRatio(contentMode: .fill)
                            default:
                                TappyColor.surface
                            }
                        }
                        .frame(minHeight: 100)
                        .aspectRatio(1, contentMode: .fill)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md))

                        Button { vm.removePhoto(at: index) } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 22, height: 22)
                                .background(.black.opacity(0.6))
                                .clipShape(Circle())
                        }
                        .padding(Spacing.xxs)
                    }
                }

                if vm.photoURLs.count < UploadLimits.maxPhotosPerReview {
                    PhotosPicker(
                        selection: $photoSelection,
                        maxSelectionCount: UploadLimits.maxPhotosPerReview - vm.photoURLs.count,
                        matching: .images
                    ) {
                        VStack {
                            if vm.photoUploading {
                                ProgressView().tint(TappyColor.primary)
                            } else {
                                Image(systemName: "plus")
                                    .font(.system(size: 22))
                                    .foregroundStyle(TappyColor.textSecondary)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .aspectRatio(1, contentMode: .fill)
                        .background(
                            RoundedRectangle(cornerRadius: Radius.md)
                                .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [6]))
                                .foregroundStyle(TappyColor.border)
                        )
                    }
                    .disabled(vm.photoUploading)
                }
            }
        }
    }

    // MARK: - Video section

    private var videoSection: some View {
        VStack(spacing: Spacing.sm) {
            switch vm.uploadStep {
            case .idle:
                PhotosPicker(selection: $videoSelection, matching: .videos) {
                    VStack(spacing: Spacing.sm) {
                        Image(systemName: "video")
                            .font(.system(size: 36))
                            .foregroundStyle(TappyColor.textSecondary)
                        Text("Chọn video")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textSecondary)
                        Text("mp4 · mov · webm  ·  tối đa 60s · 50MB")
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary.opacity(0.6))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 200)
                    .background(
                        RoundedRectangle(cornerRadius: Radius.xl)
                            .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [8]))
                            .foregroundStyle(TappyColor.border)
                    )
                }

            case .thumbnail, .uploading, .processing:
                uploadingView

            case .done:
                doneView

            case .failed(let message):
                VStack(spacing: Spacing.sm) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 36))
                        .foregroundStyle(TappyColor.danger)
                    Text(message)
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.danger)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 200)
                .background(TappyColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
            }
        }
    }

    private var uploadingView: some View {
        VStack(spacing: 0) {
            if let thumb = vm.thumbPreview {
                ZStack {
                    Image(uiImage: thumb)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(height: 200)
                        .clipped()
                        .opacity(0.5)
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(1.5)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
            }

            VStack(spacing: Spacing.sm) {
                HStack {
                    Text(uploadStepLabel)
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textSecondary)
                    Spacer()
                    if case .uploading(let progress) = vm.uploadStep {
                        Text("\(Int(progress * 100))%")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(TappyColor.primary)
                    }
                }

                if case .uploading(let progress) = vm.uploadStep {
                    ProgressView(value: progress)
                        .tint(TappyColor.primary)
                }

                if case .thumbnail = vm.uploadStep {
                    Button { vm.cancelUpload() } label: {
                        HStack(spacing: Spacing.xxs) {
                            Image(systemName: "xmark.circle")
                                .font(.system(size: 14))
                            Text("Hủy")
                                .font(TappyFont.caption)
                        }
                        .foregroundStyle(TappyColor.textSecondary)
                    }
                    .buttonStyle(.plain)
                } else if case .uploading = vm.uploadStep {
                    Button { vm.cancelUpload() } label: {
                        HStack(spacing: Spacing.xxs) {
                            Image(systemName: "xmark.circle")
                                .font(.system(size: 14))
                            Text("Hủy")
                                .font(TappyFont.caption)
                        }
                        .foregroundStyle(TappyColor.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(Spacing.md)
        }
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
    }

    private var uploadStepLabel: String {
        switch vm.uploadStep {
        case .thumbnail: return "Đang tạo thumbnail..."
        case .uploading: return "Đang tải video lên..."
        case .processing: return "Đang phân tích nội dung..."
        default: return ""
        }
    }

    private var doneView: some View {
        VStack(spacing: 0) {
            if let thumb = vm.thumbPreview {
                ZStack {
                    Image(uiImage: thumb)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(height: 200)
                        .clipped()
                    Color.black.opacity(0.3)
                    Image(systemName: "video.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(.white)
                        .padding(Spacing.md)
                        .background(.white.opacity(0.2))
                        .clipShape(Circle())
                }
                .frame(maxWidth: .infinity)
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
            }
            HStack {
                Text("Video đã tải lên")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
                Spacer()
                Button("Xóa") { vm.removeVideo() }
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.danger)
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm)
        }
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
    }

    // MARK: - URL section

    private var urlSection: some View {
        VStack(spacing: Spacing.sm) {
            HStack(spacing: Spacing.xs) {
                ForEach(ExternalSource.allCases, id: \.self) { source in
                    Button {
                        vm.sourceType = source
                        vm.sourceURL = ""
                        vm.urlMeta = nil
                    } label: {
                        Text(source == .youtube ? "▶ YouTube" : source == .tiktok ? "♪ TikTok" : "📘 Facebook")
                            .font(.system(size: 12, weight: .semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Spacing.sm)
                            .background(vm.sourceType == source ? TappyColor.textPrimary : TappyColor.surface)
                            .foregroundStyle(vm.sourceType == source ? TappyColor.background : TappyColor.textSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                            .overlay(
                                RoundedRectangle(cornerRadius: Radius.md)
                                    .stroke(TappyColor.border, lineWidth: vm.sourceType == source ? 0 : 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            TextField(
                vm.sourceType == .youtube ? "Dán link YouTube..." :
                vm.sourceType == .tiktok ? "Dán link TikTok..." :
                "Dán link Facebook...",
                text: Binding(
                    get: { vm.sourceURL },
                    set: { vm.handleURLChange($0) }
                )
            )
            .font(TappyFont.callout)
            .padding(Spacing.sm)
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.md)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.URL)

            if vm.fetchingMeta {
                HStack(spacing: Spacing.xs) {
                    ProgressView().tint(TappyColor.textSecondary)
                    Text("Đang tải thông tin...")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }

            if let thumb = vm.urlMeta?.thumbnailUrl, let url = URL(string: thumb) {
                ZStack {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fill)
                        default:
                            TappyColor.surface
                        }
                    }
                    .frame(height: 200)
                    .clipped()

                    Color.black.opacity(0.3)

                    Text(vm.sourceType == .youtube ? "▶" : vm.sourceType == .tiktok ? "♪" : "📘")
                        .font(.system(size: 28))
                        .padding(Spacing.md)
                        .background(.white.opacity(0.2))
                        .clipShape(Circle())
                }
                .frame(maxWidth: .infinity)
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: Radius.xl))

                if let title = vm.urlMeta?.title, !title.isEmpty {
                    Text(title)
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                        .lineLimit(1)
                }
            }

            if vm.sourceType == .facebook && !vm.sourceURL.isEmpty {
                Text("Facebook: chỉ lưu link và hiển thị nút xem ngoài.")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
            }
        }
    }

    // MARK: - Hashtag chips

    @ViewBuilder
    private var hashtagChips: some View {
        if !vm.aiHashtags.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Spacing.xs) {
                    ForEach(vm.aiHashtags, id: \.self) { tag in
                        Text("#\(tag)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(TappyColor.primary)
                            .padding(.horizontal, Spacing.sm)
                            .padding(.vertical, Spacing.xxs)
                            .background(TappyColor.primary.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
            }
        }
    }

    // MARK: - Body input

    private var bodyInput: some View {
        VStack(alignment: .trailing, spacing: Spacing.xxs) {
            TextEditor(text: $vm.body)
                .font(TappyFont.body)
                .foregroundStyle(TappyColor.textPrimary)
                .frame(minHeight: 100)
                .scrollContentBackground(.hidden)
                .overlay(alignment: .topLeading) {
                    if vm.body.isEmpty {
                        Text("Chia sẻ trải nghiệm, cảm nhận của bạn...")
                            .font(TappyFont.body)
                            .foregroundStyle(TappyColor.textSecondary.opacity(0.6))
                            .padding(.top, 8)
                            .padding(.leading, 4)
                            .allowsHitTesting(false)
                    }
                }
                .onChange(of: vm.body) { newValue in
                    if newValue.count > UploadLimits.maxBodyLength {
                        vm.body = String(newValue.prefix(UploadLimits.maxBodyLength))
                    }
                }

            if !vm.body.isEmpty {
                Text("\(vm.body.count)/\(UploadLimits.maxBodyLength)")
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)
            }
        }
    }

    // MARK: - Place input

    private var placeSection: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Button { vm.togglePlace() } label: {
                HStack(spacing: Spacing.xs) {
                    Image(systemName: "mappin")
                        .font(.system(size: 14))
                        .foregroundStyle(TappyColor.primary)
                    Text(vm.placeName.isEmpty ? "Thêm địa điểm" : vm.placeName)
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.primary)
                    if !vm.placeName.isEmpty {
                        Button { vm.clearPlace() } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 11))
                                .foregroundStyle(TappyColor.textSecondary)
                        }
                    }
                }
            }
            .buttonStyle(.plain)

            if vm.showPlaceInput {
                TextField("Tên quán, nhà hàng, địa điểm...", text: $vm.placeName)
                    .font(TappyFont.callout)
                    .padding(Spacing.sm)
                    .background(TappyColor.surface)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    .overlay(
                        RoundedRectangle(cornerRadius: Radius.md)
                            .stroke(TappyColor.border, lineWidth: 1)
                    )
                    .onChange(of: vm.placeName) { newValue in
                        if newValue.count > UploadLimits.maxPlaceNameLength {
                            vm.placeName = String(newValue.prefix(UploadLimits.maxPlaceNameLength))
                        }
                    }
            }
        }
    }

    // MARK: - Rating

    private var ratingSection: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Button { vm.toggleRating() } label: {
                HStack(spacing: Spacing.xs) {
                    Image(systemName: "star")
                        .font(.system(size: 14))
                        .foregroundStyle(TappyColor.primary)
                    if vm.rating > 0 {
                        Text("\(vm.rating) sao - \(UploadLimits.ratingLabels[vm.rating])")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.primary)
                        Button { vm.clearRating() } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 11))
                                .foregroundStyle(TappyColor.textSecondary)
                        }
                    } else {
                        Text("Thêm đánh giá sao")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.primary)
                    }
                }
            }
            .buttonStyle(.plain)

            if vm.showRating {
                HStack(spacing: Spacing.xs) {
                    ForEach(1...5, id: \.self) { i in
                        Button { vm.setRating(i) } label: {
                            Image(systemName: i <= vm.rating ? "star.fill" : "star")
                                .font(.system(size: 28))
                                .foregroundStyle(i <= vm.rating ? Color.amber : TappyColor.border)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Music

    private var musicSection: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            if vm.music == nil {
                Button { vm.openMusicPicker() } label: {
                    HStack(spacing: Spacing.xs) {
                        Image(systemName: "music.note")
                            .font(.system(size: 14))
                            .foregroundStyle(TappyColor.primary)
                        Text("Thêm nhạc nền")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.primary)
                    }
                }
                .buttonStyle(.plain)
            } else {
                SelectedMusicCard(
                    track: vm.selectedMusicTrack,
                    onReplace: { vm.openMusicPicker() },
                    onRemove: { vm.removeMusic() }
                )
            }
        }
    }

    // MARK: - Error

    @ViewBuilder
    private var errorBanner: some View {
        if let error = vm.error {
            Text(error)
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.danger)
                .padding(Spacing.sm)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(TappyColor.danger.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: Radius.md))
        }
    }
}

// MARK: - Color extension for amber stars

private extension Color {
    static let amber = Color(red: 251/255, green: 191/255, blue: 36/255)
}

