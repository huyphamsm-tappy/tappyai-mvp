import Foundation

/// Removes identifying metadata — GPS location above all — from a clip before it is uploaded.
///
/// rc/web-uat's upload completion (`src/lib/media/uploadCompletion.ts`, F-099) refuses a video or
/// video thumbnail that still carries location / device / author metadata or non-zero creation
/// times, with `422 identifying_metadata`, and deletes the object. An iPhone .mov carries all of
/// them (`©xyz` / `com.apple.quicktime.location.ISO6709` in `udta` / `meta`). The web client
/// neutralises the file before upload (`neutralizeClipMetadata` in `src/lib/media/clipMetadata.ts`);
/// this is a byte-for-byte port of the same rules, so the file passes the same check:
///
/// - every `udta` / `meta` box inside `moov` (and at top level) is retyped to `free` and zeroed;
/// - a top-level XMP `uuid` box is blanked the same way;
/// - the creation / modification times in `mvhd`, `tkhd`, `mdhd` are zeroed.
///
/// Box sizes never change, so every sample offset (`stco` / `co64`) stays valid and the video plays
/// exactly as before. A file that is not a recognisable ISO-BMFF container is returned unchanged.
enum ClipMetadata {
    private static let maxMoovBytes = 32 * 1024 * 1024
    private static let maxTopLevelBoxes = 64
    private static let xmpUUID: [UInt8] = [0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8,
                                           0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac]
    private static let containers: Set<String> = ["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf"]
    private static let metadataBoxes: Set<String> = ["udta", "meta"]
    private static let timeBoxes: Set<String> = ["mvhd", "tkhd", "mdhd"]
    private static let firstBoxTypes: Set<String> = ["ftyp", "wide", "free", "mdat", "moov", "skip", "uuid", "pnot"]

    struct Box: Equatable {
        let type: String
        let offset: Int
        let size: Int
        let headerLength: Int
    }

    // MARK: - Neutralise

    static func neutralize(_ data: Data) -> Data {
        var bytes = [UInt8](data)
        guard let boxes = topLevelBoxes(bytes) else { return data }
        for box in boxes where box.size <= maxMoovBytes {
            if box.type == "moov" {
                walk(&bytes, start: box.offset + box.headerLength, end: box.offset + box.size) { bytes, type, offset, size in
                    if metadataBoxes.contains(type) {
                        blank(&bytes, offset: offset, size: size)
                        return false
                    }
                    if timeBoxes.contains(type) {
                        for (at, length) in timeFields(bytes, offset: offset) where at + length <= bytes.count {
                            for i in at..<(at + length) { bytes[i] = 0 }
                        }
                    }
                    return true
                }
            } else if metadataBoxes.contains(box.type) || isXMP(bytes, box) {
                blank(&bytes, offset: box.offset, size: box.size)
            }
        }
        return Data(bytes)
    }

    // MARK: - Check (the server's rules, for tests and diagnostics)

    /// The subset of the server's `findIdentifyingMetadata` reasons that concern a clip.
    static func identifyingReasons(_ data: Data) -> Set<String> {
        let bytes = [UInt8](data)
        guard let boxes = topLevelBoxes(bytes), boxes.contains(where: { $0.type == "moov" }) else {
            return ["unrecognised-format"]
        }
        var reasons = Set<String>()
        for box in boxes {
            if isXMP(bytes, box) { reasons.insert("xmp") }
            if metadataBoxes.contains(box.type) { reasons.insert("metadata-box") }
            guard box.type == "moov" else { continue }
            var copy = bytes
            walk(&copy, start: box.offset + box.headerLength, end: box.offset + box.size) { bytes, type, offset, size in
                if metadataBoxes.contains(type) {
                    reasons.insert("metadata-box")
                    let text = String(decoding: bytes[offset..<(offset + size)], as: UTF8.self).lowercased()
                    if text.contains("xyz") || text.contains("location") || text.contains("iso6709") {
                        reasons.insert("location")
                    }
                    return false
                }
                if timeBoxes.contains(type),
                   timeFields(bytes, offset: offset).contains(where: { at, length in
                       at + length <= bytes.count && bytes[at..<(at + length)].contains { $0 != 0 }
                   }) {
                    reasons.insert("creation-time")
                }
                return true
            }
        }
        return reasons
    }

    // MARK: - JPEG thumbnail

