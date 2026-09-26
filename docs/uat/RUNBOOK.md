# TappyAI — Final Release Readiness UAT (Claude Code Runbook)

> **How to use this file**
>
> 1. **§0 Environment Contract is pre-filled and must be treated as authoritative. Do not change it without explicit owner approval.**
> 2. Run **PASS 1** in a fresh Claude Code session. It only audits — it does not fix.
> 3. Review `docs/uat/findings.json`, then run **PASS 2** in a fresh session. It only fixes.
> 4. Run **PASS 3** in a fresh session. It re-verifies and writes the release report.
>
> Each pass is a separate session on purpose: auditing and fixing in one pass makes the audit a moving target, and a single 30-section mega-prompt gets skimmed after the first third.
>
> Copy the block starting at `=== PROMPT: PASS N ===` into the session, together with §0 and §A (shared rules).

---

## §0 — ENVIRONMENT CONTRACT (authoritative)

This section is pre-filled by the owner and is authoritative. Do not change it without
explicit owner approval. The agent must not invent answers to any of these. If a line is
left as `TODO`, or a PRE-FLIGHT CHECK cannot be satisfied, the agent must STOP and ask.

```
REPO ROOT:                D:\Claude\Projects\TappyAI\tappyai-mvp\.claude\worktrees\g1-place-guard
SHELL:                    PowerShell on Windows — do NOT assume bash/unix tooling.
                          If a unix-only tool (gitleaks, trufflehog, grep, jq) is unavailable,
                          use a Windows-native equivalent or PowerShell, and say which you used.
                          Never report UNVERIFIED merely because a unix command was missing.

BRANCH TO WORK ON:        uat/release-audit-2026-09   (create from: merge/main-into-v3 @ d96d06b)
MAIN/PROD BRANCH:         main  (agent must never commit or push here)

PRE-FLIGHT CHECK 1 — WORKTREE/BRANCH. Before anything else run `git worktree list`
and `git status`. Confirm which branch this worktree currently holds and that
merge/main-into-v3 @ d96d06b is genuinely the release candidate being audited.
Git refuses to check out a branch already held by another worktree — if branch
creation fails, STOP and ask me. Do not silently audit a different branch, and do
not detach HEAD to work around it.

TARGET ENVIRONMENT:       local
APP BASE URL:             http://localhost:3101
API BASE URL:             http://localhost:3101

DATABASE ACCESS:          read-write (non-prod/staging Supabase only)
MAY RUN MIGRATIONS:       yes (non-prod/staging only)
PRODUCTION DB ACCESS:     FORBIDDEN

SUPABASE PROJECT REF (non-prod):   zdaprdfgpbpnxyofagmc

PRE-FLIGHT CHECK 2 — DATABASE TARGET. This is a hard gate. Before ANY database
write, any migration, and any test that creates data, read the running app's
SUPABASE_URL / project ref from its environment and confirm it matches the
non-prod ref above. If it does not match, if the ref above is still TODO, or if
you cannot determine it with certainty: STOP and ask me. Do not proceed
read-only "just to be safe" — stop and ask. A local dev environment pointed at
the production Supabase project is the single most damaging mistake available in
this audit.

LLM CALLS ALLOWED:        yes
  Max real LLM calls:     300
  Budget ceiling (USD):   10
  Allocation (approximate — report actual usage per bucket):
      §3.3  Main Chat + quota tests ............  30
      §3.4  Five domains, conversational matrix.  70
      §3.6  Scam Shield ........................  25
      §3.17 AI golden set ......................  140
      reserve / re-tests .......................  35
  Track your running count and report it. If you approach the ceiling, STOP and
  ask before continuing — do not silently truncate the golden set.
  Providers permitted:    Anthropic only
  NOTE: because only one provider is permitted, provider fallback, provider
  routing and multi-provider failover (§3.18, §3.22) cannot be exercised.
  Report those as UNVERIFIED with this contract line as the reason. Do not
  substitute code reading and call it verified.

EXTERNAL NETWORK EGRESS:  yes
AFFILIATE: may follow real links and land on merchant pages?  yes
AFFILIATE: may complete a real purchase?  NO (always)

BROWSER AUTOMATION:       playwright installed? NOT YET — install it as step zero
  Run `npx playwright install chromium` at the start of PASS 1 and confirm it works.
  This is required, not optional: without a real browser you cannot verify GA
  (§3.19), web runtime behaviour and console/hydration errors (§3.14), theme on
  first paint (§3.8), or most resilience scenarios (§3.22).
  If installation fails, report exactly why, then continue in static-only mode
  and mark every runtime-dependent item UNVERIFIED. Do not quietly skip those
  sections, and do not substitute code reading for runtime evidence.

ANDROID:                  emulator/device available? yes   (adb reachable: %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe; emulator-5554 is available)
IOS:                      macOS + Xcode available? no     (runtime iOS = UNVERIFIED, static review only)

TEST ACCOUNTS:
  IMPORTANT: do NOT run the audit as an admin. An admin account has authority
  everywhere, so authorization, RLS and isolation bugs will look like correct
  behaviour. The default identity for all functional testing is plain user A.

  registered user A:      PRIMARY UAT ACCOUNT — plain non-admin user.
                          Credentials supplied out-of-band; if absent, create
                          uat2609_a@<test-domain> in the non-prod project.
  registered user B:      REQUIRED — a second plain non-admin user, owning its own
                          data. Used as the counterpart for every isolation test:
                          IDOR, RLS read/write as another user, cross-user chat
                          context leakage, notification and saved-item isolation.
                          Create uat2609_b@<test-domain> if not supplied.
                          §3.2 cannot be completed without this account.
  pro user:               existing non-prod Pro test account; credentials
                          out-of-band. Used only for Pro-specific quota tests.
  admin user:             existing non-prod Admin account; credentials out-of-band.
                          Use ONLY to test admin-endpoint behaviour and to confirm
                          that a NON-admin is correctly refused. Never the default.
  merchant user:          REQUIRED for merchant-role enforcement. Create
                          uat2609_merchant@<test-domain> if not supplied.
  anonymous/guest:        no account needed
  Cleanup rule:           prefix all created data with `uat2609_` and delete at end
                          of pass. Never delete data you did not create.
  If a needed credential is not supplied, ask me once, then create the account
  yourself in the non-prod project rather than skipping the test.

GA4:
  Measurement ID (prod):  NOT CONFIGURED. Treat this as an already-known finding:
                          file it in findings.json as P1 ("GA not configured for
                          production; interim measurement layer absent at launch")
                          rather than re-discovering it. It does not need root-cause
                          investigation — it needs an owner decision before launch.
  Measurement ID (stg):   no dedicated staging ID; local UAT may use the documented
                          dummy ID for CLIENT-SIDE verification only.
  GA4 Data API service account available?  no
  MP API secret available for /debug/mp/collect?  no
  THEREFORE, for §3.19, the only available verification method is Playwright
  network interception (method (a)): assert that each event fires, fires exactly
  once, carries the expected name and parameters, and carries NO PII, no message
  content, no AI output and no tokens. This proves the CLIENT is correct.
  It cannot prove events are received by a GA property — no property is configured.
  Report delivery/realtime/production-data as UNVERIFIED and answer the reliability
  question accordingly. Do not report GA as PASS overall.

TIME BUDGET:              4 hours per pass
```

