import Foundation

@MainActor
final class SoundPageViewModel: AppObservableObject {
    let trackId: String

    @AppPublished var data: SoundData?
    @AppPublished var loading = true
    @AppPublished var error: String?

    @AppPublished var playing = false
    @AppPublished var saved = false
    @AppPublished var savedCount = 0
    @AppPublished var followed = false
    @AppPublished var playCount = 0
    @AppPublished var busy = false

    @AppPublished var reportOpen = false
    @AppPublished var reportReason: ReportReason = .copyright
    @AppPublished var reportDetails = ""
    @AppPublished var reportBusy = false
    @AppPublished var reportSent = false

    private let service: MusicService
    private let session: SessionStore
    private let log = AppLogger.music
    private var countedPlay = false

    var isAuthenticated: Bool { session.state.isAuthenticated }

    init(trackId: String, service: MusicService, session: SessionStore) {
        self.trackId = trackId
        self.service = service
        self.session = session
    }

    // MARK: - Load sound data

    func load() async {
        loading = true
        error = nil

        do {
            let result = try await service.getSoundData(trackId: trackId)
            data = result
            saved = result.savedByMe
            savedCount = result.savedCount
            followed = result.followedByMe
            playCount = result.track.playCount
        } catch let err as AppError {
            switch err {
            case .network(let status, _) where status == 404:
                error = "Bài nhạc không tồn tại."
            default:
                error = "Không tải được, thử lại nhé."
            }
        } catch {
            self.error = "Không tải được, thử lại nhé."
        }
        loading = false
    }

    // MARK: - Play (first play records a count)

    func recordFirstPlay() {
        guard !countedPlay else { return }
        countedPlay = true
        playCount += 1
        Task { await service.recordPlay(trackId: trackId) }
    }

    // MARK: - Save toggle (optimistic)

    func toggleSave() {
        guard !busy else { return }
        guard isAuthenticated else { return }
        busy = true

        let wasSaved = saved
        saved = !wasSaved
        savedCount += saved ? 1 : -1

        Task {
            do {
                let response = saved
                    ? try await service.saveTrack(trackId: trackId)
                    : try await service.unsaveTrack(trackId: trackId)
                if let count = response.savedCount { savedCount = count }
            } catch {
                saved = wasSaved
                savedCount += wasSaved ? 1 : -1
                log.error("save toggle failed: \(error)")
            }
            busy = false
        }
    }

    // MARK: - Follow toggle (optimistic)

    func toggleFollow() {
        guard !busy else { return }
        guard isAuthenticated else { return }
        busy = true

        let wasFollowed = followed
        followed = !wasFollowed

        Task {
            do {
                _ = followed
                    ? try await service.followTrack(trackId: trackId)
                    : try await service.unfollowTrack(trackId: trackId)
            } catch {
                followed = wasFollowed
                log.error("follow toggle failed: \(error)")
            }
            busy = false
        }
    }

    // MARK: - Report

    func submitReport() {
        guard !reportBusy else { return }
        reportBusy = true

        Task {
            do {
                let details = reportDetails.trimmingCharacters(in: .whitespacesAndNewlines)
                try await service.reportTrack(
                    trackId: trackId,
                    reason: reportReason.rawValue,
                    details: details.isEmpty ? nil : details
                )
                reportSent = true
                try? await Task.sleep(nanoseconds: 1_800_000_000)
                reportOpen = false
                reportSent = false
                reportDetails = ""
            } catch {
                log.error("report failed: \(error)")
            }
            reportBusy = false
        }
    }
}
