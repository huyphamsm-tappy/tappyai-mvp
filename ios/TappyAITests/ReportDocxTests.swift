import XCTest
@testable import TappyAI

/// The Deep Research report as a Word file (web `reportDocx.ts`, Android `ReportDocx.kt` / `ReportDocxTest`): Calibri 11 pt, lines at about 1.4
/// (line 336), room after each paragraph, sized headings, padded and bordered table cells, "page / pages" in the footer, https links clickable.
/// The package is a ZIP written by hand (STORE, no compression), so these tests read it back the way Word does: end record, central
/// directory, local headers, CRC32 of every part, and every XML part parsed.
final class ReportDocxTests: XCTestCase {
    private let report = "# Xe điện 2026\nMở đầu có **đậm**, *nghiêng* và [BYD](https://byd.com/a).\n\n## Doanh số\n- BYD dẫn đầu\n- Tesla thứ hai\n\n1. Một\n2. Hai\n\n| Hãng | Xe |\n|---|---|\n| BYD | 2,26 tr |\n\n> trích dẫn\n\n### Nguồn\n1. [BYD sales](https://byd.com/a)\n"

    private let partNames = ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/footer1.xml", "word/_rels/document.xml.rels"]

    // MARK: - A minimal STORE reader (what Word does with the package)

    private struct ReadEntry {
        let name: String
        let storedCrc: UInt32
        let data: Data
    }

    private func le16(_ b: [UInt8], _ at: Int) -> Int { Int(b[at]) | (Int(b[at + 1]) << 8) }
    private func le32(_ b: [UInt8], _ at: Int) -> UInt32 {
        UInt32(b[at]) | (UInt32(b[at + 1]) << 8) | (UInt32(b[at + 2]) << 16) | (UInt32(b[at + 3]) << 24)
    }

    private func readStoreZip(_ data: Data, file: StaticString = #filePath, line: UInt = #line) throws -> [ReadEntry] {
        let b = [UInt8](data)
        XCTAssertGreaterThan(b.count, 22, file: file, line: line)
        // the end record is the last 22 bytes (the writer adds no comment)
        let end = b.count - 22
        XCTAssertEqual(le32(b, end), 0x06054B50, "end of central directory signature", file: file, line: line)
        let count = le16(b, end + 10)
        let cdSize = Int(le32(b, end + 12))
        var at = Int(le32(b, end + 16))
        XCTAssertEqual(at + cdSize, end, "the central directory ends where the end record starts", file: file, line: line)
        var out: [ReadEntry] = []
        for _ in 0..<count {
            XCTAssertEqual(le32(b, at), 0x02014B50, "central directory signature", file: file, line: line)
            XCTAssertEqual(le16(b, at + 10), 0, "method STORE", file: file, line: line)
            let crc = le32(b, at + 16)
            let size = Int(le32(b, at + 20))
            XCTAssertEqual(Int(le32(b, at + 24)), size, "stored size = size", file: file, line: line)
            let nameLen = le16(b, at + 28)
            let extraLen = le16(b, at + 30)
            let commentLen = le16(b, at + 32)
            let local = Int(le32(b, at + 42))
            let name = String(decoding: b[(at + 46)..<(at + 46 + nameLen)], as: UTF8.self)
            XCTAssertEqual(le32(b, local), 0x04034B50, "local header signature", file: file, line: line)
            XCTAssertEqual(le32(b, local + 14), crc, "the local header carries the same CRC", file: file, line: line)
            let localNameLen = le16(b, local + 26)
            let localExtraLen = le16(b, local + 28)
            let start = local + 30 + localNameLen + localExtraLen
            out.append(ReadEntry(name: name, storedCrc: crc, data: Data(b[start..<(start + size)])))
            at += 46 + nameLen + extraLen + commentLen
        }
        return out
    }

    private func docxData(_ md: String? = nil, title: String = "Xe điện 2026") -> Data {
        writeReportDocx(title: title, markdown: md ?? report)
    }

    private func parts(_ md: String? = nil, title: String = "Xe điện 2026") throws -> [String: String] {
        var map: [String: String] = [:]
        for e in try readStoreZip(docxData(md, title: title)) { map[e.name] = String(decoding: e.data, as: UTF8.self) }
        return map
    }