---

## §A — SHARED RULES (include in every pass)

```
=== SHARED RULES — APPLY TO ALL PASSES ===

R1. EVIDENCE OR UNVERIFIED — THIS IS THE MOST IMPORTANT RULE
    Every status you report must be one of exactly three values:
      PASS       — you observed the correct behaviour yourself
      FAIL       — you observed the incorrect behaviour yourself
      UNVERIFIED — you could not observe it (say exactly why)
    Every PASS and FAIL must carry evidence, which is ONE OF:
      - file path + line range you actually read  (e.g. src/lib/ai/router.ts:88-131)
      - a command you ran + its real output (paste the output, trimmed)
      - an HTTP request/response you actually made
      - a Playwright run, screenshot path, or intercepted network payload
      - a log line with timestamp
    "The code looks correct" is NOT evidence of runtime behaviour. Reading code
    proves the code exists; it does not prove the feature works.
    If you have no evidence, write UNVERIFIED. Never write PASS to keep a
    checklist tidy. A report full of honest UNVERIFIED is far more useful to me
    than a report full of unearned PASS.

R2. CURRENT CODE IS THE ONLY SOURCE OF TRUTH
    Ignore prior UAT reports, README claims, old docs, and your own earlier
    conclusions in previous sessions. Verify against HEAD.

R3. SCOPE OF CHANGES
    PASS 1: read-only. No edits to source. You may only create files under docs/uat/.
    PASS 2: fixes only, per §C rules.
    PASS 3: no source edits except reverts. Report only.

R4. GIT DISCIPLINE
    - Work only on the branch named in §0. Never commit to main/prod.
    - One commit per fix, message: `fix(uat): <FINDING-ID> <short description>`
    - Never force-push, never rebase shared history, never amend someone else's commit.
    - If a change breaks build or tests and cannot be fixed in ~15 minutes, revert it
      and downgrade the finding to "reported, not fixed".

R5. SAFETY LIMITS
    - No destructive DB operations. No TRUNCATE/DROP. No writes to production.
    - No real purchases, no real payments, no real outbound messages to real users.
    - Do not disable RLS, auth checks, or rate limits "temporarily to test".
      If a test requires that, mark UNVERIFIED and explain.
    - Respect the LLM call ceiling in §0. Track your count and report it.

R6. SECRETS
    Never print secret values — not in the report, not in a commit, not in a log.
    Report only: file path, variable name, class of secret, recommended action.
    If a secret appears to be committed, treat as P0 and recommend rotation.

R7. CHECKPOINTING — you will not finish in one burst
    After every major section, append your findings to docs/uat/findings.json
    IMMEDIATELY. Do not hold results in memory until the end. If you run out of
    context or time, the partial file must still be usable.
    Also maintain docs/uat/progress.md with: sections done / in progress / not started.

R8. PRIORITY ORDER WHEN TIME RUNS SHORT
    Work in this order. If you cannot finish, everything below where you stopped
    is reported as NOT AUDITED — never silently skipped.
      1. Secrets exposure + authentication + authorization + Supabase RLS
      2. Main Chat + AI quota/abuse + AI safety (prompt injection, cross-user leak)
      3. Five core domains — happy path + failure path
      4. Affiliate / commerce correctness (wrong destination = money + trust loss)
      5. Scam Shield correctness and legal-risk wording
      6. Notification control + default theme + music reuse removal
      7. Data integrity / migrations
      8. Web frontend sweep
      9. Android
      10. Google Analytics
      11. Performance / cost
      12. Policy / localization / iOS static review

R9. NO INFLATION, NO DEFLATION
    Do not promote cosmetic issues to P0. Do not demote a genuine blocker to P2
    because fixing it is inconvenient.

R10. WHEN BLOCKED, ASK
    If §0 is ambiguous, or an action would exceed your permissions, stop and ask
    me a specific question. Do not improvise around a missing credential.

R11. PRE-EXISTING ACCOUNTS ARE NOT TEST FIXTURES  (owner rule, 2026-09-25)
    The rule is about DATA THAT IS ALREADY THERE. Before any write that would
    MODIFY or DELETE existing rows belonging to a manual.uat.* account or to ANY
    account that existed before your session (real users, the owner's own
    account, earlier smoke/consultative test users) — UPDATE, DELETE, an upsert
    that overwrites, an RPC that changes or removes their rows — STOP. Then either:
      - use synthetic rows you create yourself: account-less rows (user_id NULL
        where the schema allows) or users you insert inside a transaction that
        you ROLL BACK; or
      - ask me, naming the account, the table and the exact rows.
    Also STOP before CREATING rows that attach a pre-existing account to
    something it did not do: "filler" members in a group, rows "just for a
    count", writes into other people's groups, threads or shares.
    NOT covered — no permission needed: ordinary product use AS a test account
    (manual.uat.* exist for this). Signing in, chatting, the golden set, quota
    and usage counters, analytics events, sessions, evidence the product saves
    — new rows the product itself creates for that account's own activity.
    Reading any rows is always fine. Two audit sessions (2026-09-25) had to
    undo modifications to real accounts' data — do not be the third.
    Exception: a change the owner has explicitly ordered for those rows
    (e.g. "run the one-off cleanup on audit"). Quote the instruction in the
    report, and still scope the write to exactly what was ordered.
```

