import SwiftUI

struct ReviewPostView: View {
    let review: Review
    let isActive: Bool
    let isNeighbor: Bool
    let isAuthenticated: Bool
    let isOwnPost: Bool
    @ObservedObject var videoPlayer: FeedVideoPlayer
    let onLike: () -> Void
    let onDoubleTapLike: () -> Void
    let onSave: () -> Void
    let onComment: () -> Void
    let onShare: () -> Void
    let onFollow: () -> Void
    let onDelete: () -> Void
    let onHide: () -> Void
    let onCreatorTap: () -> Void
    var onMusicTap: (() -> Void)?

    @State private var showHeartBurst = false
    @State private var singleTapTask: Task<Void, Never>?
    @State private var showOwnMenu = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                TappyColor.feedBackground
                    .ignoresSafeArea()

                mediaLayer(size: geo.size)

                gradientOverlay

                contentOverlay(size: geo.size)

                if showHeartBurst {
                    heartBurstEffect
                }
            }
            .contentShape(Rectangle())
            .onTapGesture(count: 2) {
                handleDoubleTap()
            }
            .onTapGesture(count: 1) {
                handleSingleTap()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onChange(of: isActive) { newValue in
            if review.isVideo, !isExternalEmbed, let url = review.mediaUrl, let videoURL = URL(string: url) {
                if isActive || isNeighbor {
                    videoPlayer.load(url: videoURL)
                }
                videoPlayer.setActive(newValue)
            }
        }
        .onAppear {
            if review.isVideo, !isExternalEmbed, let url = review.mediaUrl, let videoURL = URL(string: url) {
                if isActive || isNeighbor {
                    videoPlayer.load(url: videoURL)
                }
                if isActive {
                    videoPlayer.setActive(true)
                }
            }
        }
        .confirmationDialog("", isPresented: $showOwnMenu, titleVisibility: .hidden) {
            Button("Ẩn bài viết") { onHide() }
            Button("Xoá bài viết", role: .destructive) { onDelete() }
            Button("Huỷ", role: .cancel) {}
        }
    }

    // MARK: - Media

    private var isExternalEmbed: Bool {
        guard let st = review.sourceType else { return false }
        return ["youtube", "tiktok", "facebook"].contains(st)
    }

    @ViewBuilder
    private func mediaLayer(size: CGSize) -> some View {
        if review.isVideo, !isExternalEmbed, let url = review.mediaUrl, URL(string: url) != nil {
            if isActive || isNeighbor {
                FeedVideoView(player: videoPlayer.player)
                    .frame(width: size.width, height: size.height)
                    .clipped()
            } else {
                thumbnailView(size: size)
            }
        } else if isExternalEmbed {
            externalEmbedView(size: size)
        } else if review.isPhoto, let photos = review.photos, !photos.isEmpty {
            ReviewPhotoCarousel(photos: photos)
                .frame(width: size.width, height: size.height)
                .clipped()
        } else {
            thumbnailView(size: size)
        }
    }

    @ViewBuilder
    private func externalEmbedView(size: CGSize) -> some View {
        ZStack {
            thumbnailView(size: size)

            if let sourceUrl = review.sourceUrl, let url = URL(string: sourceUrl) {
                VStack {
                    Spacer()
                    Link(destination: url) {
                        HStack(spacing: Spacing.xs) {
                            Image(systemName: "play.fill")
                            Text(externalLabel)
                        }
                        .font(TappyFont.bodyEmphasis)
                        .foregroundStyle(.white)
                        .padding(.horizontal, Spacing.lg)
                        .padding(.vertical, Spacing.sm)
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.pill))
                    }
                    Spacer()
                }
            }
        }
    }

    private var externalLabel: String {
        switch review.sourceType {
        case "youtube": return "Xem trên YouTube"
        case "tiktok": return "Xem trên TikTok"
        case "facebook": return "Xem trên Facebook"
        default: return "Xem video"
        }
    }

    @ViewBuilder
    private func thumbnailView(size: CGSize) -> some View {
        if let thumb = review.thumbnail, let url = URL(string: thumb) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().aspectRatio(contentMode: .fill)
                default:
                    TappyColor.feedBackground
                }
            }
            .frame(width: size.width, height: size.height)
            .clipped()
        } else {
            TappyColor.feedBackground
        }
    }

    // MARK: - Gradient

    private var gradientOverlay: some View {
        VStack {
            Spacer()
            LinearGradient(
                colors: [.clear, .black.opacity(0.7)],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 300)
        }
        .allowsHitTesting(false)
    }

    // MARK: - Content overlay

    @ViewBuilder
    private func contentOverlay(size: CGSize) -> some View {
        VStack {
            Spacer()

            HStack(alignment: .bottom, spacing: Spacing.sm) {
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    // Creator info
                    HStack(spacing: Spacing.xs) {
                        creatorAvatar
                            .onTapGesture { onCreatorTap() }

                        Text(review.displayName)
                            .font(TappyFont.bodyEmphasis)
                            .foregroundStyle(TappyColor.feedTextPrimary)
                            .lineLimit(1)
                            .onTapGesture { onCreatorTap() }

                        if !isOwnPost && isAuthenticated {
                            Button {
                                onFollow()
                            } label: {
                                Text("Theo dõi")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, Spacing.sm)
                                    .padding(.vertical, Spacing.xxs)
                                    .background(.white.opacity(0.2))
                                    .clipShape(RoundedRectangle(cornerRadius: Radius.pill))
                            }
                            .buttonStyle(.plain)
                        }

                        Text(ago(review.createdAt))
                            .font(TappyFont.caption)
                            .foregroundStyle(TappyColor.feedTextSecondary)
                    }

                    // Place chip
                    if let placeName = review.placeName, !review.isShareOnly {
                        HStack(spacing: Spacing.xxs) {
                            Image(systemName: "mappin.circle.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(TappyColor.secondary)
                            Text(placeName)
                                .font(TappyFont.footnote)
                                .foregroundStyle(TappyColor.feedTextPrimary)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, Spacing.sm)
                        .padding(.vertical, Spacing.xxs)
                        .background(.ultraThinMaterial.opacity(0.4))
                        .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
                    }

                    // Rating
                    if let rating = review.rating, rating > 0 {
                        HStack(spacing: 2) {
                            ForEach(1...5, id: \.self) { i in
                                Image(systemName: Double(i) <= rating ? "star.fill" : "star")
                                    .font(.system(size: 11))
                                    .foregroundStyle(Double(i) <= rating ? TappyColor.secondary : TappyColor.feedTextSecondary)
                            }
                        }
                    }

                    // Body text
                    if let body = review.body, !body.isEmpty {
                        Text(body)
                            .font(TappyFont.callout)
                            .foregroundStyle(TappyColor.feedTextPrimary)
                            .lineLimit(3)
                    }

                    // Own-post menu
                    if isOwnPost {
                        Button {
                            showOwnMenu = true
                        } label: {
                            HStack(spacing: Spacing.xxs) {
                                Image(systemName: "ellipsis")
                                    .font(.system(size: 14))
                                    .foregroundStyle(TappyColor.feedTextSecondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                // Action rail
                ReviewActionRail(
                    review: review,
                    isAuthenticated: isAuthenticated,
                    isPlaying: videoPlayer.isPlaying,
                    onLike: onLike,
                    onComment: onComment,
                    onSave: onSave,
                    onShare: onShare,
                    onMusicTap: onMusicTap
                )
            }
            .padding(.horizontal, Spacing.md)
            .padding(.bottom, Spacing.xl)
        }
    }

    // MARK: - Creator avatar

    private var creatorAvatar: some View {
        Group {
            if let url = review.profiles?.avatarUrl, let imageURL = URL(string: url) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        defaultAvatar
                    }
                }
            } else {
                defaultAvatar
            }
        }
        .frame(width: 36, height: 36)
        .clipShape(Circle())
    }

    private var defaultAvatar: some View {
        Circle()
            .fill(TappyColor.feedTextSecondary.opacity(0.3))
            .overlay(
                Image(systemName: "person.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(TappyColor.feedTextPrimary)
            )
    }

    // MARK: - Heart burst

    private var heartBurstEffect: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: 80))
            .foregroundStyle(.red)
            .scaleEffect(showHeartBurst ? 1.0 : 0.3)
            .opacity(showHeartBurst ? 1 : 0)
            .animation(.spring(response: 0.3, dampingFraction: 0.5), value: showHeartBurst)
            .allowsHitTesting(false)
    }

    // MARK: - Gestures

    private func handleDoubleTap() {
        singleTapTask?.cancel()
        singleTapTask = nil

        onDoubleTapLike()
        FeedVideoPlayer.feedAudioUnlocked = true

        showHeartBurst = true
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 800_000_000)
            showHeartBurst = false
        }
    }

    private func handleSingleTap() {
        singleTapTask?.cancel()
        singleTapTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            if review.isVideo, !isExternalEmbed {
                videoPlayer.togglePlay()
                videoPlayer.unlockAudio()
            }
        }
    }
}
