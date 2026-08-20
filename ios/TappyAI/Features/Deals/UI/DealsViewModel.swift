import Foundation

@MainActor
final class DealsViewModel: AppObservableObject {
    enum LoadState: Equatable { case idle, loading, loaded, failed }

    @AppPublished var state: LoadState = .idle
    @AppPublished var deals: [PartnerDeal] = []

    private let service: DealsService
    private let log = AppLogger.app

    init(service: DealsService) {
        self.service = service
    }

    func load(lang: String) async {
        state = .loading
        do {
            deals = try await service.fetchDeals(lang: lang)
            state = .loaded
        } catch {
            state = Task.isCancelled ? .idle : .failed
            log.error("deals load failed: \(error)")
        }
    }

    func openDeal(_ deal: PartnerDeal) {
        Task { await service.trackClick(dealId: deal.id) }
    }
}