---

## §B — FINDINGS FILE FORMAT

The agent writes `docs/uat/findings.json` as a **JSON Lines** file (one JSON object per line — append-safe, survives crashes).

```jsonc
{
  "id": "F-001",                       // stable, never reused
  "section": "8-security-authz",
  "title": "Merchant endpoint accepts any authenticated user",
  "severity": "P0",                    // P0 | P1 | P2 | P3
  "status": "open",                    // open | fixed | wontfix | not-reproducible
  "surface": "backend",                // web | android | ios | backend | ai | db | infra | policy
  "reproduced": true,
  "repro_steps": "curl -H 'Authorization: Bearer <user-token>' POST /api/merchant/items ...",
  "evidence": "src/app/api/merchant/items/route.ts:14-39 — no role check; observed 200 with non-merchant token",
  "impact": "Any signed-in user can create merchant listings.",
  "root_cause": "",                    // filled in PASS 2
  "fix": "",                           // filled in PASS 2
  "fix_commit": "",
  "verification": "",                  // filled in PASS 3
  "safe_to_fix_now": true,
  "notes": ""
}
```

Also maintained:
- `docs/uat/inventory.md` — what actually exists (routes, endpoints, features, providers, flags)
- `docs/uat/progress.md` — section-by-section state
- `docs/uat/ai-golden-set.jsonl` — the AI quality test set and its outputs
- `docs/uat/evidence/` — screenshots, HAR files, command output dumps

---

# === PROMPT: PASS 1 — INVENTORY & AUDIT (read-only) ===

