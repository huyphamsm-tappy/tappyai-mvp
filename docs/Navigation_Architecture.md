# TappyAI — Navigation Architecture

> **Phase:** Architecture Week — Part 4
> **Status:** Design/analysis only — no code changes, no migrations
> **Grounding:** Verified against `src/components/BottomNav.tsx`, `src/app/reviews/page.tsx` (full `TikNav` mobile tab bar + `?tab=` deep-link sync), `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/reviews/new/page.tsx`, `src/components/ChatInterface.tsx` (modal/lightbox patterns, save-then-`router.replace` flow), and route existence confirmed across every prior Architecture Week document this session. No claim is speculative.

---

## 1. Route Tree

```
Splash (implicit — Next.js app shell load, no dedicated splash route found)
    ↓
Home ( / )                                          [Guest OK]
    ├── Chat ( /chat , /chat/[id] )                  [Guest OK for /chat · Login required for /chat/[id]]
    ├── Explore ( /reviews — own in-page tab system, see §4 )
    │     ├── Home feed tab                          [Guest OK]
    │     ├── Explore/search tab                     [Guest OK]
    │     ├── Inbox (notifications) tab               [Login required]
    │     └── Profile tab                              [Login required]
    ├── Search ( inside Explore's tab system, not a separate route — §4 )
    ├── Trips ( does not exist as a route — Explore doc §1.7, no persistence layer built )
    └── Profile cluster ( /profile/* — edit, preferences, settings, favorites,
          bookings, price-watches, notifications, account, history,
          integrations, posts, tappy-knows, privacy, terms )        [Login required, every screen]

Sibling routes, not under Home's tree but reachable from it:
    /login, /register                                 [Guest-only entry — redirect away if already logged in]
    /onboarding                                        [Post-first-login only — auth/callback redirects here]
    /reviews/new (Upload)                               [Login required — §6]
    /reviews/[id] (Explore detail)                        [Guest OK to view · actions require login]
    /reviews/creator/[id] (Creator profile)                 [Guest OK to view · follow requires login]
    /users/[id] (Public profile)                              [Guest OK]
    /service/[id]                                              [Guest OK to view · booking requires login]
    /subscription                                               [Guest OK to view pricing · checkout requires login]
    /group/new, /group/[id] ("Tappy Together")                  [Login required — consistent with every write pattern]
    Utility tools: /currency, /split-bill, /translate, /scan,
      /boi/*, /game/*, /deals, /viet-content                     [Guest OK — standalone utilities]
```

---

## 2. Guest vs. Login Boundary

Directly restated from `Authentication_Architecture.md` §2.2/§4, applied per-screen here:

| Allowed for Guest | Requires Login |
|---|---|
| Home, Chat (new conversation), Explore feed browsing (home + search tabs), video playback, place/CTA links, Search, all standalone utility tools | Saved conversations (`/chat/[id]`), Explore Inbox + Profile tabs, Upload, Comment, Like, Save, Follow, Booking checkout, Subscription checkout, Group creation/join, entire `/profile/*` cluster |

