# 05 · Privacy & Permissions Summary

A precise map of every permission the app requests and every way data leaves the device. All of this was read from the real `AndroidManifest.xml` and feature code — not assumed.

---

## Declared permissions (complete list)

The app declares **exactly two** permissions:

| Permission | Type | Why it's needed | User prompt? |
|---|---|---|---|
| `android.permission.INTERNET` | Normal | All app functionality is online: auth, chat/AI, reviews, discovery, music streaming, etc. | No (install-time, normal). |
| `android.permission.ACCESS_NETWORK_STATE` | Normal | Detect connectivity to show offline/online states and avoid failed calls (network-monitor). | No (install-time, normal). |

**No dangerous / runtime permissions are requested.** There is no `CAMERA`, `RECORD_AUDIO`, `ACCESS_FINE_LOCATION`/`COARSE_LOCATION`, `READ_MEDIA_*`/storage, `READ_CONTACTS`, or `POST_NOTIFICATIONS`.

### Why features that "seem to need" permissions don't
| Feature | Mechanism | Permission avoided |
|---|---|---|
| Voice input (chat) | System speech recognizer via `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` — the OS UI captures audio and returns **text**. | `RECORD_AUDIO` (app never touches the mic or raw audio). |
| Scan a photo — camera | `ActivityResultContracts.TakePicturePreview` launches the **system camera app**. | `CAMERA`. |
| Scan / avatar / review photo — from gallery | Android **Photo Picker** (`PickVisualMedia`). | Storage / `READ_MEDIA_IMAGES`. |
| Read-aloud (TTS) | On-device `TextToSpeech`. | None. |
| "Location" in personalization | Free text the user optionally types in chat. | Location permissions (no device GPS is ever read). |
| Notifications screen | Settings UI only — the Android app has **no push notifications** (no FCM service, no `POST_NOTIFICATIONS`). | `POST_NOTIFICATIONS`. |

---

## Custom URL schemes (deep links)
Declared in the manifest (custom scheme, no autoVerify / no domain verification needed):
- `tappyai://auth-callback` — Supabase OAuth redirect target.
- `tappyai://group/{id}` — Group Dining shared-link handler.

These are functional deep links, not data collection. (The user-facing shared link is the public web URL `<origin>/group/{id}`; making that open the app natively would additionally require an App Links intent-filter + hosted `assetlinks.json` — an infra step, not present today.)

---

## Data-flow map (where data goes)

```
        ┌────────────────────────── Device ──────────────────────────┐
        │  TappyAI Android app (no 3rd-party data SDKs)               │
        │   • analytics = logcat only, disabled in release           │
        └───────────────┬────────────────────────────────────────────┘
                        │ HTTPS/TLS
                        ▼
        ┌──────────── TappyAI backend (first-party) ─────────────┐
        │  Supabase  → auth + Postgres storage (processor)       │
        │  TappyAI API                                            │
        └───────┬───────────────────────────────┬────────────────┘
                │ query/photo content            │ query content
                ▼                                ▼
        Anthropic Claude (AI answers)     Google Search (results)
```

- **Stored in TappyAI's backend (Supabase):** account (name, email, avatar, user id), chat history, remembered preferences/context & response style, message feedback, reviews/comments/likes/saves, saved places, price watches, bookings (name + phone), group-dining info.
- **Sent to third-party processors to function:** chat/query text and any attached image → Anthropic Claude; query text → Google Search.
- **Never leaves the device:** raw microphone audio (system recognizer returns text), device location (never accessed).
- **No advertising ID, no ad networks, no cross-app tracking.**

---

## Encryption & access control
- **In transit:** HTTPS/TLS for all backend and processor traffic.
- **At rest / access:** per-account authentication and row-level access in Supabase; a user can only read their own history and profile (privacy policy §5). Auth tokens on device are held in the app's `core:security` encrypted token storage (Keystore-backed).

---

## User rights
- **Access:** users see their own profile, chat history, reviews, saved items in-app.
- **Deletion:** privacy policy promises account + data deletion. ⚠️ **Not yet implemented in the Android app** — see README blocker #1. Resolve before launch (in-app flow or public Account Deletion URL).
- **Sign out:** available in Settings.

---

## Privacy policy pointers
- **Public policy:** the web `/privacy` page (source of truth; last updated 19/06/2026). Ensure the production URL is live for the Play listing.
- **In-app policy/terms:** reachable from Settings → Terms of Service / Privacy Policy (localized; in-app "last updated" shows June 13, 2026 — align this date with the web policy).
- **Contact:** support@tappyai.com.

## Permission-declaration sanity check for submission
- [ ] Confirm no library pulled in an unexpected permission via manifest merger. Verify with the merged manifest of a **release** build: `:app:processReleaseMainManifest` output should still show only `INTERNET` + `ACCESS_NETWORK_STATE`.
- [ ] If a future dependency adds `AD_ID` or similar, revisit [02 Data Safety](02_data_safety.md).
