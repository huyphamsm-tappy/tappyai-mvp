import XCTest
@testable import TappyAI

/// UAT build 129 (media): a clip swiped away from kept playing, kept playing after leaving Explore, needed two taps before any sound,
/// and a profile's second clip could not be reached. The invariant these pin: ONLY THE ACTIVE CLIP MAY PLAY.
@MainActor
final class FeedPlaybackTests: XCTestCase {

    override func setUp() async throws {
        FeedVideoPlayer.pauseAll()
        FeedVideoPlayer.feedAudioUnlocked = false
    }

    override func tearDown() async throws {
        FeedVideoPlayer.pauseAll()
        FeedVideoPlayer.feedAudioUnlocked = false
    }

    func testSwipingFromAToBStopsA() {
        let a = FeedVideoPlayer(), b = FeedVideoPlayer()
        a.setActive(true)
        XCTAssertTrue(a.isPlaying)
        // The page controller never tells A it is inactive; activating B must be enough.
        b.setActive(true)
        XCTAssertFalse(a.isPlaying, "the clip swiped away from stops at once")
        XCTAssertTrue(b.isPlaying)
    }

    func testOnlyOneClipIsActiveWhateverTheOrder() {
        let players = (0..<4).map { _ in FeedVideoPlayer() }
        for p in players { p.setActive(true) }
        XCTAssertEqual(players.filter(\.isPlaying).count, 1)
        XCTAssertTrue(players[3].isPlaying)
        players[1].setActive(true)
        XCTAssertEqual(players.filter(\.isPlaying).count, 1)
        XCTAssertTrue(players[1].isPlaying)
    }

    func testLeavingExploreStopsEveryClipAndReopeningResumesOne() {
        let a = FeedVideoPlayer(), b = FeedVideoPlayer()
        b.setActive(true)
        FeedVideoPlayer.pauseAll()
        XCTAssertFalse(a.isPlaying)
        XCTAssertFalse(b.isPlaying, "no clip keeps playing outside Explore")
        // Back on Explore: the page that is on screen activates again.
        b.setActive(true)
        XCTAssertTrue(b.isPlaying)
        XCTAssertFalse(a.isPlaying)
    }

    func testAPageThatDisappearsStopsItsClip() {
        let a = FeedVideoPlayer()
        a.setActive(true)
        a.setActive(false)   // what the page's onDisappear does
        XCTAssertFalse(a.isPlaying)
    }

    func testTheFirstTapUnlocksSoundAndTheClipKeepsPlaying() {
        let p = FeedVideoPlayer()
        p.setActive(true)
        XCTAssertTrue(p.isMuted, "autoplay starts muted (the Web policy)")
        p.handleTap()
        XCTAssertFalse(p.isMuted, "ONE tap turns the sound on")
        XCTAssertTrue(p.isPlaying, "…and does not pause the clip")
        p.handleTap()
        XCTAssertFalse(p.isPlaying, "once sound is on, a tap pauses")
        p.handleTap()
        XCTAssertTrue(p.isPlaying)
        XCTAssertFalse(p.isMuted)
    }

    func testTheNextClipStartsWithSoundOnceTheFeedIsUnlocked() {
        let a = FeedVideoPlayer(), b = FeedVideoPlayer()
        a.setActive(true)
        a.handleTap()
        b.setActive(true)
        XCTAssertFalse(b.isMuted, "sound stays on for the clips that follow")
        XCTAssertFalse(a.isPlaying)
    }

    func testAPausedClipThatIsTappedWhileMutedResumesWithSound() {
        let p = FeedVideoPlayer()
        p.setActive(true)
        p.togglePlay()          // paused by the person while still muted
        XCTAssertFalse(p.isPlaying)
        p.handleTap()
        XCTAssertTrue(p.isPlaying)
        XCTAssertFalse(p.isMuted)
    }

    // MARK: - The sequences the UAT asked for

    func testAThenBThenCLeavesOnlyCPlaying() {
        let a = FeedVideoPlayer(), b = FeedVideoPlayer(), c = FeedVideoPlayer()
        a.setActive(true); b.setActive(true); c.setActive(true)
        XCTAssertEqual([a, b, c].map(\.isPlaying), [false, false, true])
    }

    func testBackToAStopsB() {
        let a = FeedVideoPlayer(), b = FeedVideoPlayer()
        a.setActive(true); b.setActive(true)
        a.setActive(true)
        XCTAssertEqual([a, b].map(\.isPlaying), [true, false])
    }

    func testExploreToHomeOrProfileStopsEverything() {
        let a = FeedVideoPlayer(), b = FeedVideoPlayer()
        a.setActive(true); b.setActive(true)
        FeedVideoPlayer.pauseAll()        // the feed's onDisappear (another tab, or a pushed screen)
        XCTAssertEqual([a, b].map(\.isPlaying), [false, false])
        XCTAssertEqual(FeedVideoPlayer.playingCount, 0, "no player is producing sound or pictures")
    }

    func testBackgroundThenForegroundResumesOnlyTheClipOnScreen() {
        let a = FeedVideoPlayer(), b = FeedVideoPlayer()
        b.setActive(true)
        FeedVideoPlayer.pauseAll()        // scenePhase != .active
        XCTAssertEqual([a, b].map(\.isPlaying), [false, false])
        b.setActive(true)                 // scenePhase == .active: the page on screen re-activates
        XCTAssertEqual([a, b].map(\.isPlaying), [false, true])
    }

    func testSoundStaysUnlockedAcrossLeavingAndReturning() {
        let a = FeedVideoPlayer()
        a.setActive(true)
        a.handleTap()
        XCTAssertFalse(a.isMuted)
        FeedVideoPlayer.pauseAll()
        let again = FeedVideoPlayer()     // returning to a clip: a fresh page, same session
        again.setActive(true)
        XCTAssertFalse(again.isMuted, "the person already unlocked sound this session")
        XCTAssertTrue(again.isPlaying)
    }

    func testASharedClipDetailPlayerNeverOverlapsTheFeed() {
        let feed = FeedVideoPlayer(), detail = FeedVideoPlayer()
        feed.setActive(true)
        detail.setActive(true)            // a shared link opens the detail while the feed was playing
        XCTAssertEqual([feed, detail].map(\.isPlaying), [false, true])
        FeedVideoPlayer.pauseAll()        // leaving the detail
        XCTAssertFalse(detail.isPlaying)
    }

    // MARK: - A profile's clip viewer

    func testTheViewerOpensAtTheTappedClipAndKeepsTheWholeList() throws {
        let posts = try (1...3).map {
            try ResponseDecoder.json.decode(Review.self, from: Data(#"{"id":"r\#($0)","content_type":"video","source_type":"upload","media_url":"https://x/v\#($0).mp4"}"#.utf8))
        }
        guard case .clipViewer(let seedId, let start) = ClipSeedStore.destination(posts: posts, start: 1) else { return XCTFail("clip viewer destination") }
        XCTAssertEqual(start, 1)
        XCTAssertEqual(ClipSeedStore.posts(for: seedId).map(\.id), ["r1", "r2", "r3"], "the second clip is one swipe away")
        guard case .clipViewer(_, let clamped) = ClipSeedStore.destination(posts: posts, start: 99) else { return XCTFail() }
        XCTAssertEqual(clamped, 2, "an out-of-range start is clamped")

        let vm = ReviewsFeedViewModel(service: ReviewsService(api: MockAPIClient()), session: SessionStore(storage: InMemoryTokenStorage()))
        vm.seed(posts, start: 1)
        XCTAssertEqual(vm.reviews.count, 3)
        XCTAssertEqual(vm.activeIndex, 1)
    }
}
