# Step 1 — Authentication Events: Cross-Platform Emission Contract

**Audience:** Web, Android, iOS implementation teams. This is the **binding contract** — all three platforms emit **identical** `event_type` + `properties` (SR-2). Platform differs only via the `platform` envelope field.
**Pipeline:** every event flows through the one analytics ingestion (`/api/track`) with the unified envelope (Analytics v1.1 §3/§8A; Step 1.0).

---

## 1. The envelope (every event, every platform)

| Field | Type | Set by | Notes |
|---|---|---|---|
| `event_id` | UUID v4 | **client** | Generated at event creation; idempotency key (dedup on server). |
| `schema_version` | int | client | `1`. |
| `event_type` | string | client | Canonical name (§2). snake_case. |
| `user_id` | UUID \| null | **server** | Set from the authenticated session/token — clients MUST NOT send it (anti-spoof). |
| `anon_id` | UUID | client | Stable per-device id; present on anonymous events (pre-auth / failures). |
| `platform` | enum | client | `web` \| `android` \| `ios`. |
| `app_version` | string | client | Semantic app version (web currently `"unknown"` until set). |
| `build_number` | string | client | Platform build id. |
| `os_name` / `os_version` | string | client | e.g. `Android`/`14`, `iOS`/`17.5`. |
| `device_type` | enum | client | `phone` \| `tablet` \| `desktop` \| `unknown`. |
| `country` | string | server | From request IP. |
| `language` | string | client | e.g. `vi`, `en`. |
| `session_id` | string | client | New after 30 min inactivity. |
| `client_timestamp` | ISO 8601 UTC | client | Event time on device. |
| `server_timestamp` | ISO 8601 UTC | server | Ingestion receipt (`created_at`). |

**Transport:** batch to `POST /api/track` as `{ "events": [ …envelope+event… ] }`. Authenticated (bearer/session) sets `user_id`; anonymous requests are accepted (identity via `anon_id`).

---

## 2. Authentication events

### 2.1 `auth_signup_completed`
- **When:** a brand-new account's first successful authentication (first-time user).
- **Required metadata:** `method`.
- **Optional:** —

### 2.2 `auth_login_completed`
- **When:** any successful authentication.
- **Required metadata:** `method`.
- **Optional:** `is_first_login` (boolean) — true on the first login of a new account.

### 2.3 `auth_login_failed`
- **When:** any failed authentication attempt (anonymous — no session).
- **Required metadata:** `method`, `reason`.
- `reason` ∈ `invalid_credentials` | `expired` | `oauth_denied` | `network`.

### 2.4 `auth_logout_completed`
- **When:** user logs out.
- **Required metadata:** — (optional `method`).

---

## 3. `method` vocabulary (open TEXT — new providers just add a value)
`google` · `zalo` · `apple` · `email_otp` · `email` · `facebook`
- **Apple** (`apple`): emitted by **iOS** Sign-in-with-Apple (native). Web has no Apple flow.
- **Zalo** (`zalo`): web + native.
- `email_otp` = passwordless OTP; `email` = email+password signup.

---

## 4. Naming conventions
- `event_type`: `{domain}_{object}_{verb}`, snake_case, past-tense verb (`auth_login_completed`).
- Metadata keys: snake_case.
- Same `event_type` + same required metadata on **all** platforms — no platform-specific names or shapes.

---

## 5. Examples (identical across platforms; only `platform`/os differ)

**Android — Google login (returning user):**
```json
{ "event_id":"…","schema_version":1,"event_type":"auth_login_completed",
  "anon_id":"…","platform":"android","app_version":"1.4.0","build_number":"140",
  "os_name":"Android","os_version":"14","device_type":"phone","language":"vi",
  "session_id":"…","client_timestamp":"2026-07-13T10:00:00Z",
  "metadata":{ "method":"google","is_first_login":false } }
```

**iOS — Sign in with Apple (first login → also emit signup):**
```json
{ "event_type":"auth_signup_completed","platform":"ios","metadata":{ "method":"apple" }, … }
{ "event_type":"auth_login_completed","platform":"ios","metadata":{ "method":"apple","is_first_login":true }, … }
```

**Any platform — failed OTP (anonymous):**
```json
{ "event_type":"auth_login_failed","platform":"ios","anon_id":"…",
  "metadata":{ "method":"email_otp","reason":"invalid_credentials" }, … }
```

**Any platform — logout:**
```json
{ "event_type":"auth_logout_completed","platform":"android","metadata":{}, … }
```

---

## 6. Emission rules (all platforms)
1. **Exactly once per event.** Generate `event_id` at creation; never re-generate on retry. Guard against duplicate emission on the client (a login must emit `auth_login_completed` once). Server dedups on `event_id` as backstop.
2. **`user_id` is server-set.** Never send it from the client.
3. **Failures are anonymous** — carry `anon_id`, never a fabricated `user_id`.
4. **First-login detection** for `is_first_login` / `auth_signup_completed`: platform determines "new account" (e.g. account age at first auth). If unknown, omit `is_first_login`; the server derives first/returning from data too.

---

*This contract is the reference for Android/iOS Step-1 emission. It matches the web implementation (`src/lib/analytics/authEvents.ts`). Changes require updating this doc.*