```
You are performing PASS 1 of the final pre-launch release audit for TappyAI.

PASS 1 IS READ-ONLY. You do not fix anything in this pass. You do not edit source
files. You only investigate, reproduce, and record.

Apply §0 ENVIRONMENT CONTRACT and §A SHARED RULES above. Rule R1 (evidence or
UNVERIFIED) governs everything you write.

---------------------------------------------------------------------------
STEP 1 — GROUND TRUTH
---------------------------------------------------------------------------
Record: current branch, HEAD sha, git status, worktrees, uncommitted changes,
package manager, runtimes, how web/android/ios are built and run, which env
files exist (names only, never values), which feature flags exist and their
current values, which services the app talks to.

Confirm you can reach the target environment from §0. If you cannot, say so now
and switch to static-only mode for the affected sections.

STEP 0 (do this before STEP 1): run both PRE-FLIGHT CHECKS in §0 — worktree/branch,
and database target. Then install Playwright per §0 and confirm it launches a
browser against the app base URL. Report the result of all three before doing
anything else. If the database pre-flight check fails or is inconclusive, STOP.

---------------------------------------------------------------------------
STEP 2 — BUILD THE INVENTORY  → docs/uat/inventory.md
---------------------------------------------------------------------------
Do this BEFORE testing anything. You cannot audit what you have not enumerated.

Enumerate, with file paths:
  Frontend (web): every route, page, layout, major component, every user flow
  Android: every screen/destination, nav graph, deep-link intent filters
  iOS: every screen/route, API client surface
  Backend: every API route, server action, service, job/cron, webhook
  Data: every table, every RLS policy, every migration since last release tag
  AI: providers, adapters, model routing rules, every prompt/system prompt file,
      tool definitions, quota logic, cache layers, fallback chain
  Commerce: every affiliate provider config, adapter, deep-link resolver rule
  Analytics: every event name emitted, from which surface, to which sink
  Feature flags: name, default, where read
  Policies: every policy/legal document in the repo and its last-modified date

Then produce a DELTA list: everything added or materially changed since the last
release tag (or last 200 commits if no tag). This delta is your highest-risk area.

Then write your own audit checklist derived from what ACTUALLY exists — not from
this prompt. If this prompt mentions a feature that does not exist, note it as
"mentioned in UAT spec, not found in code" and move on. If code contains a
feature this prompt never mentions, audit it anyway.

CHECKPOINT: commit inventory.md before continuing.

---------------------------------------------------------------------------
STEP 3 — AUDIT, IN THE PRIORITY ORDER OF R8
---------------------------------------------------------------------------

3.1 SECRETS & SUPPLY CHAIN
  - Scan working tree AND full git history for committed secrets
    (use gitleaks or trufflehog if available; otherwise grep for key patterns).
    History matters: a rotated key still in history is still a finding.
  - Check client bundles for anything that should be server-only, especially
    service-role keys, provider API keys, admin tokens.
  - Check NEXT_PUBLIC_ / EXPO_PUBLIC_ style vars for anything sensitive.
  - Dependency audit: known-vulnerable packages, unpinned installs from non-registry
    sources, postinstall scripts.
  Report location and class only. Never the value.

3.2 AUTHENTICATION & AUTHORIZATION
  - Login, logout, session lifetime, refresh, revocation on logout, password reset
    token single-use + expiry, OAuth callback state validation, account enumeration
    via timing or distinct error messages.
  - IDOR: run these as plain user A against objects owned by plain user B — never
    as the admin account. For every endpoint taking an id, attempt access as the
    other user. Test at minimum: conversations, saved items, profiles,
    notifications, uploads, commerce requests, merchant objects, admin objects.
    If user B does not exist yet, create it first — this test cannot be skipped.
  - Role enforcement: admin and merchant endpoints hit with a plain user token.
  - Supabase RLS: for each table, attempt read and write as another user AND as
    anon. Verify RLS is actually enabled per table, not just that policies exist.
    Verify no endpoint bypasses RLS by using the service-role client where a user
    client is correct — enumerate every service-role usage and justify each one.

3.3 MAIN CHAT + AI
  Functional:
    - New conversation, resume conversation, multi-turn context retention,
      topic change, domain switching (food→travel→shopping→entertainment→spa).
    - Anonymous vs registered vs pro.
  Quota (test each, do not infer from code):
    - daily limit, guest lifetime limit, pro behaviour, display accuracy,
      consumption timing (is it charged on request or on success?),
      behaviour on AI failure (user must NOT be charged for a failed answer),
      reset boundary + timezone, concurrent requests (can two parallel requests
      both pass the same quota check? — race condition),
      whether URL check and QR check consume the intended quota bucket.
  AI safety:
    - Prompt injection via user message, via fetched page content, via QR payload,
      via merchant/UGC content that ends up in context.
    - System prompt extraction attempts.
    - Cross-user context leakage: does conversation A ever appear in B?
      Test cache keys specifically — a cache key missing user scoping is a P0.
    - Tool-call manipulation: can the user cause a tool call with attacker-chosen
      arguments (e.g. SSRF via a fetch tool)?
    - Does any AI output get rendered as HTML/markdown-with-raw-html? XSS check.

3.4 FIVE CORE DOMAINS — FOOD, SHOPPING, TRAVEL, ENTERTAINMENT, SPA/WELLNESS
  For each domain run the same matrix and record results per domain:
    Discovery: keyword search, natural-language search, location-aware results,
      categories, filters, sorting, pagination, empty state, error state.
    Consultative flow: initial request → clarification → budget change →
      location change → time change → preference change → "why this?" →
      "cheaper" → "nearby" → "compare these" → "3 alternatives".
    Result integrity: is every field the UI shows actually backed by data?
      Name, image, price, address, hours, availability, affiliate destination.
      Flag any field that is AI-generated but presented as factual — that is a
      P0 class of issue (misleading users), not a cosmetic one.
    Failure: no results, AI timeout, provider timeout, invalid location,
      missing data, affiliate failure, rate limit hit, expired session mid-flow.

3.5 AFFILIATE / COMMERCE
  For EVERY configured provider:
    - Is the provider account actually approved and active? If approval state is
      unknown, that is a finding — do not assume approved.
    - Generate a link. Inspect the final URL: correct merchant, correct product,
      correct tracking params, correct encoding, no double-wrapping.
    - If §0 permits egress: actually follow the link and record the landing page
      (HTTP status, final host, whether tracking params survived redirects).
    - Web vs mobile-web vs in-app vs Android intent behaviour.
    - Missing-deeplink fallback: what does the user see? A dead link is P0.
    - Wrong-platform routing: does a Shopee product ever get a Lazada wrapper?
  CRITICAL: verify that Tappy never claims an affiliate/purchase destination
  exists when it does not, and never presents an unresolved link as resolved.
  Verify the adapter/config architecture allows adding a new approved provider
  without touching the AI layer — show the seam, or report that it does not exist.

3.6 SCAM SHIELD
  - PHONE NUMBER CHECKING IS BEING REMOVED FROM THE PRODUCT. In this pass, do not
    test it for correctness — INVENTORY it instead. Find every trace of
    phone-number lookup / reporting / reputation / "kiểm tra số điện thoại"
    functionality: UI entry points, routes, API endpoints, services, prompts and
    tool definitions that accept a phone number, DB tables/columns storing numbers
    or verdicts about them, cached verdicts, analytics events, notification copy,
    and any place a phone number can reach the classifier indirectly (e.g. a number
    embedded in a pasted message or decoded from a QR). List all of it with file
    paths for removal in PASS 2. Removal is mandatory, not optional.
  - Message analysis, URL check, QR decode+check, short URLs, redirect chains,
    Vietnamese content, mixed VI/EN, obfuscated text, benign control cases.
  - Measure false positives on a set of clearly legitimate Vietnamese sites and
    messages (banks, VNPost, Shopee, government). A false "SCAM" on a real
    business is both a product failure and a legal exposure.
  - LEGAL RISK REVIEW: check the exact wording shown to users. Asserting that a
    named business, phone number, or domain "is a scam" as fact is defamation
    risk in Vietnam. Required: hedged phrasing ("có dấu hiệu rủi ro" / "signs of
    risk"), a stated basis or source, a confidence/severity level, and a way to
    contest. If the current copy asserts fact without basis, file it as P1
    (P0 if it names a real identifiable business) and flag for legal review.
  - Privacy: is the analyzed message content stored? For how long? Is it sent to
    a third-party LLM? Is that disclosed in the privacy policy? Cross-check §3.12.

3.7 NOTIFICATIONS
  - Is the notification control present and enabled at PRODUCT level on web,
    Android, iOS? Distinguish clearly between "product hides the button" (bug)
    and "OS permission not granted" (correct behaviour, needs a prompt/explainer).
  - Unread badge accuracy, read state persistence, deep-link from notification to
    the right screen, empty state, permission-denied state, token registration,
    token cleanup on logout (stale token = notifications to the wrong user = P0).

3.8 DEFAULT THEME
  Verify the intended dark-light Tappy visual system is what actually appears on:
  first launch, logged out, logged in, hard refresh, new session, new device/profile,
  after clearing storage, and under OS dark vs light preference. Identify any route
  that falls back to a plain white/dashboard shell. Check for flash-of-wrong-theme
  on first paint (SSR/hydration).

3.9 MUSIC REUSE REMOVAL
  Search the whole repo and the running product for: reuse audio/sound, "use this
  sound", audio extraction, sound-page/sound-detail routes, related API endpoints,
  related DB columns/tables, related analytics events.
  Record for each: where it is, whether the UI control is reachable, whether the
  endpoint still responds. Also record what should happen to data already created.
  Do not remove anything in PASS 1 — record it for PASS 2.

3.10 FRONTEND ↔ BACKEND CONTRACT
  For each major feature trace: UI → API call → handler → service → data/provider →
  response shape → rendering. Look for: fields the UI reads that the API does not
  guarantee, type mismatches, optional-vs-required drift, error codes the UI does
  not handle, endpoints nothing calls, calls to endpoints that no longer exist,
  validation present on one side only, business logic duplicated and diverged.

3.11 DATA INTEGRITY
  Schema vs migrations consistency, migrations that were applied out of band,
  missing indexes on hot query paths (show the query and the plan), missing FKs,
  nullable columns the code assumes non-null, orphan rows, duplicate rows where
  uniqueness is assumed, soft-delete rows still visible somewhere.

3.12 POLICY / PRIVACY / STORE READINESS
  Compare CURRENT features against current policy documents. Specifically check
  that policies cover: AI-generated recommendations and their limits, UGC and
  moderation, social/feed, messaging, affiliate relationships and paid-link
  disclosure, external links, Scam Shield (what data is analyzed, retained,
  shared), QR scanning, location collection and precision, personalization,
  notifications, merchant content, copyright/music, third-party processors
  (list every one, including LLM providers), data retention periods,
  account deletion, minors.
  Store requirements:
    Google Play — Data Safety form matches actual collection; a publicly
      reachable ACCOUNT DELETION URL exists (mandatory); permissions declared
      are all actually used; target API level; ads/affiliate disclosure.
    App Store — PrivacyInfo.xcprivacy present and accurate, required-reason APIs
      declared, ATT prompt if any cross-app tracking occurs, age rating,
      account deletion in-app, third-party SDK privacy manifests.
  Mark clearly which items engineering can fix and which need a human/legal decision.

3.13 LOCALIZATION (EN + VI)
  Missing keys, untranslated fallbacks shown to users, hard-coded strings,
  broken interpolation placeholders, pluralization, Vietnamese diacritics in
  search/sort, error messages, notification copy, AI-facing UI copy, Scam Shield
  copy, affiliate disclosure copy. Note any place where AI replies in the wrong
  language relative to the user's input.

3.14 WEB FRONTEND SWEEP
  Desktop / mobile / tablet widths. Navigation and routing, loading and skeleton
  states, empty states, error states, toasts, modals, cards, images, video,
  forms and validation, infinite scroll/pagination, back navigation, deep links,
  auth transitions. Collect console errors and hydration warnings from a real
  browser run. Find: dead buttons, dead links, wrong routes, duplicate controls,
  obsolete terminology, stale features still reachable, unnecessary refetching.

3.15 ANDROID
  Build, install, launch, login/registration, navigation, the five domains, Main
  Chat, Explore/Feed, notifications, Scam Shield, affiliate and deep links, theme,
  runtime permissions, analytics, error states, airplane-mode/network loss,
  background→foreground, back button, process death + restore, session persistence.
  Produce an explicit Web-vs-Android parity table: feature / web / android / gap.

3.16 IOS
  If macOS+Xcode is unavailable per §0, state that plainly and perform STATIC
  review only: architecture, screens, feature parity vs web, API contract match,
  auth handling, error handling, analytics, permission usage strings, privacy
  manifest. Label every runtime-dependent item UNVERIFIED. Do not claim iOS passed
  runtime UAT.

3.17 AI QUALITY BASELINE (not just "did it get worse")
  Build docs/uat/ai-golden-set.jsonl: 40 fixed queries — 8 per domain — covering
  simple, constraint-heavy, multi-turn, ambiguous, comparison, commerce, travel
  planning, and scam classification. Include the exact expected-behaviour criteria
  per query (not expected text).
  Run each once. Store the full output. Score each on:
    intent correctly identified (0/1)
    all stated constraints respected (0/1 per constraint)
    context retained across turns (0/1)
    clarifies instead of guessing when genuinely ambiguous (0/1)
    zero hallucinated merchants/prices/links (0/1 — any hallucination = fail)
    recommendation is actually actionable (0/1)
  Produce a scorecard. If a pre-optimization snapshot exists, diff against it and
  report regressions. If not, say so plainly: this pass establishes the baseline
  and quality regression is therefore UNVERIFIED for this release.
  Respect the LLM call ceiling; report calls used.

3.18 AI + INFRA COST
  Measure, do not guess. For a representative Main Chat turn, record: prompt token
  count, context assembled, number of model calls, which models, whether streaming,
  retries, cache hit or miss. Identify: duplicate calls for one user action,
  background AI calls the user never sees, context that grows unbounded,
  cache keys that never hit, model routing that sends trivial work to the
  expensive model.
  Infra: N+1 queries (name the endpoint and the count), overfetching (SELECT *
  on wide tables), missing indexes, unbounded list queries, large media served
  unoptimized, video transfer volume, storage growth, egress.
  For each finding give: estimated monthly cost impact, the proposed change, and
  the QUALITY RISK of that change. Never propose a change that degrades the
  Consultative Agent's answers to save tokens.

3.19 GOOGLE ANALYTICS — VERIFY BY OBSERVATION, NOT BY CODE
  Code inspection alone is NOT acceptable evidence here. Use whichever of these
  §0 permits, in order of preference:
    (a) Playwright: intercept outbound requests to google-analytics.com/g/collect
        and region1.google-analytics.com. Assert for each triggered action: the
        event fires, fires exactly once, carries the expected name and params,
        and carries NO PII, no message content, no AI output, no tokens.
    (b) GA4 Data API with a service account: query realtime and recent events,
        confirm the events appear in the correct property and data stream.
    (c) Measurement Protocol /debug/mp/collect: validates payload schema only —
        this proves the payload is well-formed, NOT that the client fires it.
        Weakest option; label results accordingly.
  If none are available, GA status is UNVERIFIED. Say so. Do not write PASS.
  Verify: correct measurement ID per environment, production config, single
  initialization, no duplicate firing on client navigation, no dev traffic
  landing in the production property, correct behaviour across SSR/hydration.
  Events to test at minimum: page_view, home view, main chat opened, AI query,
  recommendation generated, recommendation/card interaction, search, explore,
  feed interaction, sign_up, login, affiliate/deeplink click, Scam Shield usage,
  notification interaction.
  Platform coverage: state for web / android / ios exactly one of —
  working / partially working / not implemented / implemented-but-no-data-observed.
  Finally answer: is GA currently reliable enough to be the interim production
  measurement layer for launch? Justify with what you observed.

3.20 OTHER ANALYTICS & OBSERVABILITY
  Internal analytics, PostHog, Sentry, error monitoring, performance monitoring,
  structured logs. Verify events fire, are not duplicated, carry no PII, and that
  errors actually reach the monitoring sink (trigger one deliberately). Check that
  logs do not contain message content, tokens, or personal data. Do not remove
  existing analytics because a future internal system is planned.

3.21 PERFORMANCE
  Measure with real numbers: initial load (cold/warm), route navigation, Main Chat
  time-to-first-token and time-to-complete, search latency, recommendation latency,
  feed scroll, image/video weight, p50/p95 for the top API endpoints, DB query time
  for the slowest queries, serverless cold starts. Report the numbers, then name
  the top 5 bottlenecks.

3.22 RESILIENCE
  Where safely possible, induce: AI provider unavailable, AI timeout, DB timeout,
  Redis unavailable, affiliate provider unavailable, external API 500, invalid
  token, session expiry mid-action, network drop mid-request, empty result,
  invalid URL, invalid QR, rate limit hit.
  For each verify: no blank screen, no infinite spinner, no raw stack trace shown
  to users, no misleading success message, no duplicate side effects on retry,
  and that recovery works once the dependency returns.

3.23 BUILD / TEST BASELINE
  Run: typecheck, lint, unit, integration, E2E, mobile tests, production build.
  Record exact pass/fail counts and the time taken. Note flaky tests separately.
  State explicitly: a green suite is a baseline, not evidence of release readiness.

---------------------------------------------------------------------------
STEP 4 — PASS 1 OUTPUT
---------------------------------------------------------------------------
Produce docs/uat/PASS1-REPORT.md containing:
  1. Coverage table: every section above → AUDITED / PARTIAL / NOT AUDITED,
     with the reason for anything not fully audited.
  2. Findings summary: counts by severity and by surface.
  3. The 10 findings that most endanger the launch, with one line each on why.
  4. Anything you could not verify and exactly what you would need from me to
     verify it (a credential, a device, a permission, a decision).
  5. Your honest overall read: if we shipped today, what breaks first?
  6. LLM calls used and estimated cost of this pass.

Do not propose a release decision in PASS 1. Do not fix anything in PASS 1.
```

