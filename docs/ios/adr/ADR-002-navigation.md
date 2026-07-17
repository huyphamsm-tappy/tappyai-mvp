# ADR-002 — Navigation

**Status:** Accepted · **Date:** 2026-07-10

## Context
Web has a 5-tab shell (Home/Chat/Explore/Deals/Profile) with the global nav **hidden on `/reviews*`** (the feed owns its nav). Android uses a session-driven root + nested NavHosts. iOS must reproduce the same information architecture and deep links (`06`, `15 §10`) while feeling native.

## Decision
Use **`TabView` with 5 tabs** and a **`NavigationStack` per tab**. Root navigation is **session-driven**: `SessionStore` selects Auth stack vs App shell vs Onboarding. The **Explore/Reviews tab presents its own full-screen dark experience** (its own internal nav), matching the "feed owns its nav / two shells never merge" rule. Deep links (push taps, OAuth returns) route through a central `DeepLinkRouter` mapping `data.url` paths to destinations. On regular width (iPad), a `NavigationSplitView`/sidebar substitutes for the tab bar (parity with Android's nav-rail).

## Alternatives Considered
- **UIKit coordinators** — more control but more boilerplate; SwiftUI navigation is now sufficient (iOS 16+). Kept as a fallback for the feed if paging needs it.
- **Single global router for everything** — rejected; per-tab stacks match the product's tab isolation and Web/Android.

## Consequences
- Matches Web IA exactly; deep links unified.
- The feed's bespoke nav is encapsulated in its tab, preserving the "never merge" rule.
- Requires care with `TabView` + `AVPlayer` lifecycle (see ADR-009).

## Future Evolution
If SwiftUI navigation limits the feed, wrap that one tab in a UIKit `UIPageViewController` without changing the rest.
