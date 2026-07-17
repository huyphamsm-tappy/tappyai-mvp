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

    // MARK: - Video upload (Vercel Blob client protocol)

    func requestBlobToken(pathname: String, clientPayload: String?) async throws -> String {
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
            path: "/api/upload/video",
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

    func uploadVideoFile(data: Data, ext: String) async throws -> (mediaURL: String, thumbnailURL: String?) {
        let pathname = "videos/\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
        let token = try await requestBlobToken(pathname: pathname, clientPayload: nil)
        let contentType = ext == "mov" ? "video/quicktime" : ext == "webm" ? "video/webm" : "video/mp4"
        let mediaURL = try await uploadToBlob(token: token, pathname: pathname, data: data, contentType: contentType)
        return (mediaURL, nil)
    }

    func uploadThumbnail(data: Data) async throws -> String {
        let pathname = "thumbnails/\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
        let token = try await requestBlobToken(pathname: pathname, clientPayload: "thumbnail")
        return try await uploadToBlob(token: token, pathname: pathname, data: data, contentType: "image/jpeg")
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

    // MARK: - Blob token parsing

    private static func extractStoreId(from token: String) -> String? {
        let prefix = "vercel_blob_client_"
        guard token.hasPrefix(prefix) else { return nil }
        let rest = String(token.dropFirst(prefix.count))
        guard let decoded = Self.base64URLDecode(rest) else { return nil }
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

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) { append(data) }
    }
}
