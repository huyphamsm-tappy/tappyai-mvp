import Foundation

struct MusicService: Sendable {
    private let api: APIClient
    private let log = AppLogger.music

    init(api: APIClient) {
        self.api = api
    }

    // MARK: - Browse tracks (GET /api/music/tracks?categoryId=&page=)

    func browseTracks(categoryId: String?, page: Int) async throws -> MusicTracksPage {
        var query = [URLQueryItem(name: "page", value: String(page))]
        if let cat = categoryId { query.append(URLQueryItem(name: "categoryId", value: cat)) }
        let endpoint = Endpoint(path: "/api/music/tracks", method: .get, query: query)
        return try await api.send(endpoint, as: MusicTracksPage.self)
    }

    // MARK: - Search tracks (GET /api/music/tracks/search?q=)

    func searchTracks(query: String) async throws -> MusicTracksPage {
        let endpoint = Endpoint(
            path: "/api/music/tracks/search",
            method: .get,
            query: [URLQueryItem(name: "q", value: query)]
        )
        return try await api.send(endpoint, as: MusicTracksPage.self)
    }

    // MARK: - Get single track (GET /api/music/tracks/[id])

    func getTrack(id: String) async throws -> MusicTrack {
        let endpoint = Endpoint(
            path: "/api/music/tracks/\(id)",
            method: .get
        )
        return try await api.send(endpoint, as: MusicTrack.self)
    }

    // MARK: - Categories (GET /api/music/categories)

    func getCategories() async throws -> [MusicCategory] {
        let endpoint = Endpoint(path: "/api/music/categories", method: .get)
        let response = try await api.send(endpoint, as: MusicCategoriesResponse.self)
        return response.categories
    }

    // MARK: - Sound page (GET /api/sound/[trackId])

    func getSoundData(trackId: String) async throws -> SoundData {
        let endpoint = Endpoint(path: "/api/sound/\(trackId)", method: .get, requiresAuth: false)
        return try await api.send(endpoint, as: SoundData.self)
    }

    // MARK: - Play count (POST /api/sound/[trackId]/play)

    func recordPlay(trackId: String) async {
        let endpoint = Endpoint(path: "/api/sound/\(trackId)/play", method: .post)
        do {
            _ = try await api.send(endpoint, as: GenericOKResponse.self)
        } catch {
            log.error("play count failed (non-fatal): \(error)")
        }
    }

    // MARK: - Save toggle (POST/DELETE /api/sound/[trackId]/save)

    func saveTrack(trackId: String) async throws -> SaveToggleResponse {
        let endpoint = Endpoint(path: "/api/sound/\(trackId)/save", method: .post, requiresAuth: true)
        return try await api.send(endpoint, as: SaveToggleResponse.self)
    }

    func unsaveTrack(trackId: String) async throws -> SaveToggleResponse {
        let endpoint = Endpoint(path: "/api/sound/\(trackId)/save", method: .delete, requiresAuth: true)
        return try await api.send(endpoint, as: SaveToggleResponse.self)
    }

    // MARK: - Follow toggle (POST/DELETE /api/sound/[trackId]/follow)

    func followTrack(trackId: String) async throws -> FollowToggleResponse {
        let endpoint = Endpoint(path: "/api/sound/\(trackId)/follow", method: .post, requiresAuth: true)
        return try await api.send(endpoint, as: FollowToggleResponse.self)
    }

    func unfollowTrack(trackId: String) async throws -> FollowToggleResponse {
        let endpoint = Endpoint(path: "/api/sound/\(trackId)/follow", method: .delete, requiresAuth: true)
        return try await api.send(endpoint, as: FollowToggleResponse.self)
    }

    // MARK: - Report (POST /api/music/tracks/[id]/report)

