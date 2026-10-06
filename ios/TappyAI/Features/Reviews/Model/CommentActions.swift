import Foundation

/// The reactions the Web comment API accepts (`src/app/api/comments/[commentId]/reactions/route.ts`: `like`, `love`, `haha`, `wow`, `sad`,
/// `angry`) and the pure rules around replies and reactions, shared by the feed's and the detail screen's comment state.
enum CommentReaction: String, CaseIterable, Identifiable, Sendable {
    case like, love, haha, wow, sad, angry
    var id: String { rawValue }

    var emoji: String {
        switch self {
        case .like: return "👍"
        case .love: return "❤️"
        case .haha: return "😂"
        case .wow: return "😮"
        case .sad: return "😢"
        case .angry: return "😡"
        }
    }
}

enum CommentActions {
    /// A comment as it reads after the caller picks `reaction` (nil = removes it): the same toggle the server applies — one reaction per
    /// person, picking the one you already have takes it back.
    static func applying(_ reaction: CommentReaction, to comment: ReviewComment) -> ReviewComment {
        var next = comment
        if let mine = comment.myReaction { next.reactions[mine] = max(0, (next.reactions[mine] ?? 1) - 1) }
        if comment.myReaction == reaction.rawValue {
            next.myReaction = nil
        } else {
            next.reactions[reaction.rawValue, default: 0] += 1
            next.myReaction = reaction.rawValue
        }
        next.reactions = next.reactions.filter { $0.value > 0 }
        return next
    }

    /// The server's answer to what the caller now has: nil when the reaction was removed.
    static func resulting(_ reaction: CommentReaction, on comment: ReviewComment) -> CommentReaction? {
        comment.myReaction == reaction.rawValue ? nil : reaction
    }

    /// Web `startReply` / `send`: «replying to a reply attaches to the same top-level thread (its parent), not under the reply itself — so
    /// threads never nest deeper than one level» (`parentId = replyTo.parent_comment_id ?? replyTo.id`).
    static func parentId(forReplyingTo comment: ReviewComment) -> String { comment.parentCommentId ?? comment.id }

    /// Web `del`: «a deleted parent cascades to its replies in the DB — mirror that locally».
    static func removing(_ commentId: String, from comments: [ReviewComment]) -> [ReviewComment] {
        comments.filter { $0.id != commentId && $0.parentCommentId != commentId }
    }

    /// Web `renderComment`: up to three distinct reaction emoji and the total, e.g. «👍❤️ 3»; nil when nobody reacted.
    static func reactionSummary(_ comment: ReviewComment) -> String? {
        let total = comment.reactions.values.reduce(0, +)
        guard total > 0 else { return nil }
        let order = CommentReaction.allCases.map(\.rawValue)
        let shown = comment.reactions.filter { $0.value > 0 }.keys
            .sorted { (order.firstIndex(of: $0) ?? 99) < (order.firstIndex(of: $1) ?? 99) }
            .prefix(3).compactMap { CommentReaction(rawValue: $0)?.emoji }
        return shown.joined() + " " + String(total)
    }

    /// Web `replyName`: the last word of the name, «Ẩn danh» when there is none (the Web string `reviews.anonymous`).
    static func shortName(_ comment: ReviewComment, anonymous: String) -> String {
        let last = comment.profiles?.fullName?.split(separator: " ").last.map(String.init) ?? ""
        return last.isEmpty ? anonymous : last
    }

    /// Top-level comments in order, each followed by its replies (one level, as the Web nests them). A reply whose parent is not in the
    /// list (deleted, hidden by a block) is shown at top level rather than lost.
    static func threaded(_ comments: [ReviewComment]) -> [(comment: ReviewComment, isReply: Bool)] {
        let ids = Set(comments.map(\.id))
        let tops = comments.filter { $0.parentCommentId == nil || !ids.contains($0.parentCommentId ?? "") }
        var out: [(ReviewComment, Bool)] = []
        for top in tops {
            out.append((top, top.parentCommentId != nil))
            out.append(contentsOf: comments.filter { $0.parentCommentId == top.id }.map { ($0, true) })
        }
        return out
    }
}

/// The picture a post's tile shows. The Web has TWO orders and iOS follows each surface:
///  - `.poster` (default): Web `posterFor` / `LinkPoster` (`src/lib/links/platforms.ts`): a real PHOTO first, then the stored thumbnail. Used by the
///    public profile (`PublicProfileView`), the feed profile tab (`ProfileTab`), creator pages and Explore tiles. iOS: `UserProfileView`.
///  - `.ownProfile`: Web `ReviewGrid` / `ReviewList` in `(app)/profile/ProfileView.tsx` (`r.thumbnail || r.photos?.[0]`) and `favorites/SavedView.tsx`:
///    the stored THUMBNAIL first, then the first photo. Used by the signed-in user's own profile hub (posts, shared, saved, restricted, hidden).
///    iOS: `ProfileHubContent` and `MyPostsView`.
/// Nothing is invented: when neither exists the result is nil.
enum ReviewPoster {
    enum Order { case poster, ownProfile }

    static func url(photos: [String]?, thumbnail: String?, order: Order = .poster) -> String? {
        let photo = photos?.first?.trimmingCharacters(in: .whitespacesAndNewlines)
        let thumb = thumbnail?.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidates: [String?] = order == .poster ? [photo, thumb] : [thumb, photo]
        return candidates.compactMap { $0 }.first { !$0.isEmpty }
    }
}
