import XCTest
@testable import TappyAI

/// Owner UAT 26/11: uploading a clip took very long because the file went up as the camera wrote it. A big clip is now exported smaller first;
/// a small one is sent as it is. (The export itself needs a real clip, so it is checked on the phone; the rule is checked here.)
final class ClipTranscoderTests: XCTestCase {

    func testAClipUpToFiftyMegabytesIsSentUntouched() {
        XCTAssertEqual(ClipTranscoder.skipBelowBytes, 50 * 1024 * 1024, "the owner's threshold, 26/11")
        XCTAssertFalse(ClipTranscoder.shouldTranscode(fileSize: 5 * 1024 * 1024))
        XCTAssertFalse(ClipTranscoder.shouldTranscode(fileSize: 49 * 1024 * 1024))
        XCTAssertFalse(ClipTranscoder.shouldTranscode(fileSize: ClipTranscoder.skipBelowBytes))
    }

    func testAClipOverFiftyMegabytesIsExportedSmallerFirst() {
        XCTAssertTrue(ClipTranscoder.shouldTranscode(fileSize: ClipTranscoder.skipBelowBytes + 1))
        XCTAssertTrue(ClipTranscoder.shouldTranscode(fileSize: 120 * 1024 * 1024))
    }

    func testAMissingFileIsNeverAnError() async {
        let nowhere = FileManager.default.temporaryDirectory.appendingPathComponent("no-such-clip-\(UUID().uuidString).mov")
        let copy = await ClipTranscoder.smallerCopy(of: nowhere)
        XCTAssertNil(copy, "no file, no copy: the caller uploads whatever it had")
    }
}
