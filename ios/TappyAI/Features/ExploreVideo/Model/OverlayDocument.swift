import Foundation
import CoreGraphics

// Text overlay, schema v1 (web `src/lib/media/video/overlay/schema.ts` is the source of truth).
// STATIC text layers over a clip. x,y = the layer's CENTRE as a 0..1 fraction of the frame, `width` = wrap width as a
// fraction of the frame width, `size` = font size as a fraction of the frame WIDTH, times in whole milliseconds.

struct OverlayBackground: Codable, Equatable, Sendable {
    var color: String
    var opacity: Double
}

struct OverlayOutline: Codable, Equatable, Sendable {
    var color: String
    /// A fraction of the font size.
    var width: Double
}

struct OverlayLayer: Codable, Equatable, Sendable, Identifiable {
    var id: String
    var type: String
    var text: String
    var x: Double
    var y: Double
    var width: Double
    var size: Double
    var rotation: Double
    var align: String
    var font: String
    var weight: String
    var color: String
    var background: OverlayBackground?
    var outline: OverlayOutline?
    var shadow: Bool
    var startMs: Int
    var endMs: Int

    enum CodingKeys: String, CodingKey {
        case id, type, text, x, y, width, size, rotation, align, font, weight, color, background, outline, shadow
        case startMs = "start_ms"
        case endMs = "end_ms"
    }

    init(id: String, type: String = "text", text: String, x: Double, y: Double, width: Double, size: Double, rotation: Double,
         align: String, font: String, weight: String, color: String, background: OverlayBackground?, outline: OverlayOutline?,
         shadow: Bool, startMs: Int, endMs: Int) {
        self.id = id
        self.type = type
        self.text = text
        self.x = x
        self.y = y
        self.width = width
        self.size = size
        self.rotation = rotation
        self.align = align
        self.font = font
        self.weight = weight
        self.color = color
        self.background = background
        self.outline = outline
        self.shadow = shadow
        self.startMs = startMs
        self.endMs = endMs
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decode(String.self, forKey: .type)
        text = try c.decode(String.self, forKey: .text)
        x = try c.decode(Double.self, forKey: .x)
        y = try c.decode(Double.self, forKey: .y)
        width = try c.decode(Double.self, forKey: .width)
        size = try c.decode(Double.self, forKey: .size)
        rotation = try c.decode(Double.self, forKey: .rotation)
        align = try c.decode(String.self, forKey: .align)
        font = try c.decode(String.self, forKey: .font)
        weight = try c.decode(String.self, forKey: .weight)
        color = try c.decode(String.self, forKey: .color)
        background = try c.decodeIfPresent(OverlayBackground.self, forKey: .background)
        outline = try c.decodeIfPresent(OverlayOutline.self, forKey: .outline)
        shadow = try c.decode(Bool.self, forKey: .shadow)
        startMs = try c.decode(Int.self, forKey: .startMs)
        endMs = try c.decode(Int.self, forKey: .endMs)
    }

    /// 🚨 The server refuses a layer where `background` / `outline` is MISSING: «none» must be an explicit JSON null, which
    /// the synthesised encoder would drop. Hence the hand-written encoder.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(type, forKey: .type)
        try c.encode(text, forKey: .text)
        try c.encode(x, forKey: .x)
        try c.encode(y, forKey: .y)
        try c.encode(width, forKey: .width)
        try c.encode(size, forKey: .size)
        try c.encode(rotation, forKey: .rotation)
        try c.encode(align, forKey: .align)
        try c.encode(font, forKey: .font)
        try c.encode(weight, forKey: .weight)
        try c.encode(color, forKey: .color)
        if let background { try c.encode(background, forKey: .background) } else { try c.encodeNil(forKey: .background) }
        if let outline { try c.encode(outline, forKey: .outline) } else { try c.encodeNil(forKey: .outline) }
        try c.encode(shadow, forKey: .shadow)
        try c.encode(startMs, forKey: .startMs)
        try c.encode(endMs, forKey: .endMs)
    }

    /// A fresh layer in the middle of the frame (web `defaultTextLayer`).
    static func makeDefault(id: String, text: String, durationMs: Int) -> OverlayLayer {
        OverlayLayer(id: id, text: text, x: 0.5, y: 0.5, width: 0.8, size: 0.07, rotation: 0, align: "center", font: "sans",
                     weight: "bold", color: "#ffffff", background: nil,
                     outline: OverlayOutline(color: "#000000", width: 0.08), shadow: true,
                     startMs: 0, endMs: max(1, min(durationMs, 3000)))
    }
}

