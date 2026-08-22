import Foundation
import UIKit

/// One group-dining room: who has joined, the join form, and the creator's AI suggestion.
@MainActor
final class GroupDetailViewModel: AppObservableObject {
    enum LoadState: Equatable { case loading, loaded, notFound, failed(AppError) }

    @AppPublished var state: LoadState = .loading
    @AppPublished var room: GroupRoom?
    @AppPublished var form = GroupJoinForm()
    @AppPublished var isJoining = false
    @AppPublished var hasJoined = false
    @AppPublished var isSuggesting = false
    @AppPublished var errorMessage: String?
    @AppPublished var linkCopied = false

    let groupId: String
    private let service: GroupService
    private let session: SessionStore
    private let log = AppLogger.app

    var isAuthenticated: Bool { session.state.isAuthenticated }
    var members: [GroupMember] { room?.members ?? [] }
    var isFull: Bool { members.count >= GroupLimits.maxMembers }
    var shareURL: String { TappyShare.groupURL(groupId) }

    /// Only the creator may ask for a suggestion — the server enforces it (403 `owner_only`) and
    /// the button is hidden for everyone else rather than shown and rejected.
    var isCreator: Bool {
        guard let creatorId = room?.creatorId, let me = session.userId else { return false }
        return creatorId == me
    }

    var canSuggest: Bool { isCreator && !members.isEmpty && !isSuggesting }

    init(groupId: String, service: GroupService, session: SessionStore) {
        self.groupId = groupId
        self.service = service
        self.session = session
    }

    // MARK: - Loading

    func load() async {
        if room == nil { state = .loading }
        do {
            let loaded = try await service.fetchGroup(id: groupId)
            room = loaded
            state = .loaded
            // The membership check is by name, not by id: `GET /api/group` returns member rows
            // without `user_id`, deliberately — the room is a public link and who is in it is
            // shown by the name they typed, not by their account. So a returning member is
            // recognised by the name they entered on this device.
            if let mine = form.name.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty {
                hasJoined = loaded.members?.contains { $0.name == mine } ?? false
            }
        } catch {
            if Task.isCancelled { return }
            let appError = error as? AppError ?? .unexpected(message: error.localizedDescription)
            if case .network(let status, _) = appError, status == 404 {
                state = .notFound
            } else {
                state = .failed(appError)
            }
            log.error("group load failed: \(error)")
        }
    }

    // MARK: - Join

    func join() {
        guard form.isValid, !isJoining, isAuthenticated else { return }
        isJoining = true
        errorMessage = nil

        Task {
            do {
                _ = try await service.joinGroup(id: groupId, form: form)
                hasJoined = true
                // Reload rather than appending locally: other people may have joined while this
                // form was being filled in, and the member list is what the suggestion will be
                // built from. Showing a stale one invites "why wasn't I counted".
                await load()
            } catch {
                errorMessage = GroupErrorMessages.text(for: error, action: .join)
                log.error("group join failed: \(error)")
            }
            isJoining = false
        }
    }

    // MARK: - Suggestion

    func requestSuggestion() {
        guard canSuggest else { return }
        isSuggesting = true
        errorMessage = nil

        Task {
            do {
                let response = try await service.requestSuggestion(id: groupId)
                // The server persists the suggestion on the row, so everyone in the room sees the
                // same one. Reloading keeps this screen consistent with what they see rather than
                // holding a local copy that only exists here.
                room = room.map { current in
                    GroupRoom(
                        id: current.id,
                        name: current.name,
                        creatorId: current.creatorId,
                        status: current.status,
                        suggestion: response.suggestion,
                        createdAt: current.createdAt,
                        members: current.members
                    )
                }
            } catch {
                errorMessage = GroupErrorMessages.text(for: error, action: .suggest)
                log.error("group suggest failed: \(error)")
            }
            isSuggesting = false
        }
    }

    // MARK: - Share

    func copyLink() {
        UIPasteboard.general.string = shareURL
        linkCopied = true
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            linkCopied = false
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
