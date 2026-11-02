import Foundation

// The finished Deep Research report as a Word file (.docx), written without a library: the XML parts below packed by `ZipStore`. The same look as
// the web's reportDocx.ts (after its 01/11 fix) and Android's ReportDocx.kt: Calibri 11 pt (covers Vietnamese), lines at about 1.4, room after
// each paragraph, sized headings, bordered and padded table cells, "page / pages" in the footer, https links clickable. Built on the phone from
// the report text; nothing is sent anywhere.

/// One run of inline text: bold, italic, code or an https link (web `inlineRuns`).
struct DocxRun: Equatable, Sendable {
    var text: String
    var bold: Bool
    var italic: Bool
    var code: Bool
    var link: String?

    init(_ text: String, bold: Bool = false, italic: Bool = false, code: Bool = false, link: String? = nil) {
        self.text = text
        self.bold = bold
        self.italic = italic
        self.code = code
        self.link = link
    }
}

private func docxRegex(_ pattern: String) -> NSRegularExpression? { try? NSRegularExpression(pattern: pattern) }

private func docxGroups(_ pattern: String, _ s: String) -> [String]? {
    guard let re = docxRegex(pattern) else { return nil }
    let ns = s as NSString
    guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
    return (0..<m.numberOfRanges).map { i in
        m.range(at: i).location == NSNotFound ? "" : ns.substring(with: m.range(at: i))
    }
}

