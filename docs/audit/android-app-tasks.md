# Android app — task list after the origin/main → V3 merge (docs only, no code)

Scope: what the Android client must do to keep working against the merged backend
(`merge/main-into-v3` @ `968472e`, D1 revised). Every item below was checked against the
current app source under `android/app/src/main/java/com/tappyai/app/` and the merged
`src/app/api/chat/route.ts`; nothing here is implemented yet.

RELEASE GUARDRAILS apply: none of these tasks may change card/marker layout, provider
fetching or row fields. Items 3 and 4 touch the chat request only; item 2 touches an error
branch; item 1 adds a screen the web already has.

## Current state (verified in source)

| Concern | Web (merged) | Android today |
|---|---|---|
| Guest 18+ gate | `403 age_declaration_required` → `/age-check` (guest form) → `POST /api/age-declaration` sets the `tappy_guest_age` cookie | `RealChatRepository.parseChatError` maps any unknown non-2xx to `ChatException.ServerError(code, serverSentence)`; `ChatViewModel` shows the server sentence as an error bubble — no way to declare, so a guest is stuck |
| Trial exhausted | `401 anon_limit_reached` → sign-in prompt | mapped to `ChatException.AnonLimitReached(message)` → rendered as a plain error bubble (`ChatViewModel.kt` ~L550), nothing tappable |
| Signed-in age gate (main #251) | `403 age_verification_required` / `age_ineligible` → `/age-check` | same `ServerError` bubble |
| GPS with chat | web sends `userLocation {lat,lng,address}` in the body → `distance_km` on rows, search centred on the user | `ChatRequest` has only `messages`; no `FusedLocation`/`ACCESS_FINE_LOCATION` anywhere in the app → cards never show distance |
| Card capability | web sends `x-tappy-surface: web` → server skips inline photo/link injection (`cardOwnsEnrichment`) | app sends no `x-tappy-*` header → server inline-injects; app renders those images as galleries (`ChatResponse.segment()`); the `8:` places frame is parsed only for share (`PlacesLiveViewParser` → `takeLatestPlacesView`) |

Server contract the app targets (all in `route.ts`, merged):
- Guest identity: no Bearer → guest. Declaration read from header `x-tappy-age-declared` FIRST, then cookie `tappy_guest_age` (`src/lib/account/guestAgeDeclaration.ts`). Values: `YYYY-MM-DD`, `YYYY`, or `18plus`.
- Refusals never spend quota or call the model (pinned in `src/app/api/chat/ageGate.route.test.ts`).
- Order: age gate → trial quota (5 lifetime, `401 anon_limit_reached`, `upgradeUrl: /login`) → model.

## Tasks

### 1. Guest 18+ declaration step (blocker for guest chat on Android)
- In `parseChatError`: map `403` + `error == "age_declaration_required"` to a new
  `ChatException.AgeDeclarationRequired(message)`; map `403` + `age_ineligible` /
  `age_verification_required` to `ChatException.AgeGate(code, message)` (signed-in path, main #251).
- `ChatViewModel`: on `AgeDeclarationRequired` show a declaration card in the transcript instead of an
  error bubble — the server sentence (`age.declarationRequired`: "Vui lòng xác nhận bạn đủ 18 tuổi để
  dùng thử Tappy.") plus either a birth-year picker or an "I am 18+" confirmation. Reuse the existing
  age-check UI if the app has one (none found in `profile/` or `navigation/` — `AgeCheck` matches are
  web-only), otherwise a minimal sheet.
- Persist the answer on device (DataStore/EncryptedSharedPreferences): the raw value (`YYYY`, or
  `18plus`). Under-18 answers are persisted too so the refusal sticks (mirrors the web cookie).
- Send `x-tappy-age-declared: <value>` on every `POST api/chat` while the user is a guest
  (the request builder at `RealChatRepository.kt` ~L66). Signed-in users must NOT send it — the
  server ignores it for accounts, but keeping the header guest-only avoids confusion in logs.
- On a persisted under-18 answer, short-circuit locally with the existing ineligible message
  (server text `age.ineligible`) — no request.
- Re-send the pending user message automatically after a successful declaration.
- Tests: mapper (`403 age_declaration_required` → typed exception, no bubble), header present for a
  guest and absent when a Bearer exists, persisted value survives process death, under-18 → no
  network call.

### 2. Tappable sign-in on `auth_required` / `anon_limit_reached`
- `AnonLimitReached` (401) and a new `AuthRequired` (401 `auth_required`) must render a bubble with a
  tappable "Đăng nhập" action that opens the app's login flow (same destination the Profile tab
  uses), not a dead-end error line. Keep the server sentence as the bubble text.
- After sign-in, re-send the pending message.
- Test: the two codes produce the action; a generic 401 without a code still falls to `ServerError`.

### 3. Send GPS (`userLocation`) with chat requests
- Add `userLocation: {lat, lng, address?}` to `ChatRequest` (nullable; omitted when unknown — the
  server treats absence as "no bias", exactly as today).
- Source: last known location from `FusedLocationProviderClient` with a coarse/fine permission
  prompt on first chat that needs it (the Home shell is the natural place; no permission → send
  nothing). Do not block the send on a location fix; use the cached last location only.
- Manifest: `ACCESS_COARSE_LOCATION` (+ `ACCESS_FINE_LOCATION` if precise distances are wanted).
- Effect (server-side, already implemented): rows carry `distance_km`, search is centred on the
  user (D2 radius 1500 on V3), "gần đây" queries work. No backend change.
- Test: body contains `userLocation` only when a location exists; numeric lat/lng (the server
  drops non-numbers).

### 4. Card capability — stop the backend inline-injecting photos/links
- Prerequisite: the app must render decision cards from the `8:` places frame in the transcript
  (today it only keeps the frame for share). Until it does, the inline injection is the only way
  photos/CTAs reach Android, so this item is BLOCKED on the card renderer.
- Backend note (not app work, flag for the owner): the server keys the capability on
  `x-tappy-surface === 'web'` literally (`route.ts` ~L907). Android cannot claim `web`; the backend
  needs a capability header (e.g. `x-tappy-renders-decision-card: 1`) or to accept `android` in that
  check. That is a one-line server change plus tests, outside this doc's scope.
- Once both exist: send the capability header on `api/chat`; drop the gallery segmentation for
  place turns (keep it for non-place media); replay the 69 captured G3 replies through the
  Android renderer with the header ON to confirm 0 inline blocks and cards present.

## Not in scope / unchanged
- Marker parsing, `ChatResponse.segment()`, card layout, provider rows — PROTECTED.
- iOS: frozen (no Mac); same four items apply when it resumes.