    func reportTrack(trackId: String, reason: String, details: String?) async throws {
        let payload = ReportPayload(reason: reason, details: details)
        let body = try JSONEncoder().encode(payload)
        let endpoint = Endpoint(
            path: "/api/music/tracks/\(trackId)/report",
            method: .post,
            body: body,
            requiresAuth: true
        )
        _ = try await api.send(endpoint, as: GenericOKResponse.self)
    }

    // MARK: - Upload Original Sound

    // Server-owned upload session — the same protocol the web client uses. The
    // client never names the object and never handles a storage credential.

    func openUploadSession(kind: String, contentType: String, size: Int) async throws -> MediaUploadSessionResponse {
        let payload: [String: Any] = [
            "type": "media.create-upload-session",
            "kind": kind,
            "contentType": contentType,
            "size": size
        ]
        let body = try JSONSerialization.data(withJSONObject: payload)
        var endpoint = Endpoint(
            path: "/api/upload/audio",
            method: .post,
            body: body,
            requiresAuth: true
        )
        endpoint.timeout = 30
        return try await api.send(endpoint, as: MediaUploadSessionResponse.self)
    }

    /// Asks the server to verify the object exists before any URL is used.
    func completeUpload(kind: String, key: String) async throws -> String {
        let payload: [String: Any] = [
            "type": "media.complete-upload",
            "kind": kind,
            "key": key
        ]
        let body = try JSONSerialization.data(withJSONObject: payload)
        var endpoint = Endpoint(
            path: "/api/upload/audio",
            method: .post,
            body: body,
            requiresAuth: true
        )
        endpoint.timeout = 30

        let result = try await api.send(endpoint, as: MediaUploadCompleteResponse.self)
        guard result.ok == true, let url = result.url, !url.isEmpty else {
            throw AppError.unexpected(message: "Tải lên chưa hoàn tất. Vui lòng thử lại.")
        }
        return url
    }

    func uploadAudioFile(data: Data, ext: String) async throws -> String {
        let contentType: String
        switch ext {
        case "mp3": contentType = "audio/mpeg"
        case "m4a": contentType = "audio/mp4"
        case "wav": contentType = "audio/wav"
        case "aac": contentType = "audio/aac"
        case "ogg": contentType = "audio/ogg"
        case "webm": contentType = "audio/webm"
        default: contentType = "audio/mpeg"
        }

        let session = try await openUploadSession(kind: "audio", contentType: contentType, size: data.count)

        // Rollback safety: on the legacy provider there is no session protocol,
        // so fail loudly rather than invent an upload path.
        guard session.provider == "gcs",
              let uploadURLString = session.uploadUrl,
              let uploadURL = URL(string: uploadURLString),
              let key = session.key else {
            throw AppError.unexpected(message: "Tải lên chưa khả dụng. Vui lòng thử lại sau.")
        }

        var request = URLRequest(url: uploadURL)
        request.httpMethod = "PUT"
        request.httpBody = data
        request.setValue(session.contentType ?? contentType, forHTTPHeaderField: "content-type")
        request.timeoutInterval = 120

        // Not trusted as proof of success — the server's own lookup decides.
        _ = try? await URLSession.shared.data(for: request)

        return try await completeUpload(kind: "audio", key: key)
    }

    func publishOriginalSound(title: String, artist: String?, audioUrl: String, durationSec: Int) async throws -> UploadSoundResponse {
        let payload = UploadSoundPayload(
            title: title,
            artist: artist,
            audioUrl: audioUrl,
            durationSec: durationSec,
            rightsConfirmed: true
        )
        let body = try JSONEncoder().encode(payload)
        let endpoint = Endpoint(
            path: "/api/music/tracks",
            method: .post,
            body: body,
            requiresAuth: true
        )
        return try await api.send(endpoint, as: UploadSoundResponse.self)
    }

    // The storage-token parsing that used to live here is gone: the client no
    // longer receives, decodes or reasons about a storage credential at all.
}

private struct GenericOKResponse: Decodable, Sendable {
    let ok: Bool?
    let error: String?
}
