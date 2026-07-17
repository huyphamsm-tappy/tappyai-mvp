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

    func requestAudioBlobToken(pathname: String, clientPayload: String?) async throws -> String {
        let payload: [String: Any] = [
            "type": "blob.generate-client-token",
            "payload": [
                "pathname": pathname,
                "callbackUrl": "",
                "clientPayload": clientPayload as Any,
                "multipart": false
            ] as [String: Any]
        ]
        let body = try JSONSerialization.data(withJSONObject: payload)
        var endpoint = Endpoint(
            path: "/api/upload/audio",
            method: .post,
            body: body,
            requiresAuth: true
        )
        endpoint.timeout = 30

        let response = try await api.send(endpoint, as: BlobTokenResponse.self)
        guard let token = response.clientToken, !token.isEmpty else {
            throw AppError.unexpected(message: "No upload token received")
        }
        return token
    }

    func uploadToBlob(token: String, pathname: String, data: Data, contentType: String) async throws -> String {
        guard let storeId = Self.extractStoreId(from: token) else {
            throw AppError.unexpected(message: "Cannot parse blob store from token")
        }
        let urlString = "https://\(storeId).public.blob.vercel-storage.com/\(pathname)"
        guard let url = URL(string: urlString) else {
            throw AppError.unexpected(message: "Invalid blob URL")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.httpBody = data
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        request.setValue("7", forHTTPHeaderField: "x-api-version")
        request.setValue(contentType, forHTTPHeaderField: "x-content-type")
        request.setValue("public, max-age=31536000", forHTTPHeaderField: "x-cache-control-max-age")
        request.setValue(contentType, forHTTPHeaderField: "content-type")
        request.timeoutInterval = 120

        let (responseData, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw AppError.network(status: status, code: nil)
        }

        let result = try JSONDecoder().decode(BlobUploadResult.self, from: responseData)
        return result.url
    }

    func uploadAudioFile(data: Data, ext: String) async throws -> String {
        let pathname = "music/\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
        let token = try await requestAudioBlobToken(pathname: pathname, clientPayload: nil)
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
        return try await uploadToBlob(token: token, pathname: pathname, data: data, contentType: contentType)
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

    // MARK: - Blob token parsing (reused from CreateReviewService)

    private static func extractStoreId(from token: String) -> String? {
        let prefix = "vercel_blob_client_"
        guard token.hasPrefix(prefix) else { return nil }
        let rest = String(token.dropFirst(prefix.count))
        guard let decoded = base64URLDecode(rest) else { return nil }
        let parts = decoded.split(separator: ":", maxSplits: 1)
        guard let storeId = parts.first, !storeId.isEmpty else { return nil }
        return String(storeId)
    }

    private static func base64URLDecode(_ string: String) -> String? {
        var base64 = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64 += "=" }
        guard let data = Data(base64Encoded: base64) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

private struct GenericOKResponse: Decodable, Sendable {
    let ok: Bool?
    let error: String?
}
