import Foundation

/// A ZIP archive written by hand, every entry STORED (no compression): Foundation has no ZIP writer, and a Word file (.docx) is a ZIP of small
/// XML parts for which compression is not needed. Layout: for each entry a local header and its bytes, then the central directory (one record
/// per entry), then the end-of-central-directory record. Names are UTF-8 (flag bit 11); the date and time are fixed, so the same input gives
/// the same bytes.
enum ZipStore {
    private static let crcTable: [UInt32] = (0..<256).map { n -> UInt32 in
        var c = UInt32(n)
        for _ in 0..<8 { c = (c & 1) != 0 ? (0xEDB88320 ^ (c >> 1)) : (c >> 1) }
        return c
    }

    /// The CRC-32 (the ZIP / PNG polynomial, reflected) of `data`.
    static func crc32(_ data: Data) -> UInt32 {
        var c: UInt32 = 0xFFFFFFFF
        for byte in data { c = crcTable[Int((c ^ UInt32(byte)) & 0xFF)] ^ (c >> 8) }
        return c ^ 0xFFFFFFFF
    }

    private static func le16(_ v: Int) -> [UInt8] { [UInt8(v & 0xFF), UInt8((v >> 8) & 0xFF)] }

    private static func le32(_ v: UInt32) -> [UInt8] {
        [UInt8(v & 0xFF), UInt8((v >> 8) & 0xFF), UInt8((v >> 16) & 0xFF), UInt8((v >> 24) & 0xFF)]
    }

    /// 1980-01-01 00:00:00 in DOS form.
    private static let dosDate = 33
    private static let utf8NameFlag = 0x0800

    /// The archive of `entries` in order (Word wants `[Content_Types].xml` first).
    static func archive(_ entries: [(name: String, data: Data)]) -> Data {
        var out: [UInt8] = []
        var central: [UInt8] = []
        for entry in entries {
            let name = Array(entry.name.utf8)
            let bytes = [UInt8](entry.data)
            let size = UInt32(bytes.count)
            let crc = ZipStore.crc32(entry.data)
            let offset = UInt32(out.count)

            out.append(contentsOf: le32(0x04034B50))      // local file header
            out.append(contentsOf: le16(20))              // version needed
            out.append(contentsOf: le16(utf8NameFlag))
            out.append(contentsOf: le16(0))               // method: stored
            out.append(contentsOf: le16(0))               // time
            out.append(contentsOf: le16(dosDate))
            out.append(contentsOf: le32(crc))
            out.append(contentsOf: le32(size))            // compressed size
            out.append(contentsOf: le32(size))            // uncompressed size
            out.append(contentsOf: le16(name.count))
            out.append(contentsOf: le16(0))               // extra length
            out.append(contentsOf: name)
            out.append(contentsOf: bytes)

            central.append(contentsOf: le32(0x02014B50))  // central directory header
            central.append(contentsOf: le16(20))          // version made by
            central.append(contentsOf: le16(20))          // version needed
            central.append(contentsOf: le16(utf8NameFlag))
            central.append(contentsOf: le16(0))           // method: stored
            central.append(contentsOf: le16(0))           // time
            central.append(contentsOf: le16(dosDate))
            central.append(contentsOf: le32(crc))
            central.append(contentsOf: le32(size))
            central.append(contentsOf: le32(size))
            central.append(contentsOf: le16(name.count))
            central.append(contentsOf: le16(0))           // extra length
            central.append(contentsOf: le16(0))           // comment length
            central.append(contentsOf: le16(0))           // disk number start
            central.append(contentsOf: le16(0))           // internal attributes
            central.append(contentsOf: le32(0))           // external attributes
            central.append(contentsOf: le32(offset))      // where the local header is
            central.append(contentsOf: name)
        }
        let centralOffset = UInt32(out.count)
        out.append(contentsOf: central)
        out.append(contentsOf: le32(0x06054B50))          // end of central directory
        out.append(contentsOf: le16(0))                   // this disk
        out.append(contentsOf: le16(0))                   // disk with the central directory
        out.append(contentsOf: le16(entries.count))
        out.append(contentsOf: le16(entries.count))
        out.append(contentsOf: le32(UInt32(central.count)))
        out.append(contentsOf: le32(centralOffset))
        out.append(contentsOf: le16(0))                   // comment length
        return Data(out)
    }
}
