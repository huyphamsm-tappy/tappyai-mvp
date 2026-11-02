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
    /// A SEQUENCE of posts opened at one of them — the web's `ClipViewer posts={…} startIndex={…}` that the profile grid opens: the
    /// clips of that profile, starting at the tapped one, swipeable to the others. `seedId` names the list in `ClipSeedStore`.
    case clipViewer(seedId: String, start: Int)
    /// Someone else's public profile — the web's `/users/{id}`.
    case userProfile(id: String)
    /// A group-dining room — the web's `/group/{id}`.
    case group(id: String)
    /// The music copyright / notice-and-takedown policy — the web's `/copyright`.
    case copyrightPolicy
}

/// The posts a clip viewer was opened with (a navigation value must be `Hashable`; the posts travel by id).
@MainActor
enum ClipSeedStore {
    private static var seeds: [String: [Review]] = [:]

    /// Remembers `posts` and returns the id to put in `ReviewsDestination.clipViewer`.
    static func put(_ posts: [Review]) -> String {
        let id = UUID().uuidString
        seeds[id] = posts
        if seeds.count > 8, let oldest = seeds.keys.sorted().first, oldest != id { seeds[oldest] = nil }
        return id
    }

    static func posts(for id: String) -> [Review] { seeds[id] ?? [] }

    /// The destination that opens `posts[start]` with the rest of `posts` one swipe away.
    static func destination(posts: [Review], start: Int) -> ReviewsDestination {
        .clipViewer(seedId: put(posts), start: max(0, min(start, max(0, posts.count - 1))))
    }
}
