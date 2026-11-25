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
        // Web (owner 20/11/2026): the page draws only the deals of Accesstrade, Lazada, Agoda and Vexere.
        // The partner cards (the booking partners with the server's tracked links) are ALWAYS loaded and shown first:
        // owner UAT 25/11, «tập trung vào ưu đãi của partner». A failure of one list does not hide the other (web
        // `DealsView.tsx` swallows the deals error and still loads the cards); only when both fail is it an error.
        async let cardsTask = service.fetchPartnerCards(lang: lang)
        var loadedDeals: [PartnerDeal] = []
        var dealsFailed = false
        do {
            loadedDeals = try await service.fetchDeals(lang: lang).filter { DealPartnerAllowlist.isAllowed($0.partnerName) }
        } catch {
            dealsFailed = true
            log.error("deals load failed: \(error)")
        }
        let cards = await cardsTask
        if Task.isCancelled { state = .idle; return }
        deals = loadedDeals
        partnerCards = cards
        state = (dealsFailed && cards.isEmpty) ? .failed : .loaded
    }

    func openDeal(_ deal: PartnerDeal) {
        Task { await service.trackClick(dealId: deal.id) }
    }
}
