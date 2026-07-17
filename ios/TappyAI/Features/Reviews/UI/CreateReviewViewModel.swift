import Foundation
import PhotosUI
import AVFoundation
import SwiftUI
import Combine

@MainActor
final class CreateReviewViewModel: AppObservableObject {
    // MARK: - Published state

    @AppPublished var mediaMode: MediaMode = .photo
    @AppPublished var body: String = ""
    @AppPublished var rating: Int = 0
    @AppPublished var placeName: String = ""
    @AppPublished var showPlaceInput = false
    @AppPublished var prefilledPlaceId: String?
    @AppPublished var showRating = false
    @AppPublished var error: String?
    @AppPublished var submitting = false
    @AppPublished var success = false

    // Photo
    @AppPublished var photoURLs: [String] = []
    @AppPublished var photoUploading = false

    // Video
    @AppPublished var uploadStep: UploadStep = .idle
    @AppPublished var thumbPreview: UIImage?
    @AppPublished var videoDuration: Double = 0
    @AppPublished var aiHashtags: [String] = []

    // URL
    @AppPublished var sourceURL: String = ""
    @AppPublished var sourceType: ExternalSource = .youtube
    @AppPublished var urlMeta: OEmbedResponse?
    @AppPublished var fetchingMeta = false

    // Music
    @AppPublished var music: MusicSelection?
    @AppPublished var musicPickerOpen = false
    @AppPublished var selectedMusicTrack: MusicTrack?

    // Music picker state
    @AppPublished var musicTracks: [MusicTrack] = []
    @AppPublished var musicCategories: [MusicCategory] = []
    @AppPublished var musicSearchQuery: String = ""
    @AppPublished var musicSearchResults: [MusicTrack] = []
    @AppPublished var musicLoading = false
    @AppPublished var musicHasMore = false
    @AppPublished var musicActiveCategoryId: String?
    @AppPublished var musicSearchLoading = false
    @AppPublished var musicPage = 0

    private let service: CreateReviewService
    private let session: SessionStore
    private let log = AppLogger.reviews
    private var uploadTask: Task<Void, Never>?
    private var searchDebounceTask: Task<Void, Never>?

    var isAuthenticated: Bool { session.state.isAuthenticated }

    init(service: CreateReviewService, session: SessionStore, prefilledPlaceId: String? = nil, prefilledPlaceName: String? = nil) {
        self.service = service
        self.session = session
        if let id = prefilledPlaceId, !id.isEmpty {
            self.prefilledPlaceId = id
        }
        if let name = prefilledPlaceName, !name.isEmpty {
            self.placeName = name
            self.showPlaceInput = true
        }
    }

    // MARK: - Computed

    var canPost: Bool {
        switch mediaMode {
        case .photo:
            return !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !photoURLs.isEmpty
        case .video:
            return uploadStep.isDone
        case .url:
            let trimmed = sourceURL.trimmingCharacters(in: .whitespacesAndNewlines)
            return !trimmed.isEmpty && ExternalSource.detect(url: trimmed) != nil
        }
    }

    var isUploading: Bool { uploadStep.isActive }

    // MARK: - Photo handling