    /// Drops APP1 segments (Exif, XMP) from a JPEG — the server refuses a `videoThumbnail` that
    /// carries either. Everything else, including the image data, is kept byte for byte.
    static func stripJPEGMetadata(_ data: Data) -> Data {
        let bytes = [UInt8](data)
        guard bytes.count > 4, bytes[0] == 0xff, bytes[1] == 0xd8 else { return data }
        var out: [UInt8] = [0xff, 0xd8]
        var p = 2
        while p + 4 <= bytes.count, bytes[p] == 0xff {
            let marker = bytes[p + 1]
            if marker == 0xda { break }                          // start of scan: the rest is image data
            let length = (Int(bytes[p + 2]) << 8) + Int(bytes[p + 3])
            guard length >= 2, p + 2 + length <= bytes.count else { return data }
            if marker != 0xe1 { out.append(contentsOf: bytes[p..<(p + 2 + length)]) }
            p += 2 + length
        }
        out.append(contentsOf: bytes[p...])
        return Data(out)
    }

    // MARK: - Box parsing (same bounds as the web)

    static func topLevelBoxes(_ bytes: [UInt8]) -> [Box]? {
        var out: [Box] = []
        var p = 0
        let total = bytes.count
        while p + 8 <= total, out.count < maxTopLevelBoxes {
            var size = Int(u32(bytes, p))
            let type = typeAt(bytes, p + 4)
            var header = 8
            if size == 1 {
                guard p + 16 <= total else { return nil }
                size = Int(u32(bytes, p + 8)) << 32 + Int(u32(bytes, p + 12))
                header = 16
            } else if size == 0 {
                size = total - p
            }
            guard isPrintableType(bytes, p + 4), size >= header, p + size <= total else {
                return p == 0 ? nil : out
            }
            out.append(Box(type: type, offset: p, size: size, headerLength: header))
            p += size
        }
        guard let first = out.first, firstBoxTypes.contains(first.type) else { return nil }
        return out
    }

    private static func walk(_ bytes: inout [UInt8], start: Int, end: Int,
                             _ visit: (inout [UInt8], String, Int, Int) -> Bool) {
        var p = start
        while p + 8 <= end {
            var size = Int(u32(bytes, p))
            let type = typeAt(bytes, p + 4)
            var header = 8
            if size == 1 {
                guard p + 16 <= end else { return }
                size = Int(u32(bytes, p + 8)) << 32 + Int(u32(bytes, p + 12))
                header = 16
            } else if size == 0 {
                size = end - p
            }
            guard size >= header, p + size <= end else { return }
            let descend = visit(&bytes, type, p, size)
            if descend, containers.contains(type) {
                walk(&bytes, start: p + header, end: p + size, visit)
            }
            p += size
        }
    }

    private static func blank(_ bytes: inout [UInt8], offset: Int, size: Int) {
        let header = u32(bytes, offset) == 1 ? 16 : 8
        for (i, c) in "free".utf8.enumerated() { bytes[offset + 4 + i] = c }
        for i in (offset + header)..<(offset + size) { bytes[i] = 0 }
    }

    /// Creation and modification time of a full box (version 1: 64-bit, else 32-bit).
    private static func timeFields(_ bytes: [UInt8], offset: Int) -> [(Int, Int)] {
        guard offset + 8 < bytes.count else { return [] }
        let base = offset + 12
        return bytes[offset + 8] == 1 ? [(base, 8), (base + 8, 8)] : [(base, 4), (base + 4, 4)]
    }

    private static func isXMP(_ bytes: [UInt8], _ box: Box) -> Bool {
        let start = box.offset + box.headerLength
        guard box.type == "uuid", start + 16 <= bytes.count else { return false }
        return Array(bytes[start..<(start + 16)]) == xmpUUID
    }

    private static func u32(_ b: [UInt8], _ o: Int) -> UInt32 {
        guard o + 4 <= b.count else { return 0 }
        return UInt32(b[o]) << 24 | UInt32(b[o + 1]) << 16 | UInt32(b[o + 2]) << 8 | UInt32(b[o + 3])
    }

    private static func typeAt(_ b: [UInt8], _ o: Int) -> String {
        guard o + 4 <= b.count else { return "" }
        return String(decoding: b[o..<(o + 4)], as: Unicode.ASCII.self)
    }

    /// Printable ASCII or © (0xA9), as the web's `/^[\x20-\x7e\xa9]{4}$/`.
    private static func isPrintableType(_ b: [UInt8], _ o: Int) -> Bool {
        guard o + 4 <= b.count else { return false }
        return b[o..<(o + 4)].allSatisfy { (0x20...0x7e).contains($0) || $0 == 0xa9 }
    }
}
