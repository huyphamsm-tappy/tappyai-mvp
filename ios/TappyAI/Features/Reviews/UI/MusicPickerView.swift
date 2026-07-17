import SwiftUI
import AVFoundation

struct MusicPickerView: View {
    @ObservedObject var vm: CreateReviewViewModel
    @State private var selectedTrack: MusicTrack?
    @State private var previewingTrackId: String?
    @State private var startSec: Int = 0
    @State private var volume: Double = 1.0
    @StateObject private var audioPlayer = MusicPreviewPlayer()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let track = selectedTrack {
                    selectionPanel(track: track)
                } else {
                    browsePanel
                }
            }
            .navigationTitle("Chọn nhạc nền")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Đóng") {
                        audioPlayer.stop()
                        vm.closeMusicPicker()
                    }
                }
            }
        }
        .onDisappear { audioPlayer.stop() }
    }

    // MARK: - Browse panel

    private var browsePanel: some View {
        VStack(spacing: 0) {
            searchBar

            if vm.musicSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                categoryTabs
            }

            trackList
        }
    }

    private var searchBar: some View {
        HStack(spacing: Spacing.sm) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(TappyColor.textSecondary)
            TextField("Tìm nhạc...", text: Binding(
                get: { vm.musicSearchQuery },
                set: { vm.searchMusic($0) }
            ))
            .font(TappyFont.callout)
            .textInputAutocapitalization(.never)

            if !vm.musicSearchQuery.isEmpty {
                Button {
                    vm.searchMusic("")
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

    private var categoryTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.xs) {
                categoryPill("Tất cả", id: nil)
                ForEach(vm.musicCategories) { cat in
                    categoryPill(cat.label, id: cat.id)
                }
            }
            .padding(.horizontal, Spacing.md)
        }
        .padding(.bottom, Spacing.sm)
    }

    private func categoryPill(_ title: String, id: String?) -> some View {
        Button {
            vm.selectMusicCategory(id)
        } label: {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, Spacing.xs)
                .background(vm.musicActiveCategoryId == id ? TappyColor.primary : TappyColor.surface)
                .foregroundStyle(vm.musicActiveCategoryId == id ? .white : TappyColor.textSecondary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var trackList: some View {
        let isSearching = !vm.musicSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let tracks = isSearching ? vm.musicSearchResults : vm.musicTracks
        let loading = isSearching ? vm.musicSearchLoading : vm.musicLoading

        return ScrollView {
            LazyVStack(spacing: 0) {
                if loading && tracks.isEmpty {
                    VStack(spacing: Spacing.sm) {
                        Spacer().frame(height: Spacing.xxl)
                        ProgressView().tint(TappyColor.textSecondary)
                    }
                } else if tracks.isEmpty {
                    VStack(spacing: Spacing.sm) {
                        Spacer().frame(height: Spacing.xxl)
                        Image(systemName: "music.note.list")
                            .font(.system(size: 36))
                            .foregroundStyle(TappyColor.textSecondary)
                        Text("Không tìm thấy nhạc")
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.textSecondary)
                    }
                } else {
                    ForEach(tracks) { track in
                        trackRow(track)
                    }

                    if !isSearching && vm.musicHasMore {
                        Button("Tải thêm") {
                            vm.loadMoreMusic()
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
                audioPlayer.stop()
                previewingTrackId = nil
                selectedTrack = track
                startSec = 0
                volume = 1.0
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
                togglePreview(track)
            } label: {
                Image(systemName: previewingTrackId == track.id ? "stop.fill" : "play.fill")
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

    private func togglePreview(_ track: MusicTrack) {
        if previewingTrackId == track.id {
            audioPlayer.stop()
            previewingTrackId = nil
        } else {
            audioPlayer.play(url: track.previewSource)
            previewingTrackId = track.id
        }
    }

    // MARK: - Selection panel (start time + volume)

    private func selectionPanel(track: MusicTrack) -> some View {
        VStack(spacing: Spacing.lg) {
            HStack(spacing: Spacing.sm) {
                Button {
                    selectedTrack = nil
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16))
                        .foregroundStyle(TappyColor.textSecondary)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)

                trackThumbnail(track)
                    .frame(width: 48, height: 48)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm))

                VStack(alignment: .leading, spacing: 2) {
                    Text(track.title)
                        .font(TappyFont.bodyEmphasis)
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
            }

            VStack(spacing: Spacing.xxs) {
                HStack {
                    Text("Vị trí bắt đầu")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    Spacer()
                    Text("\(formatDuration(startSec)) / \(formatDuration(track.durationSec))")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
                Slider(
                    value: Binding(
                        get: { Double(startSec) },
                        set: { startSec = Int($0) }
                    ),
                    in: 0...Double(max(0, track.durationSec - 1)),
                    step: 1
                )
                .tint(TappyColor.primary)
            }

            VStack(spacing: Spacing.xxs) {
                HStack {
                    Text("Âm lượng")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                    Spacer()
                    Text("\(Int(volume * 100))%")
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }
                Slider(value: $volume, in: 0...1, step: 0.01)
                    .tint(TappyColor.primary)
            }

            Button {
                let selection = MusicSelection(trackId: track.trackId, startSec: startSec, volume: volume)
                audioPlayer.stop()
                vm.selectMusic(selection)
            } label: {
                Text("Chọn nhạc này")
                    .font(TappyFont.button)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.sm)
                    .background(TappyColor.primary)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)

            Spacer()
        }
        .padding(Spacing.md)
    }
}

// MARK: - Audio preview player

@MainActor
final class MusicPreviewPlayer: ObservableObject {
    private var player: AVPlayer?

    func play(url: String) {
        guard let audioURL = URL(string: url) else { return }
        stop()
        player = AVPlayer(url: audioURL)
        player?.play()
    }

    func stop() {
        player?.pause()
        player = nil
    }
}

// MusicTrack helper
private extension MusicTrack {
    var trackId: String { id }
}
