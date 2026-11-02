import XCTest
@testable import TappyAI

/// The remaining lifecycle sequences from the media UAT, at the `FeedVideoPlayer` level (what each screen's onDisappear / scenePhase calls):
/// Explore -> Profile, Explore -> background -> foreground, the profile clip viewer's dismissal, and the single-review screen.
@MainActor
final class FeedPlaybackLifecycleTests: XCTestCase {

    override func setUp() async throws { FeedVideoPlayer.pauseAll() }
    override func tearDown() async throws { FeedVideoPlayer.pauseAll() }

    func testExploreToProfileTabStopsTheFeedClip() {
        let explore = FeedVideoPlayer()
        explore.setActive(true)
        FeedVideoPlayer.pauseAll()                 // ReviewsFeedView.onDisappear when the Profile tab is selected
        XCTAssertFalse(explore.isPlaying)
        XCTAssertEqual(FeedVideoPlayer.playingCount, 0)
    }

    func testExploreToProfileViewerToDismissLeavesNothingPlaying() {
        let explore = FeedVideoPlayer(), viewerA = FeedVideoPlayer(), viewerB = FeedVideoPlayer()
        explore.setActive(true)
        FeedVideoPlayer.pauseAll()                 // leaving Explore
        viewerA.setActive(true)                    // a profile clip opens in the viewer (ReviewsFeedView with a seed)
        XCTAssertEqual([explore, viewerA, viewerB].map(\.isPlaying), [false, true, false])
        viewerB.setActive(true)                    // swipe to the profile's second clip
        XCTAssertEqual([explore, viewerA, viewerB].map(\.isPlaying), [false, false, true])
        FeedVideoPlayer.pauseAll()                 // the viewer is dismissed (its onDisappear)
        XCTAssertEqual([explore, viewerA, viewerB].map(\.isPlaying), [false, false, false])
        XCTAssertEqual(FeedVideoPlayer.playingCount, 0)
    }

    func testExploreToBackgroundThenForegroundResumesOnlyTheVisibleClip() {
        let a = FeedVideoPlayer(), b = FeedVideoPlayer()
        a.setActive(true)
        b.setActive(true)                          // b is the page on screen
        FeedVideoPlayer.pauseAll()                 // scenePhase != .active
        XCTAssertEqual(FeedVideoPlayer.playingCount, 0)
        b.setActive(true)                          // scenePhase == .active -> ReviewPostView re-activates the on-screen page only
        XCTAssertEqual([a, b].map(\.isPlaying), [false, true])
    }

    func testBackgroundingTwiceIsHarmless() {
        let a = FeedVideoPlayer()
        a.setActive(true)
        FeedVideoPlayer.pauseAll()
        FeedVideoPlayer.pauseAll()
        XCTAssertFalse(a.isPlaying)
        a.setActive(true)
        XCTAssertTrue(a.isPlaying)
    }

    func testSingleReviewScreenLeavingStopsItsClipAndTheFeedBehindStaysStopped() {
        let feedClip = FeedVideoPlayer(), detailClip = FeedVideoPlayer()
        feedClip.setActive(true)
        FeedVideoPlayer.pauseAll()                 // Explore disappears when a review is pushed
        detailClip.setActive(true)                 // ReviewDetailView's page
        XCTAssertEqual([feedClip, detailClip].map(\.isPlaying), [false, true])
        FeedVideoPlayer.pauseAll()                 // ReviewDetailView.onDisappear / backgrounding
        XCTAssertEqual([feedClip, detailClip].map(\.isPlaying), [false, false])
        XCTAssertEqual(FeedVideoPlayer.playingCount, 0)
    }
}