    // MARK: - The package

    func testCrc32MatchesTheKnownValues() {
        XCTAssertEqual(ZipStore.crc32(Data()), 0)
        XCTAssertEqual(ZipStore.crc32(Data("a".utf8)), 0xE8B7BE43)
        XCTAssertEqual(ZipStore.crc32(Data("123456789".utf8)), 0xCBF43926)
    }

    func testItIsAZipWithTheLocalSignatureAndTheWordPartsInOrder() throws {
        let data = docxData()
        XCTAssertEqual([UInt8](data.prefix(4)), [0x50, 0x4B, 0x03, 0x04]) // "PK\x03\x04"
        let entries = try readStoreZip(data)
        XCTAssertEqual(entries.map { $0.name }, partNames)
    }

    func testEveryPartsCrcMatchesItsBytesAndEveryXmlPartParses() throws {
        for e in try readStoreZip(docxData()) {
            XCTAssertEqual(e.storedCrc, ZipStore.crc32(e.data), e.name)
            let parser = XMLParser(data: e.data)
            XCTAssertTrue(parser.parse(), "\(e.name): \(String(describing: parser.parserError))")
        }
    }

    func testTheArchiveWriterKeepsEachEntrysBytesAndNames() throws {
        let zip = ZipStore.archive([(name: "a.txt", data: Data("một".utf8)), (name: "dir/b.bin", data: Data([0, 1, 2, 255]))])
        let entries = try readStoreZip(zip)
        XCTAssertEqual(entries.map { $0.name }, ["a.txt", "dir/b.bin"])
        XCTAssertEqual(entries[0].data, Data("một".utf8))
        XCTAssertEqual(entries[1].data, Data([0, 1, 2, 255]))
    }

    // MARK: - The look

    func testItIsAWordPackageTheContentTypesNameEveryPart() throws {
        let p = try parts()
        for name in partNames { XCTAssertNotNil(p[name], name) }
        let types = try XCTUnwrap(p["[Content_Types].xml"])
        XCTAssertTrue(types.contains("/word/document.xml") && types.contains("/word/styles.xml") && types.contains("/word/footer1.xml"))
        XCTAssertTrue(try XCTUnwrap(p["_rels/.rels"]).contains("word/document.xml"))
    }

    func testTheDocumentFontCoversVietnameseAtElevenPointWithLinesAtAboutOnePointFourAndRoomAfterAParagraph() throws {
        let styles = try XCTUnwrap(try parts()["word/styles.xml"])
        XCTAssertTrue(styles.contains("w:ascii=\"Calibri\""))
        XCTAssertTrue(styles.contains("<w:sz w:val=\"22\"/>"))
        XCTAssertTrue(styles.contains("w:line=\"336\""))
        XCTAssertTrue(styles.contains("w:after=\"140\""))
    }

    func testHeadingsAreSizedAboveTheBodyTheTitleAboveTheHeadings() throws {
        let styles = try XCTUnwrap(try parts()["word/styles.xml"])
        func sizeOf(_ id: String) throws -> Int {
            let re = try NSRegularExpression(pattern: "w:styleId=\"\(id)\"[\\s\\S]*?<w:sz w:val=\"(\\d+)\"")
            let m = try XCTUnwrap(re.firstMatch(in: styles, range: NSRange(location: 0, length: (styles as NSString).length)))
            return try XCTUnwrap(Int((styles as NSString).substring(with: m.range(at: 1))))
        }
        let title = try sizeOf("Title"), h1 = try sizeOf("Heading1"), h2 = try sizeOf("Heading2"), h3 = try sizeOf("Heading3")
        XCTAssertGreaterThan(title, h1)
        XCTAssertGreaterThan(h1, h2)
        XCTAssertGreaterThan(h2, h3)
        XCTAssertGreaterThanOrEqual(h3, 24)
    }

