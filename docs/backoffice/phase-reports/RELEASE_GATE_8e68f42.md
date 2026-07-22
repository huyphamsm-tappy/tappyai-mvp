# Release Gate — commit `8e68f42` (Backend Production Hardening Sprint)

**Status:** 🟢 **Ready for Release** — smoke tests S1–S5,S8 PASS (owner-accepted 2026-07-13). Release Approval pending S6 (Stripe) + S7 (Zalo) owner production verification. Not pushed, not deployed. See [`FINAL_RELEASE_READINESS_8e68f42.md`](FINAL_RELEASE_READINESS_8e68f42.md).
**Commit:** `8e68f42` (parent of Phase 0 `dc7fc84`; unmodified)
**Evidence base:** [`DEPLOYMENT_READINESS_8e68f42.md`](DEPLOYMENT_READINESS_8e68f42.md)
**Relationship to Phase 0:** independent. This gate releases `8e68f42` **alone**. Phase 0 (`dc7fc84`) remains held on `feat/backoffice-phase0` and continues under its own gate afterward.

---

## 1. Scope of the release

Deploy the backend production hardening sprint by fast-forwarding production from `a4fda40` → `8e68f42` (1 commit). 28 files, +1032 / −29. **No Phase 0 code, no back office code.**

**Deploy mechanic:** push local `main` (already at `8e68f42`) → `origin/main`. This is a clean fast-forward and does **not** include `dc7fc84`.

## 2. Impacted features

| Feature | Change | Nature |
|---|---|---|
| Zalo login | O(n) `listUsers` → try-create | Fix (auth beyond 1000 users) |
| Sound play-count (`/api/sound/[id]/play`) | per-IP 30/min limit | New protection |
| Review interactions (`/api/reviews/[id]/interact`) | per-user 10/min limit | New protection |
| Conversations (`/api/conversations`) | payload validation (≤200 msgs, 512 KB) | New protection |
| Stripe webhook / Pro grant | correct columns `stripe_sub_id`,`plan` | **Fix** (Pro-never-granted) |
| Apple IAP (`/api/iap/apple/*`) | new verify + notifications + lib | New (self-guards → 503 if unconfigured) |
| Subscription status (`/api/subscription`) | unified endpoint | New |
| Health (`/api/health`) | liveness + DB probe | New |
| Universal links (AASA) | `.well-known` + route | New |
| Push notifications | dead-token pruning on failure | Hardening |
| Chat (`/api/chat`) | provider isolation, 20k history cap, abort on disconnect | Behavioral change (core path) |

## 3. Required smoke tests (post-deploy, before sign-off)

| # | Test | Who | Pass criteria |
|---|---|---|---|
| S1 | `GET /api/health` | Claude | 200, DB reachable=true |
| S2 | Chat round-trip (send → streamed reply) | Claude (browser) | Response returns, no error |
| S3 | Apple IAP graceful degradation: `POST /api/iap/apple/verify` unconfigured | Claude | **503** "IAP verification unavailable" (not 500/crash) |
| S4 | Rate limit spot check: hammer `/api/sound/[id]/play` > 30/min | Claude | eventually **429** |
| S5 | `GET /api/subscription` for a logged-in user | Claude/owner | 200 with status shape |
| S6 | Stripe Pro-grant path | **Owner** | Send a Stripe **test** `checkout.session.completed` (or CLI `stripe trigger`) → `subscriptions` row upserted with `plan` set; verify Pro granted |
| S7 | Zalo login | **Owner** | Login succeeds (needs a Zalo account) |
| S8 | Core regression: reviews feed loads, existing login works | Claude/owner | No regression |

*S6/S7 require owner credentials/accounts Claude cannot access.*

## 4. Rollback plan

- **Primary:** Vercel **Instant Rollback** to the previous production deployment (`a4fda40`). Code-only; no data migration to reverse.
- **Git (if needed):** production returns to `a4fda40`; do **not** force-push over `8e68f42` history — use Vercel rollback, then re-cut when fixed.
- **DB:** none required — `8e68f42`'s migration (`20260712`) is already applied, idempotent, and additive (indexes + RLS); nothing to undo.
- **Env:** if `APPLE_IAP_*` were added and misbehave, unset them — endpoints revert to the guarded 503 path. No other env change.

## 5. Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Chat behavioral change (isolation/caps/abort) regresses a flow | Med | Low | S2 + S8; instant rollback |
| Rate limits throttle legitimate bursts | Low | Low | Conservative thresholds; in-memory per-instance |
| `APPLE_IAP_*` unset in Vercel | Low | Med | Self-guards → 503; iOS IAP not live; S3 confirms |
| Stripe fix interacts with live billing | Med | Low | S6 with **test** event first; verify columns already present |
| Not shipping keeps Pro-never-granted bug live | (cost of NOT deploying) | — | Deploying resolves it |

## 6. Production verification checklist (RV)

| # | Item | Status |
|---|---|---|
| RV-1 | `/api/health` 200 + DB reachable | ⏳ |
| RV-2 | Chat round-trip works | ⏳ |
| RV-3 | Stripe test event → Pro granted, correct columns | ⏳ |
| RV-4 | Rate limits enforce (429) | ⏳ |
| RV-5 | IAP verify → 503 (graceful, no crash) | ⏳ |
| RV-6 | `/api/subscription` returns status | ⏳ |
| RV-7 | No regression: feed loads, login works | ⏳ |

## 7. Owner approval

`8e68f42` is released only when S1–S8 + RV-1…RV-7 pass **and** the owner signs off.

- [ ] Smoke tests S1–S8 pass
- [ ] Production verification RV-1…RV-7 pass
- [ ] Owner approval granted

_Owner approval: __________________  Date: ___________

---

**After `8e68f42` is released and verified, resume the existing Phase 0 Release Gate** using the already-approved commit `dc7fc84` (now a clean fast-forward on top of `8e68f42`).

*No merge. No deploy. No commit modified. Phase 0 held. Phase 1 not started.*
