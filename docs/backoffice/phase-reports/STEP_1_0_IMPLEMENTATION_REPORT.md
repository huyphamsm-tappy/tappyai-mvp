# Step 1.0 — Shared Analytics Foundation — Implementation Report

**Status:** ✅ **APPROVED** (owner, 2026-07-13) · **Architecture v1.1 compliant** · **Ready for Step 1.**
Implemented + verified (static + partial runtime; full runtime pending migration apply). Not deployed; migration not yet applied.
**Governance:** Implementation of Analytics Architecture v1.1 (envelope §3, ingestion §8A). No architecture change, no ADR, no feature-specific analytics.
**Verification evidence:** [`STEP_1_0_VERIFICATION.md`](STEP_1_0_VERIFICATION.md) (backward compatibility · migration safety · performance).

## 1. Scope delivered (exactly the approved Step 1.0)
Extended the **one** tracker + `/api/track` to the v1.1 unified envelope + `event_id` idempotency; support **authenticated and anonymous** events (incl. the ability to carry `auth_login_failed` generically); reconciled `user_events` to the v1.1 event model. **No second tracking system. No auth/feature analytics.**

## 2. Files changed
| File | Change |
|---|---|
| `supabase/migrations/20260713_analytics_envelope_foundation.sql` | **New** — reconcile `user_events` to the envelope |
| `src/lib/tracking/envelope.ts` | **New** — shared client envelope builder (reused by the tracker) |
| `src/lib/tracking/tracker.ts` | Attach envelope to every event; open event-type vocabulary (forward-compat) |
| `src/app/api/track/route.ts` | Accept anon + authed; idempotent upsert; caps/rate-limit/PII guard; service-role write |

## 3. Migration decisions (every one, with rationale)
| # | Change | Why |
|---|---|---|
| 1 | `user_id` → **DROP NOT NULL** | It was `NOT NULL`, which **blocked anonymous / pre-auth events** (e.g. login-failed). Required for §3/§8D. |
| 2 | **Add envelope columns** (`event_id, schema_version, anon_id, platform, app_version, build_number, os_name, os_version, device_type, country, language, session_id, client_timestamp, is_unknown_event`) | The v1.1 envelope (doc 04 §7A). All additive/nullable → existing rows untouched. |
| 3 | **`UNIQUE(event_id)`** index | Idempotency (§8A.1). Plain UNIQUE (not partial) so `ON CONFLICT (event_id)` works; Postgres allows multiple NULLs → legacy rows don't collide. |
| 4 | **DROP CHECK `user_events_event_type_check`** | The old allowlist CHECK **hard-rejected any new event_type** (incl. auth events). v1.1 is forward-compatible: accept-and-tag at the app layer, never DB-reject. Security preserved via app caps + rate limits + service-role-only writes. |
| 5 | **Add `user_events_identity_chk` (NOT VALID)** — `user_id IS NOT NULL OR anon_id IS NOT NULL` | Every event must have an identity. `NOT VALID` → new rows only; existing rows (all had `user_id`) are unaffected. |
| 6 | Indexes `created_at`, `(event_type, created_at)`, partial `anon_id` | Efficient rollup/snapshot scans (Performance §3.1); anon lookups (§8D). |
| — | **RLS unchanged** | Existing `auth.uid()=user_id` policy stays for authed self-access; ingestion writes via **service role** (bypasses RLS) so anon inserts work and direct anon client access stays denied. |

## 4. Compatibility decisions (explained)
- **Kept the table name `user_events`** (docs call it `track_events`). Renaming would break existing consumers (preference profiling, behavior-rollup). **Reconciliation = align in place**; `user_events` *is* the architecture's unified events table. (Editorial name-mapping, like the earlier `full_name` erratum — no behavior change.)
- **Kept the `metadata` column** as the event `properties` store (no rename) → existing writers/readers unaffected.
- **Backward-compatible tracker API:** `track(event_type, metadata)` signature unchanged; the envelope is attached internally. All existing callers (`useTrack`, reviews page) work unmodified — verified no caller used the removed object form.
- **Open event vocabulary:** `EventType = KnownEventType | (string & {})` → autocomplete kept, any string allowed; unknowns tagged `is_unknown_event=true` server-side (never dropped).
- **Service-role ingestion write** (was user-scoped) → enables anon + is the correct server-controlled analytics write. `user_id` is set from the **session** (un-spoofable); clients cannot forge it.
- **Abuse controls (§8A.3):** batch cap 100, per-event 8 KB, per-IP rate limit 600/min (silent best-effort drop), email/phone PII reject on `metadata`, `country` from `x-vercel-ip-country` (server-authoritative).
- **`app_version` defaults to `'unknown'`** — no `NEXT_PUBLIC_APP_VERSION` exists yet; owner can set it later with zero code change.
- **Deploy-order note:** the migration MUST be applied **before** the Step 1.0 code is deployed. The code is resilient (a missing-column upsert error is caught → `200`, no crash — verified), but until the migration is applied, event *writes* silently no-op. Apply migration → then deploy (same discipline as Phase 0).