    func testTheReportsBlocksBecomeWordBlocksTitleHeadingsBoldItalicATableWithPaddedCells() throws {
        let doc = try XCTUnwrap(try parts()["word/document.xml"])
        XCTAssertTrue(doc.contains("w:val=\"Title\""))
        XCTAssertTrue(doc.contains("w:val=\"Heading1\"")) // "##"
        XCTAssertTrue(doc.contains("w:val=\"Heading2\"")) // "###"
        XCTAssertTrue(doc.contains("<w:b/>"))
        XCTAssertTrue(doc.contains("<w:i/>"))
        XCTAssertTrue(doc.contains("<w:tbl>"))
        XCTAssertTrue(doc.contains("<w:tblCellMar>"))
        XCTAssertTrue(doc.contains(">Hãng<") && doc.contains(">2,26 tr<"))
        XCTAssertTrue(doc.contains("•")) // a bullet
        XCTAssertTrue(doc.contains(">1. <")) // a numbered item keeps its number
    }

    func testTheTitleArgumentIsUsedOnlyWhenTheTextHasNoTitleOfItsOwn() throws {
        let own = try XCTUnwrap(try parts("# Tiêu đề riêng\n\nChữ.", title: "Tên khác")["word/document.xml"])
        XCTAssertTrue(own.contains("Tiêu đề riêng") && !own.contains("Tên khác"))
        let none = try XCTUnwrap(try parts("Chỉ có chữ.", title: "Tên báo cáo")["word/document.xml"])
        XCTAssertTrue(none.contains("Tên báo cáo"))
    }

    func testAnHttpsLinkIsClickableAnotherSchemeIsOnlyItsLabel() throws {
        let p = try parts("Xem [BYD](https://byd.com/a) và [x](javascript:alert(1)).")
        let doc = try XCTUnwrap(p["word/document.xml"])
        let rels = try XCTUnwrap(p["word/_rels/document.xml.rels"])
        XCTAssertTrue(doc.contains("<w:hyperlink"))
        XCTAssertTrue(rels.contains("Target=\"https://byd.com/a\""))
        XCTAssertFalse(rels.contains("javascript"))
        XCTAssertTrue(doc.contains(">x<"))
    }

    func testTheFooterShowsThePageNumberOverThePageCount() throws {
        let footer = try XCTUnwrap(try parts()["word/footer1.xml"])
        XCTAssertTrue(footer.contains("w:instr=\"PAGE\"") && footer.contains("w:instr=\"NUMPAGES\""))
    }

    func testTextIsEscapedSoAReportWithMarkupCharactersCannotBreakTheFile() throws {
        let doc = try XCTUnwrap(try parts("Giá < 5 & > 3 \"ổn\"")["word/document.xml"])
        XCTAssertTrue(doc.contains("Giá &lt; 5 &amp; &gt; 3 &quot;ổn&quot;") || doc.contains("Giá &lt; 5 &amp; &gt; 3 \"ổn\""), doc)
        XCTAssertFalse(doc.contains("< 5"))
    }

    func testAControlCharacterInTheReportDoesNotCorruptTheWordFile() throws {
        func scalar(_ v: UInt8) -> String { String(Unicode.Scalar(v)) }
        let md = "# Báo cáo\n\nCó ký tự \(scalar(1)) và \(scalar(0x0B)) và \(scalar(0)) lạ.\n"
        let entries = try readStoreZip(docxData(md, title: "Báo cáo"))
        let xmlData = try XCTUnwrap(entries.first { $0.name == "word/document.xml" }).data
        let xml = String(decoding: xmlData, as: UTF8.self)
        XCTAssertTrue(xml.unicodeScalars.allSatisfy { $0.value >= 0x20 || $0 == "\t" || $0 == "\n" || $0 == "\r" })
        XCTAssertTrue(xml.contains("Có ký tự"))
        XCTAssertTrue(XMLParser(data: xmlData).parse())
    }

    // MARK: - Inline runs

    func testInlineRunsBoldItalicCodeAndHttpsLinksOnly() {
        XCTAssertEqual(
            inlineRuns("a **b** *c* `d` [e](https://x.example/) [f](javascript:y)"),
            [DocxRun("a "), DocxRun("b", bold: true), DocxRun(" "), DocxRun("c", italic: true), DocxRun(" "), DocxRun("d", code: true),
             DocxRun(" "), DocxRun("e", link: "https://x.example/"), DocxRun(" "), DocxRun("f")])
    }
}
