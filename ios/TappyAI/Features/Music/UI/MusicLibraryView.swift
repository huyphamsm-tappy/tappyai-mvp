import SwiftUI
import AVFoundation

struct MusicLibraryView: View {
    @AppStateObject private var vm: MusicLibraryViewModel
    @StateObject private var audioPlayer = MusicAudioPlayer()
    @State private var showUpload = false
    @State private var soundPageTrackId: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    private let deps: AppDependencies

    init(deps: AppDependencies) {
        self.deps = deps
        let service = MusicService(api: deps.api)
        _vm = AppStateObject(wrappedValue: MusicLibraryViewModel(service: service))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchBar
                if !vm.isSearching {
                    categoryTabs
                }
                trackList
            }
            .background(TappyColor.background)
            .navigationTitle("🎵 Thư viện nhạc")
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
                            Text("Trang chủ")
                                .font(.system(size: 14, weight: .medium))
                        }
                        .foregroundStyle(TappyColor.primary)
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showUpload = true
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.system(size: 14))
                            Text("Đăng")
                                .font(.system(size: 14, weight: .medium))
                        }
                        .foregroundStyle(TappyColor.primary)
                    }
                }
            }
            .sheet(isPresented: $showUpload) {
                MusicUploadView(deps: deps) { trackId in
                    soundPageTrackId = trackId
                }
            }
            .sheet(item: soundPageBinding) { wrapper in
                NavigationStack {
                    SoundPageView(trackId: wrapper.id, deps: deps)
                }
            }
        }
        .onAppear {
            vm.loadCategories()
            vm.loadTracks()
            audioPlayer.onEnded = {
                vm.stopPreview()
            }
        }
        .onDisappear {
            audioPlayer.stop()
        }
        .onChange(of: vm.previewingTrackId) { newValue in
            if let id = newValue,
               let track = vm.displayTracks.first(where: { $0.id == id }) {
                audioPlayer.play(url: track.previewSource)
            } else {
                audioPlayer.stop()
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .background {
                audioPlayer.stop()
                vm.stopPreview()
            }
        }
    }

    private var soundPageBinding: Binding<StringIdentifiable?> {
        Binding<StringIdentifiable?>(
            get: { soundPageTrackId.map { StringIdentifiable(id: $0) } },
            set: { soundPageTrackId = $0?.id }
        )
    }

    // MARK: - Search bar

    private var searchBar: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(TappyColor.textSecondary)
            TextField("Tìm nhạc...", text: Binding(
                get: { vm.searchQuery },
                set: { vm.updateSearch($0) }
            ))
            .font(TappyFont.callout)
            .textInputAutocapitalization(.never)

            if !vm.searchQuery.isEmpty {
                Button {
                    vm.updateSearch("")
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
        }
        .padding(Spacing.sm)
        .background(TappyColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md))
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm)
    }

    // MARK: - Category tabs

    private var categoryTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                categoryPill("Tất cả", id: nil)
                ForEach(vm.categories) { cat in
                    categoryPill(cat.label, id: cat.id)
                }
            }
            .padding(.horizontal, Spacing.md)
        }
        .padding(.bottom, Spacing.sm)
    }

    private func categoryPill(_ title: String, id: String?) -> some View {
        Button {
            vm.selectCategory(id)
        } label: {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.xs)
                .background(vm.activeCategoryId == id ? TappyColor.primary : TappyColor.surface)
                .foregroundStyle(vm.activeCategoryId == id ? .white : TappyColor.textSecondary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Track list

    private var trackList: some View {
        Group {
            if let error = vm.displayError {
                errorState(error)
            } else if vm.displayLoading && vm.displayTracks.isEmpty {
                loadingState
            } else if vm.displayTracks.isEmpty {
                emptyState
            } else {
                trackListContent
            }
        }
    }

    private var trackListContent: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(vm.displayTracks) { track in
                    trackRow(track)
                }

                if !vm.isSearching && vm.hasMore {
                    if vm.loading {
                        ProgressView()
                            .tint(TappyColor.textSecondary)
                            .padding(.vertical, Spacing.md)
                    } else {
                        Button("Tải thêm") {
                            vm.loadMore()
                        }
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.primary)
                        .padding(.vertical, Spacing.md)
                    }
                }
            }
            .padding(.horizontal, Spacing.md)
        }
    }

    private func trackRow(_ track: MusicTrack) -> some View {
        HStack(spacing: Spacing.sm) {
            Button {
                vm.togglePreview(track)
            } label: {
                HStack(spacing: Spacing.sm) {
                    trackThumbnail(track)
                        .frame(width: 40, height: 40)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.sm))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.title)
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textPrimary)
                            .lineLimit(1)
                        if let artist = track.artist, !artist.isEmpty {
                            Text(artist)
                                .font(TappyFont.caption)
                                .foregroundStyle(TappyColor.textSecondary)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Text(formatDuration(track.durationSec))
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
            }
            .buttonStyle(.plain)

            Button {
                vm.togglePreview(track)
            } label: {
                Image(systemName: vm.previewingTrackId == track.id ? "stop.fill" : "play.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(TappyColor.primary)
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, Spacing.xs)
    }

    @ViewBuilder
    private func trackThumbnail(_ track: MusicTrack) -> some View {
        if let coverUrl = track.coverUrl, let url = URL(string: coverUrl) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                default:
                    defaultTrackThumb
                }
            }
        } else {
            defaultTrackThumb
        }
    }

    private var defaultTrackThumb: some View {
        RoundedRectangle(cornerRadius: Radius.sm)
            .fill(TappyColor.surface)
            .overlay(
                Image(systemName: "music.note")
                    .font(.system(size: 14))
                    .foregroundStyle(TappyColor.textSecondary)
            )
    }

    // MARK: - States

    private var loadingState: some View {
        VStack {
            Spacer()
            ProgressView()
                .tint(TappyColor.textSecondary)
            Spacer()
        }
    }

    private var emptyState: some View {
        VStack(spacing: Spacing.sm) {
            Spacer()
            Image(systemName: "music.note.list")
                .font(.system(size: 36))
                .foregroundStyle(TappyColor.textSecondary)
            Text("Không tìm thấy nhạc")
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
            Spacer()
        }
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: Spacing.sm) {
            Spacer()
            Image(systemName: "exclamationmark.circle")
                .font(.system(size: 36))
                .foregroundStyle(TappyColor.textSecondary)
                .opacity(0.6)
            Text(message)
                .font(TappyFont.callout)
                .foregroundStyle(TappyColor.textSecondary)
            Button("Thử lại") {
                vm.loadTracks()
            }
            .buttonStyle(.tappy(.tertiary))
            Spacer()
        }
    }
}

// MARK: - Shared audio preview player

@MainActor
final class MusicAudioPlayer: ObservableObject {
    private var player: AVPlayer?
    private var endObserver: NSObjectProtocol?
    var onEnded: (() -> Void)?

    func play(url: String) {
        guard let audioURL = URL(string: url) else { return }
        stop()
        let item = AVPlayerItem(url: audioURL)
        player = AVPlayer(playerItem: item)
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndOfTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            self?.onEnded?()
        }
        player?.play()
    }

    func stop() {
        player?.pause()
        if let obs = endObserver {
            NotificationCenter.default.removeObserver(obs)
            endObserver = nil
        }
        player = nil
    }
}

