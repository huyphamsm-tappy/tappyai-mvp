# TappyAI V3 — iOS Verification Plan (Phase 4B)

**Status:** iOS implementation **COMPLETE but UNVERIFIED**
**Blocker:** no Swift toolchain on the development machine (Windows). `swift`, `swiftc` and
`xcodebuild` are all absent — confirmed, not assumed.

Everything below was written without ever being compiled. This document exists so the first
macOS/Xcode session can verify it in a defined order rather than rediscovering what changed.

---

## 1. What to verify, in dependency order

Fix failures in this order; each stage's correctness is assumed by the next.

| # | Area | Files |
|---|---|---|
| 1 | Marker parsing (D2) | `Features/Chat/Model/ContentParser.swift` |
| 2 | Decision model (D1) | `Features/Chat/Model/ShoppingDecisionView.swift` |
| 3 | Comparison derivation | `Features/Chat/Model/ShoppingComparison.swift` |
| 4 | Decision card | `Features/Chat/UI/ShoppingDecisionCardView.swift` |
| 5 | Comparison + confirmation sheets | `Features/Chat/UI/ShoppingComparisonSheet.swift` |
| 6 | Chat wiring | `Features/Chat/UI/ChatMessageList.swift`, `Features/Chat/Model/ChatModels.swift` |
| 7 | AI-first Home | `Features/Home/UI/HomeView.swift` |
| 8 | Strings | `Resources/Localizable.xcstrings` (+26 keys) |

**Tests to run**
- `TappyAITests/ContentParserFixtureConformanceTests.swift` — reads the shared fixtures
- `TappyAITests/ShoppingComparisonTests.swift`
- `TappyAITests/ContentParserMarkerLeakTests.swift` — **pre-existing; must still pass**

---

## 2. The two failures most likely to appear first

Written blind, these are where the risk concentrates.

### 2.1 Memberwise initialisers
`ShoppingDecisionView`, `ShoppingEntityView` and `ShoppingRecommendationView` each declare
`init(from decoder:)`, which **suppresses Swift's synthesised memberwise init**. Explicit
initialisers were added for exactly this reason. If a "missing argument" or "extra argument" error
appears in `ShoppingComparisonTests`, the initialiser signature — not the test — is what to check.

### 2.2 Design-system token names
`TappyFont` has no `.subheadline` (the set is `largeTitle · title · headline · body · bodyEmphasis
· callout · footnote · caption · button`). That was caught and fixed once by reading
`Typography.swift`; any similar name used in the new views should be checked against
`DesignSystem/Tokens/` rather than assumed from UIKit habit.

Also worth confirming: `TappyColor.warning`, `TappyColor.success`, `TappyColor.danger`,
`TappyColor.border`, `Radius.md/lg`, `Spacing.xxs…lg`, and `minimumTapTarget()` are all used by the
new views and all read from existing tokens.

---

## 3. Fixture path resolution

`ContentParserFixtureConformanceTests` locates `shared/structured-content/marker-fixtures.json` by
walking up from `#filePath`, deliberately **not** from the test bundle — all three platforms must
read one physical file, and a copied fixture is a fixture that can drift.

If the file is not found the test throws `XCTSkip`. **A skip here is a failure of this plan, not a
pass.** Confirm the assertions actually ran; a green suite that skipped the conformance test proves
nothing, which is the exact trap `scripts/requiredSuites.mjs` exists to catch on the web side.

---

## 4. Parity expectations

These have already passed on Web and Android. iOS must agree, and the shared fixtures are what make
that checkable rather than reviewable.

| Case | Expectation |
|---|---|
| `cta-bare-then-followups` | Buttons decoded; **prose after the block survives** |
| `cta-bare-then-prose` | Trailing prose survives |
| `cta-brace-in-label` | A `}` inside a JSON string does not end the scan |
| `shopping-full` | Decision decodes; no payload in the visible text |
| `plan-truncated` | Decodes to nothing; leaks nothing |
| `all-markers-in-order` | Prose survives; every block consumed |

**The regression this guards:** iOS previously lost the CTA buttons *and* deleted every character
after the block, because `stripMarkerResidue`'s end-anchored pattern ran on a block `parseCTA` had
declined. `cta-bare-then-prose` is the case that fails if the brace matcher is wrong.

---

## 5. What cannot be verified by compiling

Compilation and unit tests will not establish these. They need a simulator or a device:

- SwiftUI layout of `ShoppingDecisionCardView` and `ShoppingComparisonSheet` at phone width
- Sheet detents and swipe-to-dismiss resolving to **cancel** (never confirm)
- Dynamic Type at the largest sizes
- VoiceOver order and labels on the decision card and the comparison grid
- Reduce Motion
- The Home reorder as rendered

Until then, iOS should be reported as **implemented, compiled-unverified, runtime-unverified** —
in that order of increasing uncertainty.

---

## 6. Suggested command sequence

```bash
xcodebuild -scheme TappyAI -destination 'platform=iOS Simulator,name=iPhone 15' build
xcodebuild test -scheme TappyAI -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:TappyAITests/ContentParserFixtureConformanceTests \
  -only-testing:TappyAITests/ShoppingComparisonTests \
  -only-testing:TappyAITests/ContentParserMarkerLeakTests
```

Then the full suite. Report executed/failed/skipped counts — **not** "build succeeded", which on
this project has meant zero tests ran more than once.

---

## 7. If a new file is missing from the Xcode project

The repo's `project.pbxproj` was not edited, because doing so blind is how a project file gets
corrupted. Six new Swift files may need adding to the `TappyAI` and `TappyAITests` targets:

```
TappyAI/Features/Chat/Model/ShoppingDecisionView.swift
TappyAI/Features/Chat/Model/ShoppingComparison.swift
TappyAI/Features/Chat/UI/ShoppingDecisionCardView.swift
TappyAI/Features/Chat/UI/ShoppingComparisonSheet.swift
TappyAITests/ContentParserFixtureConformanceTests.swift
TappyAITests/ShoppingComparisonTests.swift
```

If the project uses file-system synchronised groups (Xcode 16+), they are picked up automatically
and nothing is needed.
