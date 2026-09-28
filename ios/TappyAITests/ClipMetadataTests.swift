import XCTest
@testable import TappyAI

/// GPS / device / creation-time metadata is removed from a clip before upload (server F-099).
final class ClipMetadataTests: XCTestCase {

    // MARK: - A tiny QuickTime file, built box by box

    private func box(_ type: String, _ payload: [UInt8]) -> [UInt8] {
        box(typeBytes: Array(type.utf8), payload)
    }

    private func box(typeBytes: [UInt8], _ payload: [UInt8]) -> [UInt8] {
        precondition(typeBytes.count == 4)
        let size = UInt32(8 + payload.count)
        return [UInt8(size >> 24), UInt8(size >> 16 & 0xff), UInt8(size >> 8 & 0xff), UInt8(size & 0xff)]
            + typeBytes + payload
    }

    /// version 0 full box: version+flags, creation, modification, then 12 more bytes.
    private func timedBox(_ type: String, created: UInt32) -> [UInt8] {
        let t = [UInt8(created >> 24), UInt8(created >> 16 & 0xff), UInt8(created >> 8 & 0xff), UInt8(created & 0xff)]
        return box(type, [0, 0, 0, 0] + t + t + [UInt8](repeating: 7, count: 12))
    }

    private let iso6709 = Array("+10.7769+106.7009/".utf8)
    private let mdatPayload: [UInt8] = Array(repeating: 0xab, count: 64)

    private func iphoneLikeClip() -> Data {
        // "©xyz" as QuickTime writes it: 0xA9 then "xyz" (one byte each, not UTF-8).
        let location = box(typeBytes: [0xa9] + Array("xyz".utf8), [0, 18, 0x15, 0xc7] + iso6709)
        let udta = box("udta", location)
        let keys = box("meta", Array("com.apple.quicktime.location.ISO6709".utf8) + iso6709)
        let trak = box("trak", timedBox("tkhd", created: 3_800_000_000)
                       + box("mdia", timedBox("mdhd", created: 3_800_000_000)))
        let moov = box("moov", timedBox("mvhd", created: 3_800_000_000) + trak + udta + keys)
        return Data(box("ftyp", Array("qt  ".utf8) + [0, 0, 0, 0]) + box("mdat", mdatPayload) + moov)
    }

    // MARK: - Tests

    func testAnIPhoneLikeClipIsRefusedAsIs() {
        let reasons = ClipMetadata.identifyingReasons(iphoneLikeClip())
        XCTAssertTrue(reasons.contains("metadata-box"))
        XCTAssertTrue(reasons.contains("location"))
        XCTAssertTrue(reasons.contains("creation-time"))
    }

    func testNeutralizedClipPassesTheServerRules() {
        let clean = ClipMetadata.neutralize(iphoneLikeClip())
        XCTAssertEqual(ClipMetadata.identifyingReasons(clean), [])
        XCTAssertNil(clean.range(of: Data(iso6709)), "the coordinates are gone from the bytes")
    }

    func testNeutralizingKeepsSizesAndMediaData() throws {
        let original = iphoneLikeClip()
        let clean = ClipMetadata.neutralize(original)
        XCTAssertEqual(clean.count, original.count, "no box changes size, so sample offsets stay valid")
        XCTAssertEqual(ClipMetadata.topLevelBoxes([UInt8](clean))?.map(\.type), ["ftyp", "mdat", "moov"])
        XCTAssertNotNil(clean.range(of: Data(mdatPayload)), "media bytes untouched")
    }

    func testNotAContainerIsReturnedUnchanged() {
        let junk = Data("not a video at all".utf8)
        XCTAssertEqual(ClipMetadata.neutralize(junk), junk)
    }

    func testJPEGExifIsDropped() {
        let soi: [UInt8] = [0xff, 0xd8]
        let app0: [UInt8] = [0xff, 0xe0, 0x00, 0x06] + Array("JFIF".utf8)
        let exif: [UInt8] = [0xff, 0xe1, 0x00, 0x0a] + Array("Exif".utf8) + [0, 0, 1, 2]
        let scan: [UInt8] = [0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x55, 0x66, 0xff, 0xd9]
        let stripped = [UInt8](ClipMetadata.stripJPEGMetadata(Data(soi + app0 + exif + scan)))
        XCTAssertEqual(stripped, soi + app0 + scan)
    }
}
