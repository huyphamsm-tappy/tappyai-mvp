# Cross-Platform Synchronization Report — 2026-07-11

**Scope:** synchronize Android (`android/`) and iOS (`ios/` + `docs/ios/`) with the
current production Web platform (single source of truth), after the Web-only period
that ended with the AI Platform v1.0 freeze.

**Method:** full Web change inventory (26 commits since the native pause, 2026-07-09)
→ three deep audits (Android code, iOS code, 21 iOS docs + Android docs) → targeted
fixes → build verification. Nothing was assumed from old documents; every claim below
was verified against source.

---

## 1. Web changes inventoried (what native had to catch up to)

| Change-set | Commits | Native impact |
|---|---|---|
| Multi-LLM AI Platform v1.0 + frozen law + Architecture Guard | `20cd623`, `aa2c8dd`, `d7efb7d` | Clients must never know provider/model; docs must stop naming models |
| Freemium: free 10→15/day, "come back tomorrow", Pro hidden app-wide | `66aedb8` | Contract change (429 body, no `upgradeUrl`) + every Pro UI must hide |
| Feed playback: parent-driven `active` + watchdog, no mute button, per-clip audio | `ce68a90`…`43da5db`, `8f81353`, `a0de3ca`, `239a160` | Patterns + bug fixes for future native feed |
| Original Sound Phase 1: `music.origin`, `duration` field, auto-registration | `5f0385e`, `239a160` | POST /api/reviews contract + DB shape |
| Mascot: 18 poses, motion system, `getTappyPose()` state engine | `70e5a55`…`984081c`, `6ec3ae3` | UX parity spec for native |
| PWA version watcher `GET /api/version`; feed fetch cascade fix | `bb15b48`, `031fcc7` | New endpoint (N/A native); bug pattern |

## 2. Audit verdicts

### Android (`android/`) — UI foundation, auth-only backend
- **AI Platform:** ✅ CLEAN — zero provider SDKs/models/keys (verified sweep).
- **Backend calls:** only Supabase auth is real; zero `/api/*` REST calls exist yet.
  Chat is an explicit no-network placeholder → no chat-contract drift possible.
- **Violations found & FIXED:**
  - `MembershipContent.kt` said **"10 messages / day"** → corrected to **15** (+ sync comment).
  - Profile **"Upgrade to Pro" row was visible** → now gated behind
    `SHOW_PRO_UPGRADE = false` (mirrors web `ProfileView`); `MembershipScreen`
    kept but unreachable, exactly like web's unlinked `/subscription`.
  - New **ADR-0003** records the Pro-hidden decision + AI Platform v1.0 client rules
    (the frozen `Android_Architecture.md` requires a superseding ADR).
  - `FEATURE_STATUS.md` rows (Chat/Profile/Membership) updated with the new truths
    and the chat-contract requirements for when networking lands.
- **Verified:** `:app:compileDebugKotlin` passes after edits.

### iOS (`ios/`) — Phase 0 foundation + Phase 1 auth
- **AI Platform:** ✅ CLEAN — zero matches for any provider/model/key; only
  supabase-swift as a dependency. Error copy already says "come back tomorrow"
  (free) / sign-in (anon); no quota numbers or Pro UI hardcoded anywhere. 👏
- **Gaps found & FIXED:**
  - `StreamingClient` threw a generic error on non-2xx **without reading the body**
    → chat's `free_limit_reached` / `anon_limit_reached` UX would have been lost.
    Now reads the (bounded, 64 KB) error body and maps it through the same
    `mapHTTP` as the non-streaming path.
  - `DataStreamLineParser` had no **`f:` (message-start)** frame → added
    `StreamFrame.messageStart(Data)` + parser case + locking test.
  - `README.md` claimed "no Auth" (stale) → updated; added an **AI Platform v1.0
    guardrail** section binding this client to the frozen law.
- **Not verifiable on Windows:** Swift compilation (no Xcode). Edits are minimal and
  style-consistent; must be confirmed on a Mac (pre-existing risk, see §6).