---

# === PROMPT: PASS 2 — FIX (P0/P1 only) ===

```
You are performing PASS 2 of the TappyAI release audit: FIXING.

Apply §0 ENVIRONMENT CONTRACT and §A SHARED RULES. Read docs/uat/findings.json
and docs/uat/PASS1-REPORT.md first. Do not re-run the full audit.

SCOPE
  Fix only findings with severity P0 or P1 AND safe_to_fix_now: true.
  Work in the R8 priority order.
  If a finding turns out NOT to be reproducible, mark it not-reproducible with
  evidence and move on — do not "fix" a phantom.

FOR EACH FINDING, IN THIS ORDER
  1. Reproduce it again now. If you cannot, stop and mark not-reproducible.
  2. Identify the actual root cause. Not the symptom. Write it down.
  3. Implement the SMALLEST safe production-ready fix.
  4. Run the relevant tests. Add a regression test where one is cheap and clearly
     valuable — especially for auth, authorization, RLS, quota, and affiliate
     destination correctness.
  5. Re-test the original reproduction steps. Record the new observed behaviour.
  6. Check for regressions in the areas the change touches. Run typecheck + build.
  7. Commit: `fix(uat): <FINDING-ID> <description>`
  8. Update the finding in findings.json: root_cause, fix, fix_commit, status.

HARD CONSTRAINTS
  - No architectural rewrites. If a correct fix requires one, do not do it:
    record the required change, a short-term mitigation if one exists, and leave
    the finding open with a clear note. An unfinished rewrite is worse than a
    documented blocker.
  - No new dependencies unless there is no reasonable alternative; justify each.
  - Never fix an AI cost issue by degrading answer quality. If a cost fix has any
    quality risk, re-run the affected golden-set queries and show before/after.
  - Never weaken a security control to make a test pass.
  - If a fix touches auth, RLS, quota, or affiliate routing, treat it as high risk:
    smaller diff, explicit test, explicit re-verification.

SPECIFIC ITEMS TO RESOLVE IN THIS PASS
  a. PHONE NUMBER CHECKING — REMOVE ENTIRELY. This is a hard product requirement,
     treat as P0. Work from the inventory produced in PASS 1 §3.6.
     Remove or disable, on web, Android and iOS, and in the backend:
       - every UI entry point, form field, button, menu item and empty/result state
       - every route/screen dedicated to phone lookup
       - every API endpoint that accepts a phone number for checking or reporting
         → endpoint returns 410 Gone, not 404, and not a silent success
       - the service/classifier path, and any AI tool definition or prompt
         instruction that lets the agent classify or comment on a phone number
       - any user-reporting flow for phone numbers
       - related analytics events
     INDIRECT PATHS MATTER MOST. After removing the direct feature, verify that a
     phone number cannot still reach the classifier through: a pasted message that
     contains a number, a QR payload, a tel: URL passed to the URL checker, or a
     free-text question to Main Chat ("số 09xx có lừa đảo không?"). Add an explicit
     guard so the product never returns a scam verdict about a phone number by any
     route, and a neutral refusal/redirect message instead. Add a regression test
     covering each of these indirect paths.
     DATA: identify all stored phone numbers, stored verdicts, reports and cached
     results. Stop writing new ones immediately and hide existing ones from every
     surface. Do NOT delete data in this pass — list exactly what exists, where,
     and how much, and flag the deletion decision to me (retention and deletion of
     already-collected personal data is my call, not yours).
     Also check: public policy/help copy and store listings that advertise phone
     checking, and any cached/CDN/SEO-indexed page for it.
  b. Music reuse: remove or disable it on BOTH surfaces. No visible UI control may
     point at a disabled endpoint, and no endpoint may still enable the behaviour.
     Decide and state explicitly what happens to already-created data. Prefer:
     UI removed, endpoint returns 410 Gone, existing records hidden from all
     public surfaces, data retained but inert pending a deletion decision from me.
  c. Notification control: ensure it is always available at product level on all
     three surfaces, gated only by OS permission, with a clear permission-denied
     state and a way to re-request.
  d. Default theme: ensure the dark-light Tappy system is the default on every
     entry path, including first paint. No white dashboard fallback.
  e. Any dead critical UI control or dead critical endpoint found in PASS 1.
  f. Policy/privacy copy: where PASS 1 identified a required update AND the copy
     lives in this repo AND the change is factual (e.g. listing an actual
     third-party processor, adding affiliate disclosure, adding the account
     deletion path), make the edit. Where the change is a legal judgement, do NOT
     write it — list it under "requires human/legal decision".

OUTPUT
  docs/uat/PASS2-REPORT.md with, per finding: ID, root cause, the diff summary,
  the tests run and their result, the re-test observation, the regression check,
  and the commit sha. Plus a list of P0/P1 findings deliberately NOT fixed, each
  with the reason.
```

