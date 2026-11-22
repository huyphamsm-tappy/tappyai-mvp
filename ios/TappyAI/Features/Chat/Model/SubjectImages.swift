import Foundation

/// The pictures the server found for the subject cards and the gallery of a reply (web `src/lib/answerDoc/subjectImages.ts`, 16/11/2026, owner's
/// mockup: every subject card has a picture). The server sends them as the `8:` annotation `tappy.subject_images.v1`:
///
///     {"kind":"tappy.subject_images.v1","v":1,"images":[{"name","src"}],"gallery":[{"name","src"}],"stops":[{"name","src"}]}
///
/// `images` illustrate subject cards Wikipedia cannot, `gallery` the declared gallery, `stops` the itinerary stops that had no picture of their own.
/// Each `src` must be a safe `https` address; one that is not is dropped. A picture is matched to its card by a folded name key (`key`), the
/// same on the web, so "Đà Nẵng" and "da  nang" meet. Pure.
let subjectImagesAnnotationKind = "tappy.subject_images.v1"

struct SubjectImagesFrame: Equatable, Sendable {
    let images: [String: URL]
    let gallery: [String: URL]
    let stops: [String: URL]

    var isEmpty: Bool { images.isEmpty && gallery.isEmpty && stops.isEmpty }
}

enum SubjectImages {
    /// The most pictures each list keeps, as the web's reader (a hostile frame cannot make the app load hundreds).
    static let maxSubjects = 6, maxGallery = 3, maxStops = 10

    /// Web `subjectKey`: diacritics removed, `đ` as `d`, lower case, whitespace collapsed, trimmed.
    static func key(_ name: String) -> String {
        let lowered = name.lowercased().replacingOccurrences(of: "đ", with: "d")
        let folded = lowered.folding(options: .diacriticInsensitive, locale: nil)
        return folded.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    /// The frame of one annotation element, or nil when no picture survives. Never throws.
    static func frame(_ item: [String: Any]) -> SubjectImagesFrame? {
        guard (item["kind"] as? String) == subjectImagesAnnotationKind, (item["v"] as? Int) == 1 else { return nil }
        let frame = SubjectImagesFrame(images: read(item["images"], cap: maxSubjects), gallery: read(item["gallery"], cap: maxGallery),
                                       stops: read(item["stops"], cap: maxStops))
        return frame.isEmpty ? nil : frame
    }

    /// A name as the web's `clean`: control characters and angle brackets become spaces, whitespace collapsed, at most 80 characters.
    static func cleanName(_ raw: String) -> String {
        let spaced = raw.unicodeScalars.map { $0.value < 0x20 || $0 == "<" || $0 == ">" ? " " : String($0) }.joined()
        return String(spaced.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ").prefix(80))
    }

    private static func read(_ raw: Any?, cap: Int) -> [String: URL] {
        var out: [String: URL] = [:]
        for entry in (raw as? [Any] ?? []).prefix(200) {
            guard out.count < cap, let o = entry as? [String: Any], let rawName = o["name"] as? String,
                  case let name = cleanName(rawName), !name.isEmpty,
                  let src = o["src"] as? String, src.count <= 2048,
                  let url = safeWebURL(src), url.scheme?.lowercased() == "https" else { continue }
            let k = key(name)
            if !k.isEmpty, out[k] == nil { out[k] = url }
        }
        return out
    }
}
