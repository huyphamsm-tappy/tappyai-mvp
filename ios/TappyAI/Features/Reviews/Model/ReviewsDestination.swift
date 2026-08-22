import Foundation

/// Navigation targets that are reachable from MORE THAN ONE tab.
///
/// ============================================================================
/// WHY THIS IS NOT A CASE ON `ProfileDestination`
/// ============================================================================
/// A review detail is pushed from Explore (a feed post), from Profile (favourites, my posts) and
/// from Home (a recommendation), and a public profile is pushed from a review's author row, from
/// people search and from a comment. Putting those on one tab's enum would mean either that the
/// other tabs cannot reach them, or that each tab re-declares its own case for the same screen —
/// which is how `.deals` ended up with no destination at all.
///
/// One enum, registered once for every tab's `NavigationStack`, so pushing works from wherever the
/// user actually is and the back stack stays inside the tab they were in.
enum ReviewsDestination: Hashable {
    /// One review, by id — the web's `/reviews/{id}`.
    case reviewDetail(id: String)
    /// Someone else's public profile — the web's `/users/{id}`.
    case userProfile(id: String)
    /// A group-dining room — the web's `/group/{id}`.
    case group(id: String)
    /// The music copyright / notice-and-takedown policy — the web's `/copyright`.
    case copyrightPolicy
}
