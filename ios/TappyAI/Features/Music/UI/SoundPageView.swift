import SwiftUI
import AVFoundation

struct SoundPageView: View {
    @AppStateObject private var vm: SoundPageViewModel
    @StateObject private var audioPlayer = MusicAudioPlayer()
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var showCreateReview = false

    private let deps: AppDependencies

    init(trackId: String, deps: AppDependencies) {
        self.deps = deps
        let service = MusicService(api: deps.api)
        _vm = AppStateObject(wrappedValue: SoundPageViewModel(
            trackId: trackId, service: service, session: deps.session
        ))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if vm.loading {
                    loadingState
                } else if let error = vm.error {
                    errorState(error)
                } else if let data = vm.data {
                    soundContent(data)
                }
            }
            .padding(.horizontal, Spacing.md)
            .padding(.top, Spacing.lg)
        }
        .background(TappyColor.background)
        .navigationTitle("Âm thanh")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    audioPlayer.stop()
                    dismiss()
                } label: {
                    HStack(spacing: 2) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Quay lại")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundStyle(TappyColor.primary)
                }
            }
        }
        .navigationBarBackButtonHidden(true)
        .fullScreenCover(isPresented: $showCreateReview) {
            CreateReviewView(deps: deps, preselectedSoundId: vm.trackId)
        }
        .sheet(isPresented: $vm.reportOpen) {
            reportSheet
        }
        .task {
            await vm.load()
        }
        .onAppear {
            audioPlayer.onEnded = {
                vm.playing = false
            }
        }
        .onDisappear {
            audioPlayer.stop()
        }
        .onChange(of: vm.playing) { isPlaying in
            if let data = vm.data {
                if isPlaying {
                    let url = data.track.previewUrl ?? data.track.audioUrl
                    audioPlayer.play(url: url)
                    vm.recordFirstPlay()
                } else {
                    audioPlayer.stop()
                }
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background && vm.playing {
                audioPlayer.stop()
                vm.playing = false
            }
        }
    }

    // MARK: - Sound content

    @ViewBuilder
    private func soundContent(_ data: SoundData) -> some View {
        VStack(spacing: Spacing.md) {
            heroSection(data)
            actionButtons(data)
            videosGrid(data)
        }
    }

    // MARK: - Hero section

    private func heroSection(_ data: SoundData) -> some View {
        VStack(spacing: Spacing.sm) {
            ZStack {
                trackCover(data.track.coverUrl, size: 132)
                Button {
                    vm.playing.toggle()
                } label: {
                    Image(systemName: vm.playing ? "pause.fill" : "play.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(.white)
                        .frame(width: 56, height: 56)
                        .background(.black.opacity(0.55))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 6) {
                Image(systemName: "music.note")
                    .font(.system(size: 14))
                    .foregroundStyle(TappyColor.primary)
                Text(data.track.title)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(TappyColor.textPrimary)
            }
            .padding(.top, Spacing.xs)

            Text(data.track.artist ?? "Không rõ nghệ sĩ")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)

            HStack(spacing: Spacing.sm) {
                Text(formatDuration(data.track.durationSec))
                    .font(TappyFont.caption)
                    .foregroundStyle(TappyColor.textSecondary)

                Text("🏷️ \(MusicTypeLabel.label(for: data.track.musicType))")
                    .font(.system(size: 12))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(TappyColor.surface)
                    .clipShape(Capsule())
            }

            if let attr = attributionFor(data.track.audioUrl) {
                Text("\(data.track.artist ?? "") · \(attr.license) · \(attr.provider)")
                    .font(.system(size: 11))
                    .foregroundStyle(TappyColor.textSecondary.opacity(0.7))
            }

            if let rank = data.trendingRank {
                HStack(spacing: 4) {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .font(.system(size: 13))
                    Text("Trending tuần này (#\(rank))")
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundStyle(.orange)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Color.orange.opacity(0.1))
                .clipShape(Capsule())
                .padding(.top, Spacing.xxs)
            }

            HStack(spacing: Spacing.md) {
                HStack(spacing: 4) {
                    Text("🎬")
                    Text("\(fmtNumber(data.usageCount))")
                        .fontWeight(.semibold)
                    Text("video")
                }
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textPrimary)

                HStack(spacing: 4) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.pink)
                    Text("\(fmtNumber(vm.savedCount))")
                        .fontWeight(.semibold)
                    Text("lưu")
                }
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textPrimary)
            }
            .padding(.top, Spacing.xs)

            Text("Đã phát \(fmtNumber(vm.playCount)) lần")
                .font(TappyFont.caption)
                .foregroundStyle(TappyColor.textSecondary.opacity(0.7))
        }
    }

    // MARK: - Action buttons

    private func actionButtons(_ data: SoundData) -> some View {
        VStack(spacing: Spacing.sm) {
            HStack(spacing: Spacing.sm) {
                Button {
                    vm.toggleSave()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: vm.saved ? "heart.fill" : "heart")
                            .font(.system(size: 16))
                        Text(vm.saved ? "Đã lưu" : "Lưu")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(vm.saved ? Color.pink : TappyColor.surface)
                    .foregroundStyle(vm.saved ? .white : TappyColor.textPrimary)
                    .clipShape(Capsule())
                    .overlay(
                        Capsule()
                            .stroke(vm.saved ? Color.clear : TappyColor.border, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .disabled(vm.busy || !vm.isAuthenticated)

                Button {
                    vm.toggleFollow()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: vm.followed ? "bell.fill" : "bell")
                            .font(.system(size: 16))
                        Text(vm.followed ? "Đang theo dõi" : "Theo dõi")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(vm.followed ? TappyColor.primary : TappyColor.surface)
                    .foregroundStyle(vm.followed ? .white : TappyColor.textPrimary)
                    .clipShape(Capsule())
                    .overlay(
                        Capsule()
                            .stroke(vm.followed ? Color.clear : TappyColor.border, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .disabled(vm.busy || !vm.isAuthenticated)
            }

            Button {
                audioPlayer.stop()
                vm.playing = false
                showCreateReview = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                        .font(.system(size: 16))
                    Text("Sử dụng âm thanh này")
                        .font(.system(size: 14, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(
                    LinearGradient(
                        colors: [TappyColor.primary, TappyColor.primary.opacity(0.8)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .foregroundStyle(.white)
                .clipShape(Capsule())
            }
            .buttonStyle(.plain)

            Button {
                vm.reportOpen = true
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "flag")
                        .font(.system(size: 12))
                    Text("Báo cáo bản quyền")
                        .font(.system(size: 12))
                }
                .foregroundStyle(TappyColor.textSecondary.opacity(0.7))
            }
            .buttonStyle(.plain)
            .padding(.top, Spacing.xxs)
        }
        .padding(.top, Spacing.lg)
    }

    // MARK: - Videos grid

    private func videosGrid(_ data: SoundData) -> some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            Text("Video sử dụng bài nhạc này")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(TappyColor.textPrimary)

            if data.videos.isEmpty {
                Text("Chưa có video nào dùng bài nhạc này. Hãy là người đầu tiên!")
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.xxl)
            } else {
                let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 3)
                LazyVGrid(columns: columns, spacing: 6) {
                    ForEach(data.videos) { video in
                        videoThumbnail(video)
                    }
                }
            }
        }
        .padding(.top, Spacing.xxl)
    }

    private func videoThumbnail(_ video: SoundVideo) -> some View {
        ZStack(alignment: .bottomLeading) {
            if let thumb = video.thumbnail, let url = URL(string: thumb) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        placeholderThumb
                    }
                }
            } else {
                placeholderThumb
            }

            HStack(spacing: 2) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 11))
                Text("\(video.likeCount)")
                    .font(.system(size: 11))
            }
            .foregroundStyle(.white)
            .shadow(radius: 2)
            .padding(4)
        }
        .frame(height: 160)
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
        .clipped()
    }

    private var placeholderThumb: some View {
        Rectangle()
            .fill(TappyColor.surface)
            .overlay(
                Image(systemName: "music.note")
                    .font(.system(size: 20))
                    .foregroundStyle(TappyColor.textSecondary)
            )
    }

    // MARK: - Report sheet

    private var reportSheet: some View {
        NavigationStack {
            VStack(spacing: Spacing.md) {
                HStack {
                    Image(systemName: "flag.fill")
                        .foregroundStyle(.red)
                    Text("Báo cáo bài nhạc")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(TappyColor.textPrimary)
                    Spacer()
                }

                if vm.reportSent {
                    Text("Đã gửi báo cáo. Chúng tôi sẽ xử lý trong 24–48h. Cảm ơn bạn!")
                        .font(TappyFont.callout)
                        .foregroundStyle(.green)
                        .padding(.vertical, Spacing.lg)
                } else {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        ForEach(ReportReason.allCases, id: \.self) { reason in
                            Button {
                                vm.reportReason = reason
                            } label: {
                                HStack(spacing: Spacing.sm) {
                                    Image(systemName: vm.reportReason == reason ? "largecircle.fill.circle" : "circle")
                                        .font(.system(size: 16))
                                        .foregroundStyle(vm.reportReason == reason ? TappyColor.primary : TappyColor.textSecondary)
                                    Text(reason.displayLabel)
                                        .font(TappyFont.callout)
                                        .foregroundStyle(TappyColor.textPrimary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    TextEditor(text: $vm.reportDetails)
                        .font(TappyFont.callout)
                        .frame(height: 80)
                        .padding(Spacing.xs)
                        .background(TappyColor.surface)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                        .overlay(
                            RoundedRectangle(cornerRadius: Radius.md)
                                .stroke(TappyColor.border, lineWidth: 1)
                        )
                        .overlay(alignment: .topLeading) {
                            if vm.reportDetails.isEmpty {
                                Text("Mô tả thêm (tùy chọn)")
                                    .font(TappyFont.callout)
                                    .foregroundStyle(TappyColor.textSecondary)
                                    .padding(.horizontal, Spacing.sm)
                                    .padding(.vertical, Spacing.xs + 8)
                                    .allowsHitTesting(false)
                            }
                        }

                    Button {
                        vm.submitReport()
                    } label: {
                        HStack {
                            if vm.reportBusy {
                                ProgressView()
                                    .tint(.white)
                                    .scaleEffect(0.8)
                            }
                            Text("Gửi báo cáo")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.red)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(vm.reportBusy)

                    Text("Xem Chính sách bản quyền")
                        .font(.system(size: 11))
                        .foregroundStyle(TappyColor.textSecondary)
                        .frame(maxWidth: .infinity)
                }

                Spacer()
            }
            .padding(Spacing.lg)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Đóng") {
                        vm.reportOpen = false
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Helpers

    @ViewBuilder
    private func trackCover(_ coverUrl: String?, size: CGFloat) -> some View {
        if let coverUrl, let url = URL(string: coverUrl) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: size, height: size)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
                default:
                    defaultCover(size: size)
                }
            }
        } else {
            defaultCover(size: size)
        }
    }

    private func defaultCover(size: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: Radius.lg)
            .fill(TappyColor.surface)
            .frame(width: size, height: size)
            .overlay(
                Image(systemName: "music.note")
                    .font(.system(size: size * 0.3))
                    .foregroundStyle(TappyColor.textSecondary)
            )
    }

    // MARK: - Loading / Error states

    private var loadingState: some View {
        VStack {
            Spacer().frame(height: 100)
            ProgressView()
                .tint(TappyColor.textSecondary)
        }
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: Spacing.sm) {
            Spacer().frame(height: 60)
            RoundedRectangle(cornerRadius: Radius.lg)
                .fill(Color.red.opacity(0.05))
                .overlay(
                    Text(message)
                        .font(TappyFont.callout)
                        .foregroundStyle(.red)
                        .padding(Spacing.md)
                )
                .frame(height: 60)
        }
    }

    private func fmtNumber(_ n: Int) -> String {
        n.formatted(.number.locale(Locale(identifier: "vi-VN")))
    }

    private func attributionFor(_ audioUrl: String) -> (license: String, provider: String)? {
        guard audioUrl.contains("mp3d.jamendo.com") else { return nil }
        return (license: "CC-BY", provider: "Jamendo")
    }
}
