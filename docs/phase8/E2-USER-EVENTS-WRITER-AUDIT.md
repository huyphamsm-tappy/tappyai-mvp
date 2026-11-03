# E2 — `user_events` writers, policies and trust consumers (facts only) — 2026-10-10

Status: **E2 stays BLOCKED** until the owner documents which event types a client may write directly and from which sources. This document lists the facts that decision needs; it does **not** propose the approved list and changes no policy. Baseline `17d4aac`; repository files only (no live database queried).

## 1. Table and policies
- Prod baseline (`docs/audit/schema-baseline/prod-schema-only.sql`, generated 2026-09-17, project `fwznnobrdctuskgrvuik`, a **snapshot**): `user_id` nullable, `event_type text NOT NULL`, `metadata jsonb`, `created_at` default `now()` (client-settable under RLS), `event_id` unique, `anon_id`, envelope columns, `device_context`. The **only CHECK is `user_events_identity_chk (user_id IS NOT NULL OR anon_id IS NOT NULL) NOT VALID`; there is no `event_type` CHECK in prod** (`20260713_analytics_envelope_foundation.sql` dropped it: "security is preserved via app-layer caps + rate limits + service-role-only writes"). A later `add_event_type_check.sql` re-adds a NOT VALID allow-list of 21 types; migrations #7/#8 (`20260921_*`) extend it only where the constraint exists. The audit/non-prod database has one (expanded by G1 with `share_out`, `action_started`, not derivable from the repo), so **the environments differ**.
- Policies (snapshot): `"Users insert own events" FOR INSERT WITH CHECK (auth.uid() = user_id)`, `"Users manage own events" FOR ALL USING/WITH CHECK (auth.uid() = user_id)`, `"Users read own events" FOR SELECT`. Grants: ALL to `anon`, `authenticated`, `service_role`; `anon` cannot satisfy RLS (`auth.uid() = user_id` is NULL).

## 2. Writers
| event_type | file | role | client-reachable with the user's JWT? |
|---|---|---|---|
| any string (client sends `page_view`, `page_time`, `review_like`, `review_search`, `place_save`, `report`, `review_share`, `recommendation_click`, `scam_check`, `chat_opened`, `shopping_search_click`, `chat_response_received`, `search_result_saved`, `auth_*`, `ask_tappy_place`, G1 events) | `src/app/api/track/route.ts` (upsert via `createAdminClient`) | service_role | public and anonymous-capable route; **does not reject on event_type** (unknown types are accepted and flagged `is_unknown_event`) |
| `like`, `skip_suggestion`, `checkin`, `view_review`, `open_app` (`UserEventType`) | `src/lib/userMemory.ts:43` `logUserEvent` | **browser client** (user JWT) → covered only by RLS | **yes** — the only caller is `src/app/reviews/page.tsx` (writes `like`) |
| `like` | `src/app/api/reviews/[id]/like/route.ts` | request-scoped server client carrying the user's JWT | same role and policy as a direct write |
| `ask_tappy_place` (target phase) | `src/app/api/chat/route.ts` | service_role | server-only |
| (reads only) | crons `analytics-snapshot`, `behavior-rollup`, `signalCollector`, `userMemory` | | |
`/api/track` validation (verified): drops empty/non-string/over-8 KB events and metadata matching an email/phone pattern; needs a session user or a valid UUID `anon_id`; batches ≤ 100; 600/min per IP; strips `ANALYTICS_FORBIDDEN_KEYS`; `user_id` comes from the session; `created_at` is set server-side. No other writer exists in `scripts/` or `supabase/functions`.

## 3. The client-direct surface (inference from the verified policy text)
An authenticated client calling PostgREST with its own JWT can INSERT, UPDATE and DELETE **its own** rows through the FOR ALL policy, with **any `event_type`** (prod has no CHECK) and any `metadata`/`created_at`/`event_id`/`session_id`/`platform`/`is_unknown_event`. None of `/api/track`'s checks apply to that path (PII regex, forbidden-key strip, size cap, rate limit). It cannot touch other users' or anon rows. `SECURITY-AUDIT-2026-09-30` DB-4 already records this ("owner FOR ALL … can edit, delete or fabricate their own analytics events", rated low, proposal).

## 4. Consumers that trust `event_type` / `metadata` (all read through the service role without checking where a row came from)
`cron/analytics-snapshot` (`auth_signup_completed` → acquisition; activation Rule-v1 signals `chat_response_received`, `search_result_saved` → `evaluateAndUpsertActivation`, so spoofing can produce a false "activated"); `activationAnalyticsService`; SQL rollups `fn_rollup_auth_daily` (`auth_*`, `metadata.is_first_login`), daily snapshots, cohort metrics; `growthReportService` (G1 events); `cron/behavior-rollup` (writes `user_memory.behavior_summary`, which feeds the AI prompt context — spoofing could skew personalisation); `signalCollector` (`chat_search`, `review_share`, `hide`, `not_interested`, `report`); `userMemory` (`like`, `checkin`, `metadata.style_tags`). No billing/entitlement reader was found.

## 5. Tests and documents
Tests: the conditional-migration boundary test (#7/#8) and rollup fixtures; `uuidNotPii.test.ts` for `/api/track`; **no test covers the RLS policies or client-write rights**; `check-sql-grants.mjs` rule G6 only prevents RLS being disabled/policies dropped on `user_events`. Documents: `FINAL_ARCHITECTURE.md:368` says "/api/track (gated by ALLOWED_TYPES)" — **stale**, the route no longer gates; `MERGE-LOSS-AUDIT.md:72` "needs a decision on how `user_events` is written"; `AI_Personalization_Architecture.md:258` proposes moving `logUserEvent` callers onto `/api/track`. Nothing defines the approved writers.

## 6. UNKNOWN (needs production access or the owner)
Live policies/grants today (snapshot is from 2026-09-17); whether prod has since gained an `event_type` CHECK; the audit DB's exact CHECK contents; whether native Android/iOS write to PostgREST directly; whether off-taxonomy or spoofed `auth_*` rows already exist; the intended meaning of "approved sources".

## 7. Decisions the owner's E2 policy must make (not made here)
Which event types a client may write directly (candidates visible in §2: the five `logUserEvent` types and `like`), whether client-direct writes should exist at all (versus everything through `/api/track` — the option in `AI_Personalization_Architecture.md`), whether the table's FOR ALL should narrow to INSERT, whether an `event_type` allow-list belongs in the database or the route, and which consumers (§4) must be protected from spoofing first.
