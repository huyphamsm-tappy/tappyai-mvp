import XCTest
@testable import TappyAI

/// 03/11 (Explore): the clip swiped away from kept sounding when the next post was not a video, a long session kept every clip it had shown in
/// memory until iOS ended the app, and the feed wrote SwiftUI state while building a page. What these pin is the player side of those fixes.
@MainActor
final class FeedPlayerPoolTests: XCTestCase {

    private let url = URL(string: "https://example.com/clip.mp4")!

    override func setUp() async throws { FeedVideoPlayer.pauseAll(); FeedVideoPlayer.feedAudioUnlocked = false }
    override func tearDown() async throws { FeedVideoPlayer.pauseAll(); FeedVideoPlayer.feedAudioUnlocked = false }

    func testTheClipOnScreenStopsWhenThePageChangesEvenIfNothingElseActivates() {
        let a = FeedVideoPlayer()
        a.setActive(true)
        XCTAssertTrue(a.isPlaying)
        // The next post is a photo or a link post: no player activates, so nothing but this call can stop A.
        FeedVideoPlayer.deactivateActive()
        XCTAssertFalse(a.isPlaying, "the previous clip's sound stops when the swipe completes")
    }

    func testDeactivatingWhenNothingIsActiveIsHarmless() {
        FeedVideoPlayer.deactivateActive()
        FeedVideoPlayer.deactivateActive()
        XCTAssertEqual(FeedVideoPlayer.playingCount, 0)
    }

    func testAReleasedClipGivesItsItemBackAndLoadsAgain() {
        let p = FeedVideoPlayer()
        p.load(url: url)
        XCTAssertNotNil(p.player.currentItem)
        p.setActive(true)
        p.release()
        XCTAssertNil(p.player.currentItem, "the decoder and buffer are freed")
        XCTAssertFalse(p.isPlaying)
        p.load(url: url)
        XCTAssertNotNil(p.player.currentItem, "a page that needs the clip again can load it again")
    }

    func testAReleasedActiveClipIsNoLongerTheActiveOne() {
        let a = FeedVideoPlayer(), b = FeedVideoPlayer()
        a.setActive(true)
        a.release()
        b.setActive(true)
        XCTAssertTrue(b.isPlaying)
        XCTAssertFalse(a.isPlaying)
    }

    func testThePoolMakesOnePlayerPerPostAndReusesIt() {
        let pool = FeedPlayerPool()
        var made = 0
        let first = pool.player(for: "p1") { made += 1; return FeedVideoPlayer() }
        let again = pool.player(for: "p1") { made += 1; return FeedVideoPlayer() }
        XCTAssertTrue(first === again)
        XCTAssertEqual(made, 1)
        XCTAssertEqual(pool.count, 1)
    }

    func testPruningKeepsTheNearbyPostsAndReleasesTheRest() {
        let pool = FeedPlayerPool()
        let ids = (0..<6).map(String.init)
        let players = ids.map { id in pool.player(for: id) { FeedVideoPlayer() } }
        for p in players { p.load(url: url) }
        pool.prune(keeping: ["2", "3", "4"])
        XCTAssertEqual(pool.count, 3)
        for (i, p) in players.enumerated() {
            if (2...4).contains(i) { XCTAssertNotNil(p.player.currentItem, "post \(i) is near the one on screen") }
            else { XCTAssertNil(p.player.currentItem, "post \(i) is far away: its video is out of memory") }
        }
    }

    func testPruningEverythingEmptiesThePool() {
        let pool = FeedPlayerPool()
        _ = pool.player(for: "a") { FeedVideoPlayer() }
        _ = pool.player(for: "b") { FeedVideoPlayer() }
        pool.prune(keeping: [])
        XCTAssertEqual(pool.count, 0)
    }
}
