import Foundation

/// The pure editing rules of the overlay editor (no UI, no network).
enum OverlayEditing {
    static let defaultText = "Văn bản"
    static let palette = ["#ffffff", "#000000", "#ffd400", "#ff3b30", "#34c759", "#0a84ff", "#ff2d92"]

    /// A new default layer appended, or nil when the document already holds the maximum.
    static func adding(to doc: OverlayDocument, durationMs: Int, text: String = defaultText) -> (doc: OverlayDocument, id: String)? {
        guard doc.layers.count < OverlayValidator.maxLayers else { return nil }
        let id = OverlayValidator.newLayerId()
        var next = doc
        next.layers.append(OverlayLayer.makeDefault(id: id, text: text, durationMs: durationMs))
        return (next, id)
    }

    static func removing(_ id: String, from doc: OverlayDocument) -> OverlayDocument {
        var next = doc
        next.layers.removeAll { $0.id == id }
        return next
    }

    /// Moves a layer's centre (already normalised); clamped to the frame.
    static func moving(_ id: String, x: Double, y: Double, in doc: OverlayDocument) -> OverlayDocument {
        var next = doc
        guard let i = next.layers.firstIndex(where: { $0.id == id }) else { return doc }
        next.layers[i].x = min(1, max(0, x))
        next.layers[i].y = min(1, max(0, y))
        return next
    }

    /// Sets the visible window. Whole milliseconds inside the clip, and always `end > start`.
    static func settingTimes(_ id: String, startMs: Int, endMs: Int, durationMs: Int, in doc: OverlayDocument) -> OverlayDocument {
        var next = doc
        guard let i = next.layers.firstIndex(where: { $0.id == id }) else { return doc }
        let maxEnd = max(1, durationMs)
        let start = min(max(0, startMs), maxEnd - 1)
        let end = min(max(endMs, start + 1), maxEnd)
        next.layers[i].startMs = start
        next.layers[i].endMs = end
        return next
    }

    /// A layer cut to the clip: a document made before the clip was trimmed or with a longer duration still validates.
    static func clamped(_ doc: OverlayDocument, durationMs: Int) -> OverlayDocument {
        var next = doc
        for i in next.layers.indices {
            let l = next.layers[i]
            let r = settingTimes(l.id, startMs: l.startMs, endMs: l.endMs, durationMs: durationMs, in: next)
            next = r
        }
        return next
    }

    static func setBackground(_ on: Bool, for id: String, in doc: OverlayDocument) -> OverlayDocument {
        var next = doc
        guard let i = next.layers.firstIndex(where: { $0.id == id }) else { return doc }
        next.layers[i].background = on ? OverlayBackground(color: "#000000", opacity: 0.6) : nil
        return next
    }

    static func setOutline(_ on: Bool, for id: String, in doc: OverlayDocument) -> OverlayDocument {
        var next = doc
        guard let i = next.layers.firstIndex(where: { $0.id == id }) else { return doc }
        next.layers[i].outline = on ? OverlayOutline(color: "#000000", width: 0.08) : nil
        return next
    }
}
