# Android behavioral analytics — gap audit and follow-up scope

**Status:** AUDIT ONLY — nothing in this document is implemented.
**Date:** 2026-09-08
**Context:** V3 User Data Foundation. §12/§13 require first-party behavioural data linked to the canonical identity; §11 forbids building a second analytics system.
**Related:** [`20260713_analytics_envelope_foundation.sql`](../../../supabase/migrations/20260713_analytics_envelope_foundation.sql) · [`deviceContext.ts`](../../../src/lib/tracking/deviceContext.ts) · [`DEVICE_CONTEXT_ARCHITECTURE_DECISION.md`](./DEVICE_CONTEXT_ARCHITECTURE_DECISION.md)

---

## 1. The finding, stated exactly

**No behavioural event from the Android app has ever reached `public.user_events`.** The gap is two distinct problems, and the second is larger than the first:

| # | Problem | Evidence |
|---|---|---|
| 1 | The provider is a logcat stub | [`LoggingAnalyticsProvider.kt`](../../../android/core/analytics/src/main/java/com/tappyai/core/analytics/LoggingAnalyticsProvider.kt) forwards `track`/`screen` to `LoggerProvider` and nothing else. Its own KDoc says *"until a real provider is wired in (Phase 1+)"* |
| 2 | **There is no instrumentation to send** | `AnalyticsProvider` has exactly ONE consumer in the whole app: `DiagnosticsViewModel`, reached only from the developer showcase screen. No product screen calls `track()` or `screen()` |

Fixing (1) alone would ship a working pipe carrying one diagnostics event. The follow-up must cover both or it delivers nothing measurable.

**Not affected:** the *server-side* half of Android's behaviour is already captured, because Android calls the same backend routes as Web. Review likes/saves/interactions, follows and posts are written by those handlers and are already visible to `signalCollector`. What is missing is **client-side** behaviour — screen views, impressions, searches, taps, session starts — which only the client can observe.

## 2. What already exists and must be REUSED, not rebuilt

The canonical pipeline is complete and platform-neutral. Android needs to *join* it, not extend it.

| Piece | Where | Android's obligation |
|---|---|---|
| Ingestion endpoint | `POST /api/track` | Call it. Accepts authenticated *and* anonymous events; dedups on `event_id`; caps batch at 100 and 8 KB/event; rejects PII by value and by key |
| Event table | `public.user_events` | Nothing — the envelope columns already exist and are indexed |
| Envelope contract | [`envelope.ts`](../../../src/lib/tracking/envelope.ts) | Produce the same field set |
| Device contract | `DeviceContext` in [`deviceContext.ts`](../../../src/lib/tracking/deviceContext.ts) | Fill the identical 19-field shape natively |
| Auth | `AuthInterceptor` | Nothing — it already attaches `Authorization: Bearer <jwt>` to our own host, and `/api/track` resolves `user_id` from the session server-side |
| HTTP + serialization | `NetworkModule` (Retrofit + OkHttp + kotlinx) | Nothing — add one `TrackApi` interface |
| Persistence for a stable id | `core:datastore` | Store the anon id there |
| Build metadata | `BuildConfig.VERSION_NAME`, `VERSION_CODE`, `GIT_SHA` | Read them |

**`user_id` must never be sent from the client.** `/api/track` sets it from the verified session — that is what makes event attribution un-spoofable (§31 test 24), and a client-supplied id would break it.

## 3. Exactly what the follow-up must build

### 3.1 `RemoteAnalyticsProvider` (replaces the binding, keeps the interface)

The `AnalyticsProvider` seam is correct and stays. Only the Hilt binding in `AnalyticsModule` changes. Feature modules keep depending on the interface, so no product code is touched by this step.

It must reproduce the Web tracker's behaviour, which is already specified by `tracker.ts`:

- batch, flushing every 10 s or at 10 events
- generate `event_id` at event-creation time (not at flush) so retries dedup server-side
- fail silently — analytics is best-effort and must never surface an error to a user
- flush on process/lifecycle stop (`ProcessLifecycleOwner`), the Android equivalent of `flushSync`/`sendBeacon`

### 3.2 The two identifiers

- **`anon_id`** — a stable per-install UUID in `core:datastore`. Web keeps this in `localStorage`; it is deliberately *not* the auth token and *not* an advertising id. Required so pre-sign-in events have an identity (`user_events_identity_chk` requires `user_id` OR `anon_id`).
- **`session_id`** — new after 30 minutes of inactivity, matching the Data Dictionary §4 session rule that `envelope.ts` implements.

### 3.3 `DeviceContext` — native implementation of the existing 19-field contract

Fill from `Build.*`, `Resources.displayMetrics`, `ConnectivityManager`, `Locale`, `TimeZone`, `BuildConfig`. **Honesty rule, copied from the Web implementation and non-negotiable:** undetectable *string* fields are `"unknown"`; undetectable *numeric* fields (`screen_width`, `screen_height`, `pixel_ratio`) are `null`. A fabricated `0` would assert a real 0×0 screen. `browser_name`/`browser_version` are `"unknown"` on native; `platform` is `"android"`; `is_pwa` is `false`.

`network_type` needs `ACCESS_NETWORK_STATE`. If that permission is unwanted, send `"unknown"` — do not guess.

### 3.4 Event taxonomy — start small, match the Web vocabulary

Only events the Android product actually has, using the **same names** as `KNOWN_TYPES` in `/api/track` (an unrecognised name is accepted but tagged `is_unknown_event`, which silently splits a metric in two):

`app_open` · `session_start` · `page_view` (screen) · `chat_search` · `category_click` · `place_click` · `place_save` · `review_view` · `deal_click` · `feature_use`

Deliberately excluded until there is a consumer: impressions, watch-duration (already server-side via `/api/reviews/{id}/interact`), and every event in §12 that Android has no surface for.

### 3.5 Instrumentation

The real work. A `TrackedScreen` composable effect for `page_view`, plus explicit `track()` calls at the handful of interaction sites above.

## 4. Privacy constraints this follow-up inherits

- `metadata` must carry no key in `ANALYTICS_FORBIDDEN_KEYS` ([`userDataClassification.ts`](../../../src/lib/account/userDataClassification.ts)). The server strips them and logs the key names, so a violation is visible rather than silent — but the client should not send them in the first place.
- No date of birth, age, email, phone, token or precise coordinate in any event.
- `anon_id` is an analytics identifier, not an identity: it must not be used for auth, and must be regenerated if the user clears app data (it will be, since DataStore is cleared with it).
- **REQUIRES LEGAL REVIEW before shipping:** the Privacy Policy ([`legal.ts`](../../../src/lib/i18n/legal.ts)) describes usage-and-device collection in terms that already cover this, but Play Data Safety declarations must be re-checked against the actual field list.

## 5. Why this is a SEPARATE task

1. **It is not user-data foundation work.** The canonical identity, profile, classification and AI boundary are complete without it. This is instrumentation of an existing pipeline.
2. **Its bulk is product-surface edits**, not architecture — `track()` calls spread across chat, explore, reviews, deals and home. That touches many files this task deliberately does not, and would violate §33.
3. **It needs its own product decision** on the event list and its own Play Data Safety review.
4. **It carries a permission question** (`ACCESS_NETWORK_STATE`) that is a release concern, not a schema one.

**Proposed scope for that task:** §3.1–3.5 above, one `TrackApi`, one provider swap, the ten events listed, and a wire-contract test asserting the Android envelope matches `envelope.ts` field-for-field — the same technique `ChatWireContractTest.kt` already uses for the chat contract.

**Explicitly out of that scope:** a second analytics system, an SDK (Firebase/Amplitude), a new events table, changes to `/api/track` or `user_events`, and iOS.