    func handlePhotoItems(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        let remaining = UploadLimits.maxPhotosPerReview - photoURLs.count
        guard remaining > 0 else {
            error = "Tối đa \(UploadLimits.maxPhotosPerReview) ảnh"
            return
        }
        let toProcess = Array(items.prefix(remaining))
        photoUploading = true
        error = nil

        Task {
            var uploaded: [String] = []
            for item in toProcess {
                do {
                    guard let data = try await item.loadTransferable(type: Data.self) else { continue }
                    let compressed = UIImage(data: data)?.jpegData(compressionQuality: 0.85) ?? data
                    let url = try await service.uploadPhoto(data: compressed, filename: "photo_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
                    uploaded.append(url)
                } catch {
                    self.error = "Lỗi tải ảnh"
                    log.error("photo upload failed: \(error)")
                }
            }
            photoURLs.append(contentsOf: uploaded)
            photoUploading = false
        }
    }

    func removePhoto(at index: Int) {
        guard photoURLs.indices.contains(index) else { return }
        photoURLs.remove(at: index)
    }

    // MARK: - Video handling

    func handleVideoItem(_ item: PhotosPickerItem) {
        error = nil
        uploadTask?.cancel()

        uploadTask = Task {
            do {
                let videoURL = try await loadVideoURL(from: item)
                try await processVideo(url: videoURL)
            } catch is CancellationError {
                // user cancelled
            } catch {
                self.error = "Lỗi tải video"
                resetVideoState()
            }
        }
    }

    private func loadVideoURL(from item: PhotosPickerItem) async throws -> URL {
        guard let movie = try await item.loadTransferable(type: VideoTransferable.self) else {
            throw AppError.unexpected(message: "Cannot load video")
        }
        return movie.url
    }

    private func processVideo(url: URL) async throws {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        let durationSec = CMTimeGetSeconds(duration)

        guard durationSec <= Double(UploadLimits.maxVideoDurationAcceptSec) else {
            error = "Video tối đa \(UploadLimits.maxVideoDurationSec) giây"
            return
        }

        let fileSize = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int ?? 0
        guard fileSize <= UploadLimits.maxVideoSizeBytes else {
            error = "Video phải nhỏ hơn \(UploadLimits.maxVideoSizeMB)MB"
            return
        }

        resetVideoState()
        videoDuration = durationSec

        // 1. Generate thumbnail
        uploadStep = .thumbnail
        var thumbnailURL = ""
        do {
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 1280, height: 1280)
            let time = CMTime(seconds: min(0.1, durationSec / 2), preferredTimescale: 600)
            let cgImage = try await generator.image(at: time).image
            let thumbnail = UIImage(cgImage: cgImage)
            thumbPreview = thumbnail

            if let jpegData = thumbnail.jpegData(compressionQuality: 0.82) {
                thumbnailURL = try await service.uploadThumbnail(data: jpegData)
            }
        } catch {
            log.error("thumbnail generation/upload failed (continuing): \(error)")
        }

        try Task.checkCancellation()

        // 2. Upload video
        uploadStep = .uploading(progress: 0)
        let videoData = try Data(contentsOf: url)
        let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension.lowercased()
        let result = try await service.uploadVideoFile(data: videoData, ext: ext)

        try Task.checkCancellation()

        // 3. AI processing (non-blocking)
        uploadStep = .processing
        do {
            let ai = try await service.processContent(
                thumbnailUrl: thumbnailURL.isEmpty ? nil : thumbnailURL,
                caption: body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : body
            )
            if let tags = ai.hashtags, !tags.isEmpty { aiHashtags = tags }
            if body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               let caption = ai.caption, !caption.isEmpty {
                body = caption
            }
        } catch {
            log.error("AI processing failed (non-blocking): \(error)")
        }

        uploadStep = .done(mediaURL: result.mediaURL, thumbnailURL: thumbnailURL)

        try? FileManager.default.removeItem(at: url)
    }

    func cancelUpload() {
        uploadTask?.cancel()
        uploadTask = nil
        resetVideoState()
        error = "Đã hủy tải lên"
    }

    func removeVideo() {
        resetVideoState()
    }

    private func resetVideoState() {
        uploadStep = .idle
        thumbPreview = nil
        videoDuration = 0
        aiHashtags = []
    }

    // MARK: - URL source

    func handleURLChange(_ url: String) {
        sourceURL = url
        urlMeta = nil
        aiHashtags = []
        let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        guard let detected = ExternalSource.detect(url: trimmed) else { return }
        sourceType = detected

        if detected == .youtube {
            if let id = ExternalSource.extractYouTubeId(trimmed) {
                let thumb = "https://i.ytimg.com/vi/\(id)/maxresdefault.jpg"
                urlMeta = OEmbedResponse(thumbnailUrl: thumb, title: nil, authorName: nil)
                triggerURLAI(thumbnailUrl: thumb, title: nil)
            }
            return
        }

        fetchingMeta = true
        Task {
            do {
                let meta = try await service.fetchOEmbed(url: trimmed)
                urlMeta = meta
                triggerURLAI(thumbnailUrl: meta.thumbnailUrl, title: meta.title)
            } catch {
                urlMeta = OEmbedResponse(thumbnailUrl: nil, title: nil, authorName: nil)
            }
            fetchingMeta = false
        }
    }

