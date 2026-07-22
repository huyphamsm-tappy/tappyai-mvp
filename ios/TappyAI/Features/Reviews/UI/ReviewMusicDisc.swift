import SwiftUI

struct ReviewMusicDisc: View {
    let music: ReviewMusic?
    let isPlaying: Bool
    var onTap: (() -> Void)?
    @State private var rotation: Double = 0

    var body: some View {
        Button {
            onTap?()
        } label: {
            HStack(spacing: Spacing.xs) {
                Image(systemName: music?.trackId != nil ? "music.note" : "speaker.slash")
                    .font(.system(size: 11))
                    .foregroundStyle(TappyColor.feedTextSecondary)
                    .rotationEffect(.degrees(music?.trackId != nil ? rotation : 0))

                if let title = music?.title, !title.isEmpty {
                    Text(title)
                        .font(.system(size: 12))
                        .foregroundStyle(TappyColor.feedTextSecondary)
                        .lineLimit(1)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(music?.trackId == nil)
        .onAppear {
            if isPlaying && music?.trackId != nil {
                withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
                    rotation = 360
                }
            }
        }
        .onChange(of: isPlaying) { playing in
            if playing && music?.trackId != nil {
                withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
                    rotation = 360
                }
            } else {
                withAnimation(.default) { rotation = 0 }
            }
        }
    }
}
