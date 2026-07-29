# Analytics Platform v1 — Known Limitations

Intentional, documented deferrals and pre-existing low-severity items. None block the v1 freeze; listed so future work doesn't rediscover them as "bugs."

1. **`device_context` has no consumer yet.** The column is written on every event but nothing reads it (no dashboard, no service). Zero risk today; when a first reader is built, re-verify the privacy posture in `DEVICE_CONTEXT_AUDIT.md` §6 (P-1) at that time.
2. **No GIN index on `device_context`.** Deferred until a real segmentation query needs it — avoids premature indexing on a column with zero current readers.
3. **`login/page.tsx` has a pre-existing, out-of-scope UA check** (`navigator.userAgent` + `/Android/i`) unrelated to the analytics `device_context` detection module (flagged as F-1 in the device_context audit). Auth-flow concern, not an analytics-platform defect; optional future cleanup to route through `detectDeviceContext().os_name`.
4. **Fingerprint-surface note (P-1):** the combination of screen dims + pixel_ratio + color_scheme + timezone + browser/os version is a mild device-fingerprint surface, standard for analytics SDKs, no PII. Mitigations (bucketing screen dims, dropping timezone, truncating browser_version) are noted but not implemented — current posture (server-side only, RBAC-gated reads, no cross-user exposure) is low-risk.
5. **`is_pwa` / `network_type` on native platforms:** Android/iOS will report `is_pwa: false` (native apps aren't installed PWAs) and must implement their own `network_type` detection via `ConnectivityManager`/`NWPathMonitor` — mapping tables exist in the Architecture Decision, but no native code has shipped these fields yet. Web-only today.
6. **Webhook-originated events** (payment/notification providers) are not yet wired to `/api/track` — any future Revenue/Notification Analytics domain needs a thin server-side ingestion path for webhook-sourced events (see Extension Guide). Not built because no such domain exists yet.
7. **Operational Analytics table separation** is an open, low-stakes decision (share `user_events` vs. a dedicated table) deferred until that domain is actually built — see Extension Guide.
8. **`device_context` migration (`20260714_device_context.sql`) is staged but not applied to any database.** Must be applied before any code path that writes `device_context` is deployed; otherwise the insert would error on the missing column.
9. **Rate limits are a fixed 100 req/60s per user per domain** for admin analytics APIs — not yet configurable per role or per deployment tier. Acceptable at current admin headcount; revisit if analyst usage grows substantially.

None of the above represents a defect requiring a change before the v1 freeze; each is either deliberately deferred (documented above) or explicitly out of this platform's scope.
