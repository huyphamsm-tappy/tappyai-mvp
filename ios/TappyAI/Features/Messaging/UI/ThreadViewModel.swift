import SwiftUI
import UIKit

/// One conversation — the web's `ThreadView`. History (oldest → newest, paged further back with the keyset `before` + `beforeId`), the read
/// cursor moved on open and on every incoming message, and send: the SERVER's row is appended (its real id and `created_at`), so a later
/// re-read dedupes against it cleanly. No "Online", no "Typing…": there is no presence infrastructure, and nothing here claims to know.
///
/// The web release 2026-11-04, mirrored here (and on Android):
///  - **Pictures.** Picking one uploads it AT ONCE (the media route scans it and answers with a path), kept pending until the message is
///    sent or it is removed. A message is text, a picture, or both.
///  - **One id per send attempt** (`clientId`), tied to the exact text AND picture: a retry of the SAME attempt repeats it and the server
///    returns the stored row instead of a second copy; other content, or the next send after a success, gets a new one.
///  - **Neutral refusals.** The server answers "not a participant" and "blocked" with the same 404, so a 404 only locks the writing area with
///    one neutral sentence (`locked`); nothing here ever says "blocked".
///
/// Realtime stands in for: `poll()` re-reads the newest page while the screen is showing and merges by id — new rows land, nothing is
/// duplicated, nothing is invented.
@MainActor
final class ThreadViewModel: AppObservableObject {
    /// A picture uploaded and ready to go with the next message.
    struct PendingPhoto {
        let preview: UIImage
        let media: UploadedPhoto
    }

    @AppPublished private(set) var thread: ChatThreadSummary?
    @AppPublished private(set) var messages: [PeerMessage] = []
    @AppPublished private(set) var hasMore = false
    @AppPublished private(set) var isLoading = true
    @AppPublished private(set) var loadingOlder = false
    /// Nil = fine; otherwise the screen shows this failure's text.
    @AppPublished private(set) var failure: ChatFailure?
    @AppPublished var draft = "" {
        didSet { if draft.count > ChatLimits.maxBody { draft = String(draft.prefix(ChatLimits.maxBody)) } }
    }
    @AppPublished private(set) var sending = false
    @AppPublished private(set) var uploading = false
    @AppPublished private(set) var photo: PendingPhoto?
    /// Set when a send or an upload was answered with the neutral 404: the writing area is replaced by one neutral sentence.
    @AppPublished private(set) var locked = false
    /// Bumped when a row is appended, so the list scrolls to the end.
    @AppPublished private(set) var appendTick = 0

    let threadId: String
    let meId: String?
    private let service: MessagingService
    private let log = AppLogger.app

    /// The id of the send attempt in flight or just failed, tied to the exact text and picture it was made for.
    private var attempt: (key: String, id: String)?

    init(threadId: String, meId: String?, service: MessagingService) {
        self.threadId = threadId
        self.meId = meId
        self.service = service
    }

    // MARK: History

    func start() async {
        if let found = try? await service.threads().first(where: { $0.id == threadId }) { thread = found }
        await load()
    }

    func load() async {
        isLoading = true
        failure = nil
        do {
            let page = try await service.messages(threadId: threadId)
            messages = page.messages
            hasMore = page.hasMore
            appendTick += 1
            // Opening a thread IS reading it: the mark is unconditional (no per-message receipts).
            try? await service.markRead(threadId: threadId)
        } catch {
            log.error("thread load failed: \(error)")
            failure = .load
        }
        isLoading = false
    }

    /// Older history, prepended; the keyset is the oldest loaded message — its stamp AND its id.
    func loadOlder() async {
        guard let oldest = messages.first, hasMore, !loadingOlder else { return }
        loadingOlder = true
        if let page = try? await service.messages(threadId: threadId, before: oldest.createdAt, beforeId: oldest.id) {
            let known = Set(messages.map(\.id))
            messages = page.messages.filter { !known.contains($0.id) } + messages
            hasMore = page.hasMore
        }
        loadingOlder = false
    }

    /// The newest page, merged by id. Incoming rows from others move the read cursor, as the web does on a realtime INSERT.
    func poll() async {
        guard !isLoading, !sending, let page = try? await service.messages(threadId: threadId) else { return }
        let known = Set(messages.map(\.id))
        let fresh = page.messages.filter { !known.contains($0.id) }
        guard !fresh.isEmpty else { return }
        messages = (messages + fresh).sorted { $0.createdAt < $1.createdAt }
        appendTick += 1
        if fresh.contains(where: { $0.senderId != meId }) { try? await service.markRead(threadId: threadId) }
    }

    // MARK: Pictures

    /// A picture was picked: bring it to what the server accepts, upload it at once. A failure says why and keeps nothing pending.
    func pickPhoto(data: Data?) async {
        guard !uploading, !sending, !locked else { return }
        uploading = true
        failure = nil
        defer { uploading = false }
        guard let data, let prepared = ChatPhotoPrep.prepare(data) else { failure = .photoType; return }
        do {
            let media = try await service.uploadPhoto(threadId: threadId, jpeg: prepared.jpeg)
            photo = PendingPhoto(preview: prepared.preview, media: media)
        } catch {
            log.error("photo upload failed: \(error)")
            let f = ChatFailure.forUpload(error)
            if f.locksComposer { locked = true }
            // The person declining the AI-sharing sheet is their answer, not an error to scold them for.
            if (error as? AppError) != AIConsentStore.blockedError { failure = f }
        }
    }

    func removePhoto() { photo = nil }

    // MARK: Send

    func send() async {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let pending = photo
        guard !(body.isEmpty && pending == nil), !sending, !uploading, !locked else { return }
        sending = true
        failure = nil
        defer { sending = false }
        // the attempt is tied to the exact text AND picture it was made for
        let key = body + "\u{0}" + (pending?.media.path ?? "")
        let clientId: String
        if let current = attempt, current.key == key {
            clientId = current.id
        } else {
            clientId = UUID().uuidString.lowercased()
            attempt = (key, clientId)
        }
        do {
            let row = try await service.send(threadId: threadId, body: body, clientId: clientId, media: pending?.media)
            attempt = nil   // delivered: the next message is a new send, even with the same text
            if !messages.contains(where: { $0.id == row.id }) { messages.append(row) }
            draft = ""
            photo = nil
            appendTick += 1
        } catch {
            log.error("send failed: \(error)")
            let f = ChatFailure.forSend(error)
            if f.locksComposer { locked = true }
            failure = f
        }
    }
}