struct OverlayDocument: Codable, Equatable, Sendable {
    var schemaVersion: Int
    var layers: [OverlayLayer]

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case layers
    }

    init(schemaVersion: Int = 1, layers: [OverlayLayer] = []) {
        self.schemaVersion = schemaVersion
        self.layers = layers
    }

    static let empty = OverlayDocument()

    /// Lenient on the way IN (an empty `{}` is «nothing saved»); a layer that does not decode is dropped, not fatal.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = (try? c.decode(Int.self, forKey: .schemaVersion)) ?? 1
        let elements = (try? c.decode([LossyElement<OverlayLayer>].self, forKey: .layers)) ?? []
        layers = elements.compactMap(\.value)
    }
}

/// `GET .../overlay` → `{ version, doc }`.
struct OverlayEnvelope: Decodable, Sendable, Equatable {
    let version: Int
    let doc: OverlayDocument

    enum CodingKeys: String, CodingKey { case version, doc }

    init(version: Int, doc: OverlayDocument) {
        self.version = version
        self.doc = doc
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = (try? c.decode(Int.self, forKey: .version)) ?? 0
        doc = (try? c.decode(OverlayDocument.self, forKey: .doc)) ?? .empty
    }
}

/// `PUT .../overlay` → `{ version, warnings?: { unsupported_chars } }`.
struct OverlaySaveResult: Decodable, Sendable, Equatable {
    let version: Int
    let hasUnsupportedChars: Bool

    enum CodingKeys: String, CodingKey { case version, warnings }

    init(version: Int, hasUnsupportedChars: Bool) {
        self.version = version
        self.hasUnsupportedChars = hasUnsupportedChars
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decode(Int.self, forKey: .version)
        // `unsupported_chars` may be a list or a flag: anything present and non-empty counts.
        if let w = try? c.decodeIfPresent([String: AnyDecodableValue].self, forKey: .warnings) {
            hasUnsupportedChars = w.values.contains { !$0.isEmpty }
        } else {
            hasUnsupportedChars = false
        }
    }
}

/// Just enough of «any JSON value» to ask «is it empty?».
struct AnyDecodableValue: Decodable, Sendable, Equatable {
    let isEmpty: Bool

    init(from decoder: Decoder) throws {
        let single = try decoder.singleValueContainer()
        if let list = try? single.decode([AnyDecodableValue].self) {
            isEmpty = list.isEmpty
        } else if let flag = try? single.decode(Bool.self) {
            isEmpty = !flag
        } else if let text = try? single.decode(String.self) {
            isEmpty = text.isEmpty
        } else {
            isEmpty = true
        }
    }
}

// MARK: - Validator (mirrors the web `validateOverlayDoc`; the server stays the authority)

enum OverlayValidator {
    static let maxLayers = 10
    static let maxTextLength = 200
    static let maxTextLines = 6
    static let aligns = ["left", "center", "right"]
    static let fonts = ["sans"]
    static let weights = ["normal", "bold"]

    /// The paths of every field that is not acceptable (`layers.0.x`); empty = valid.
    static func errors(in doc: OverlayDocument, durationMs: Int? = nil) -> [String] {
        var errors: [String] = []
        if doc.schemaVersion != 1 { errors.append("schema_version") }
        if doc.layers.count > maxLayers { errors.append("layers") }
        var seen = Set<String>()
        for (i, layer) in doc.layers.enumerated() {
            let p = "layers.\(i)"
            if !isValidId(layer.id) || seen.contains(layer.id) { errors.append("\(p).id") } else { seen.insert(layer.id) }
            if layer.type != "text" { errors.append("\(p).type") }
            if !isValidText(layer.text) { errors.append("\(p).text") }
            if !inRange(layer.x, 0, 1) { errors.append("\(p).x") }
            if !inRange(layer.y, 0, 1) { errors.append("\(p).y") }
            if !inRange(layer.width, 0.1, 1) { errors.append("\(p).width") }
            if !inRange(layer.size, 0.02, 0.2) { errors.append("\(p).size") }
            if !inRange(layer.rotation, -180, 180) { errors.append("\(p).rotation") }
            if !aligns.contains(layer.align) { errors.append("\(p).align") }
            if !fonts.contains(layer.font) { errors.append("\(p).font") }
            if !weights.contains(layer.weight) { errors.append("\(p).weight") }
            if !isValidColor(layer.color) { errors.append("\(p).color") }
            if let bg = layer.background {
                if !isValidColor(bg.color) { errors.append("\(p).background.color") }
                if !inRange(bg.opacity, 0, 1) { errors.append("\(p).background.opacity") }
            }
            if let ol = layer.outline {
                if !isValidColor(ol.color) { errors.append("\(p).outline.color") }
                if !inRange(ol.width, 0, 0.2) { errors.append("\(p).outline.width") }
            }
            let maxEnd = durationMs ?? Int.max
            let startOk = layer.startMs >= 0 && layer.startMs <= maxEnd
            if !startOk { errors.append("\(p).start_ms") }
            let endOk = layer.endMs > 0 && layer.endMs <= maxEnd && (!startOk || layer.endMs > layer.startMs)
            if !endOk { errors.append("\(p).end_ms") }
        }
        return errors
    }

