import SwiftUI

struct SelectedMusicCard: View {
    let track: MusicTrack?
    let onReplace: () -> Void
    let onRemove: () -> Void

    var body: some View {
        Button(action: onReplace) {
            HStack(spacing: Spacing.sm) {
                musicThumbnail
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.sm))

                VStack(alignment: .leading, spacing: 2) {
                    Text(track?.title ?? "Đang tải...")
                        .font(TappyFont.callout)
                        .foregroundStyle(TappyColor.textPrimary)
                        .lineLimit(1)
                    if let artist = track?.artist, !artist.isEmpty {
                        Text(artist)
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.textSecondary)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if let track {
                    Text(formatDuration(track.durationSec))
                        .font(TappyFont.caption)
                        .foregroundStyle(TappyColor.textSecondary)
                }

                Button {
                    onRemove()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12))
                        .foregroundStyle(TappyColor.textSecondary)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
            }
            .padding(Spacing.sm)
            .background(TappyColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.lg)
                    .stroke(TappyColor.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var musicThumbnail: some View {
        if let coverUrl = track?.coverUrl, let url = URL(string: coverUrl) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                default:
                    defaultThumbnail
                }
            }
        } else {
            defaultThumbnail
        }
    }

    private var defaultThumbnail: some View {
        RoundedRectangle(cornerRadius: Radius.sm)
            .fill(TappyColor.surface)
            .overlay(
                Image(systemName: "music.note")
                    .foregroundStyle(TappyColor.textSecondary)
            )
    }
}

func formatDuration(_ seconds: Int) -> String {
    let m = seconds / 60
    let s = seconds % 60
    return "\(m):\(String(format: "%02d", s))"
}
