import Foundation

/// The group-dining entry point: name a group, create it, land in it.
@MainActor
final class GroupDiningViewModel: AppObservableObject {
    @AppPublished var groupName: String = ""
    @AppPublished var isCreating = false
    @AppPublished var errorMessage: String?
    /// Set once the room exists; the view pushes the detail screen and clears it.
    @AppPublished var createdGroupId: String?

    private let service: GroupService
    private let session: SessionStore
    private let log = AppLogger.app

    /// 🚨 `isAuthenticated`, NOT "has a token". An anonymous session carries a real bearer token
    /// and is still refused by the server for social writes, so offering the button to one would
    /// produce a failure the user cannot act on. They are asked to sign in instead.
    var canCreate: Bool { session.state.isAuthenticated }

    var isNameValid: Bool {
        !groupName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    init(service: GroupService, session: SessionStore) {
        self.service = service
        self.session = session
    }

    func createGroup() {
        let name = groupName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !isCreating else { return }
        isCreating = true
        errorMessage = nil

        Task {
            do {
                let created = try await service.createGroup(name: name)
                createdGroupId = created.id
                groupName = ""
            } catch {
                errorMessage = GroupErrorMessages.text(for: error, action: .create)
                log.error("group create failed: \(error)")
            }
            isCreating = false
        }
    }

    func consumeCreatedGroup() {
        createdGroupId = nil
    }
}

/// Turns a transport error into the sentence the user reads.
///
/// Mirrors Android's `GroupErrorMessages`: the server's `error` codes are stable machine strings
/// and are never shown; each one maps to a sentence in the catalogue. The `action` distinguishes
/// the two 400s, which mean different things — "enter a group name" when creating, "the group may
/// be full or your details are incomplete" when joining — and would otherwise collapse into one
/// unhelpful message.
enum GroupErrorMessages {
    enum Action { case create, join, suggest }

    static func text(for error: Error, action: Action) -> String {
        guard let appError = error as? AppError else {
            return NSLocalizedString("group.error.generic", comment: "")
        }
        switch appError {
        case .offline:
            return NSLocalizedString("group.error.offline", comment: "")
        case .authentication(let reason):
            switch reason {
            case .forbidden:
                return NSLocalizedString("group.error.creatorOnly", comment: "")
            default:
                return NSLocalizedString("group.error.signIn", comment: "")
            }
        case .validation:
            switch action {
            case .create: return NSLocalizedString("group.error.nameRequired", comment: "")
            case .join: return NSLocalizedString("group.error.joinRejected", comment: "")
            case .suggest: return NSLocalizedString("group.error.generic", comment: "")
            }
        case .network(let status, _):
            if status == 429 { return NSLocalizedString("group.error.rateLimited", comment: "") }
            if let status, status >= 500 { return NSLocalizedString("group.error.server", comment: "") }
            if status == 404 { return NSLocalizedString("group.notFound.message", comment: "") }
            return NSLocalizedString("group.error.generic", comment: "")
        default:
            return NSLocalizedString("group.error.generic", comment: "")
        }
    }
}