private func docxTrim(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

/// Inline Markdown as runs: bold, italic, code, links (https only; any other link keeps its label). Pure.
func inlineRuns(_ s: String) -> [DocxRun] {
    guard let re = docxRegex(#"\*\*([^*]+)\*\*|\*([^\s*](?:[^*\n]*[^\s*])?)\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)"#) else { return [DocxRun(s)] }
    let ns = s as NSString
    var out: [DocxRun] = []
    var at = 0
    for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
        if m.range.location > at { out.append(DocxRun(ns.substring(with: NSRange(location: at, length: m.range.location - at)))) }
        func group(_ i: Int) -> String { m.range(at: i).location == NSNotFound ? "" : ns.substring(with: m.range(at: i)) }
        if !group(1).isEmpty {
            out.append(DocxRun(group(1), bold: true))
        } else if !group(2).isEmpty {
            out.append(DocxRun(group(2), italic: true))
        } else if !group(3).isEmpty {
            out.append(DocxRun(group(3), code: true))
        } else if OneBrainFrames.isSafeHttpsUrl(group(5)) {
            out.append(DocxRun(group(4), link: group(5)))
        } else {
            out.append(DocxRun(group(4)))
        }
        at = m.range.location + m.range.length
    }
    if at < ns.length { out.append(DocxRun(ns.substring(from: at))) }
    return out.map { run -> DocxRun in
        var r = run
        r.text = r.text.replacingOccurrences(of: "\n", with: " ")
        return r
    }.filter { !$0.text.isEmpty }
}

// MARK: - Blocks

private enum DocxBlock {
    case heading(Int, String)
    case para(String)
    case bullet(String, Int)
    case numbered(String, String)
    case quote(String)
    case code([String])
    case table([[String]])
    case rule
}

private let docxTableSeparator = #"^\|?\s*:?-{2,}[\s:|-]*$"#

private func docxCells(_ line: String) -> [String] {
    var t = docxTrim(line)
    if t.hasPrefix("|") { t.removeFirst() }
    if t.hasSuffix("|") { t.removeLast() }
    // `\|` is a pipe inside a cell, not a column break (GFM).
    return t.replacingOccurrences(of: "\\|", with: "\u{E000}").components(separatedBy: "|")
        .map { docxTrim($0).replacingOccurrences(of: "\u{E000}", with: "|") }
}

private func docxParseBlocks(_ markdown: String) -> [DocxBlock] {
    let normalised = markdown.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
    let lines = normalised.components(separatedBy: "\n")
    var out: [DocxBlock] = []
    var para = ""
    func flush() {
        if !docxTrim(para).isEmpty { out.append(.para(docxTrim(para))) }
        para = ""
    }
    var i = 0
    while i < lines.count {
        let t = docxTrim(lines[i])
        if t.isEmpty {
            flush()
            i += 1
        } else if t.hasPrefix("```") {
            flush()
            var code: [String] = []
            i += 1
            while i < lines.count && !docxTrim(lines[i]).hasPrefix("```") {
                code.append(lines[i])
                i += 1
            }
            i += 1
            out.append(.code(code))
        } else if let m = docxGroups(#"^(#{1,6})\s+(.*)$"#, t) {
            flush()
            out.append(.heading(m[1].count, docxTrim(m[2])))
            i += 1
        } else if t.hasPrefix("|") && i + 1 < lines.count && docxGroups(docxTableSeparator, docxTrim(lines[i + 1])) != nil {
            flush()
            var rows: [[String]] = []
            var k = i
            while k < lines.count && docxTrim(lines[k]).hasPrefix("|") {
                if k != i + 1 { rows.append(docxCells(lines[k])) }
                k += 1
            }
            out.append(.table(rows))
            i = k
        } else if docxGroups(#"^(-{3,}|\*{3,}|_{3,})$"#, t) != nil {
            flush()
            out.append(.rule)
            i += 1
        } else if let m = docxGroups(#"^(\s*)[-*+]\s+(.*)$"#, lines[i]) {
            flush()
            out.append(.bullet(docxTrim(m[2]), m[1].count / 2))
            i += 1
        } else if let m = docxGroups(#"^(\s*)(\d{1,3})[.)]\s+(.*)$"#, lines[i]) {
            flush()
            out.append(.numbered(m[2], docxTrim(m[3])))
            i += 1
        } else if t.hasPrefix(">") {
            flush()
            out.append(.quote(docxTrim(String(t.dropFirst()))))
            i += 1
        } else {
            if !para.isEmpty { para += " " }
            para += t
            i += 1
        }
    }
    flush()
    return out
}

// MARK: - XML

/// XML 1.0 forbids the control characters (all but tab, line feed, carriage return) and U+FFFE / U+FFFF: one in the text makes Word call the
/// file corrupt. They come from web pages through the model, so they are dropped.
private func docxEscape(_ s: String) -> String {
    var kept = String.UnicodeScalarView()
    for u in s.unicodeScalars {
        let v = u.value
        if v <= 0x08 || v == 0x0B || v == 0x0C || (v >= 0x0E && v <= 0x1F) || v == 0xFFFE || v == 0xFFFF { continue }
        kept.append(u)
    }
    return String(kept)
        .replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
        .replacingOccurrences(of: "\"", with: "&quot;")
}

private final class DocxRels {
    var urls: [String] = []

    /// rId1 is the styles part and rId2 the footer; hyperlinks start at rId11.
    func link(_ url: String) -> String {
        urls.append(url)
        return "rId\(urls.count + 10)"
    }
}

private func docxRunsXml(_ text: String, _ rels: DocxRels, boldAll: Bool = false) -> String {
    var xml = ""
    for r in inlineRuns(text) {
        // CT_RPr order: rStyle, rFonts, b, i
        var rpr = ""
        if r.link != nil { rpr += #"<w:rStyle w:val="Hyperlink"/>"# }
        if r.code { rpr += #"<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>"# }
        if r.bold || boldAll { rpr += "<w:b/>" }
        if r.italic { rpr += "<w:i/>" }
        var run = "<w:r>"
        if !rpr.isEmpty { run += "<w:rPr>" + rpr + "</w:rPr>" }
        run += #"<w:t xml:space="preserve">"# + docxEscape(r.text) + "</w:t></w:r>"
        if let link = r.link {
            xml += #"<w:hyperlink r:id=""# + rels.link(link) + #"">"# + run + "</w:hyperlink>"
        } else {
            xml += run
        }
    }
    return xml
}

private func docxPara(style: String?, ind: String, inner: String) -> String {
    var xml = "<w:p>"
    if style != nil || !ind.isEmpty {
        xml += "<w:pPr>"
        if let style { xml += #"<w:pStyle w:val=""# + style + #""/>"# }
        xml += ind + "</w:pPr>"
    }
    return xml + inner + "</w:p>"
}

/// A4 11906 - 2 x 1134 margins, in twentieths of a point.
private let docxTextWidth = 9638

private func docxTable(_ rows: [[String]], _ rels: DocxRels) -> String {
    let cols = max(rows.map { $0.count }.max() ?? 1, 1)
    let w = docxTextWidth / cols
    var borders = ""
    for side in ["top", "left", "bottom", "right", "insideH", "insideV"] {
        borders += "<w:\(side) " + #"w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>"#
    }
    var grid = "<w:tblGrid>"
    for _ in 0..<cols { grid += "<w:gridCol w:w=\"\(w)\"/>" }
    grid += "</w:tblGrid>"
    var trs = ""
    for (r, cells) in rows.enumerated() {
        trs += "<w:tr>"
        for c in 0..<cols {
            let shade = r == 0 ? #"<w:shd w:val="clear" w:color="auto" w:fill="EEF2FA"/>"# : ""
            trs += "<w:tc><w:tcPr><w:tcW w:w=\"\(w)\" w:type=\"dxa\"/>" + shade + "</w:tcPr>"
            trs += #"<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>"#
            trs += docxRunsXml(c < cells.count ? cells[c] : "", rels, boldAll: r == 0) + "</w:p></w:tc>"
        }
        trs += "</w:tr>"
    }
    var mar = "<w:tblCellMar>"
    mar += #"<w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/>"#
    mar += "</w:tblCellMar>"
    var xml = "<w:tbl><w:tblPr><w:tblW w:w=\"\(docxTextWidth)\" w:type=\"dxa\"/><w:tblBorders>" + borders + "</w:tblBorders>"
    xml += #"<w:tblLayout w:type="fixed"/>"# + mar + "</w:tblPr>" + grid + trs + "</w:tbl><w:p/>"
    return xml
}

private let wNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
private let rNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
private let xmlDecl = #"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>"#

private func docxHeadingStyle(_ id: String, _ name: String, _ size: Int, _ before: Int, _ after: Int, _ color: String) -> String {
    var xml = "<w:style w:type=\"paragraph\" w:styleId=\"\(id)\"><w:name w:val=\"\(name)\"/><w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:qFormat/>"
    xml += "<w:pPr><w:keepNext/><w:spacing w:before=\"\(before)\" w:after=\"\(after)\" w:line=\"300\" w:lineRule=\"auto\"/></w:pPr>"
    xml += "<w:rPr><w:b/><w:color w:val=\"\(color)\"/><w:sz w:val=\"\(size)\"/><w:szCs w:val=\"\(size)\"/></w:rPr></w:style>"
    return xml
}

private func docxStyles() -> String {
    var xml = xmlDecl + "<w:styles xmlns:w=\"\(wNS)\">"
    xml += "<w:docDefaults><w:rPrDefault><w:rPr>"
    xml += #"<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="vi-VN"/>"#
    xml += "</w:rPr></w:rPrDefault>"
    xml += #"<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="336" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>"#
    xml += #"<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>"#
    xml += docxHeadingStyle("Title", "Title", 48, 0, 200, "1A3D7C")
    xml += docxHeadingStyle("Heading1", "heading 1", 34, 360, 140, "1A3D7C")
    xml += docxHeadingStyle("Heading2", "heading 2", 28, 300, 120, "1A3D7C")
    xml += docxHeadingStyle("Heading3", "heading 3", 24, 240, 100, "333333")
    xml += docxHeadingStyle("Heading4", "heading 4", 22, 200, 80, "333333")
    xml += #"<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1A4FB5"/><w:u w:val="single"/></w:rPr></w:style>"#
    return xml + "</w:styles>"
}

private func docxFooter() -> String {
    let rpr = #"<w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr>"#
    var xml = xmlDecl + "<w:ftr xmlns:w=\"\(wNS)\" xmlns:r=\"\(rNS)\"><w:p>"
    xml += #"<w:pPr><w:jc w:val="center"/></w:pPr>"#
    xml += #"<w:fldSimple w:instr="PAGE"><w:r>"# + rpr + "<w:t>1</w:t></w:r></w:fldSimple>"
    xml += "<w:r>" + rpr + #"<w:t xml:space="preserve"> / </w:t></w:r>"#
    xml += #"<w:fldSimple w:instr="NUMPAGES"><w:r>"# + rpr + "<w:t>1</w:t></w:r></w:fldSimple>"
    return xml + "</w:p></w:ftr>"
}

private func docxBody(_ blocks: [DocxBlock], _ rels: DocxRels) -> String {
    var body = ""
    for b in blocks {
        switch b {
        case .heading(let level, let text):
            let style = level == 1 ? "Title" : "Heading\(min(level - 1, 3))"
            body += docxPara(style: style, ind: "", inner: docxRunsXml(text, rels))
        case .para(let text):
            body += docxPara(style: nil, ind: "", inner: docxRunsXml(text, rels))
        case .bullet(let text, let depth):
            let ind = "<w:ind w:left=\"\(360 * (depth + 1))\" w:hanging=\"260\"/>"
            body += docxPara(style: nil, ind: ind, inner: #"<w:r><w:t xml:space="preserve">• </w:t></w:r>"# + docxRunsXml(text, rels))
        case .numbered(let n, let text):
            let lead = #"<w:r><w:t xml:space="preserve">"# + docxEscape(n) + ". </w:t></w:r>"
            body += docxPara(style: nil, ind: #"<w:ind w:left="360" w:hanging="300"/>"#, inner: lead + docxRunsXml(text, rels))
        case .quote(let text):
            body += docxPara(style: nil, ind: #"<w:ind w:left="400"/>"#, inner: docxRunsXml(text, rels))
        case .code(let lines):
            for l in lines {
                body += #"<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr>"#
                body += #"<w:t xml:space="preserve">"# + docxEscape(l) + "</w:t></w:r></w:p>"
            }
        case .table(let rows):
            if !rows.isEmpty { body += docxTable(rows, rels) }
        case .rule:
            body += #"<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr></w:pPr></w:p>"#
        }
    }
    return body
}

/// The report as a Word file. The report's own "# " title is the document Title; its "##" sections are Heading 1, "###" Heading 2 and deeper
/// Heading 3 (as the web). `title` is used only when the text has no title of its own.
func writeReportDocx(title: String, markdown: String) -> Data {
    let rels = DocxRels()
    var blocks = docxParseBlocks(markdown)
    let hasTitle = blocks.contains { if case .heading(1, _) = $0 { return true } else { return false } }
    if !hasTitle { blocks.insert(.heading(1, title), at: 0) }
    let body = docxBody(blocks, rels)

    var document = xmlDecl + "<w:document xmlns:w=\"\(wNS)\" xmlns:r=\"\(rNS)\"><w:body>" + body
    document += #"<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/>"#
    document += #"<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>"#

    var documentRels = xmlDecl + #"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#
    documentRels += "<Relationship Id=\"rId1\" Type=\"\(rNS)/styles\" Target=\"styles.xml\"/>"
    documentRels += "<Relationship Id=\"rId2\" Type=\"\(rNS)/footer\" Target=\"footer1.xml\"/>"
    for (i, url) in rels.urls.enumerated() {
        documentRels += "<Relationship Id=\"rId\(i + 11)\" Type=\"\(rNS)/hyperlink\" Target=\"\(docxEscape(url))\" TargetMode=\"External\"/>"
    }
    documentRels += "</Relationships>"

    var contentTypes = xmlDecl + #"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">"#
    contentTypes += #"<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>"#
    contentTypes += #"<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>"#
    contentTypes += #"<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>"#
    contentTypes += #"<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>"#

    var rootRels = xmlDecl + #"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">"#
    rootRels += "<Relationship Id=\"rId1\" Type=\"\(rNS)/officeDocument\" Target=\"word/document.xml\"/></Relationships>"

    return ZipStore.archive([
        (name: "[Content_Types].xml", data: Data(contentTypes.utf8)),
        (name: "_rels/.rels", data: Data(rootRels.utf8)),
        (name: "word/document.xml", data: Data(document.utf8)),
        (name: "word/styles.xml", data: Data(docxStyles().utf8)),
        (name: "word/footer1.xml", data: Data(docxFooter().utf8)),
        (name: "word/_rels/document.xml.rels", data: Data(documentRels.utf8)),
    ])
}
