# Root Cause Analysis — Acquisition Breakdown fields showing "unknown"

**Scope:** Investigation only. No code, database, migrations, APIs, services, rollups, tracking, or UI were changed.

**Symptom:** In Admin Dashboard → Authentication Analytics → Acquisition breakdown, the `method` dimension displays real values; `platform`, `app_version`, `country`, `language`, and `source` all display `unknown` for nearly every row.

> **Revision note (post CRON_SECRET fix):** An earlier draft of this RCA concluded the root cause was "the `analytics-snapshot` cron has never run successfully." That was true of the **historical** production state but is **no longer true**. Per [CRON_SECRET_ROTATION_VERIFICATION.md](CRON_SECRET_ROTATION_VERIFICATION.md) (2026-07-17), the cron now runs successfully and `auth_daily_rollup` is populating. This revision distinguishes historical vs current state and re-derives the *current* root cause, which is **not** the cron.

## Data flow traced

```
Client envelope → /api/track → user_events → (cron: analytics-snapshot) → user_acquisition → authAnalyticsService → Dashboard
```

Every stage from the client through `user_events` is implemented correctly, and every code-level mapping (client → API → RPC) is correct. The break is in the **state of the `user_acquisition` table** — the table the dashboard reads for this view — not in any single mapping.

## Historical state vs current state

| | Historical (before CRON_SECRET fix) | Current (after fix, verified 2026-07-17) |
|---|---|---|
| `analytics-snapshot` cron | Never completed a run (rejected 401 — secret unrecoverable) | Runs successfully; returns `{"ok":true,...}` |
| `auth_daily_rollup` | 0 rows | ≥1 row (confirmed) |
| Cron **acquisition step** (step 2) | Never executed | Executes, but returned **`acquisitionProcessed: 0`** in the verified run |
| Acquisition breakdown fields | unknown/NULL | **Still** unknown/NULL |

The key new evidence is the verified cron response:
```json
{"window":{"from":"2026-07-14","to":"2026-07-17"}, "acquisitionProcessed":0, "rollupError":null, "signupReadError":null, ...}
```
The cron worked — but its acquisition step **processed zero rows**, because there were no `auth_signup_completed` events inside its trailing 4-day window. (The rollup row that *did* appear came from a returning **login**, not a new signup.) So a working cron, in this run, wrote/updated **nothing** in `user_acquisition`.

## Why the fields are still null — current root cause

The cron being fixed does not fix these fields, for three compounding structural reasons:

### 1. The dashboard is dominated by historical backfill rows, which the cron cannot touch
The one-time backfill ([migration:89-103](supabase/migrations/20260713_user_acquisition_dimension.sql#L89)) inserted a row for **every pre-existing user**, hardcoding:
```sql
'unknown', 'unknown', 'unknown',   -- signup_platform, signup_app_version, signup_device_type
```
and **omitting** `signup_country`, `signup_language`, `acquisition_source` entirely (→ `NULL`). These rows dominate the breakdown counts. The cron's acquisition step only queries **new `auth_signup_completed` events in a trailing 4-day window** ([route.ts:42-48](src/app/api/cron/analytics-snapshot/route.ts#L42), `RECONCILE_DAYS = 4`). A user who signed up long ago generates no new signup event, so **no working cron will ever revisit their row.**

### 2. First-write-wins makes the `'unknown'` placeholders permanently sticky
`fn_upsert_user_acquisition` merges with **first-write-wins** ([migration:70-78](supabase/migrations/20260713_user_acquisition_dimension.sql#L70)):
```sql
signup_platform    = COALESCE(ua.signup_platform,    EXCLUDED.signup_platform),
signup_app_version = COALESCE(ua.signup_app_version, EXCLUDED.signup_app_version),
```
Because the backfill wrote the **non-null string** `'unknown'`, `COALESCE(existing, new)` keeps `'unknown'` — even if a real signup event for that user later arrives. So `signup_platform`/`signup_app_version` on any backfilled row can **never** be corrected by the cron. (By contrast `signup_country`/`signup_language` are `NULL`, so COALESCE *would* accept a new value — but only if a new signup event for that user is ever processed, which for existing users it never is.)

### 3. The correct new-signup path is sound in code but hasn't been exercised yet
For a genuinely **new** user signing up after the envelope + cron fix, there is no prior row, so `fn_upsert_user_acquisition` does a clean `INSERT` with the correctly-mapped values from [acquisitionFromSignupEvent](src/lib/admin/analytics/userAcquisitionService.ts#L40) — all five fields would populate (with `acquisition_source` defaulting to `'organic'`). This path is **correct in code**, but `acquisitionProcessed: 0` shows it has **not actually run for any signup yet** (no new signups in the verified window). So there is not yet any live evidence of a correctly-populated acquisition row — the table still contains only the placeholder backfill rows.

## Root cause classification per field (current state)

| Field | Why still null/unknown now | Category |
|---|---|---|
| `signup_platform` | Backfill wrote literal `'unknown'`; first-write-wins COALESCE permanently protects it; cron only reprocesses new windowed signups (never historical users). For pre-tracking users the real value never existed. | **Missing backfill** (corrective) + sticky-placeholder merge semantics. *Not* cron, mapping, or RPC. |
| `signup_app_version` | Same as `signup_platform`. | **Missing backfill** + sticky placeholder. |
| `signup_country` | Backfill left `NULL`; only correctable if a *new* signup event for that user is processed, which never happens for existing users. Cron works but processes 0 rows for these users. | **Missing backfill** (corrective). Source is captured correctly for *new* signups (server-side IP header). |
| `signup_language` | Same as `signup_country` (NULL in backfill; new-signup path works but unexercised). | **Missing backfill** (corrective). |
| `acquisition_source` | No client-side UTM/referrer/campaign capture exists **anywhere**; independent of the cron. New signups fall back to `'organic'`, historical rows are `NULL`→`unknown`. | **Missing tracking** (unchanged, independent gap). |

## What is NOT the cause (ruled out)

- **Not the cron** — it now runs successfully (verified).
- **Not missing API mapping** — `/api/track` forwards/derives all fields into `user_events` correctly ([route.ts:85-96](src/app/api/track/route.ts#L85)).
- **Not missing RPC parameters** — `fn_upsert_user_acquisition` accepts and writes all five fields; `toRpcParams` passes them all ([userAcquisitionService.ts:71-86](src/lib/admin/analytics/userAcquisitionService.ts#L71)).
- **Not missing DB columns** — all columns exist ([migration:16-31](supabase/migrations/20260713_user_acquisition_dimension.sql#L16)).
- **Not a client-capture gap for platform/app_version/language** — the envelope attaches these to every event ([envelope.ts:80-97](src/lib/tracking/envelope.ts#L80)); `country` is derived server-side from `x-vercel-ip-country`. (`acquisition_source` is the sole client-capture gap.)

## Conclusion

**Historically**, the acquisition fields were null because the cron never ran (the earlier RCA's conclusion, and [PRODUCTION_BUGLIST.md](PRODUCTION_BUGLIST.md#L14) item #2). **That cause is now resolved** — the cron runs and the auth rollup populates.

**Currently**, the fields remain null/unknown for a *different* reason: the `user_acquisition` table is still filled almost entirely by the **one-time backfill's placeholder rows**, which a correctly-functioning incremental cron **structurally cannot correct** — because (a) it only reprocesses new signups in a trailing 4-day window, never historical users, and (b) first-write-wins `COALESCE` permanently protects the backfilled literal `'unknown'` for platform/app_version. The verified `acquisitionProcessed: 0` confirms that, since the fix, **no new signup has yet flowed through the (correct) live path**, so no properly-populated row exists to displace the placeholders in the breakdown.

Primary current root cause: **missing corrective backfill** (compounded by sticky first-write-wins semantics for the two hardcoded `'unknown'` fields). Secondary, independent: **missing tracking** for `acquisition_source`. The live new-signup mapping/RPC path is correct in code but **unverified in production** (0 signups processed so far).

### Caveats / limits of this investigation
- I could not query the production `user_acquisition` table directly to quantify how many rows are backfill-placeholders vs correctly populated (the temporary Supabase access token used in the prior session was revoked). The above is derived from code + migration + the verified cron response.
- Whether any post-migration signups exist in `user_events` that fell **outside** every 4-day cron window (and were therefore silently skipped by the incremental design) cannot be confirmed without a DB query — flagged as a possible additional, quantifiable gap.

---

# Addendum — Does this affect NEW signups, or only historical users?

**Question:** trace a brand-new signup end to end and state, per field, whether it populates correctly on first write.

## Brand-new signup path (verified against code)

1. **Client fires the event** — `emitAuthLoginFromSession` fires `track('auth_signup_completed', { method })` for a first-time account ([authEvents.ts:59](src/lib/analytics/authEvents.ts#L59)). `track` attaches the shared envelope ([tracker.ts:47](src/lib/tracking/tracker.ts#L47) → [buildEnvelope](src/lib/tracking/envelope.ts#L80)), so the event carries `platform:'web'`, `app_version`, `language` (=`device.locale`) in addition to `metadata.method`.
2. **`/api/track` stores it** — writes those envelope fields into `user_events`, sets `user_id` from the authenticated **session** on the request, and derives `country` from the `x-vercel-ip-country` header ([route.ts:68,85-96](src/app/api/track/route.ts#L68)).
3. **Cron picks it up** — the daily `analytics-snapshot` run selects `auth_signup_completed` events in the trailing 4-day window (with `user_id` not null) and maps each via `acquisitionFromSignupEvent` ([route.ts:42-54](src/app/api/cron/analytics-snapshot/route.ts#L42)).
4. **RPC writes it** — `fn_upsert_user_acquisition`. A brand-new user has **no prior row** (backfill only covered migration-time users; nothing else writes acquisition rows), so this is a clean **INSERT** — first-write-wins `COALESCE` is irrelevant because there is no conflict.

## Per-field verdict for a brand-new signup

| Field | First-write value | Correct on first write? |
|---|---|---|
| `signup_platform` | `'web'` (from envelope) | ✅ **Yes** |
| `signup_app_version` | `device.app_version` (from envelope) | ✅ **Yes** |
| `signup_country` | server-derived from `x-vercel-ip-country` | ✅ **Yes** on Vercel production (⚠️ `null` only if the header is absent, e.g. non-Vercel/edge cases) |
| `signup_language` | `device.locale` (from envelope) | ✅ **Yes** |
| `acquisition_source` | `'organic'` (hardcoded fallback; client never sends a real source) | ⚠️ **No** — writes a non-null `'organic'`, but **never captures the real UTM/referrer/campaign**; no source instrumentation exists |

## Answer

- **`signup_platform`, `signup_app_version`, `signup_country`, `signup_language`** → a brand-new signup **populates these correctly on first write**. The `unknown`/`NULL` values seen on the dashboard for these four come **exclusively from the one-time backfill's placeholder rows** for pre-existing users. → **Classification: historical backfill limitation.** (Now that the cron works, these fields self-heal as new users sign up; only the historical rows remain wrong, and for genuinely pre-tracking users their true values never existed and are unrecoverable.)

- **`acquisition_source`** → **No** — the current signup pipeline still loses the real value for *every* user, new ones included. It is lost at the **very first step**: nothing in the client (or anywhere) ever captures UTM/referrer/campaign into `metadata.acquisition_source`, so `acquisitionFromSignupEvent` always falls back to `'organic'` ([userAcquisitionService.ts:52](src/lib/admin/analytics/userAcquisitionService.ts#L52)). → **Classification: ongoing tracking-instrumentation gap (not historical).** The exact loss point is client-side capture — before the event is even built.

## Edge cases worth noting (not the systematic cause, but real)

These can make an *individual* new signup miss its acquisition row entirely (the user then does not appear in the breakdown at all, rather than appearing as `unknown`):
- **2-minute first-login heuristic** — `auth_signup_completed` only fires if `auth.users.created_at` is within 2 minutes of session availability ([authEvents.ts:58](src/lib/analytics/authEvents.ts#L58)). A slow OAuth round-trip exceeding that window emits no signup event. Since the acquisition step consumes *only* signup events (`acquisitionFromLoginEvent` has no caller — `AUTH_ANALYTICS_AUDIT.md` TD-1), such a user never gets an acquisition row.
- **`user_id`-null race** — the cron excludes rows where `user_id IS NULL` ([route.ts:47](src/app/api/cron/analytics-snapshot/route.ts#L47)); if the batched signup event flushed before the session cookie was attached, it would be skipped.
- **Cron gap > 4 days** — the incremental window would skip a signup only if the cron failed to run for more than 4 consecutive days (the now-fixed historical failure mode).

## Bottom line

The dashboard symptom is **two overlapping issues**, now cleanly separated:
1. **Historical backfill limitation** (platform, app_version, country, language) — new signups are fine; only the placeholder backfill rows are wrong.
2. **Ongoing tracking gap** (acquisition_source) — affects everyone, including new signups, because the value is never captured client-side.

Quantifying the exact ratio of correct-vs-placeholder rows in production would require a direct `user_acquisition` query, which I cannot run (the temporary DB token was revoked). The verified `acquisitionProcessed: 0` means the new-user path, while correct in code, had not yet been exercised by a real signup as of the last verification.

No code was modified as part of this investigation.
