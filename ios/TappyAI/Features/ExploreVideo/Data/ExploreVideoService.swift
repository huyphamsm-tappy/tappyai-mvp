import Foundation

/// The server calls of the Explore video pipeline, as a protocol so the upload flow can be driven by a fake in tests.
protocol ExploreVideoAPI: Sendable {
    func openUpload(idempotencyKey: String, contentType: String, size: Int) async throws -> VideoUploadSession
    func completeUpload(assetId: String) async throws -> VideoStatusResponse
    func uploadStatus(assetId: String) async throws -> VideoStatusResponse
    func playback(assetId: String) async throws -> VideoPlaybackGrant
    func startDownload(assetId: String) async throws -> VideoDownloadStatusResponse
    func downloadStatus(assetId: String) async throws -> VideoDownloadStatusResponse
    /// The finished MP4, written to a temporary file (the caller removes it).
    func downloadFile(assetId: String) async throws -> URL
    func overlay(assetId: String) async throws -> OverlayEnvelope
    func saveOverlay(assetId: String, version: Int, doc: OverlayDocument) async throws -> OverlaySaveResult
    /// POST /api/video/consent {accepted:true, version} - the clip conditions (NOT the AI consent route).
    func recordVideoConsent(version: Int) async throws
}

enum ExploreVideoConsent {
    /// The version of the clip conditions this build shows (contract §6).
    static let version = 1
}

struct ExploreVideoService: ExploreVideoAPI {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    private func encode(_ object: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: object)
    }

    // MARK: Clip conditions (contract §6)

    func recordVideoConsent(version: Int) async throws {
        let body = try encode(["accepted": true, "version": version])
        var endpoint = Endpoint(path: "/api/video/consent", method: .post, body: body, requiresAuth: true)
        endpoint.timeout = 20
        _ = try await api.send(endpoint)
    }

    // MARK: Upload (contract §2)

    func openUpload(idempotencyKey: String, contentType: String, size: Int) async throws -> VideoUploadSession {
        let body = try encode(["idempotencyKey": idempotencyKey, "contentType": contentType, "size": size])
        var endpoint = Endpoint(path: "/api/video/uploads", method: .post, body: body, requiresAuth: true)
        endpoint.timeout = 30
        return try await api.send(endpoint, as: VideoUploadSession.self)
    }

    func completeUpload(assetId: String) async throws -> VideoStatusResponse {
        var endpoint = Endpoint(path: "/api/video/uploads/\(assetId)/complete", method: .post, requiresAuth: true)
        endpoint.timeout = 60
        return try await api.send(endpoint, as: VideoStatusResponse.self)
    }

    func uploadStatus(assetId: String) async throws -> VideoStatusResponse {
        var endpoint = Endpoint(path: "/api/video/uploads/\(assetId)", method: .get, requiresAuth: true)
        endpoint.timeout = 30
        return try await api.send(endpoint, as: VideoStatusResponse.self)
    }

    // MARK: Playback (contract §5)

    func playback(assetId: String) async throws -> VideoPlaybackGrant {
        let body = try encode(["client": "native"])
        var endpoint = Endpoint(path: "/api/video/playback/\(assetId)", method: .post, body: body, requiresAuth: true)
        endpoint.timeout = 20
        return try await api.send(endpoint, as: VideoPlaybackGrant.self)
    }

    // MARK: Download (contract §4)

    func startDownload(assetId: String) async throws -> VideoDownloadStatusResponse {
        var endpoint = Endpoint(path: "/api/video/uploads/\(assetId)/download", method: .post, requiresAuth: true)
        endpoint.timeout = 30
        return try await api.send(endpoint, as: VideoDownloadStatusResponse.self)
    }

    func downloadStatus(assetId: String) async throws -> VideoDownloadStatusResponse {
        var endpoint = Endpoint(path: "/api/video/uploads/\(assetId)/download", method: .get, requiresAuth: true)
        endpoint.timeout = 30
        return try await api.send(endpoint, as: VideoDownloadStatusResponse.self)
    }

    /// The watermarked MP4 is at most the upload ceiling (150 MB). It goes through the shared API client so the sign-in
    /// and its renewal are handled in one place; the bytes are written to a temporary file straight away.
    func downloadFile(assetId: String) async throws -> URL {
        var endpoint = Endpoint(path: "/api/video/uploads/\(assetId)/download",
                                method: .get,
                                query: [URLQueryItem(name: "file", value: "1")],
                                requiresAuth: true)
        endpoint.timeout = 300
        let data = try await api.send(endpoint)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("tappyai-explore-\(UUID().uuidString).mp4")
        try data.write(to: url, options: .atomic)
        return url
    }

    // MARK: Overlay (contract §3)

    func overlay(assetId: String) async throws -> OverlayEnvelope {
        var endpoint = Endpoint(path: "/api/video/uploads/\(assetId)/overlay", method: .get, requiresAuth: true)
        endpoint.timeout = 20
        return try await api.send(endpoint, as: OverlayEnvelope.self)
    }

    func saveOverlay(assetId: String, version: Int, doc: OverlayDocument) async throws -> OverlaySaveResult {
        let body = try ExploreVideoRequests.overlayBody(version: version, doc: doc)
        var endpoint = Endpoint(path: "/api/video/uploads/\(assetId)/overlay", method: .put, body: body, requiresAuth: true)
        endpoint.timeout = 30
        return try await api.send(endpoint, as: OverlaySaveResult.self)
    }
}

/// Request bodies built as pure functions (tested without a network).
enum ExploreVideoRequests {
    static func overlayBody(version: Int, doc: OverlayDocument) throws -> Data {
        let docData = try JSONEncoder().encode(doc)
        var body = Data("{\"version\":\(version),\"doc\":".utf8)
        body.append(docData)
        body.append(Data("}".utf8))
        return body
    }
}

/// App-wide handle for the code that has no dependency container (the feed player, the post menu). Set once at launch.
enum ExploreVideoRuntime {
    static var service: ExploreVideoService?
}
