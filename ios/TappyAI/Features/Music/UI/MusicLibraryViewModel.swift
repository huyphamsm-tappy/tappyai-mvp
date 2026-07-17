import Foundation
import Combine

@MainActor
final class MusicLibraryViewModel: AppObservableObject {
    @AppPublished var tracks: [MusicTrack] = []
    @AppPublished var categories: [MusicCategory] = []
    @AppPublished var activeCategoryId: String?
    @AppPublished var loading = true
    @AppPublished var error: String?
    @AppPublished var hasMore = false
    @AppPublished var page = 0

    @AppPublished var searchQuery = ""
    @AppPublished var searchResults: [MusicTrack] = []
    @AppPublished var searchLoading = false
    @AppPublished var searchError: String?

    @AppPublished var previewingTrackId: String?

    private let service: MusicService
    private var searchDebounceTask: Task<Void, Never>?
    private let log = AppLogger.music

    var isSearching: Bool {
        !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var displayTracks: [MusicTrack] {
        isSearching ? searchResults : tracks
    }

    var displayLoading: Bool {
        isSearching ? searchLoading : loading
    }

    var displayError: String? {
        isSearching ? searchError : error
    }

    init(service: MusicService) {
        self.service = service
    }

    // MARK: - Load categories

    func loadCategories() {
        Task {
            do {
                categories = try await service.getCategories()
            } catch {
                log.error("load music categories failed: \(error)")
            }
        }
    }

    // MARK: - Browse tracks (paginated)

    private var loadTask: Task<Void, Never>?

    func loadTracks() {
        loadTask?.cancel()
        loading = true
        error = nil
        page = 0

        loadTask = Task {
            do {
                let result = try await service.browseTracks(categoryId: activeCategoryId, page: 0)
                tracks = result.tracks
                hasMore = result.hasMore
                page = 1
            } catch {
                self.error = "Không thể tải danh sách nhạc"
                log.error("load music tracks failed: \(error)")
            }
            loading = false
        }
    }

    func loadMore() {
        guard !loading, hasMore else { return }
        loading = true

        Task {
            do {
                let result = try await service.browseTracks(categoryId: activeCategoryId, page: page)
                tracks.append(contentsOf: result.tracks)
                hasMore = result.hasMore
                page += 1
            } catch {
                log.error("load more music failed: \(error)")
            }
            loading = false
        }
    }

    // MARK: - Category selection

    func selectCategory(_ id: String?) {
        activeCategoryId = id
        loadTracks()
    }

    // MARK: - Search (300ms debounce, matching Web)

    func updateSearch(_ query: String) {
        searchQuery = query
        searchDebounceTask?.cancel()

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            searchResults = []
            searchLoading = false
            searchError = nil
            return
        }

        searchLoading = true
        searchError = nil

        searchDebounceTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            do {
                let result = try await service.searchTracks(query: trimmed)
                guard !Task.isCancelled else { return }
                searchResults = result.tracks
            } catch {
                guard !Task.isCancelled else { return }
                searchError = "Không thể tìm nhạc"
                log.error("music search failed: \(error)")
            }
            searchLoading = false
        }
    }

    // MARK: - Preview toggle

    func togglePreview(_ track: MusicTrack) {
        if previewingTrackId == track.id {
            previewingTrackId = nil
        } else {
            previewingTrackId = track.id
        }
    }

    func stopPreview() {
        previewingTrackId = nil
    }
}