## 5. Verification results
| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `next lint` (changed files) | ✅ no warnings/errors |
| `npm run build` | ✅ compiles |
| `npm test` | ✅ 24/24 |
| `npm run architecture:check` | ✅ 7/7 |
| Runtime: anonymous `POST /api/track` (`auth_login_failed`, no session) | ✅ **`200 {ok:true}`** (was `401`); no server errors |
| Runtime: empty batch | ✅ `200` |
| **DB insert + idempotency + envelope storage** | ⏳ **PENDING migration apply** (columns not yet in the shared DB; upsert currently no-ops gracefully) |

**Post-migration checks I will run (once applied):** insert an event → row has envelope columns populated; re-send same `event_id` → **one** row (dedup); anon event → row with `anon_id`, `user_id` NULL; unknown type → `is_unknown_event=true`; existing `page_view` still writes.

## 6. Risks
| Risk | Severity | Mitigation |
|---|---|---|
| Code deployed before migration → tracking-write gap | Med | Documented apply-before-deploy order; code degrades gracefully (no crash) |
| Dropping the event_type CHECK re-opens arbitrary types | Low | App-layer validation + caps + rate limit + service-role-only writes |
| Anonymous ingestion abuse surface | Low | Rate limit + size caps + PII reject; anon direct DB access still denied |

## 7. Explicitly NOT done (out of Step 1.0 scope)
No `auth_daily_rollup`, no `user_acquisition`, no `authAnalyticsService`, no auth dashboard/API, no auth event emission. Those are Step 1+ and remain unbuilt.

## 8. Known limitations & assumptions
- **`app_version` defaults to `"unknown"`** until a real version source is provided (web: `NEXT_PUBLIC_APP_VERSION`; native apps supply their own). No code change needed to populate it later.
- **Historical events carry no envelope.** The 2011 pre-existing `user_events` rows (and any written before the migration) have `event_id`, `platform`, `anon_id`, etc. as NULL/default. Envelope data exists only for events created after the tracker update ships.
- **Anonymous events become available only after the migration is applied.** Until then `user_id` remains `NOT NULL` and the code's anon inserts silently no-op (graceful, no crash).
- **`event_id` deduplication applies only to new events after migration.** The `UNIQUE(event_id)` index and `ON CONFLICT DO NOTHING` take effect once the migration is live; legacy rows (NULL `event_id`) are unaffected.
- **Native (Android/iOS) emission is not part of Step 1.0.** This step delivers the web tracker + shared server ingestion; native trackers emit the same schema in their own step.

## 9. Future improvements (intentionally postponed — NOT tasks now)
Future scalability considerations only, to revisit when production metrics justify:
- **Event compression** (payload/storage) — only if ever required.
- **Table partitioning** of `user_events` (e.g. monthly range on `created_at`) — at the DB-Governance §8 scale trigger.
- **Cold storage / archival** of aged raw events before the retention prune (doc 34).
- **Analytics warehouse migration** (ClickHouse/BigQuery) — only if daily event volume outgrows Postgres (ADR-002 trigger).
- **Additional indexes** — added only when justified by observed production query patterns, not preemptively.

## 10. Production verification checklist (run when the migration is applied in prod)
- [ ] Existing tracking still works (`page_view`/`page_time`/`review_*` write rows).
- [ ] Anonymous tracking works (event with no session → row with `anon_id`, `user_id` NULL).
- [ ] `event_id` deduplication works (re-send same `event_id` → no second row).
- [ ] No duplicate events stored (spot-check counts by `event_id`).
- [ ] Existing dashboards continue working (`/admin/analytics` renders).
- [ ] Preference profiling continues working (signal event → `behavior_summary` rebuild).
- [ ] No unexpected database growth (row-size / table-size within the estimated ~130–160 B/row).
- [ ] No noticeable latency increase on `/api/track` or the auth/reviews flows.

## 11. Next
On approval → **Step 1 (Authentication events)**: emit `auth_signup_completed` / `auth_login_completed` / `auth_login_failed` (+ `method` vocab, `is_first_login`) at the auth points, on top of this foundation.

---
*Phase 0 remains held; the `8e68f42` release still awaits S6/S7. Step 1.0 touches neither. No code beyond the approved Step 1.0 scope.*