### Web — one real bug found by the sync (bug parity works both ways)
- `/subscription` page (unlinked but reachable) still said **"10 tin nhắn/ngày"** and
  computed `remaining = 10 - count` against the enforced 15 → **fixed to 15** in all
  3 spots. This also resolves the "10-vs-15 inconsistency" flagged across 9 iOS docs.

### Documentation (`docs/ios/` — 21 docs)
- Freemium (15/day, Pro-OFF, no-upsell), feed watchdog, original-sound core, and the
  18-pose count were **already correct** (the dossier was written well).
- **Dominant staleness:** the AI model was named in 9 docs — including two
  load-bearing instructions (`15_MIGRATION_STRATEGY` listing the model as an iOS
  *invariant*, `13_PARITY_GOVERNANCE` DoD requiring "same model"). All de-named to
  "backend AI capability layer (provider-abstracted)" per AI Platform v1.0.
- Contract docs gained: `reviews.music.origin`, POST `/api/reviews` `duration`,
  `GET /api/version`, `getTappyPose()` engine spec, ReviewMusicDisc nav-link
  behavior, and "10-vs-15 RESOLVED" annotations.

## 3. Parity status (honest)

Native apps were paused early by design — parity here means **"what exists is
correct", not "everything exists"**.

| Surface | Web | Android | iOS |
|---|---|---|---|
| Auth (email/OAuth/anon) | ✅ | ✅ implemented, contract-current | ✅ implemented, contract-current |
| Chat | ✅ | UI only (no network, by design) | Transport ready (parser/errors now contract-current), no UI |
| Explore/Feed/Reviews | ✅ | Discovery UI shell only | Placeholder |
| Deals/Recs/Music/etc. | ✅ | UI shells / deferred | Placeholder |
| Freemium behavior | ✅ 15/day | ✅ copy fixed, Pro hidden | ✅ already correct |
| AI Platform v1.0 compliance | ✅ guarded | ✅ clean | ✅ clean |
| Mascot system | ✅ 18 poses | ❌ absent (backlog) | ❌ absent (backlog) |
| **Implemented-surface parity** | — | **100 %** | **100 %** |
| **Feature-breadth coverage** | 100 % | ~25 % | ~10 % |

**No previously-fixed Web bug exists on native** (the Web bug classes — feed
autoplay races, fetch cascades, mute-state drift — live in code paths native has
not built yet; the fixed patterns are now documented in their specs so they won't
be re-introduced).

## 4. Rules confirmed intact
Backend owns business behavior (no duplicated validation/ranking/recommendation
logic found on either client — only two cosmetic emoji-map mirrors on Android,
flagged in its docs). No provider SDKs on any client. Web untouched except the
`/subscription` 10→15 bug fix. Architecture Guard passes 7/7 after all changes.

## 5. Files changed
- **Web (tracked, committed):** `src/app/subscription/page.tsx` (3× 10→15), this report.
- **Android (local, untracked dir):** `app/.../membership/MembershipContent.kt`,
  `app/.../profile/ProfileScreen.kt`, `docs/FEATURE_STATUS.md`,
  `docs/adr/0003-pro-hidden-and-ai-platform-client-rules.md` (new).
- **iOS (local, untracked dir):** `TappyAI/Core/Networking/StreamingClient.swift`,
  `TappyAITests/DataStreamLineParserTests.swift`, `README.md`.
- **docs/ios (local, untracked dir):** 12+ docs updated per §2.

## 6. Risks / follow-ups
1. **iOS Swift edits unverified on Windows** — compile + run tests on a Mac before Phase 2.
2. `android/`, `ios/`, `docs/ios/` are **untracked** — sync edits live on disk only;
   decide whether to commit these trees (recommend: yes, with build-dir .gitignore).
3. Architecture Guard scans `src/` only — native AI-platform compliance relies on
   review + ADR-0003 / README guardrails until a native guard is added.
4. When native chat/feed/upload get built, spec from the **updated** docs (origin/
   duration fields, per-clip audio, 15/day) — not from memory of the old Web.

## 7. Confirmation
Android and iOS are **synchronized with the current production Web platform for
every surface they implement**, are fully compliant with AI Platform v1.0, contain
no stale business values, no Web-fixed bugs, and their governing documents now
reflect the production Web. Native feature development may resume from this baseline.
