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
        if room?.state == "creator" { return true }   // the server's own word, when it sends one
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
                room = room.map { $0.withNewSuggestion(response.suggestion, cards: response.options) }
                // With cards, read the room again for the vote state (what the web does).
                if !response.options.isEmpty { await load() }
            } catch {
                errorMessage = GroupErrorMessages.text(for: error, action: .suggest)
                log.error("group suggest failed: \(error)")
            }
            isSuggesting = false
        }
    }

    // MARK: - Leader and member actions (G2–G4)

    /// The server says this person asked to join and the leader has not answered.
    var isPending: Bool { room?.isPendingForMe ?? false }
    /// People waiting for the leader's answer (sent to the leader only).
    var pendingRequests: [GroupMember] { room?.pendingRequests ?? [] }
    /// An accepted member who is not the leader can leave; the leader deletes instead.
    var canLeave: Bool { room?.state == "member" && !isCreator }
    /// Set once the group is gone for this person (left, withdrew or deleted): the screen closes.
    @AppPublished var didExit = false
    @AppPublished var isWorking = false

    /// Accept, decline or remove — then reload, so the lists and the count match the server.
    func manage(_ member: GroupMember, _ action: GroupService.MemberAction) {
        guard isCreator, !isWorking else { return }
        isWorking = true
        errorMessage = nil
        Task {
            do {
                try await service.manageMember(groupId: groupId, memberId: member.id, action: action)
                await load()
            } catch {
                errorMessage = GroupErrorMessages.text(for: error, action: .manage)
                log.error("group member action failed: \(error)")
            }
            isWorking = false
        }
    }

    /// Leave the group, or withdraw a request that is still waiting.
    func leave() {
        guard !isWorking, isPending || canLeave else { return }
        isWorking = true
        errorMessage = nil
        Task {
            do {
                try await service.leaveGroup(id: groupId)
                didExit = true
            } catch {
                errorMessage = GroupErrorMessages.text(for: error, action: .leave)
                log.error("group leave failed: \(error)")
            }
            isWorking = false
        }
    }

    /// Leader only; the confirmation is asked by the view (Apple 5.1.1(v) spirit: no silent destroy).
    func deleteGroup() {
        guard isCreator, !isWorking else { return }
        isWorking = true
        errorMessage = nil
        Task {
            do {
                try await service.deleteGroup(id: groupId)
                didExit = true
            } catch {
                errorMessage = GroupErrorMessages.text(for: error, action: .delete)
                log.error("group delete failed: \(error)")
            }
            isWorking = false
        }
    }

    // MARK: - Group picture (G8)

    @AppPublished var isUploadingAvatar = false

    /// Leader only. The photo is re-encoded as JPEG (as the profile picture is); too large or unreadable shows a sentence.
    func setAvatar(imageData: Data) {
        guard isCreator, !isUploadingAvatar else { return }
        guard let image = UIImage(data: imageData), let jpeg = image.jpegData(compressionQuality: 0.85) else {
            errorMessage = NSLocalizedString("group.avatar.error", comment: "")
            return
        }
        isUploadingAvatar = true
        errorMessage = nil
        Task {
            do {
                try await service.uploadAvatar(groupId: groupId, jpeg: jpeg)
                await load()
            } catch {
                errorMessage = UploadUnavailable.matches(error)
                    ? NSLocalizedString("editprofile.error.uploadUnavailable", comment: "")
                    : NSLocalizedString("group.avatar.error", comment: "")
                log.error("group avatar failed: \(error)")
            }
            isUploadingAvatar = false
        }
    }

    // MARK: - Bill (G7)

    /// Two or more people share the meal, so a bill makes sense (what the web requires).
    var canShowBill: Bool { (room?.people.count ?? 0) >= 2 && (isCreator || room?.state == "member") }
    var bill: GroupBill? { room?.bill }

    func saveBill(_ draft: GroupService.BillDraft) async -> Bool {
        await runBill { _ = try await self.service.saveBill(groupId: self.groupId, draft: draft) }
    }

    func markPaid(_ key: String, paid: Bool) {
        Task { _ = await runBill { _ = try await self.service.markPaid(groupId: self.groupId, memberKey: key, paid: paid) } }
    }

    func deleteBill() {
        Task { _ = await runBill { try await self.service.deleteBill(groupId: self.groupId) } }
    }

    /// One write, then a reload: the server computes the split, so the screen shows what it says.
    private func runBill(_ call: @escaping () async throws -> Void) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await call()
            await load()
            return true
        } catch {
            errorMessage = GroupErrorMessages.text(for: error, action: .bill)
            log.error("group bill failed: \(error)")
            return false
        }
    }

    // MARK: - Cards and vote (G5–G6)

    var cards: [GroupCard] { room?.suggestionOptions ?? [] }
    var hasCards: Bool { !cards.isEmpty }
    var isDecided: Bool { room?.chosenOption != nil }
    /// Anyone in the group (the leader or an accepted member) may vote; a person only asking to join may not.
    var canVote: Bool { !isDecided && (isCreator || room?.state == "member") }
    /// The leader settles a tie: everyone voted and no place has more than half.
    var canChoose: Bool { isCreator && !isDecided && (room?.votes?.isTie ?? false) }

    func votes(for card: GroupCard) -> Int { room?.votes?.counts[card.id] ?? 0 }
    func isMyVote(_ card: GroupCard) -> Bool { room?.votes?.mine == card.id }

    func vote(_ card: GroupCard) { decide(card, leader: false) }
    func choose(_ card: GroupCard) { decide(card, leader: true) }

    private func decide(_ card: GroupCard, leader: Bool) {
        guard !isWorking, leader ? canChoose : canVote else { return }
        isWorking = true
        errorMessage = nil
        Task {
            do {
                if leader { _ = try await service.choose(groupId: groupId, optionId: card.id) }
                else { _ = try await service.vote(groupId: groupId, optionId: card.id) }
                await load()   // the server counts; the app shows what it says
            } catch {
                // 409 already_decided / not_allowed_yet: someone else settled it first — show the new state.
                if case AppError.network(let status, _) = error, status == 409 { await load() }
                else { errorMessage = GroupErrorMessages.text(for: error, action: .vote) }
                log.error("group vote failed: \(error)")
            }
            isWorking = false
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

