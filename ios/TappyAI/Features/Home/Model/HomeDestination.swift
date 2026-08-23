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
    /// The sound library (`/music` on web, `MusicLibraryScreen` on Android). The screen and its
    /// view model already existed and its 29 catalogue keys already shipped; only this routing
    /// case, the Home tile and the shell registration were missing, so nothing could open it.
    case musicLibrary
    case recommendations
    case serviceDetail(ServiceDetail)
    case favorites
}