    private func triggerURLAI(thumbnailUrl: String?, title: String?) {
        guard thumbnailUrl != nil || title != nil else { return }
        Task {
            do {
                let ai = try await service.processContent(
                    thumbnailUrl: thumbnailUrl,
                    caption: body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? title : body
                )
                if let tags = ai.hashtags, !tags.isEmpty { aiHashtags = tags }
                if body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   let caption = ai.caption, !caption.isEmpty {
                    body = caption
                }
            } catch { /* non-blocking */ }
        }
    }

    // MARK: - Tab switching

    func switchMediaMode(_ mode: MediaMode) {
        guard !isUploading else { return }
        mediaMode = mode
        error = nil
    }

    // MARK: - Rating

    func setRating(_ value: Int) {
        rating = value
        showRating = false
    }

    func clearRating() {
        rating = 0
    }

    func toggleRating() {
        if showRating { rating = 0 }
        showRating.toggle()
    }

    // MARK: - Place

    func togglePlace() {
        showPlaceInput.toggle()
        if !showPlaceInput { placeName = "" }
    }

    func clearPlace() {
        placeName = ""
        showPlaceInput = false
    }

    // MARK: - Music picker

    func openMusicPicker() {
        musicPickerOpen = true
        loadMusicCategories()
        loadMusicTracks()
    }

    func closeMusicPicker() {
        musicPickerOpen = false
        musicSearchQuery = ""
        musicSearchResults = []
    }

    func selectMusic(_ selection: MusicSelection) {
        music = selection
        musicPickerOpen = false
        Task {
            do {
                selectedMusicTrack = try await service.getTrack(id: selection.trackId)
            } catch {
                log.error("load selected track failed: \(error)")
            }
        }
    }

    func removeMusic() {
        music = nil
        selectedMusicTrack = nil
    }

    func loadMusicCategories() {
        Task {
            do {
                musicCategories = try await service.getCategories()
            } catch {
                log.error("load music categories failed: \(error)")
            }
        }
    }

    func loadMusicTracks() {
        musicLoading = true
        musicPage = 0
        Task {
            do {
                let page = try await service.browseTracks(categoryId: musicActiveCategoryId, page: 0)
                musicTracks = page.tracks
                musicHasMore = page.hasMore
                musicPage = 1
            } catch {
                log.error("load music tracks failed: \(error)")
            }
            musicLoading = false
        }
    }

    func loadMoreMusic() {
        guard !musicLoading, musicHasMore else { return }
        musicLoading = true
        Task {
            do {
                let page = try await service.browseTracks(categoryId: musicActiveCategoryId, page: musicPage)
                musicTracks.append(contentsOf: page.tracks)
                musicHasMore = page.hasMore
                musicPage += 1
            } catch {
                log.error("load more music failed: \(error)")
            }
            musicLoading = false
        }
    }

    func selectMusicCategory(_ id: String?) {
        musicActiveCategoryId = id
        loadMusicTracks()
    }

