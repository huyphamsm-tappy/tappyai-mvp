import SwiftUI
import Photos

/// What to do after a download status answer (contract §4). Pure.
enum ExploreDownloadDecision: Equatable {
    case wait, fetch, fail

    static func decide(_ status: ExploreDownloadStatus) -> ExploreDownloadDecision {
        switch status {
        case .ready: return .fetch
        case .failed: return .fail
        case .none, .rendering: return .wait
        }
    }

    /// About 6 minutes of waiting for the server to burn the text and watermark in.
    static let maxPolls = 120
    static let pollSeconds: TimeInterval = 3
}

enum ExploreDownloadStep: Equatable {
    case idle, requesting, rendering, downloading, saving, finished
    case failed(messageKey: String)
}

@MainActor
final class ExploreVideoDownloadViewModel: AppObservableObject {
    @AppPublished private(set) var step: ExploreDownloadStep = .idle

    private let api: ExploreVideoAPI
    private let assetId: String
    private var task: Task<Void, Never>?

    init(api: ExploreVideoAPI, assetId: String) {
        self.api = api
        self.assetId = assetId
    }

    func start() {
        guard task == nil else { return }
        task = Task { await run() }
    }

    /// The sheet went away: stop waiting (the server keeps the finished copy cached for the next time).
    func stop() {
        task?.cancel()
        task = nil
    }

    func retry() {
        task?.cancel()
        task = nil
        step = .idle
        start()
    }

    private func fail(_ error: Error) {
        let issue = ExploreVideoIssue.from(error)
        if issue == .cancelled { return }
        step = .failed(messageKey: issue.messageKey)
    }

    private func run() async {
        defer { task = nil }
        step = .requesting
        var tempFile: URL?
        defer { if let f = tempFile { try? FileManager.default.removeItem(at: f) } }
        do {
            var status = try await api.startDownload(assetId: assetId).parsed
            var polls = 0
            while ExploreDownloadDecision.decide(status) == .wait {
                step = .rendering
                guard polls < ExploreDownloadDecision.maxPolls else { step = .failed(messageKey: "video.download.slow"); return }
                try await Task.sleep(nanoseconds: UInt64(ExploreDownloadDecision.pollSeconds * 1_000_000_000))
                polls += 1
                status = try await api.downloadStatus(assetId: assetId).parsed
            }
            if ExploreDownloadDecision.decide(status) == .fail { step = .failed(messageKey: "video.download.failed"); return }

            step = .downloading
            let file = try await api.downloadFile(assetId: assetId)
            tempFile = file
            try Task.checkCancellation()

            step = .saving
            guard await Self.requestAddOnlyAccess() else { step = .failed(messageKey: "video.download.noPhotosAccess"); return }
            try await Self.save(file)
            step = .finished
        } catch {
            fail(error)
        }
    }

    private static func requestAddOnlyAccess() async -> Bool {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        return status == .authorized || status == .limited
    }

    private static func save(_ file: URL) async throws {
        try await PHPhotoLibrary.shared().performChanges {
            _ = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: file)
        }
    }
}

struct ExploreVideoDownloadView: View {
    @AppStateObject private var model: ExploreVideoDownloadViewModel
    @Environment(\.dismiss) private var dismiss

    init(assetId: String, api: ExploreVideoAPI) {
        _model = AppStateObject(wrappedValue: ExploreVideoDownloadViewModel(api: api, assetId: assetId))
    }

    var body: some View {
        VStack(spacing: Spacing.md) {
            Spacer()
            icon
            Text(titleKey)
                .font(TappyFont.title)
                .foregroundStyle(TappyColor.textPrimary)
                .multilineTextAlignment(.center)
            if case .failed(let key) = model.step {
                Text(NSLocalizedString(key, comment: ""))
                    .font(TappyFont.callout)
                    .foregroundStyle(TappyColor.textSecondary)
                    .multilineTextAlignment(.center)
                Button { model.retry() } label: { Text("common.retry.action") }
                    .buttonStyle(.borderedProminent)
            }
            Spacer()
            Button { dismiss() } label: {
                Text(LocalizedStringKey(model.step == .finished ? "video.download.done" : "common.cancel"))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .padding(Spacing.lg)
        .background(TappyColor.background.ignoresSafeArea())
        .onAppear { model.start() }
        .onDisappear { model.stop() }
    }

    @ViewBuilder
    private var icon: some View {
        switch model.step {
        case .finished:
            Image(systemName: "checkmark.circle.fill").font(.system(size: 56)).foregroundStyle(TappyColor.success)
        case .failed:
            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 56)).foregroundStyle(TappyColor.warning)
        default:
            ProgressView().scaleEffect(1.6)
        }
    }

    private var titleKey: LocalizedStringKey {
        switch model.step {
        case .idle, .requesting: return "video.download.requesting"
        case .rendering: return "video.download.rendering"
        case .downloading: return "video.download.downloading"
        case .saving: return "video.download.saving"
        case .finished: return "video.download.finished"
        case .failed: return "video.download.failedTitle"
        }
    }
}
