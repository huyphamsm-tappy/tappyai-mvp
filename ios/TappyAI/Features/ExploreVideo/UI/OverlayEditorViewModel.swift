import SwiftUI
import UIKit

@MainActor
final class OverlayEditorViewModel: AppObservableObject {
    @AppPublished var doc: OverlayDocument = .empty
    @AppPublished var selectedId: String?
    @AppPublished var loading = true
    @AppPublished var saving = false
    @AppPublished var message: String?
    @AppPublished var savedOnce = false

    let thumbnail: UIImage?
    let durationMs: Int
    private let api: ExploreVideoAPI
    private let assetId: String
    private var version = 0

    init(api: ExploreVideoAPI, assetId: String, durationMs: Int, thumbnail: UIImage?) {
        self.api = api
        self.assetId = assetId
        self.durationMs = max(1, durationMs)
        self.thumbnail = thumbnail
    }

    var selectedLayer: OverlayLayer? {
        guard let id = selectedId else { return nil }
        return doc.layers.first { $0.id == id }
    }

    /// The width / height of the picture the layers are measured against (the clip's cover; 9:16 when there is none).
    var frameSize: CGSize {
        if let t = thumbnail, t.size.width > 0, t.size.height > 0 { return t.size }
        return CGSize(width: 9, height: 16)
    }

    // MARK: Server

    func load() async {
        loading = true
        defer { loading = false }
        do {
            let envelope = try await api.overlay(assetId: assetId)
            version = envelope.version
            doc = OverlayEditing.clamped(envelope.doc, durationMs: durationMs)
            selectedId = doc.layers.first?.id
        } catch {
            message = NSLocalizedString(ExploreVideoIssue.from(error).messageKey, comment: "")
        }
    }

    func save() async {
        guard !saving else { return }
        doc = OverlayEditing.clamped(doc, durationMs: durationMs)
        guard OverlayValidator.isValid(doc, durationMs: durationMs) else {
            message = NSLocalizedString("video.error.overlayInvalid", comment: "")
            return
        }
        saving = true
        message = nil
        defer { saving = false }
        do {
            let result = try await api.saveOverlay(assetId: assetId, version: version, doc: doc)
            version = result.version
            savedOnce = true
            message = result.hasUnsupportedChars ? NSLocalizedString("video.overlay.glyphWarning", comment: "")
                                                 : NSLocalizedString("video.overlay.saved", comment: "")
        } catch {
            let issue = ExploreVideoIssue.from(error)
            if issue == .versionConflict {
                // Someone saved a newer version (another device): take its number, keep this text, and ask to save again.
                if let latest = try? await api.overlay(assetId: assetId) { version = latest.version }
            }
            message = NSLocalizedString(issue.messageKey, comment: "")
        }
    }

    // MARK: Editing (all through the pure rules)

    func addLayer() {
        guard let added = OverlayEditing.adding(to: doc, durationMs: durationMs) else {
            message = NSLocalizedString("video.overlay.tooMany", comment: "")
            return
        }
        doc = added.doc
        selectedId = added.id
        message = nil
    }

    func deleteSelected() {
        guard let id = selectedId else { return }
        doc = OverlayEditing.removing(id, from: doc)
        selectedId = doc.layers.first?.id
    }

    func move(_ id: String, to point: CGPoint, in rect: CGRect) {
        let n = OverlayGeometry.normalized(point: point, in: rect)
        doc = OverlayEditing.moving(id, x: n.x, y: n.y, in: doc)
    }

    func binding<T>(_ id: String, _ keyPath: WritableKeyPath<OverlayLayer, T>, fallback: T) -> Binding<T> {
        Binding(
            get: { self.doc.layers.first(where: { $0.id == id })?[keyPath: keyPath] ?? fallback },
            set: { value in
                if let i = self.doc.layers.firstIndex(where: { $0.id == id }) { self.doc.layers[i][keyPath: keyPath] = value }
            }
        )
    }

    func secondsBinding(_ id: String, isStart: Bool) -> Binding<Double> {
        Binding(
            get: {
                guard let l = self.doc.layers.first(where: { $0.id == id }) else { return 0 }
                return Double(isStart ? l.startMs : l.endMs) / 1000
            },
            set: { seconds in
                guard let l = self.doc.layers.first(where: { $0.id == id }) else { return }
                let ms = Int((seconds * 1000).rounded())
                self.doc = OverlayEditing.settingTimes(id, startMs: isStart ? ms : l.startMs, endMs: isStart ? l.endMs : ms,
                                                       durationMs: self.durationMs, in: self.doc)
            }
        )
    }

    func backgroundBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { self.doc.layers.first(where: { $0.id == id })?.background != nil },
            set: { self.doc = OverlayEditing.setBackground($0, for: id, in: self.doc) }
        )
    }

    func outlineBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { self.doc.layers.first(where: { $0.id == id })?.outline != nil },
            set: { self.doc = OverlayEditing.setOutline($0, for: id, in: self.doc) }
        )
    }

    func boldBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { self.doc.layers.first(where: { $0.id == id })?.weight == "bold" },
            set: { on in
                if let i = self.doc.layers.firstIndex(where: { $0.id == id }) { self.doc.layers[i].weight = on ? "bold" : "normal" }
            }
        )
    }
}
