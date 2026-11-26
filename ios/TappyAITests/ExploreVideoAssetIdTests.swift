import XCTest
@testable import TappyAI

/// 26/11 (owner UAT): a clip posted through the Explore pipeline showed «Không tải được clip này» in the feed and in the profile. The server, the CDN and
/// the cookie were checked by hand against production and all answered 200; the app asked for playback with the OWNER's id (the first uuid in
/// the path) instead of the clip's (the folder that holds the manifest), so the server answered 404.
final class ExploreVideoAssetIdTests: XCTestCase {

    private let owner = "f9077a52-b0f3-453a-a497-97da115ae386"
    private let asset = "9ad73f94-da7b-468a-9415-4ec1c2df7751"

    func testTheAssetIsTheFolderThatHoldsTheManifestNotTheOwner() throws {
        let url = try XCTUnwrap(URL(string: "https://media.tappyai.com/vdel/\(owner)/\(asset)/manifest.m3u8"))
        XCTAssertEqual(ExploreVideoPlayback.assetId(fromManifestURL: url), asset)
        XCTAssertNotEqual(ExploreVideoPlayback.assetId(fromManifestURL: url), owner)
    }

    func testAnAssetFolderThatIsNotAUuidIsStillTheAsset() throws {
        let url = try XCTUnwrap(URL(string: "https://media.tappyai.com/vdel/\(owner)/abcdefgh12345678/manifest.m3u8"))
        XCTAssertEqual(ExploreVideoPlayback.assetId(fromManifestURL: url), "abcdefgh12345678")
    }

    func testAManifestNotDirectlyInTheAssetFolderFallsBackToAUuidInThePath() throws {
        let url = try XCTUnwrap(URL(string: "https://media.tappyai.com/v/\(asset)/hls/manifest.m3u8"))
        XCTAssertEqual(ExploreVideoPlayback.assetId(fromManifestURL: url), asset)
    }

    func testPlaylistsAndOtherLinksAreNotAnAsset() throws {
        XCTAssertNil(ExploreVideoPlayback.assetId(fromManifestURL: try XCTUnwrap(URL(string: "https://media.tappyai.com/clip.mp4"))))
        XCTAssertNil(ExploreVideoPlayback.assetId(fromManifestURL: try XCTUnwrap(URL(string: "https://youtu.be/abc"))))
    }
}
