import Foundation

/// What the account's plan lets the composer offer, read from `GET /api/payments/me` (web `subscriptionState.ts`). Only the three
/// facts the mode menu needs: whether someone is signed in, the subscription's state (`ACTIVE`, `CANCELLED`, `EXPIRED`, `PENDING`,
/// `NONE`) and the plan's id (`free`, `coco`, ...). Unknown to the app is `nil` where this is used, never a guess.
struct PlanAccess: Equatable, Sendable {
    let signedIn: Bool
    let state: String
    let planId: String?
}
