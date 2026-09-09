# The 18+ gate: what the existing user base experiences on first contact

**Status:** Audit + the minimal UX corrections it made necessary (implemented).
**Date:** 2026-09-08
**Related:** [ADR-027](../../architecture/ADR-027-user-demographics-isolation.md) · [`ageEligibility.ts`](../../../src/lib/account/ageEligibility.ts)

---

## 1. The population

`public.user_demographics` is created empty and **nothing is backfilled**. On the day this ships, *every* existing account has `ageStatus = 'unknown'` — not `ineligible`. They are not under age; they have never been asked.

That distinction is load-bearing. Enforcement stays fail-closed (product access is withheld), but nothing is recorded about anyone and no account is branded.

## 2. The defect this audit found

The eligibility redirects were placed where onboarding's is: on the **login transition** — the web auth callback, and Android's `AuthSessionState` change.

**No existing user passes through either.** They are already signed in. On the web they hold a session cookie the middleware silently refreshes; on Android `hasHandledInitialState` deliberately skips the cold-start value so a returning user is not re-navigated.

So before the corrections below, the entire existing base would have:

1. opened the app normally and seen nothing unusual,
2. sent their first message,
3. received `403 age_verification_required`, and
4. been shown the generic red *"Mình gặp trục trặc khi trả lời — bạn thử lại nhé?"* ("something went wrong, try again") — because `ChatInterface` matched no branch for the new code.

**Retrying is not what fixes it.** That is an unrecoverable loop presented as a transient error, for 100% of users, on day one. The gate would have been technically correct and practically broken.

## 3. The minimal corrections made

Three, all small, all on paths that already existed:

| Platform | Correction | File |
|---|---|---|
| Web | Home page (server component) reads eligibility inside the `Promise.all` it already runs and redirects to `/age-check` | [`(home)/page.tsx`](../../../src/app/(home)/page.tsx) |
| Web | `ChatInterface` recognises `age_verification_required` / `age_ineligible` and offers a button to `/age-check?next=…`, preserving the transcript via the existing `stashPendingChat()` | [`ChatInterface.tsx`](../../../src/components/ChatInterface.tsx) |
| Android | The cold-start branch runs `ageStatus()` and navigates to `AgeCheck` when not eligible | [`AppNavHost.kt`](../../../android/app/src/main/java/com/tappyai/app/navigation/AppNavHost.kt) |

None of them is enforcement. Every product API still refuses independently, so deep-linking past any of them changes nothing about what the account can do. They exist so the refusal is *actionable* rather than a dead end.

The Android cold-start check is deliberately **non-blocking**: the flag is set and the shell composes immediately, so startup is not gated on a network call. A user who turns out to be ineligible is moved a moment later; an eligible one sees nothing.

## 4. The expected one-time experience, after the corrections

**Web, returning signed-in user**
1. Opens TappyAI → home renders → server sees `unknown` → redirect to `/age-check`.
2. Enters day / month / year → `PATCH /api/profile { dateOfBirth }`.
3. 18+ → `router.replace` back to where they were going. **Asked once, ever.**
4. Under 18 → the refusal screen, with one self-correction offered and a sign-out.

**Web, user who happens to start in Chat rather than home**
Sends a message → 403 → the new branch shows the server's sentence and a button to `/age-check?next=<here>`; the transcript survives.

**Android, returning signed-in user**
Cold start → shell composes → eligibility check → `AgeCheck` screen → same two outcomes. Onboarding is *not* re-run: eligibility is checked before it, and an already-onboarded user goes straight to the shell once eligible.

**A user who signs out and back in** takes the clean auth-callback path and never sees any of the above.

## 5. The other gated surfaces

**RESOLVED.** These four now route through one shared handler,
[`ageGateClient.ts`](../../../src/lib/account/ageGateClient.ts), rather than four
bespoke error branches:

| Surface | Handler |
|---|---|
| `POST /api/reviews` | `apiFetch` in `reviews/new/page.tsx` |
| `POST /api/explore/process` | `apiFetch` in `reviews/new/page.tsx` (both call sites) |
| `GET /api/recommendations` | `apiFetch` in `recommendations/page.tsx` |
| `POST/PUT /api/conversations` | `apiFetch` in `chat/page.tsx` and `chat/[id]/ChatConversation.tsx` |

`apiFetch` behaves exactly like `fetch` for every response that is not an age
refusal — success, 401, 500, and even a 403 that is not ours pass straight
through with the body unread — so adopting it changed one identifier per call
site and no existing error handling.

Chat cannot use it, because `useChat` owns its own request. It shares the
DETECTOR instead (`isAgeGateMessage` + `redirectToAgeCheck`), so there is still
exactly one definition of what an age refusal is and one decision about where it
sends the user. A test asserts no surface kept a hand-rolled copy of either.

## 6. What is deliberately NOT done

- **No backfill, and no `is_over_18` default.** Assuming eligibility for existing accounts would defeat the gate on exactly the population it most needs to cover.
- **No grace period.** A "you have 7 days to answer" window is a product/legal decision, not a technical one, and fail-closed is what was directed.
- **No middleware-level redirect.** It would add a database read to every request on every route; the entry point plus per-API enforcement achieves the same outcome for a fraction of the cost.
- **No email or push campaign** telling users in advance. That is a marketing decision and needs the legal texts updated first.

## 7. Requires product decision

1. Whether to pre-announce the one-time age prompt.
2. Support tooling for a user who has spent their single self-correction. The
   database primitive now exists and is audited; the admin/support SURFACE that
   would call it is deferred to the Controller task and is a **launch blocker** —
   see [V3_DOB_ADMIN_CORRECTION_PATH.md](./V3_DOB_ADMIN_CORRECTION_PATH.md).