    static func isValid(_ doc: OverlayDocument, durationMs: Int? = nil) -> Bool {
        errors(in: doc, durationMs: durationMs).isEmpty
    }

    static func inRange(_ v: Double, _ lo: Double, _ hi: Double) -> Bool {
        v.isFinite && v >= lo && v <= hi
    }

    static func isValidId(_ id: String) -> Bool {
        let n = id.utf8.count
        guard n >= 1 && n <= 32 else { return false }
        return id.utf8.allSatisfy { b in
            (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A) || b == 0x5F || b == 0x2D
        }
    }

    static func isValidColor(_ s: String) -> Bool {
        let u = Array(s.utf8)
        guard u.count == 7, u[0] == 0x23 else { return false }
        return u[1...].allSatisfy { b in
            (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66)
        }
    }

    /// Non-blank, at most 200 characters (code points) and 6 lines, no control or direction-changing characters.
    static func isValidText(_ text: String) -> Bool {
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return false }
        if text.unicodeScalars.count > maxTextLength { return false }
        if text.components(separatedBy: "\n").count > maxTextLines { return false }
        for scalar in text.unicodeScalars where isForbidden(scalar.value) { return false }
        return true
    }

    private static func isForbidden(_ v: UInt32) -> Bool {
        switch v {
        case 0x00...0x09, 0x0B...0x1F, 0x7F...0x9F, 0x200B...0x200F, 0x202A...0x202E, 0x2060...0x2064, 0x2066...0x2069, 0xFEFF:
            return true
        default:
            return false
        }
    }

    /// A layer id the validator accepts (random, so two editors cannot collide).
    static func newLayerId() -> String {
        let hex = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        return "t" + String(hex.prefix(12))
    }
}

// MARK: - Geometry (web `layout.ts`: ONE rule for the preview, the playback layer and the burned-in download)

enum OverlayGeometry {
    static let paddingXEm: Double = 0.4
    static let paddingYEm: Double = 0.2
    static let shadowDx: Double = 0.04
    static let shadowDy: Double = 0.06
    static let shadowBlur: Double = 0.08
    static let shadowOpacity: Double = 0.6

    static func fontPx(size: Double, frameWidth: Double) -> Double {
        max(6, (size * frameWidth).rounded())
    }

    static func boxWidthPx(width: Double, frameWidth: Double) -> Double {
        max(8, (width * frameWidth).rounded())
    }

    /// On screen from its start (inclusive) to its end (exclusive).
    static func isVisible(_ layer: OverlayLayer, timeMs: Int) -> Bool {
        timeMs >= layer.startMs && timeMs < layer.endMs
    }

    /// Where the VIDEO FRAME lies inside its container. `fill` = aspect-fill (the feed), otherwise aspect-fit (the editor).
    /// An unknown video size means the frame is the whole container.
    static func contentRect(container: CGSize, video: CGSize, fill: Bool) -> CGRect {
        guard container.width > 0, container.height > 0, video.width > 0, video.height > 0 else {
            return CGRect(origin: .zero, size: container)
        }
        let sx = container.width / video.width
        let sy = container.height / video.height
        let scale = fill ? max(sx, sy) : min(sx, sy)
        let w = video.width * scale
        let h = video.height * scale
        return CGRect(x: (container.width - w) / 2, y: (container.height - h) / 2, width: w, height: h)
    }

    /// The layer's centre in the container's coordinates.
    static func center(of layer: OverlayLayer, in rect: CGRect) -> CGPoint {
        CGPoint(x: rect.minX + CGFloat(layer.x) * rect.width, y: rect.minY + CGFloat(layer.y) * rect.height)
    }

    /// A dragged centre back to normalised 0..1 (clamped to the frame).
    static func normalized(point: CGPoint, in rect: CGRect) -> (x: Double, y: Double) {
        guard rect.width > 0, rect.height > 0 else { return (0.5, 0.5) }
        let nx = Double((point.x - rect.minX) / rect.width)
        let ny = Double((point.y - rect.minY) / rect.height)
        return (min(1, max(0, nx)), min(1, max(0, ny)))
    }
}