---

# === PROMPT: PASS 3 — RE-VERIFY & RELEASE REPORT ===

```
You are performing PASS 3 of the TappyAI release audit: INDEPENDENT VERIFICATION
and the final release report.

Apply §0 and §A. Treat PASS 2's claims with professional skepticism — your job is
to check them, not to trust them. Do not edit source except to revert something
that is clearly broken.

STEP 1 — RE-VERIFY EVERY FIX
  For each finding with status "fixed": run the ORIGINAL reproduction steps again
  yourself. Record what you observe. If it still reproduces, set status back to
  open and raise severity if warranted.

STEP 2 — REGRESSION SWEEP
  Re-run: typecheck, lint, unit, integration, E2E, production build, mobile tests
  where available. Compare counts against the PASS 1 baseline. Any new failure is
  a finding.
  Re-run the AI golden set (docs/uat/ai-golden-set.jsonl) and diff the scorecard
  against PASS 1. Any drop in intent accuracy, constraint adherence, or an increase
  in hallucinations is a P0 — cost optimizations must not have cost us quality.
  Re-run the critical security checks: IDOR set, RLS matrix, admin/merchant role
  enforcement, quota race condition.
  Re-verify the four explicit product requirements:
    (1) PHONE NUMBER CHECKING FULLY GONE — verify yourself on every surface, and
        verify the indirect paths: paste a message containing a phone number, scan
        a QR containing a tel: link, submit a tel: URL to the URL checker, and ask
        Main Chat directly in Vietnamese whether a specific number is a scam.
        NONE of these may produce a scam verdict, risk score, or characterization
        of the number. Any surviving path is a P0 and blocks release.
    (2) music reuse gone on both frontend and backend
    (3) notification control available on all surfaces
    (4) dark-light default theme on every entry path

STEP 3 — FINAL RELEASE REPORT  → docs/uat/RELEASE-REPORT.md

A. EXECUTIVE STATUS — exactly one of:
     READY
     READY WITH DOCUMENTED P2/P3
     NOT READY
   You may not declare READY while any P0 or P1 remains open.
   You may not declare READY if the areas that would reveal P0s were UNVERIFIED.
   State the confidence level of this verdict and what limits it.

B. COVERAGE — every audit area → AUDITED / PARTIAL / NOT AUDITED / UNVERIFIED,
   with reasons. This section is as important as the verdict.

C. FIVE CORE DOMAINS — table: Domain | Web | Android | iOS | Backend | Result

D. FEATURE AUDIT — every feature discovered, its status, its surface coverage.

E. AFFILIATE — per provider: provider | approval state | link generation |
   deeplink | tracking params | destination verified? | fallback | result

F. AI QUALITY & COST — golden-set scorecard before/after, hallucination count,
   optimizations applied, measured/estimated savings, quality impact, remaining
   opportunities not taken and why.

G. SECURITY — findings, fixes, remaining risks, and anything needing rotation.
   Locations and classes only, never values.

H. GOOGLE ANALYTICS — fill this table, with the verification METHOD in each row:
     Check                      | Result           | Method / evidence
     Integration                | PASS/FAIL/UNVER  |
     Production configuration   | PASS/FAIL/UNVER  |
     Real events received       | PASS/FAIL/UNVER  |
     Realtime                   | PASS/FAIL/UNVER  |
     Event tracking             | PASS/FAIL/UNVER  |
     No duplicate events        | PASS/FAIL/UNVER  |
     No PII leakage             | PASS/FAIL/UNVER  |
     Web                        | PASS/FAIL/UNVER  |
     Android                    | PASS/FAIL/N/A    |
     iOS                        | PASS/FAIL/N/A    |
   Then answer: is GA reliable enough as the interim production measurement layer?

I. POLICY / PRIVACY / STORE — updates made, updates still required, and a clearly
   separated list of items requiring a human or legal decision.

J. BUGS FIXED — issue | root cause | fix | independent verification result.

K. REMAINING ISSUES — separated into P0 / P1 / P2 / P3, each with impact and
   recommended action.

L. GO-LIVE PLAN — this is required, not optional:
   - Pre-deploy: DB backup taken? migrations reviewed and reversible?
     rollback procedure written? feature flags for the riskiest new features?
   - Kill switches: what can we turn off without a deploy if it misbehaves
     (AI provider, affiliate provider, Scam Shield, feed, notifications)?
   - Monitoring for the first 48h: which dashboards, which alerts, which error
     rates and latencies to watch, what the abort threshold is.
   - Cost alarms: LLM spend, DB, storage, egress — with thresholds.
   - The rollback procedure, step by step.
   - Staged rollout recommendation if the risk profile warrants one.

M. FINAL ANSWER — answer this question directly and without hedging:
   "If we deployed the current codebase publicly today, are there any known
    P0/P1 issues that should prevent release?"
   Then list the exact remaining blockers, if any.

STEP 4 — HONESTY STATEMENT
  End the report with a short section titled "What I did not verify". List every
  area where you reported UNVERIFIED, and state what a human would need to do to
  close each gap. Do not soften this section. A launch decision made on an
  incomplete audit that pretended to be complete is worse than a delayed launch.
```

