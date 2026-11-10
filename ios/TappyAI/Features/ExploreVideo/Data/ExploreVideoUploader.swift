import Foundation

enum ExploreUploadOutcome: Equatable {
    /// The server answered 404: the pipeline is off, the caller uses the legacy clip upload.
    case featureOff
    /// The bytes are on the server (or were already); `state` is what the server reported last.
    case uploaded(assetId: String, state: ExploreVideoState)
}

/// The upload sequence of contract §2 as one testable unit: POST /api/video/uploads (with the clip-conditions gate of §6)
/// -> file PUT -> /complete -> poll. Everything that touches the outside (the PUT, the sheet, the clock) is injected.
///
/// 🚨 Two different 403 gates: `video_consent_required` opens the clip-conditions sheet and records the answer with
/// POST /api/video/consent; `ai_consent_required` is another gate, is only REPORTED and never reopens a sheet.
@MainActor
struct ExploreVideoUploader {
    let api: ExploreVideoAPI
    /// (file, upload URL, content type, progress 0...1)
    let putFile: (URL, URL, String, @escaping (Double) -> Void) async throws -> Void
    let sleep: (TimeInterval) async throws -> Void

    /// What the flow throws when the person answers «Để sau» to the clip conditions.
    static let declinedError = AppError.validation(message: "video_consent_declined")

    static func make(api: APIClient) -> ExploreVideoUploader {
        ExploreVideoUploader(
            api: ExploreVideoService(api: api),
            putFile: { file, url, type, progress in
                try await VideoFileUploader.put(fileURL: file, to: url, contentType: type, progress: progress)
            },
            sleep: { seconds in try await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000)) }
        )
    }

    // MARK: Upload

    /// `askConsent` shows the clip-conditions sheet and returns the person's answer (true = accepted).
    func upload(fileURL: URL, contentType: String, size: Int,
                askConsent: () async -> Bool,
                onProgress: @escaping (Double) -> Void) async throws -> ExploreUploadOutcome {
        let session: VideoUploadSession
        do {
            session = try await openWithConsentRetry(contentType: contentType, size: size, askConsent: askConsent)
        } catch {
            if ExploreVideoIssue.from(error) == .notFound { return .featureOff }
            throw error
        }
        guard ExploreVideoPlayback.isSafeAssetId(session.assetId) else {
            throw AppError.unexpected(message: "bad asset id")
        }

        guard let rawURL = session.uploadUrl else {
            // Same key as an earlier attempt that is already past the upload: nothing to send, only to follow.
            if session.reused == true { return .uploaded(assetId: session.assetId, state: ExploreVideoState(raw: session.state)) }
            throw AppError.network(status: 503, code: "video_unavailable")
        }
        guard let uploadURL = URL(string: rawURL), uploadURL.scheme?.lowercased() == "https" else {
            throw AppError.network(status: 503, code: "video_unavailable")
        }

        try await putFile(fileURL, uploadURL, session.contentType ?? contentType, onProgress)
        let state = try await completeWithRetry(assetId: session.assetId)
        return .uploaded(assetId: session.assetId, state: state)
    }

    private func open(contentType: String, size: Int) async throws -> VideoUploadSession {
        // A NEW idempotency key for every attempt.
        try await api.openUpload(idempotencyKey: ExploreVideoUploadRules.makeIdempotencyKey(), contentType: contentType, size: size)
    }

    private func openWithConsentRetry(contentType: String, size: Int, askConsent: () async -> Bool) async throws -> VideoUploadSession {
        do {
            return try await open(contentType: contentType, size: size)
        } catch {
            // Only the clip-conditions gate opens the sheet. Every other refusal (including ai_consent_required) is rethrown as is.
            guard ExploreVideoIssue.from(error) == .videoConsentRequired else { throw error }
            guard await askConsent() else { throw Self.declinedError }
            try await api.recordVideoConsent(version: ExploreVideoConsent.version)
            return try await open(contentType: contentType, size: size)
        }
    }

    /// `422 upload_incomplete` (the object has not landed yet) and `502 storage_unavailable` are worth a few more tries.
    private func completeWithRetry(assetId: String) async throws -> ExploreVideoState {
        var lastError: Error = AppError.unexpected(message: "complete")
        for attempt in 0..<4 {
            if attempt > 0 { try await sleep(2) }
            do {
                return try await api.completeUpload(assetId: assetId).parsedState
            } catch {
                lastError = error
                let issue = ExploreVideoIssue.from(error)
                guard issue == .incomplete || issue == .storageUnavailable else { throw error }
            }
        }
        throw lastError
    }

    // MARK: Poll (the poll itself pushes the video one step further on the server)

    /// Follows the video until it is ready, rejected or failed. Calls `onPhase` for every state it sees. Returns the last phase;
    /// a phase that is not terminal means the poll budget ran out (the clip is not lost, it is only slow).
    func poll(assetId: String, initial: ExploreVideoState,
              onPhase: (ExploreVideoPhase) -> Void) async throws -> ExploreVideoPhase {
        var phase = ExploreVideoPhase.phase(for: initial)
        onPhase(phase)
        var attempt = 0
        var consecutiveFailures = 0
        while !phase.isTerminal && attempt < ExploreVideoUploadRules.maxPollAttempts {
            try await sleep(ExploreVideoUploadRules.pollDelay(attempt: attempt))
            try Task.checkCancellation()
            attempt += 1
            do {
                let status = try await api.uploadStatus(assetId: assetId)
                consecutiveFailures = 0
                phase = ExploreVideoPhase.phase(for: status.parsedState)
                onPhase(phase)
            } catch {
                let issue = ExploreVideoIssue.from(error)
                if issue == .cancelled { throw CancellationError() }
                if issue == .notFound { throw error }
                consecutiveFailures += 1
                if consecutiveFailures >= 5 { throw error }
            }
        }
        return phase
    }
}
