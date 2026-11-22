import Foundation

@MainActor
final class DealsViewModel: AppObservableObject {
    enum LoadState: Equatable { case idle, loading, loaded, failed }

    @AppPublished var state: LoadState = .idle
    @AppPublished var deals: [PartnerDeal] = []
    /// The booking partners shown only when no managed deal is left (web `/deals`).
    @AppPublished var partnerCards: [DealPartnerCard] = []

    private let service: DealsService
    private let log = AppLogger.app

    init(service: DealsService) {
        self.service = service
    }

    func load(lang: String) async {
        state = .loading
        do {
            // Web (owner 20/11/2026): the page draws only the deals of Accesstrade, Lazada, Agoda and Vexere.
            deals = try await service.fetchDeals(lang: lang).filter { DealPartnerAllowlist.isAllowed($0.partnerName) }
            partnerCards = deals.isEmpty ? await service.fetchPartnerCards(lang: lang) : []
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