---

## §C — NOTES FOR YOU (not for the agent)

- **Run PASS 1 twice on the riskiest areas** if you have budget — security and affiliate especially. Different sessions find different things.
- **The three-value status (PASS/FAIL/UNVERIFIED) is the single highest-leverage change** in this rewrite. It removes the incentive to fake completeness.
- **iOS will almost certainly come back UNVERIFIED** unless you run Claude Code on a Mac with Xcode. That is fine — just don't let the report pretend otherwise.
- **GA is the section most likely to be faked.** If you can't give the agent Playwright or a GA4 Data API service account, consider just doing that check manually yourself; it's 20 minutes in the browser with devtools filtered to `g/collect`.
- **Phone number checking**: gỡ feature là đúng, nhưng gỡ UI không tự động hết rủi ro. Hai chỗ dễ sót: (a) đường gián tiếp — user dán tin nhắn có số, hoặc hỏi thẳng Main Chat "số 09xx có lừa đảo không", agent vẫn trả lời được nếu không có guard; (b) dữ liệu đã thu thập — số điện thoại và verdict đã lưu trong DB vẫn là dữ liệu cá nhân đang giữ. Quyết định xóa hay giữ là của ông, đã ghi rõ trong prompt là agent không được tự xóa.
- **Wording vẫn quan trọng dù đã bỏ số điện thoại.** Rủi ro tương tự áp dụng cho tên miền và tên doanh nghiệp — gắn nhãn "lừa đảo" cho một website có thật cũng đủ thành vấn đề. Phần yêu cầu dùng ngôn từ có mức độ ("có dấu hiệu rủi ro"), nêu căn cứ, và có đường khiếu nại vẫn còn trong prompt. Đây là chỗ đáng tự đọc bằng mắt, đừng phó cho agent.
- **Budget guard**: set the LLM ceiling low on the first run (e.g. 50 calls) to see how far it gets before raising it.
