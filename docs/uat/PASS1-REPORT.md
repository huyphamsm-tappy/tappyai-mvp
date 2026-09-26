# PASS 1 — Inventory & Audit Report

**Branch** `uat/release-audit-2026-09` ← `merge/main-into-v3 @ d96d06b` · **Production** `origin/main @ 842379b` · **Date** 2026-09-20 · **Environment** local `next dev -p 3101` against non-prod Supabase `zdaprdfgpbpnxyofagmc` · Read-only pass (no source edits; only `docs/uat/**` written).

**Scope (owner revision, 2026-09-20):** a **backend audit of the DELTA** (`842379b..d96d06b`, 378 commits / 2 212 files) on an initially **empty** non-prod DB, not a full-product UAT. Priorities executed in order: §3.1 secrets → §3.2 auth/authz/RLS/IDOR (core) → §3.3 chat quota → §3.10 contract → §3.11 schema → §3.17 AI-safety subset → §3.5 affiliate, plus §3.6 (scam-shield inventory+legal) and §3.9 (music inventory). UI/runtime sections were DEFERRED by the owner.

## 1. Coverage table

| Section | State | Note |
|---|---|---|
| STEP 0 pre-flights | AUDITED | Worktree/branch confirmed; DB target = non-prod ref read from the running app's bundle; Playwright+Chromium installed and launched (0 console errors) |
| STEP 2 inventory | AUDITED | `docs/uat/inventory.md` — 78 web pages, 138 API routes, 80 tables, 186 fns, providers, flags, analytics, policies, delta |
| 3.1 secrets & supply chain | AUDITED | Full-history blob scan (26 547 blobs), bundle check, `npm audit`, install scripts |
| 3.2 auth / authz / RLS / IDOR | AUDITED | A/B/merchant seeded via the app; RLS matrix over 45 tables; API IDOR on delta + admin + cron; auth lifecycle |
| 3.3 main chat quota + AI | AUDITED | 20 live LLM turns: charge timing, no-double-charge, atomic race, failure charging, cross-user leak |
| 3.5 affiliate / commerce | AUDITED (config+static) | 17 providers, resolver/param-echo/registry; **runtime wrapping UNVERIFIED** (no publisher id) |
| 3.6 scam shield (inventory+legal) | AUDITED | No phone-lookup exists; legal wording reviewed |
| 3.9 music reuse | AUDITED (inventory) | Fully wired; recorded for PASS 2 |
| 3.10 frontend↔backend contract | PARTIAL | Highest-risk delta cross-platform routes traced (no drift); full coverage not done (backend scope) |
| 3.11 data integrity | AUDITED (schema) | Delta tables RLS/FK/index correct; **query plans UNVERIFIED on empty DB** |
| 3.17 AI safety subset | AUDITED | Injection (direct/memory/tool-result), extraction, XSS, SSRF — all blocked; golden-set scoring DEFERRED |
| 3.23 build/test baseline | AUDITED | tsc 0, lint 0/2 warn, vitest 13 864 pass / 0 fail |
| 3.4 five-domain quality | **DEFERRED** | needs real place data (owner) |
| 3.7 notifications UI · 3.8 theme · 3.14 web sweep · 3.15 Android | **DEFERRED** | UI/runtime out of backend scope |
| 3.12 policy/store · 3.13 localization · 3.16 iOS runtime | **DEFERRED** | static-only / out of scope this pass |
| 3.18 cost · 3.19 GA · 3.20 observability · 3.21 perf · 3.22 resilience | **DEFERRED** | GA pre-declared (F-001); rest need runtime/scale |
| 3.17 AI golden-set scoring | **DEFERRED** | no data to recommend from (empty DB) |

## 2. Findings summary (26 total)

By severity: **P0 ×1, P1 ×2, P2 ×8, P3 ×15** (15 P3 are verified-PASS records + minor status-code cosmetics). By surface: backend 11, infra 6, web 3, db 2, ai 2, android 1, policy 1. Full detail in `docs/uat/findings.json` (JSONL); evidence in `docs/uat/evidence/`.

## 3. The findings that most endanger the launch

