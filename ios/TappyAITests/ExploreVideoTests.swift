import XCTest
import CoreGraphics
@testable import TappyAI

/// Explore video (iOS side of docs/handoff/EXPLORE-VIDEO-API-CONTRACT-20261105.md): the pure rules, driven for real.
/// The wire fixtures are the contract's own shapes.
@MainActor
final class ExploreVideoTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try ResponseDecoder.json.decode(T.self, from: Data(json.utf8))
    }

    // MARK: State and phase

    func testEveryServerStateFoldsIntoOnePhase() {
        for s in ["draft", "uploading", "uploaded", "processing", "moderating"] {
            XCTAssertEqual(ExploreVideoPhase.phase(for: ExploreVideoState(raw: s)), .processing, s)
        }
        XCTAssertEqual(ExploreVideoPhase.phase(for: ExploreVideoState(raw: "review_required")), .awaitingReview)
        XCTAssertEqual(ExploreVideoPhase.phase(for: ExploreVideoState(raw: "ready")), .ready)
        XCTAssertEqual(ExploreVideoPhase.phase(for: ExploreVideoState(raw: "published")), .published)
        XCTAssertEqual(ExploreVideoPhase.phase(for: ExploreVideoState(raw: "rejected")), .rejected)
        XCTAssertEqual(ExploreVideoPhase.phase(for: ExploreVideoState(raw: "failed")), .failed)
        XCTAssertEqual(ExploreVideoPhase.phase(for: ExploreVideoState(raw: "deleted")), .failed)
    }

    func testAnUnknownOrMissingStateIsNeverReady() {
        XCTAssertEqual(ExploreVideoPhase.phase(for: ExploreVideoState(raw: "something_new")), .processing)
        XCTAssertEqual(ExploreVideoPhase.phase(for: ExploreVideoState(raw: nil)), .processing)
        XCTAssertFalse(ExploreVideoPhase.processing.canPublish)
        XCTAssertFalse(ExploreVideoPhase.awaitingReview.canPublish)
        XCTAssertTrue(ExploreVideoPhase.ready.canPublish)
    }

    func testPollingStopsOnlyOnATerminalPhase() {
        XCTAssertFalse(ExploreVideoPhase.processing.isTerminal)
        XCTAssertFalse(ExploreVideoPhase.awaitingReview.isTerminal)
        for p in [ExploreVideoPhase.ready, .published, .rejected, .failed] { XCTAssertTrue(p.isTerminal) }
    }

    // MARK: Upload rules

    func testIdempotencyKeysAreValidAndNewEveryTime() {
        let a = ExploreVideoUploadRules.makeIdempotencyKey()
        let b = ExploreVideoUploadRules.makeIdempotencyKey()
        XCTAssertNotEqual(a, b)
        XCTAssertTrue(ExploreVideoUploadRules.isValidIdempotencyKey(a))
        XCTAssertFalse(ExploreVideoUploadRules.isValidIdempotencyKey("short"))
        XCTAssertFalse(ExploreVideoUploadRules.isValidIdempotencyKey("has space in it"))
        XCTAssertFalse(ExploreVideoUploadRules.isValidIdempotencyKey(String(repeating: "a", count: 129)))
    }

    func testContentTypeByExtension() {
        XCTAssertEqual(ExploreVideoUploadRules.contentType(forExtension: "MP4"), "video/mp4")
        XCTAssertEqual(ExploreVideoUploadRules.contentType(forExtension: "mov"), "video/quicktime")
        XCTAssertNil(ExploreVideoUploadRules.contentType(forExtension: "webm"), "webm keeps the legacy path")
    }

    func testPollDelayGrowsFromTwoToFiveSeconds() {
        XCTAssertEqual(ExploreVideoUploadRules.pollDelay(attempt: 0), 2.0)
        XCTAssertEqual(ExploreVideoUploadRules.pollDelay(attempt: 2), 3.0)
        XCTAssertEqual(ExploreVideoUploadRules.pollDelay(attempt: 100), 5.0)
    }

    func testThePutRequestCarriesNoAuthorizationAndTheStatusIsChecked() {
        let r = VideoFileUploader.makeRequest(to: URL(string: "https://storage.example/upload?id=1")!, contentType: "video/mp4")
        XCTAssertEqual(r.httpMethod, "PUT")
        XCTAssertEqual(r.value(forHTTPHeaderField: "Content-Type"), "video/mp4")
        XCTAssertNil(r.value(forHTTPHeaderField: "Authorization"))
        XCTAssertTrue(VideoFileUploader.isSuccess(status: 200))
        XCTAssertTrue(VideoFileUploader.isSuccess(status: 201))
        XCTAssertFalse(VideoFileUploader.isSuccess(status: 308))
        XCTAssertFalse(VideoFileUploader.isSuccess(status: 403))
    }

    // MARK: Wire shapes

    func testTheUploadSessionAndStatusDecode() throws {
        let s = try decode(VideoUploadSession.self, #"{"assetId":"a1b2c3d4-0000-4000-8000-000000000001","state":"uploading","uploadUrl":"https://u.example/x","contentType":"video/mp4"}"#)
        XCTAssertEqual(s.uploadUrl, "https://u.example/x")
        let reused = try decode(VideoUploadSession.self, #"{"assetId":"a1b2c3d4-0000-4000-8000-000000000001","state":"processing","reused":true}"#)
        XCTAssertNil(reused.uploadUrl)
        XCTAssertEqual(reused.reused, true)
        let st = try decode(VideoStatusResponse.self, #"{"assetId":"x","state":"review_required"}"#)
        XCTAssertEqual(st.parsedState, .reviewRequired)
    }

    func testTheDownloadStatusDecodesAndUnknownIsNone() throws {
        XCTAssertEqual(try decode(VideoDownloadStatusResponse.self, #"{"status":"rendering"}"#).parsed, .rendering)
        XCTAssertEqual(try decode(VideoDownloadStatusResponse.self, #"{"status":"ready"}"#).parsed, .ready)
        XCTAssertEqual(try decode(VideoDownloadStatusResponse.self, #"{"status":"zzz"}"#).parsed, .none)
        XCTAssertEqual(ExploreDownloadDecision.decide(.rendering), .wait)
        XCTAssertEqual(ExploreDownloadDecision.decide(.none), .wait)
        XCTAssertEqual(ExploreDownloadDecision.decide(.ready), .fetch)
        XCTAssertEqual(ExploreDownloadDecision.decide(.failed), .fail)
    }

    // MARK: Error mapping

    func testEveryDocumentedErrorCodeMapsToAnIssue() {
        let cases: [(Int, String?, ExploreVideoIssue)] = [
            (403, "video_consent_required", .videoConsentRequired),
            (404, "not_found", .notFound),
            (413, nil, .tooLarge), (415, nil, .unsupportedFormat), (429, nil, .rateLimited),
            (503, "video_unavailable", .serviceUnavailable), (503, "video_promoting", .promoting),
            (502, "storage_unavailable", .storageUnavailable),
            (409, "asset_failed", .assetFailed), (409, "asset_deleted", .assetFailed),
            (409, "video_not_ready", .notReady), (409, "not_ready", .notReady), (409, "video_in_use", .inUse),
            (409, "version_conflict", .versionConflict),
            (422, "upload_incomplete", .incomplete), (422, "unreadable_video", .unreadable), (422, "video_too_long", .tooLong),
            (422, "identifying_metadata", .identifyingMetadata), (422, "unsupported_format", .unsupportedFormat),
            (422, "overlay_invalid", .overlayInvalid), (422, "unsupported_glyph", .unsupportedGlyph),
        ]
        for (status, code, expected) in cases {
            XCTAssertEqual(ExploreVideoIssue.from(AppError.network(status: status, code: code)), expected, "\(status) \(code ?? "-")")
        }
    }

    func testAnAIConsentRefusalIsReportedAndIsNotTheClipConditionsGate() {
        let ai = ExploreVideoIssue.from(AppError.authentication(reason: .aiConsentRequired(message: nil)))
        XCTAssertEqual(ai, .aiGate)
        XCTAssertNotEqual(ai, .videoConsentRequired)
    }

    func testOtherErrorKindsMap() {
        XCTAssertEqual(ExploreVideoIssue.from(AppError.offline), .offline)
        XCTAssertEqual(ExploreVideoIssue.from(CancellationError()), .cancelled)
        XCTAssertEqual(ExploreVideoIssue.from(AppError.authentication(reason: .ageGate(code: "age_ineligible", message: nil))), .ageRequired)
        XCTAssertEqual(ExploreVideoIssue.from(AppError.validation(message: "invalid_overlay")), .overlayInvalid)
        XCTAssertEqual(ExploreVideoIssue.from(ExploreVideoUploader.declinedError), .videoConsentDeclined)
        XCTAssertEqual(ExploreVideoIssue.from(AppError.unexpected(message: "x")), .unknown)
    }

    func testEveryIssueHasALocalizedMessageKey() {
        for issue in [ExploreVideoIssue.featureOff, .notFound, .consentDeclined, .videoConsentRequired, .videoConsentDeclined, .aiGate, .ageRequired,
                      .tooLarge, .unsupportedFormat, .rateLimited, .serviceUnavailable, .storageUnavailable, .promoting, .incomplete,
                      .unreadable, .tooLong, .identifyingMetadata, .assetFailed, .notReady, .inUse, .overlayInvalid, .unsupportedGlyph,
                      .versionConflict, .offline, .cancelled, .unknown] {
            XCTAssertTrue(issue.messageKey.hasPrefix("video.error."), "\(issue)")
        }
    }

    func testPublishErrorsOfTheReviewCall() {
        XCTAssertEqual(ExploreVideoIssue.publishMessageKey(for: .network(status: 404, code: "video_not_found")), "video.error.notFound")
        XCTAssertEqual(ExploreVideoIssue.publishMessageKey(for: .network(status: 409, code: "video_not_ready")), "video.error.notReady")
        XCTAssertEqual(ExploreVideoIssue.publishMessageKey(for: .network(status: 409, code: "video_in_use")), "video.error.inUse")
        XCTAssertEqual(ExploreVideoIssue.publishMessageKey(for: .network(status: 503, code: "video_promoting")), "video.error.promoting")
        XCTAssertEqual(ExploreVideoIssue.publishMessageKey(for: .network(status: 503, code: "video_unavailable")), "video.error.unavailable")
        XCTAssertNil(ExploreVideoIssue.publishMessageKey(for: .network(status: 409, code: nil)), "a plain 409 keeps «already reviewed»")
        XCTAssertNil(ExploreVideoIssue.publishMessageKey(for: .offline))
    }

    func testTheClipConditionsGateKeepsItsCodeThroughTheAPIClient() {
        let body = Data(#"{"error":"video_consent_required"}"#.utf8)
        XCTAssertEqual(URLSessionAPIClient.mapHTTP(status: 403, data: body), .network(status: 403, code: "video_consent_required"))
        let ai = Data(#"{"error":"ai_consent_required"}"#.utf8)
        if case .authentication(.aiConsentRequired) = URLSessionAPIClient.mapHTTP(status: 403, data: ai) {} else { XCTFail("the AI gate is unchanged") }
    }

    func testThePostPayloadCarriesTheAssetIdOnlyWhenSet() throws {
        func json(_ p: CreateReviewPayload) throws -> [String: Any] {
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(p)) as? [String: Any] ?? [:]
        }
        let base = CreateReviewPayload(placeId: "p", placeName: "n", placeAddress: "", rating: 0, body: "b", photos: nil, contentType: "video",
                                       mediaUrl: nil, thumbnail: nil, sourceType: "upload", sourceUrl: nil, hashtags: nil, music: nil, duration: 3)
        XCTAssertNil(try json(base)["videoAssetId"])
        var withAsset = base
        withAsset.videoAssetId = "a1b2c3d4-0000-4000-8000-000000000001"
        XCTAssertEqual(try json(withAsset)["videoAssetId"] as? String, "a1b2c3d4-0000-4000-8000-000000000001")
    }

    // MARK: Uploader flow

    private final class Box: @unchecked Sendable { var puts = 0; var consentCalls = 0; var asked = 0 }

    private final class FakeAPI: ExploreVideoAPI, @unchecked Sendable {
        var open: [Result<VideoUploadSession, Error>] = []
        var complete: [Result<VideoStatusResponse, Error>] = []
        var status: [Result<VideoStatusResponse, Error>] = []
        var keys: [String] = []
        var consentVersions: [Int] = []
        var completeCalls = 0

        func openUpload(idempotencyKey: String, contentType: String, size: Int) async throws -> VideoUploadSession {
            keys.append(idempotencyKey)
            return try open.removeFirst().get()
        }
        func completeUpload(assetId: String) async throws -> VideoStatusResponse {
            completeCalls += 1
            return try complete.removeFirst().get()
        }
        func uploadStatus(assetId: String) async throws -> VideoStatusResponse { try status.removeFirst().get() }
        func recordVideoConsent(version: Int) async throws { consentVersions.append(version) }
        func playback(assetId: String) async throws -> VideoPlaybackGrant { throw AppError.unexpected(message: "unused") }
        func startDownload(assetId: String) async throws -> VideoDownloadStatusResponse { throw AppError.unexpected(message: "unused") }
        func downloadStatus(assetId: String) async throws -> VideoDownloadStatusResponse { throw AppError.unexpected(message: "unused") }
        func downloadFile(assetId: String) async throws -> URL { throw AppError.unexpected(message: "unused") }
        func overlay(assetId: String) async throws -> OverlayEnvelope { throw AppError.unexpected(message: "unused") }
        func saveOverlay(assetId: String, version: Int, doc: OverlayDocument) async throws -> OverlaySaveResult { throw AppError.unexpected(message: "unused") }
    }

    private let assetId = "a1b2c3d4-0000-4000-8000-000000000001"

    private func session(upload: Bool = true, reused: Bool = false, state: String = "uploading") -> VideoUploadSession {
        VideoUploadSession(assetId: assetId, state: state, uploadUrl: upload ? "https://storage.example/u" : nil, contentType: "video/mp4", reused: reused ? true : nil)
    }

    private func uploader(_ api: FakeAPI, _ box: Box) -> ExploreVideoUploader {
        ExploreVideoUploader(api: api, putFile: { _, _, _, progress in box.puts += 1; progress(1) }, sleep: { _ in })
    }

    private let file = URL(fileURLWithPath: "/tmp/none.mp4")

    func testAHappyUploadPutsOnceCompletesAndReturnsTheState() async throws {
        let api = FakeAPI(); let box = Box()
        api.open = [.success(session())]
        api.complete = [.success(VideoStatusResponse(assetId: assetId, state: "processing"))]
        let outcome = try await uploader(api, box).upload(fileURL: file, contentType: "video/mp4", size: 10,
                                                          askConsent: { box.asked += 1; return true }, onProgress: { _ in })
        XCTAssertEqual(outcome, .uploaded(assetId: assetId, state: .processing))
        XCTAssertEqual(box.puts, 1)
        XCTAssertEqual(box.asked, 0, "no sheet when the server did not ask for one")
    }

    func testA404MeansTheFeatureIsOffAndNothingIsSent() async throws {
        let api = FakeAPI(); let box = Box()
        api.open = [.failure(AppError.network(status: 404, code: "not_found"))]
        let outcome = try await uploader(api, box).upload(fileURL: file, contentType: "video/mp4", size: 10, askConsent: { true }, onProgress: { _ in })
        XCTAssertEqual(outcome, .featureOff)
        XCTAssertEqual(box.puts, 0)
    }

    func testTheClipConditionsGateAsksOnceRecordsVersionOneAndRetriesWithANewKey() async throws {
        let api = FakeAPI(); let box = Box()
        api.open = [.failure(AppError.network(status: 403, code: "video_consent_required")), .success(session())]
        api.complete = [.success(VideoStatusResponse(assetId: assetId, state: "processing"))]
        _ = try await uploader(api, box).upload(fileURL: file, contentType: "video/mp4", size: 10,
                                                askConsent: { box.asked += 1; return true }, onProgress: { _ in })
        XCTAssertEqual(box.asked, 1)
        XCTAssertEqual(api.consentVersions, [1])
        XCTAssertEqual(api.keys.count, 2)
        XCTAssertNotEqual(api.keys[0], api.keys[1], "a NEW idempotency key for every attempt")
    }

    func testDecliningTheClipConditionsRecordsNothingAndSendsNothing() async {
        let api = FakeAPI(); let box = Box()
        api.open = [.failure(AppError.network(status: 403, code: "video_consent_required"))]
        do {
            _ = try await uploader(api, box).upload(fileURL: file, contentType: "video/mp4", size: 10, askConsent: { false }, onProgress: { _ in })
            XCTFail("must not upload")
        } catch {
            XCTAssertEqual(error as? AppError, ExploreVideoUploader.declinedError)
        }
        XCTAssertTrue(api.consentVersions.isEmpty)
        XCTAssertEqual(box.puts, 0)
    }

    func testTheAIGateNeverOpensTheSheet() async {
        let api = FakeAPI(); let box = Box()
        api.open = [.failure(AppError.authentication(reason: .aiConsentRequired(message: nil)))]
        do {
            _ = try await uploader(api, box).upload(fileURL: file, contentType: "video/mp4", size: 10,
                                                    askConsent: { box.asked += 1; return true }, onProgress: { _ in })
            XCTFail("must fail")
        } catch {
            XCTAssertEqual(ExploreVideoIssue.from(error), .aiGate)
        }
        XCTAssertEqual(box.asked, 0)
        XCTAssertTrue(api.consentVersions.isEmpty)
    }

    func testAReusedSessionSkipsThePutAndTheComplete() async throws {
        let api = FakeAPI(); let box = Box()
        api.open = [.success(session(upload: false, reused: true, state: "moderating"))]
        let outcome = try await uploader(api, box).upload(fileURL: file, contentType: "video/mp4", size: 10, askConsent: { true }, onProgress: { _ in })
        XCTAssertEqual(outcome, .uploaded(assetId: assetId, state: .moderating))
        XCTAssertEqual(box.puts, 0)
        XCTAssertEqual(api.completeCalls, 0)
    }

    func testCompleteIsRetriedWhileTheObjectHasNotLanded() async throws {
        let api = FakeAPI(); let box = Box()
        api.open = [.success(session())]
        api.complete = [.failure(AppError.network(status: 422, code: "upload_incomplete")),
                        .failure(AppError.network(status: 502, code: "storage_unavailable")),
                        .success(VideoStatusResponse(assetId: assetId, state: "processing"))]
        let outcome = try await uploader(api, box).upload(fileURL: file, contentType: "video/mp4", size: 10, askConsent: { true }, onProgress: { _ in })
        XCTAssertEqual(outcome, .uploaded(assetId: assetId, state: .processing))
        XCTAssertEqual(api.completeCalls, 3)
    }

    func testAnUnreadableVideoIsNotRetried() async {
        let api = FakeAPI(); let box = Box()
        api.open = [.success(session())]
        api.complete = [.failure(AppError.network(status: 422, code: "unreadable_video"))]
        do {
            _ = try await uploader(api, box).upload(fileURL: file, contentType: "video/mp4", size: 10, askConsent: { true }, onProgress: { _ in })
            XCTFail("must fail")
        } catch {
            XCTAssertEqual(ExploreVideoIssue.from(error), .unreadable)
        }
        XCTAssertEqual(api.completeCalls, 1)
    }

    func testAnUploadSessionOnAnotherSchemeOrWithAnUnsafeIdIsRefused() async {
        let api = FakeAPI(); let box = Box()
        api.open = [.success(VideoUploadSession(assetId: assetId, state: "uploading", uploadUrl: "http://plain.example/u", contentType: nil, reused: nil))]
        do {
            _ = try await uploader(api, box).upload(fileURL: file, contentType: "video/mp4", size: 10, askConsent: { true }, onProgress: { _ in })
            XCTFail("http must be refused")
        } catch {}
        api.open = [.success(VideoUploadSession(assetId: "../x", state: "uploading", uploadUrl: "https://s.example/u", contentType: nil, reused: nil))]
        do {
            _ = try await uploader(api, box).upload(fileURL: file, contentType: "video/mp4", size: 10, askConsent: { true }, onProgress: { _ in })
            XCTFail("a path-like id must be refused")
        } catch {}
        XCTAssertEqual(box.puts, 0)
    }

    func testPollFollowsTheStatesUntilReady() async throws {
        let api = FakeAPI(); let box = Box()
        api.status = [.success(VideoStatusResponse(assetId: assetId, state: "moderating")),
                      .success(VideoStatusResponse(assetId: assetId, state: "review_required")),
                      .success(VideoStatusResponse(assetId: assetId, state: "ready"))]
        var seen: [ExploreVideoPhase] = []
        let last = try await uploader(api, box).poll(assetId: assetId, initial: .processing, onPhase: { seen.append($0) })
        XCTAssertEqual(last, .ready)
        XCTAssertEqual(seen, [.processing, .processing, .awaitingReview, .ready])
    }

    func testPollStopsOnRejectedAndSurvivesOneBlip() async throws {
        let api = FakeAPI(); let box = Box()
        api.status = [.failure(AppError.offline), .success(VideoStatusResponse(assetId: assetId, state: "rejected"))]
        let last = try await uploader(api, box).poll(assetId: assetId, initial: .uploaded, onPhase: { _ in })
        XCTAssertEqual(last, .rejected)
    }

    func testPollGivesUpOnA404() async {
        let api = FakeAPI(); let box = Box()
        api.status = [.failure(AppError.network(status: 404, code: "not_found"))]
        do {
            _ = try await uploader(api, box).poll(assetId: assetId, initial: .processing, onPhase: { _ in })
            XCTFail("a vanished video ends the poll")
        } catch {
            XCTAssertEqual(ExploreVideoIssue.from(error), .notFound)
        }
    }

    // MARK: Playback

    private func grant(manifest: String = "https://cdn.example.com/v/a1b2c3d4-0000-4000-8000-000000000001/master.m3u8",
                       cookie: PlaybackCookie? = PlaybackCookie(name: "Cloud-CDN-Cookie", value: "URLPrefix=abc:Expires=1:KeyName=k:Signature=s",
                                                                domain: "cdn.example.com", path: "/v/", expiresAt: "2026-11-05T10:10:00.000Z"),
                       overlay: PlaybackOverlay? = nil) -> VideoPlaybackGrant {
        VideoPlaybackGrant(assetId: assetId, manifestUrl: manifest, expiresAt: nil, ttlSeconds: 600, cookie: cookie, overlay: overlay)
    }

    func testTheAssetIdIsFoundInAnHLSManifestUrlOnly() {
        XCTAssertEqual(ExploreVideoPlayback.assetId(fromManifestURL: URL(string: "https://cdn.example.com/v/a1b2c3d4-0000-4000-8000-000000000001/master.m3u8")!),
                       "a1b2c3d4-0000-4000-8000-000000000001")
        XCTAssertEqual(ExploreVideoPlayback.assetId(fromManifestURL: URL(string: "https://cdn.example.com/videos/abcdefgh12345678/index.m3u8")!), "abcdefgh12345678")
        XCTAssertNil(ExploreVideoPlayback.assetId(fromManifestURL: URL(string: "https://media.example.com/clip.mp4")!), "old MP4 clips are untouched")
        XCTAssertNil(ExploreVideoPlayback.assetId(fromManifestURL: URL(string: "https://youtu.be/abc")!))
    }

    func testTheCookieIsBuiltSecureWithItsDomainPathAndExpiry() throws {
        let c = try XCTUnwrap(ExploreVideoPlayback.cookie(from: PlaybackCookie(name: "Cloud-CDN-Cookie", value: "v", domain: "cdn.example.com", path: "/v/",
                                                                              expiresAt: "2026-11-05T10:10:00.000Z")))
        XCTAssertEqual(c.name, "Cloud-CDN-Cookie")
        XCTAssertEqual(c.value, "v")
        XCTAssertEqual(c.domain, "cdn.example.com")
        XCTAssertEqual(c.path, "/v/")
        XCTAssertTrue(c.isSecure)
        XCTAssertNotNil(c.expiresDate)
        XCTAssertNil(ExploreVideoPlayback.cookie(from: PlaybackCookie(name: "", value: "v", domain: "d", path: "/", expiresAt: nil)))
    }

    func testRefreshIsAt80PercentOfTheTTL() {
        XCTAssertEqual(ExploreVideoPlayback.refreshDelay(ttlSeconds: 600), 480, accuracy: 0.001)
        XCTAssertEqual(ExploreVideoPlayback.refreshDelay(ttlSeconds: nil), 480, accuracy: 0.001)
        XCTAssertEqual(ExploreVideoPlayback.refreshDelay(ttlSeconds: 5), 10, accuracy: 0.001, "never tighter than ten seconds")
    }

    func testPrepareNeedsAnHTTPSManifestAndAUsableCookie() throws {
        let p = try XCTUnwrap(ExploreVideoPlayback.prepare(grant()))
        XCTAssertEqual(p.cookies.count, 1)
        XCTAssertEqual(p.refreshAfter, 480, accuracy: 0.001)
        XCTAssertNotNil(ExploreVideoPlayback.assetOptions(cookies: p.cookies))
        XCTAssertNil(ExploreVideoPlayback.prepare(grant(manifest: "http://cdn.example.com/a.m3u8")))
        XCTAssertNil(ExploreVideoPlayback.prepare(grant(cookie: PlaybackCookie(name: "", value: "", domain: "", path: "", expiresAt: nil))))
        XCTAssertNil(ExploreVideoPlayback.assetOptions(cookies: []))
    }

    func testThePlaybackAnswerDecodesWithItsCookieAndOverlay() throws {
        let json = """
        {"assetId":"\(assetId)","manifestUrl":"https://cdn.example.com/v/\(assetId)/master.m3u8","expiresAt":"2026-11-05T10:10:00.000Z","ttlSeconds":600,
         "preview":false,"overlay":{"version":3,"doc":\(Self.validDocJSON)},
         "cookie":{"name":"Cloud-CDN-Cookie","value":"x","domain":"cdn.example.com","path":"/v/","expiresAt":"2026-11-05T10:10:00.000Z"}}
        """
        let g = try decode(VideoPlaybackGrant.self, json)
        XCTAssertEqual(g.ttlSeconds, 600)
        XCTAssertEqual(g.cookie?.name, "Cloud-CDN-Cookie")
        XCTAssertEqual(g.overlay?.version, 3)
        XCTAssertEqual(g.overlay?.doc?.layers.count, 1)
        XCTAssertNotNil(ExploreVideoPlayback.prepare(g)?.overlay)
    }

    func testANullOrBrokenOverlayNeverStopsThePlayback() throws {
        let nullJSON = #"{"assetId":"x","manifestUrl":"https://cdn.example.com/a/master.m3u8","ttlSeconds":600,"overlay":null}"#
        XCTAssertNil(try decode(VideoPlaybackGrant.self, nullJSON).overlay)
        let broken = #"{"assetId":"x","manifestUrl":"https://cdn.example.com/a/master.m3u8","ttlSeconds":600,"overlay":{"version":1,"doc":{"schema_version":1,"layers":[{"id":"a"}]}}}"#
        let g = try decode(VideoPlaybackGrant.self, broken)
        XCTAssertNil(g.overlay?.doc, "one layer that does not decode = nothing is drawn")
        XCTAssertNotNil(ExploreVideoPlayback.prepare(g), "the video still plays")
        XCTAssertNil(ExploreVideoPlayback.prepare(g)?.overlay)
    }

    func testAnOverlayThatFailsTheValidatorIsNotDrawn() {
        var doc = OverlayDocument(layers: [Self.layer()])
        XCTAssertNotNil(ExploreVideoPlayback.drawableOverlay(PlaybackOverlay.make(doc)))
        doc.layers[0].size = 0.9
        XCTAssertNil(ExploreVideoPlayback.drawableOverlay(PlaybackOverlay.make(doc)))
        XCTAssertNil(ExploreVideoPlayback.drawableOverlay(PlaybackOverlay.make(OverlayDocument())), "an empty document draws nothing")
        XCTAssertNil(ExploreVideoPlayback.drawableOverlay(nil))
    }

    // MARK: Overlay schema

    static func layer(id: String = "t1") -> OverlayLayer {
        OverlayLayer.makeDefault(id: id, text: "Xin chào Hà Nội", durationMs: 5000)
    }

    static let validDocJSON = #"""
    {"schema_version":1,"layers":[{"id":"t1","type":"text","text":"Xin chào","x":0.5,"y":0.5,"width":0.8,"size":0.07,"rotation":0,"align":"center","font":"sans","weight":"bold","color":"#ffffff","background":null,"outline":{"color":"#000000","width":0.08},"shadow":true,"start_ms":0,"end_ms":3000}]}
    """#

    func testTheServersDefaultDocumentIsValid() throws {
        let doc = try decode(OverlayDocument.self, Self.validDocJSON)
        XCTAssertEqual(OverlayValidator.errors(in: doc, durationMs: 5000), [])
        XCTAssertNil(doc.layers[0].background)
        XCTAssertEqual(doc.layers[0].outline?.width, 0.08)
    }

    func testAnEmptyDocumentIsValidAndWhatIsSavedKeepsExplicitNulls() throws {
        XCTAssertTrue(OverlayValidator.isValid(OverlayDocument()))
        let data = try JSONEncoder().encode(OverlayDocument(layers: [Self.layer()]))
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(obj["schema_version"] as? Int, 1)
        let layers = try XCTUnwrap(obj["layers"] as? [[String: Any]])
        XCTAssertTrue(layers[0]["background"] is NSNull, "none is an explicit null: the server refuses a missing key")
        XCTAssertNotNil(layers[0]["start_ms"])
        XCTAssertNil(layers[0]["startMs"])
    }

    func testTheValidatorRefusesEachRuleOfSchemaV1() {
        func errs(_ change: (inout OverlayLayer) -> Void) -> [String] {
            var l = Self.layer(); change(&l)
            return OverlayValidator.errors(in: OverlayDocument(layers: [l]), durationMs: 5000)
        }
        XCTAssertEqual(errs { $0.text = "   " }, ["layers.0.text"])
        XCTAssertEqual(errs { $0.text = String(repeating: "a", count: 201) }, ["layers.0.text"])
        XCTAssertEqual(errs { $0.text = "1\n2\n3\n4\n5\n6\n7" }, ["layers.0.text"])
        XCTAssertEqual(errs { $0.text = "ok\u{202E}evil" }, ["layers.0.text"], "direction override characters are refused")
        XCTAssertEqual(errs { $0.x = 1.1 }, ["layers.0.x"])
        XCTAssertEqual(errs { $0.y = -0.1 }, ["layers.0.y"])
        XCTAssertEqual(errs { $0.width = 0.05 }, ["layers.0.width"])
        XCTAssertEqual(errs { $0.size = 0.21 }, ["layers.0.size"])
        XCTAssertEqual(errs { $0.size = 0.01 }, ["layers.0.size"])
        XCTAssertEqual(errs { $0.rotation = 181 }, ["layers.0.rotation"])
        XCTAssertEqual(errs { $0.align = "justify" }, ["layers.0.align"])
        XCTAssertEqual(errs { $0.font = "serif" }, ["layers.0.font"])
        XCTAssertEqual(errs { $0.weight = "heavy" }, ["layers.0.weight"])
        XCTAssertEqual(errs { $0.color = "red" }, ["layers.0.color"])
        XCTAssertEqual(errs { $0.color = "#fff" }, ["layers.0.color"])
        XCTAssertEqual(errs { $0.id = "bad id!" }, ["layers.0.id"])
        XCTAssertEqual(errs { $0.type = "image" }, ["layers.0.type"])
        XCTAssertEqual(errs { $0.background = OverlayBackground(color: "#000000", opacity: 1.5) }, ["layers.0.background.opacity"])
        XCTAssertEqual(errs { $0.outline = OverlayOutline(color: "#000000", width: 0.5) }, ["layers.0.outline.width"])
        XCTAssertEqual(errs { $0.startMs = 4000; $0.endMs = 4000 }, ["layers.0.end_ms"], "end must be after start")
        XCTAssertEqual(errs { $0.endMs = 5001 }, ["layers.0.end_ms"], "a layer may not end after the clip")
        XCTAssertEqual(errs { $0.startMs = -1 }, ["layers.0.start_ms"])
        XCTAssertEqual(errs { $0.x = .nan }, ["layers.0.x"])
    }

    func testTheValidatorCapsLayersDuplicateIdsAndTheVersion() {
        let many = OverlayDocument(layers: (0..<11).map { Self.layer(id: "t\($0)") })
        XCTAssertEqual(OverlayValidator.errors(in: many), ["layers"])
        let dup = OverlayDocument(layers: [Self.layer(id: "same"), Self.layer(id: "same")])
        XCTAssertEqual(OverlayValidator.errors(in: dup), ["layers.1.id"])
        XCTAssertEqual(OverlayValidator.errors(in: OverlayDocument(schemaVersion: 2)), ["schema_version"])
        XCTAssertEqual(OverlayValidator.errors(in: OverlayDocument(layers: (0..<10).map { Self.layer(id: "t\($0)") })), [])
    }

    func testTheEnvelopeAndTheSaveResultDecode() throws {
        let empty = try decode(OverlayEnvelope.self, #"{"version":0,"doc":{}}"#)
        XCTAssertEqual(empty.version, 0)
        XCTAssertTrue(empty.doc.layers.isEmpty)
        let ok = try decode(OverlaySaveResult.self, #"{"version":4}"#)
        XCTAssertEqual(ok.version, 4)
        XCTAssertFalse(ok.hasUnsupportedChars)
        let warn = try decode(OverlaySaveResult.self, #"{"version":5,"warnings":{"unsupported_chars":["☃"]}}"#)
        XCTAssertTrue(warn.hasUnsupportedChars)
    }

    func testTheOverlayBodyIsVersionPlusDoc() throws {
        let body = try ExploreVideoRequests.overlayBody(version: 7, doc: OverlayDocument(layers: [Self.layer()]))
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(obj["version"] as? Int, 7)
        let doc = try XCTUnwrap(obj["doc"] as? [String: Any])
        XCTAssertEqual(doc["schema_version"] as? Int, 1)
    }

    // MARK: Editing

    func testAddingStopsAtTenLayersAndGivesValidLayers() throws {
        var doc = OverlayDocument()
        for _ in 0..<10 {
            let added = try XCTUnwrap(OverlayEditing.adding(to: doc, durationMs: 5000))
            doc = added.doc
        }
        XCTAssertNil(OverlayEditing.adding(to: doc, durationMs: 5000))
        XCTAssertEqual(OverlayValidator.errors(in: doc, durationMs: 5000), [])
    }

    func testMovingClampsToTheFrameAndTimesStayInsideTheClip() {
        let doc = OverlayDocument(layers: [Self.layer()])
        let moved = OverlayEditing.moving("t1", x: 1.4, y: -2, in: doc)
        XCTAssertEqual(moved.layers[0].x, 1)
        XCTAssertEqual(moved.layers[0].y, 0)
        let timed = OverlayEditing.settingTimes("t1", startMs: 4900, endMs: 100, durationMs: 5000, in: doc)
        XCTAssertEqual(timed.layers[0].startMs, 4900)
        XCTAssertEqual(timed.layers[0].endMs, 4901)
        let cut = OverlayEditing.clamped(OverlayDocument(layers: [Self.layer()]), durationMs: 1000)
        XCTAssertEqual(cut.layers[0].endMs, 1000)
        XCTAssertTrue(OverlayValidator.isValid(cut, durationMs: 1000))
    }

    func testBackgroundAndOutlineSwitches() {
        let doc = OverlayDocument(layers: [Self.layer()])
        XCTAssertNotNil(OverlayEditing.setBackground(true, for: "t1", in: doc).layers[0].background)
        XCTAssertNil(OverlayEditing.setOutline(false, for: "t1", in: doc).layers[0].outline)
        XCTAssertTrue(OverlayValidator.isValid(OverlayEditing.setBackground(true, for: "t1", in: doc), durationMs: 5000))
    }

    func testNewLayerIdsPassTheValidator() {
        for _ in 0..<20 { XCTAssertTrue(OverlayValidator.isValidId(OverlayValidator.newLayerId())) }
    }

    // MARK: Geometry (the same rule as the web layout)

    func testFontAndBoxSizesFollowTheFrameWidth() {
        XCTAssertEqual(OverlayGeometry.fontPx(size: 0.07, frameWidth: 1000), 70)
        XCTAssertEqual(OverlayGeometry.fontPx(size: 0.02, frameWidth: 100), 6, "never below 6 px")
        XCTAssertEqual(OverlayGeometry.boxWidthPx(width: 0.8, frameWidth: 500), 400)
        XCTAssertEqual(OverlayGeometry.boxWidthPx(width: 0.1, frameWidth: 20), 8, "never below 8 px")
    }

    func testALayerIsVisibleFromItsStartUpToButNotIncludingItsEnd() {
        var l = Self.layer(); l.startMs = 1000; l.endMs = 2000
        XCTAssertFalse(OverlayGeometry.isVisible(l, timeMs: 999))
        XCTAssertTrue(OverlayGeometry.isVisible(l, timeMs: 1000))
        XCTAssertTrue(OverlayGeometry.isVisible(l, timeMs: 1999))
        XCTAssertFalse(OverlayGeometry.isVisible(l, timeMs: 2000))
    }

    func testTheFrameRectIsFilledInTheFeedAndFittedInTheEditor() {
        let container = CGSize(width: 400, height: 800)
        let landscape = CGSize(width: 1920, height: 1080)
        let fill = OverlayGeometry.contentRect(container: container, video: landscape, fill: true)
        XCTAssertEqual(fill.height, 800, accuracy: 0.001)
        XCTAssertGreaterThan(fill.width, 400, "aspect-fill crops the sides: the frame is wider than the screen")
        XCTAssertEqual(fill.midX, 200, accuracy: 0.001)
        let fit = OverlayGeometry.contentRect(container: container, video: landscape, fill: false)
        XCTAssertEqual(fit.width, 400, accuracy: 0.001)
        XCTAssertEqual(fit.height, 225, accuracy: 0.001)
        XCTAssertEqual(fit.midY, 400, accuracy: 0.001)
        XCTAssertEqual(OverlayGeometry.contentRect(container: container, video: .zero, fill: true), CGRect(origin: .zero, size: container))
    }

    func testTheCentreIsNormalisedToTheFrameAndBack() {
        let rect = CGRect(x: 10, y: 20, width: 200, height: 400)
        var l = Self.layer(); l.x = 0.25; l.y = 0.75
        let p = OverlayGeometry.center(of: l, in: rect)
        XCTAssertEqual(p.x, 60, accuracy: 0.001)
        XCTAssertEqual(p.y, 320, accuracy: 0.001)
        let n = OverlayGeometry.normalized(point: p, in: rect)
        XCTAssertEqual(n.x, 0.25, accuracy: 0.001)
        XCTAssertEqual(n.y, 0.75, accuracy: 0.001)
        XCTAssertEqual(OverlayGeometry.normalized(point: CGPoint(x: -500, y: 9999), in: rect).x, 0)
        XCTAssertEqual(OverlayGeometry.normalized(point: CGPoint(x: -500, y: 9999), in: rect).y, 1)
    }

    func testColourParsing() {
        XCTAssertTrue(OverlayValidator.isValidColor("#a1B2c3"))
        XCTAssertFalse(OverlayValidator.isValidColor("a1b2c3"))
        XCTAssertFalse(OverlayValidator.isValidColor("#a1b2c"))
    }
}

private extension PlaybackOverlay {
    /// A decoded overlay holding `doc`, built through JSON so the test uses the real decoder.
    static func make(_ doc: OverlayDocument) -> PlaybackOverlay? {
        guard let data = try? JSONEncoder().encode(doc),
              let text = String(data: data, encoding: .utf8) else { return nil }
        let json = "{\"version\":1,\"doc\":\(text)}"
        return try? ResponseDecoder.json.decode(PlaybackOverlay.self, from: Data(json.utf8))
    }
}
