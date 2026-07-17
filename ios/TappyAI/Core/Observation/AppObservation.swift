import SwiftUI
import Combine

// MARK: - State Observation Seam (Phase 0 refinement 1)
//
// The app must not depend *directly* on `ObservableObject` at call sites. Stores and views use these
// aliases instead. Today they map to Combine's `ObservableObject`/`@Published` and SwiftUI's
// `@StateObject`/`@EnvironmentObject`. When the minimum-iOS target allows moving to the Observation
// framework (`@Observable`), the migration is localized to:
//   1. this seam file, and
//   2. the store type annotations (`AppObservableObject` → `@Observable`, drop `@AppPublished`).
// View property-wrapper usages change mechanically (`@AppEnvironmentState` → `@Environment`) via a
// single find/replace on the alias name — the view *logic* is unaffected. This minimizes migration
// cost without changing any product behavior (ADR-003 intent; no ADR modified).

/// Adopted by app-scoped stores instead of `ObservableObject` directly.
typealias AppObservableObject = ObservableObject

/// Published property wrapper alias for store state.
typealias AppPublished = Published

/// Owned store creation in the App entry (`@AppStateObject`).
typealias AppStateObject = StateObject

/// Environment injection read at call sites (`@AppEnvironmentState`).
typealias AppEnvironmentState = EnvironmentObject
