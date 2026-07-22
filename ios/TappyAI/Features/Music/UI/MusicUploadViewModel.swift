import Foundation
import AVFoundation

@MainActor
final class MusicUploadViewModel: AppObservableObject {
    @AppPublished var fileData: Data?
    @AppPublished var fileName: String = ""
    @AppPublished var title: String = ""
    @AppPublished var artist: String = ""
    @AppPublished var rights = false
    @AppPublished var busy = false
    @AppPublished var error: String?
    @AppPublished var uploadedTrackId: String?

    private let service: MusicService
    private let session: SessionStore
    private let log = AppLogger.music

    var isAuthenticated: Bool { session.state.isAuthenticated }

    var canSubmit: Bool {
        fileData != nil && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && rights && !busy
    }

    init(service: MusicService, session: SessionStore) {
        self.service = service
        self.session = session
    }

    func setFile(data: Data, name: String) {
        error = nil
        let ext = (name as NSString).pathExtension.lowercased()
        guard MusicUploadLimits.allowedExtensions.contains(ext), !ext.isEmpty else {
            error = "Vui lòng chọn file âm thanh (mp3, m4a, wav…)"
            return
        }
        guard data.count <= MusicUploadLimits.maxFileSizeBytes else {
            error = "File tối đa \(MusicUploadLimits.maxFileSizeMB)MB"
            return
        }
        fileData = data
        fileName = name
        if title.isEmpty {
            title = (name as NSString).deletingPathExtension.prefix(120).description
        }
    }

    func submit() async {
        guard canSubmit, isAuthenticated else { return }
        busy = true
        error = nil

        guard let data = fileData else { busy = false; return }

        do {
            let ext = (fileName as NSString).pathExtension.lowercased()
            let effectiveExt = ext.isEmpty ? "mp3" : ext

            let durationSec = await readAudioDuration(data: data, ext: effectiveExt)
            guard durationSec >= MusicUploadLimits.minDurationSec,
                  durationSec <= MusicUploadLimits.maxDurationSec else {
                error = "Nhạc phải dài 1 giây–10 phút"
                busy = false
                return
            }

            let audioUrl = try await service.uploadAudioFile(data: data, ext: effectiveExt)

            let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedArtist = artist.trimmingCharacters(in: .whitespacesAndNewlines)

            let response = try await service.publishOriginalSound(
                title: trimmedTitle,
                artist: trimmedArtist.isEmpty ? nil : trimmedArtist,
                audioUrl: audioUrl,
                durationSec: durationSec
            )

            if let err = response.error, !err.isEmpty {
                error = err
            } else if let id = response.id {
                uploadedTrackId = id
            } else {
                error = "Đăng nhạc thất bại"
            }
        } catch {
            self.error = "Có lỗi khi tải nhạc lên. Vui lòng thử lại."
            log.error("music upload failed: \(error)")
        }
        busy = false
    }

    private func readAudioDuration(data: Data, ext: String) async -> Int {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).\(ext)")
        do {
            try data.write(to: tempURL)
            let asset = AVURLAsset(url: tempURL)
            let duration = try await asset.load(.duration)
            let seconds = CMTimeGetSeconds(duration)
            try? FileManager.default.removeItem(at: tempURL)
            return Int(seconds.rounded())
        } catch {
            try? FileManager.default.removeItem(at: tempURL)
            return 0
        }
    }
}
