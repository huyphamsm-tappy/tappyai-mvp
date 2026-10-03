import Foundation

/// Which deal links the app may open. Parity with the Web: `partner_deals.official_url` is an `https://` URL by database
/// constraint (`20260724_partner_deals.sql`: `CHECK (official_url ~ '^https://')`, also checked by the admin API) and the
/// Web card is a plain link to `deal.officialUrl` — no affiliate parameter, no rewriting, no redirect. The app opens exactly
/// that URL and nothing else: `https` with a host. Anything else (a missing value, `http:`, `javascript:`, `tel:`, a
/// custom scheme) opens nothing.
///
/// There is NO affiliate URL in this contract: `affiliate_code` is "a schema placeholder only" and is never sent to clients
/// (`src/lib/deals/partnerDeals.ts`). Tracked ACCESSTRADE links exist only in the chat commerce path (`docs/commerce/AFFILIATE_STATUS.md`).
enum DealLink {
    static func url(from officialUrl: String) -> URL? {
        let trimmed = officialUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              !trimmed.unicodeScalars.contains(where: { $0.value < 0x21 || $0.value == 0x7f }),
              let url = URL(string: trimmed),
              url.scheme?.lowercased() == "https",
              let host = url.host, !host.isEmpty
        else { return nil }
        return url
    }
}
