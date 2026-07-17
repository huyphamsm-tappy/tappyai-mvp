import Foundation

/// Navigation targets reachable from the Home screen. Each case maps 1:1 to a Web route.
/// The destination view for each case is registered by the owning feature module when it is built.
enum HomeDestination: Hashable {
    case conversation(id: String)
    case currency
    case translate
    case scan
    case vietContent
    case splitBill
    case fortune
    case recommendations
    case serviceDetail(ServiceDetail)
    case favorites
}
