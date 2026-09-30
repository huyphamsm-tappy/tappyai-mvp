import Foundation

/// Navigation targets reachable from the Home screen. Each case maps 1:1 to a Web route.
/// The destination view for each case is registered by the owning feature module when it is built.
enum HomeDestination: Hashable {
    case conversation(id: String)
    case currency
    case translate
    case scan
    case scamShield
    case vietContent
    case splitBill
    case fortune
    case recommendations
    case serviceDetail(ServiceDetail)
    case favorites
    /// The Smart Tools catalogue (web `/tools`) — Home's "Xem tất cả".
    case smartTools
    /// Tappy Together (group dining) — the Smart Tools "Nhóm ăn" card.
    case groupDining
    /// A chat scoped to one category (web `/chat?category=<id>`) — Home's category pills.
    case categoryChat(String)
}