1. **F-002 (P0, infra)** — `next@14.2.35` carries two *critical* unauthenticated-RCE advisories (Image-Optimization/AVIF `GHSA-2xp9-vwfh-vxw4`, range `<15.5.24`) plus high SSRF/DoS; the image optimizer is live (`remotePatterns` set, `sharp` backend). No 14.x patch exists — the fix is a Next 15.5 major. **Needs an owner decision** (confirm Vercel platform mitigation and/or plan the upgrade and/or disable AVIF interim).
2. **F-015 (P1, backend)** — a **failed AI answer is charged** to the user's daily quota: `/api/chat` consumes the question before the model call, returns HTTP 200 with a stream error part, and has no refund path. During any provider outage every free user burns 15 questions on errors.
3. **F-001 (P1, infra)** — **GA not configured for production** (owner-pre-declared); no interim measurement at launch. Growth/GEO ships blind.
4. **F-014 (P2, backend)** — `/api/debug-places` and `/api/test-photos` are **unauthenticated in non-production** and call paid providers (Places/Serper) on every hit; production gate is a shared `CRON_SECRET`, code-verified only. Diagnostics should not be in the prod bundle.
5. **F-020 (P2, infra)** — **affiliate wrapping is UNVERIFIED** end-to-end: `ACCESSTRADE_PUBLISHER_ID` is unset in the audit env, so every wrapper falls back to a direct link. The money path (correct `go.isclix.com` URL, surviving tracking params, real approval state) was never exercised.
6. **F-023 (P2, policy)** — Scam Shield verdicts are hedged and evidence-backed, but there is **no scam-specific disclaimer/appeal** near a HIGH/CRITICAL verdict; residual defamation/UX risk in Vietnam. Flag for legal.
7. **F-024 (P2, web)** — **music "use this sound" reuse is fully wired and reachable** (routes, tables, UI); if §3.9 removal is truly intended for launch, it is still shipping. Owner must confirm intent.
8. **F-005 (P2, infra)** — 15 prod-dep advisories; `sharp 0.35.3` (optimizer backend, patch to 0.35.4), `nanoid`, `postcss`, `qs`, `glob`, `brace-expansion` — most are `npm audit fix`-able without majors.
9. **F-003 / F-004 (P2, android/infra)** — `google-services.json` committed (benign only if the Firebase key is restricted in GCP — owner must verify); an old Google key in a reflog-only commit `c473ade` (not in HEAD/prod, hash ≠ live key) — confirm it is disabled.
10. **F-010 (P2, infra)** — anonymous sign-in is **disabled on the audit project**, so the entire guest path (lifetime quota, `is_anonymous` RLS clauses, claim-anonymous) is **UNVERIFIED** this pass.

**Verified strong (PASS, recorded so they are not re-audited):** RLS/IDOR isolation across 45 tables with real counterpart rows (F-007); admin RBAC (12 endpoints × 2 users → 403) and cron auth (F-007); auth lifecycle — global-signout revocation, tampered-token rejection, no enumeration (F-013); quota atomicity — exactly 1 of 5 parallel admitted at remaining=1 (F-016); prompt-injection / system-prompt-extraction / output-XSS all blocked (F-017); SSRF defenses incl. DNS pinning and metadata-host refusal (F-018); commerce resolver never emits an unresolved link and blocks removed merchants (F-019); delta schema RLS/FK/indexes (F-025); cross-platform contract on sampled delta routes (F-026); green build/test baseline (F-016/3.23).

## 4. What I could not verify, and what it needs

| Item | Blocker | Needed from owner |
|---|---|---|
| Guest/anonymous path (quota, `is_anonymous` RLS, claim-anonymous) | anon sign-in disabled on audit project (503) | Enable "Allow anonymous sign-ins" in the audit project, then re-run |
| Affiliate wrapping end-to-end + campaign approval state | `ACCESSTRADE_PUBLISHER_ID` unset | Set it in the audit env; confirm each accesstrade campaign's live approval |
| Next.js RCE mitigation (F-002) | platform-dependent | Confirm with Vercel whether hosted deploys are mitigated; decide on upgrade |
| `google-services.json` key exposure (F-003) | GCP-side | Verify the Firebase Android key's app+API restrictions |
| Pro-tier quota, reset-boundary at runtime, scan/QR bucket | no pro account / clock control | Provide a non-prod Pro account; PASS 2/3 with clock control |
| Query plans on hot paths (§3.11) | empty DB | production-scale data or a representative fixture |
| GA client firing (§3.19), theme, web sweep, Android, iOS runtime, five-domain quality, perf, resilience | DEFERRED per scope | separate UI/runtime pass |

## 5. Honest overall read — if we shipped `d96d06b` today, what breaks first?

The **delta is solid on the things that usually go wrong**: isolation, authorization, injection, SSRF, and the commerce link-integrity architecture are all verified-good, and the whole suite is green. The launch risks are not in the new feature code — they are:

1. **The Next.js critical-RCE class (F-002)** is the single thing that could turn into an incident on day one if Vercel's platform mitigation does not cover it. This is the first thing to resolve.
2. **Quota-charging-on-failure (F-015)** breaks quietly and en masse the first time the Anthropic API has a bad hour — every free user hits their cap on errors and the client can't even tell (200s). High blast radius, cheap fix.
3. **Two P2 "shipping the wrong thing" items** need an owner yes/no before launch, not engineering: is music-reuse (F-024) supposed to be gone, and is the debug/test route pair (F-014) supposed to be in the bundle.
4. **GA blind at launch (F-001)** means you won't see the above break in the numbers.

Nothing found is a data-exposure or auth-bypass blocker. The blockers are one supply-chain P0 and one quota-correctness P1; everything else is a decision or a deferred verification.

## 6. LLM usage and cost

- **LLM-reaching chat requests this pass: 25** (§3.3: 3 normal + 15 race + 1 failed + 1 cross-user; §3.17: 5 injection/extraction/XSS turns) — well under the 300 ceiling.
- Model: `claude-haiku-4-5` family; each turn ~13 s, ~30 KB streamed, with tool calls. Estimated cost **< $0.50** (Haiku pricing, ~25 short agentic turns). Scam-shield `check` also made ~3 Serper/1 provider call in the debug-route probe.
- Golden-set (140-call budget) DEFERRED per owner — not spent.

*This pass proposes no release decision and made no source changes (R3). Findings and evidence are in `docs/uat/findings.json` and `docs/uat/evidence/`.*