    func searchMusic(_ query: String) {
        musicSearchQuery = query
        searchDebounceTask?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            musicSearchResults = []
            musicSearchLoading = false
            return
        }
        musicSearchLoading = true
        searchDebounceTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            do {
                let page = try await service.searchTracks(query: trimmed)
                guard !Task.isCancelled else { return }
                musicSearchResults = page.tracks
            } catch {
                guard !Task.isCancelled else { return }
                log.error("music search failed: \(error)")
            }
            musicSearchLoading = false
        }
    }

    // MARK: - Submit

    func submit() {
        guard canPost, !submitting, !isUploading else { return }
        guard isAuthenticated else {
            error = "Cần đăng nhập để đăng bài"
            return
        }
        error = nil
        submitting = true

        Task {
            do {
                let trimmedPlace = placeName.trimmingCharacters(in: .whitespacesAndNewlines)
                let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)

                let placeId: String
                if let prefilled = prefilledPlaceId, !prefilled.isEmpty {
                    placeId = prefilled
                } else if mediaMode == .photo && !trimmedPlace.isEmpty {
                    placeId = "community_" + trimmedPlace.lowercased().replacingOccurrences(of: " ", with: "_")
                } else {
                    placeId = "\(mediaMode.rawValue)_\(Int(Date().timeIntervalSince1970 * 1000))"
                }

                var musicPayload: MusicPayload?
                if let m = music {
                    musicPayload = MusicPayload(trackId: m.trackId, startSec: m.startSec, volume: m.volume)
                }

                var payload = CreateReviewPayload(
                    placeId: placeId,
                    placeName: trimmedPlace.isEmpty ? "Chia sẻ" : trimmedPlace,
                    placeAddress: "",
                    rating: rating,
                    body: trimmedBody,
                    photos: nil,
                    contentType: nil,
                    mediaUrl: nil,
                    thumbnail: nil,
                    sourceType: nil,
                    sourceUrl: nil,
                    hashtags: nil,
                    music: musicPayload,
                    duration: nil
                )

                switch mediaMode {
                case .photo:
                    payload = CreateReviewPayload(
                        placeId: placeId,
                        placeName: payload.placeName,
                        placeAddress: "",
                        rating: rating,
                        body: trimmedBody,
                        photos: photoURLs.isEmpty ? nil : photoURLs,
                        contentType: "photo",
                        mediaUrl: nil,
                        thumbnail: nil,
                        sourceType: nil,
                        sourceUrl: nil,
                        hashtags: nil,
                        music: musicPayload,
                        duration: nil
                    )
                case .video:
                    if case .done(let mediaURL, let thumbnailURL) = uploadStep {
                        payload = CreateReviewPayload(
                            placeId: placeId,
                            placeName: payload.placeName,
                            placeAddress: "",
                            rating: rating,
                            body: trimmedBody,
                            photos: nil,
                            contentType: "video",
                            mediaUrl: mediaURL,
                            thumbnail: thumbnailURL,
                            sourceType: "upload",
                            sourceUrl: nil,
                            hashtags: aiHashtags.isEmpty ? nil : aiHashtags,
                            music: musicPayload,
                            duration: videoDuration
                        )
                    }
                case .url:
                    payload = CreateReviewPayload(
                        placeId: placeId,
                        placeName: payload.placeName,
                        placeAddress: "",
                        rating: rating,
                        body: trimmedBody,
                        photos: nil,
                        contentType: "video",
                        mediaUrl: sourceURL,
                        thumbnail: urlMeta?.thumbnailUrl ?? "",
                        sourceType: sourceType.rawValue,
                        sourceUrl: sourceURL,
                        hashtags: aiHashtags.isEmpty ? nil : aiHashtags,
                        music: musicPayload,
                        duration: nil
                    )
                }

                let response = try await service.createReview(payload: payload)
                if let err = response.error, !err.isEmpty {
                    self.error = err
                } else {
                    success = true
                }
            } catch let appError as AppError {
                switch appError {
                case .network(status: let s, code: _) where s == 409:
                    self.error = "Bạn đã đánh giá địa điểm này rồi"
                default:
                    self.error = "Lỗi đăng bài"
                }
                log.error("submit review failed: \(appError)")
            } catch {
                self.error = "Lỗi đăng bài"
                log.error("submit review failed: \(error)")
            }
            submitting = false
        }
    }
}

// MARK: - Video Transferable for PhotosPicker

struct VideoTransferable: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { video in
            SentTransferredFile(video.url)
        } importing: { received in
            let temp = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(UUID().uuidString).\(received.file.pathExtension)")
            try FileManager.default.copyItem(at: received.file, to: temp)
            return Self(url: temp)
        }
    }
}
