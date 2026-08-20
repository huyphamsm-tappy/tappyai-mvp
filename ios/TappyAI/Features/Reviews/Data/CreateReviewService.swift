import Foundation

struct CreateReviewService: Sendable {
    private let api: APIClient
    private let log = AppLogger.reviews

    init(api: APIClient) {
        self.api = api
    }

    // MARK: - Photo upload (multipart POST /api/reviews/upload)

    func uploadPhoto(data: Data, filename: String) async throws -> String {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        body.append("Content-Type: image/jpeg\r\n\r\n")
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n")

        var endpoint = Endpoint(
            path: "/api/reviews/upload",
            method: .post,
            body: body,
            requiresAuth: true,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
        endpoint.timeout = 60

        let response = try await api.send(endpoint, as: PhotoUploadResponse.self)
        return response.url
    }

    // MARK: - Video upload (server-owned upload session)
    //
    // The client no longer names the object or talks a storage vendor's
    // protocol. It asks the server to open a session, PUTs the bytes to the URI
    // it is given, then asks the server to confirm the object actually landed.
    // The server owns the key and is the only thing that decides success, so a
    // provider change is invisible here.

    func uploadViaSession(
        endpointPath: String,
        kind: String,
        data: Data,
        contentType: String
    ) async throws -> String {
        let session = try await openUploadSession(
            endpointPath: endpointPath,
            kind: kind,
            contentType: contentType,
            size: data.count
        )

        // Rollback safety: unsetting MEDIA_PROVIDER puts the server back on the
        // legacy provider, which has no session protocol. Fail loudly rather
        // than invent an upload path the server did not offer.
        guard session.provider == "gcs",
              let uploadURLString = session.uploadUrl,
              let uploadURL = URL(string: uploadURLString),
              let key = session.key else {
            throw AppError.unexpected(message: NSLocalizedString("upload.error.unavailable", comment: ""))
        }

        var request = URLRequest(url: uploadURL)
        request.httpMethod = "PUT"
        request.httpBody = data
        request.setValue(session.contentType ?? contentType, forHTTPHeaderField: "content-type")
        request.timeoutInterval = 120

        // The response is deliberately NOT trusted as proof of success — only
        // an outright transport failure is fatal here. The server's own lookup
        // below is what decides, exactly as on web.
        _ = try? await URLSession.shared.data(for: request)

        return try await completeUpload(endpointPath: endpointPath, kind: kind, key: key)
    }

    func openUploadSession(
        endpointPath: String,
        kind: String,
        contentType: String,
        size: Int
    ) async throws -> MediaUploadSessionResponse {
        let payload: [String: Any] = [
            "type": "media.create-upload-session",
            "kind": kind,
            "contentType": contentType,
            "size": size
        ]
        let body = try JSONSerialization.data(withJSONObject: payload)
        var endpoint = Endpoint(path: endpointPath, method: .post, body: body, requiresAuth: true)
        endpoint.timeout = 30
        return try await api.send(endpoint, as: MediaUploadSessionResponse.self)
    }

    /// Asks the server to verify the object exists before any URL is used.
    func completeUpload(endpointPath: String, kind: String, key: String) async throws -> String {
        let payload: [String: Any] = [
            "type": "media.complete-upload",
            "kind": kind,
            "key": key
        ]
        let body = try JSONSerialization.data(withJSONObject: payload)
        var endpoint = Endpoint(path: endpointPath, method: .post, body: body, requiresAuth: true)
        endpoint.timeout = 30

        let result = try await api.send(endpoint, as: MediaUploadCompleteResponse.self)
        guard result.ok == true, let url = result.url, !url.isEmpty else {
            throw AppError.unexpected(message: NSLocalizedString("upload.error.incomplete", comment: ""))
        }
        return url
    }

    func uploadVideoFile(data: Data, ext: String) async throws -> (mediaURL: String, thumbnailURL: String?) {
        let contentType = ext == "mov" ? "video/quicktime" : ext == "webm" ? "video/webm" : "video/mp4"
        let mediaURL = try await uploadViaSession(
            endpointPath: "/api/upload/video",
            kind: "video",
            data: data,
            contentType: contentType
        )
        return (mediaURL, nil)
    }

    func uploadThumbnail(data: Data) async throws -> String {
        try await uploadViaSession(
            endpointPath: "/api/upload/video",
            kind: "videoThumbnail",
            data: data,
            contentType: "image/jpeg"
        )
    }

    // MARK: - AI content analysis (POST /api/explore/process — non-blocking)

    func processContent(thumbnailUrl: String?, caption: String?) async throws -> AIProcessResponse {
        var payload: [String: String] = [:]
        if let t = thumbnailUrl, !t.isEmpty { payload["thumbnail_url"] = t }
        if let c = caption, !c.isEmpty { payload["caption"] = c }

        let body = try JSONEncoder().encode(payload)
        var endpoint = Endpoint(
            path: "/api/explore/process",
            method: .post,
            body: body,
            requiresAuth: true
        )
        endpoint.timeout = 30
        return try await api.send(endpoint, as: AIProcessResponse.self)
    }

    // MARK: - oEmbed fetch (GET /api/explore/oembed)

    func fetchOEmbed(url: String) async throws -> OEmbedResponse {
        let endpoint = Endpoint(
            path: "/api/explore/oembed",
            method: .get,
            query: [URLQueryItem(name: "url", value: url)],
            requiresAuth: false
        )
        return try await api.send(endpoint, as: OEmbedResponse.self)
    }

    // MARK: - Create review (POST /api/reviews)

    func createReview(payload: CreateReviewPayload) async throws -> CreateReviewResponse {
        let body = try JSONEncoder().encode(payload)
        var endpoint = Endpoint(
            path: "/api/reviews",
            method: .post,
            body: body,
            requiresAuth: true
        )
        endpoint.timeout = 30
        return try await api.send(endpoint, as: CreateReviewResponse.self)
    }

    // MARK: - Music

    func browseTracks(categoryId: String?, page: Int) async throws -> MusicTracksPage {
        var query = [URLQueryItem(name: "page", value: String(page))]
        if let cat = categoryId { query.append(URLQueryItem(name: "categoryId", value: cat)) }
        let endpoint = Endpoint(path: "/api/music/tracks", method: .get, query: query)
        return try await api.send(endpoint, as: MusicTracksPage.self)
    }

    func searchTracks(query: String) async throws -> MusicTracksPage {
        let endpoint = Endpoint(
            path: "/api/music/tracks/search",
            method: .get,
            query: [URLQueryItem(name: "q", value: query)]
        )
        return try await api.send(endpoint, as: MusicTracksPage.self)
    }

    func getTrack(id: String) async throws -> MusicTrack? {
        let endpoint = Endpoint(
            path: "/api/music/tracks/\(id)",
            method: .get
        )
        return try? await api.send(endpoint, as: MusicTrack.self)
    }

    func getCategories() async throws -> [MusicCategory] {
        let endpoint = Endpoint(path: "/api/music/categories", method: .get)
        let response = try await api.send(endpoint, as: MusicCategoriesResponse.self)
        return response.categories
    }

    // The storage-token parsing that used to live here is gone: the client no
    // longer receives, decodes or reasons about a storage credential at all.
}

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) { append(data) }
    }
}