**No screen forces login before showing content** — the guest boundary is enforced at the *action* level (a 401 from the API, per `Authentication_Architecture.md` §4's Guest Flow), not at the *route* level, with three confirmed exceptions where the route itself gates: `/reviews/new`'s submit handler explicitly checks for a session before posting (redirects to `/login?returnTo=/reviews/new`), Explore's in-page `profile`/`inbox` tabs show a login prompt in place of content rather than fetching anything, and the entire `/profile/*` cluster is inherently personal-data-only.

---

## 3. Deep Link

- **Explore's in-page tabs are already deep-linkable — a real, working, non-trivial pattern, verified in full:** `?tab=home|explore|inbox|profile` on `/reviews` is read on initial mount (`URLSearchParams`, falling back to a `sessionStorage`-cached tab for return-navigation), and every tab switch calls `router.replace(pathname + '?tab=' + t, {scroll:false})` — updating the URL without adding a browser-history entry. This means a shared `/reviews?tab=profile` link, or a "Trip Planner Integration" future flow that needs to land a user on a specific Explore tab, already has the mechanism to do so.
- **Chat's `?q=` seeding** (confirmed across this entire session: Home's search bar, and proposed for Explore's "Ask Tappy" in `Explore_AI_Platform_Architecture.md` §3.4) is the other established deep-link pattern — `/chat?q=<prefilled question>` opens chat with an initial message ready to send.
- **`returnTo` on `/login`** (`Authentication_Architecture.md` §3/§4) is itself a deep-link mechanism — it's how the app returns a user to their original destination after an auth detour.
- **No Android App Link / universal-link route-mapping was found or is proposed here** — if Android ships as a TWA (per the already-configured `assetlinks.json`, `Authentication_Architecture.md` §1/§8), every web route above is automatically deep-linkable from a TWA without any additional mapping, since a TWA *is* the web app. This is a genuine, free consequence of the TWA path, not something to build separately.

---

## 4. Back Stack

- **No custom back-stack management exists anywhere** — the app relies entirely on Next.js App Router's native browser history (`router.push`/`router.replace`/`router.back()`, confirmed used consistently across every page read this session).
- **One already-solved, non-obvious back-stack edge case, worth crediting explicitly:** `auth/callback/route.ts`'s redirect-after-login deliberately uses a fresh `NextResponse.redirect()` rather than mutating an existing response (documented in its own code comment), and the login page's `/login`→destination redirect uses `router.replace()` specifically to avoid iOS Safari's known back-button behavior of re-adding history entries during a Back-navigation replay, which would otherwise create an infinite Back→login→destination loop. This is real, already-shipped correctness work, not a gap.
- **Explore's `router.replace` for tab switching (§3)** is the same discipline applied a second time — switching tabs doesn't pollute back-history with every intermediate tab view, so pressing Back from Explore returns the user to wherever they were *before* entering Explore, not to their third-to-last tab click.

### 🆕 New finding — modals do not participate in the back stack (flagged per Working Rules)
- **Current State:** every modal/overlay pattern found this session (chat's image lightbox, the emoji panel, the onboarding modal, Explore's comment sheet and post-management bottom sheet) is pure React state (`useState`), toggled directly — none of them push a browser-history entry when opened.
- **Impact:** on a platform where the hardware/system Back gesture is expected to close the topmost UI layer (Android, especially relevant if Android ships as a TWA per `Authentication_Architecture.md` §8), pressing Back while any of these modals is open will **not** close the modal — it will navigate the underlying page back (or exit the TWA/app if there's no further history), which is a well-known, jarring PWA/TWA UX pitfall, not a hypothetical one.
- **Recommendation:** before an Android TWA ships, add a lightweight `history.pushState` (or Next.js-router-compatible equivalent) on modal-open and listen for `popstate` to close the modal instead of navigating — a small, well-understood pattern, not a redesign. Not proposed as code here per this document's scope.
- **Priority:** Medium — not blocking for a web-only launch, but should be resolved **before**, not after, an Android TWA ships, since it's a first-impression UX issue on exactly the platform Architecture Week is preparing for.

---

## 5. Bottom Navigation

**Two independent bottom-navigation components exist, by design, confirmed via both files' source:**
- **`BottomNav.tsx`** (global) — 5 tabs (Home/Chat/Explore/Deals/Profile), fixed, hidden entirely via an early-return (`if (pathname.startsWith('/reviews')) return null`) whenever the user is inside Explore.
- **`TikNav`** (Explore-internal, defined inside `reviews/page.tsx`) — 4 destinations (Home/Explore/Inbox/Profile) plus a central "Post" button linking to `/reviews/new`, driving the in-page `tab` state (§3/§4), not routing.

**This is correct, not duplicated-by-accident:** Explore's TikTok-style full-bleed video experience needs its own persistent, always-visible action row (including the prominent Post CTA) that the generic global nav doesn't provide — the two navs never render simultaneously (confirmed by the early-return), and a user always sees exactly one.

---

## 6. Modal Flow

Consistent pattern across every instance found: local React state → conditional render → `fixed inset-0` backdrop with click-outside-to-close → no history entry (§4's flagged gap). Examples verified this session: image lightbox (Chat), emoji picker (Chat + Home search bar), onboarding modal (Chat), comment sheet + post-management sheet (Explore). No modal in the app is implemented as a route/page — this is a consistent, deliberate architectural choice, not an inconsistency.

---

## 7. Upload Flow

```
/reviews (TikNav "+" button) → /reviews/new
      ↓
Media mode select: Photo | Video | URL import           [client state, no route change]
      ↓
Photo: /api/reviews/upload per file (up to 6)
Video: client-side validation → Blob upload (thumbnail + video) → /api/explore/process (AI, fire-and-forget UX)
URL: paste link → detectSource() → /api/explore/oembed (TikTok/FB) or client-side (YouTube) → /api/explore/process
      ↓
Submit ("Đăng" button, disabled until canPost + not isUploading + not submitting)
      ↓
No session → router.push('/login?returnTo=/reviews/new')     [confirmed in handleSubmit]
Has session → POST /api/reviews → success screen (1.5s) → router.push('/reviews')
```
Fully verified against `reviews/new/page.tsx`'s actual `handleSubmit`/`handleVideoSelect`/`handleUrlChange` implementations — not inferred.

---

## 8. Chat Flow

```
Home ?q=<seed> or Explore "Ask Tappy" (proposed, Explore doc §3.4) → /chat?q=<text>
      ↓
First message sent (no conversation id yet)                [Guest OK]
      ↓
Response streams; on completion, chat auto-saves the conversation
      ↓
router.replace('/chat/' + newId)   [NOT router.push — deliberately avoids adding a spurious
                                     back-stack entry, so Back from a saved chat returns to
                                     wherever the user was before starting the chat, not to
                                     the pre-save /chat URL — same discipline as §3/§4]
      ↓
Subsequent messages: PATCH-equivalent append to the same conversation, same URL, no navigation
```
Guest chatting works fully (§2) but produces no persisted `/chat/[id]` — the conversation exists only for the duration of the client session, consistent with `Authentication_Architecture.md` §2.2's stated personalization trade-off for anonymous use.

---

*This document is Architecture Week Part 4. No code changes were made. Awaiting review.*
