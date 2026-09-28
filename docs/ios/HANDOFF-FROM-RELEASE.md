# iOS handoff from the 2026-09-28 public release

- Release SHA (main): <FILL>
- Android versionCode 10 / versionName 1.0.0 (`1dcc877`)
- Backend: https://www.tappyai.com
- Date: 2026-09-28
- Source of truth: `rc/web-uat` @ `1dcc877` vs `origin/main` @ `f42ae4b` (previous production). 555 non-merge commits in range; Phase 7 → release window starts ~2026-09-18.
- Server contract doc touched in this window: `docs/ios/04_API_CONTRACT.md` (maxDuration update, `acb2c4b`).

> Every endpoint below was verified to exist under `src/app/api/`. "iOS today" = grep of `ios/TappyAI/` at `1dcc877`.
> Caveat (project memory): iOS has never been compiled on macOS in this line of work — even "done" items are source-level only.
> Android paths are relative to `android/app/src/main/java/com/tappyai/app/` unless prefixed with `res/`.

---

## 1. Must do on iOS

### P0 — store / blocking

| Item | What iOS must do | API contract | Android reference | Web reference |
|---|---|---|---|---|
| **In-app account deletion** (`938501e`, `93e1b52`, `d1ef6ec`, `1dcc877`). iOS today: **missing** — `Features/Profile/UI/SettingsView.swift` only opens an email ("the app never deletes anything itself"). The public `/delete-account` page now describes an in-app button (Android/web). | When `GET /api/config` → `flags.accountSelfDelete == true`: Settings row "Xóa tài khoản" (subtitle "Xóa vĩnh viễn tài khoản và dữ liệu của bạn" / "Permanently delete your account and data"), dialog with the removal list + "kept, no longer linked" list, user types XÓA/XOÁ/DELETE to enable a red button; on 200 show what happens next (DB now, files ≤48 h) then sign out locally. Flag false/config unreadable → keep today's email flow. | `POST /api/account/delete`, `Authorization: Bearer <supabase JWT>`, body `{ "confirm": "XÓA" \| "XOÁ" \| "DELETE" }` (NFC, trimmed, upper-cased server-side). `200 {ok:true}`, `400 confirm_required`, `401 unauthorized`, `403 account_required` (anonymous), `404 not_available` (flag off), `409 staff_account`, `500 delete_failed`; every error has a localised `message`. | `account/data/AccountDeletionApi.kt`, `profile/DeleteAccountDialog.kt`, `profile/SettingsScreen.kt`, `profile/SettingsViewModel.kt`, `res/values{,-vi}/strings_account_delete.xml` | `src/app/(app)/profile/settings/delete-account/DeleteAccountView.tsx`, copy `src/lib/i18n/accountDelete.ts` (parity test `src/lib/legal/accountDeleteCopyParity.test.ts`), `src/lib/account/selfDelete.ts`, `src/app/api/account/delete/route.ts` |
| **18+ gate on chat** (guest part new: `968472e`; account part already in prod: `126a7e1`). iOS today: **missing** — no age handling in `ios/`. | Guest/anonymous: before the first chat ask "18+?" (birth year or confirm), store on device, send the header on every `/api/chat`; without it every guest turn is 403. Signed-in without DOB: handle the 403 and let the user enter a DOB. Map all three 403 codes to UI — never a generic error. | Header `x-tappy-age-declared: YYYY-MM-DD \| YYYY \| 18plus` (re-evaluated per request). 403 bodies: `{error:"age_declaration_required", message, upgradeUrl:"/age-check"}`, `{error:"age_ineligible"}`, `{error:"age_verification_required"}`. Account DOB: `PATCH /api/profile` `{ dateOfBirth }` → 400 `invalid_date_of_birth`. (`POST /api/age-declaration` is the web cookie path; native uses the header.) | `chat/GuestAgeDeclaration.kt`, `chat/data/GuestAgeStore.kt`, `chat/data/RealChatRepository.kt` (header), `chat/data/ChatException.kt` (`AgeDeclarationRequired`, `AgeGate`) | `src/app/age-check/AgeCheckView.tsx`, `src/lib/account/guestAgeDeclaration.ts`, `src/lib/account/ageEligibility.ts` |
| **Report a review/clip (UGC)** (`6d36276`, F-031). iOS today: **missing** (Android also missing; web has the menu). | "Report" action on other people's posts (feed + detail); owners keep hide/delete; guests see neither. Needed for App Review 1.2 now that music reuse (old report path) is gone. | `POST /api/reviews/{id}/report`, auth required (anonymous refused), body `{ "reason": "spam"\|"harassment"\|"inappropriate"\|"copyright"\|"misinformation"\|"violence"\|"other" }`; `400 invalid_reason`, `401`, `404 not_found`; duplicate = silent no-op. | — (Android gap) | `src/app/reviews/feedShared.tsx`, `src/lib/reviews/reportReasons.ts`, labels `src/lib/i18n/w2/reviews.ts` |
| **Music stays hidden; never call retired endpoints** (`c9e8352`, `b72f5cc`, `919736a`, `ae2a777`). iOS today: flag done (`Core/Config/ProductFlags.swift` `showMusic=false`; `AppConfigService` reads `flags.showMusic`); composer **verify** — `CreateReviewViewModel.swift` still builds `music: musicPayload`. | Ensure no entry point reaches `/api/music/*`, `/api/sound/*`, `/api/upload/audio` — all **410 Gone** now. `POST /api/reviews` with any `music` value → **410**, so the payload must stay nil (synthesised Encodable omits nil Optionals — keep it so). | `flags.showMusic` from `GET /api/config`; 410 on retired routes | `ProductFlags.kt`; whole `music/` package deleted | `src/lib/config/product.ts` `SHOW_MUSIC`, `src/lib/http/gone.ts` |

### P1 — user-visible parity

| Item | What iOS must do | API contract | Android reference | Web reference |
|---|---|---|---|---|
| **Booking/order CTA before Maps** (`30799a6` UAT4 P1-b; hotel booking links `15e0d86`/`41bcd42`/`2e16f4c`). iOS today: **wrong order** — `Features/Chat/UI/PlaceCardView.swift` `usableActions` puts maps first. | Order: commerce-primary lead → one row of BOOK_KINDS → Maps → rest. No book-kind action → Maps first. Hotels from the places tool now carry a Trip.com `booking` action that must render before "Xem bản đồ". | place action `kind` ∈ `{order, delivery, booking, reservation, ticket, purchase}` (unchanged `tappy.places.v1` shape) | `chat/PlaceCard.kt` (`BOOK_KINDS`, `groupActions` → `books`) | `src/components/chat/PlaceDecision.tsx` (`BOOK_KINDS`) |
| **Client-side repeated-reply collapse** (`84f9307`, `6d036f3`, UAT3/UAT4 P1-a). iOS today: **missing**. | On stream finish, before parse/save/TTS, run the port of `cleanRepeats`: drop a second near-identical version of the reply (Dice ≥ 0.8), intra-turn repeated sentences and immediate phrase repeats. The server guard cannot undo a repeat inside one streamed step. | none (client text transform) | `chat/ReplyRepeat.kt`, call site `chat/ChatViewModel.kt` | `src/lib/chat/replyRepeat.ts` (used in `src/components/ChatInterface.tsx` onFinish) |
| **Trip plan: local tips + "no price" sentinel** (`17deb7e`, `b0045ab`). iOS today: **missing** — `TappyPlan` (`Features/Chat/Model/ChatModels.swift`) has no `local_tips`; plan card renders `cost` verbatim. | (a) Decode optional `local_tips` and render a "Local tips" section. (b) Show a cost/budget/breakdown value only if it contains a digit or means free (Miễn phí/Free); drop "chưa có giá"/"price not available" — never paint it in a price slot. Keep sending the verbatim `planJSON` to `/api/plans/share`. | `[TAPPY_PLAN]` JSON gains `local_tips?: [{ text, basis: "tool"\|"general", place?: string }]` (≤4, guarded server-side) | `chat/ChatResponse.kt` (`LocalTip`), `chat/TripPlanCard.kt`, `chat/PlanPrice.kt` | `src/components/TripPlanCard.tsx`, `src/lib/plans/planPrice.ts` |
| **Place-card copy: localised reasons, readable price band, no false rank** (`7423444`, `35a68c2` F-050; `982a4c0`; `feee661` server). iOS today: **missing** — `LivePlaceReason` has only `attribute`/`evidence`; no `pickUnmatched`. | Word each reason from `params` in the reader's language ("đánh giá 4.9 · cách 0.9 km"), fallback `evidence`. Price band: open lower bound "1-100.000 ₫" → "dưới 100.000 ₫"; closed "100.000–200.000 ₫". Rank badges only when `ranked != false && !pickUnmatched`. Save-place button only on replies that carry a place. | `tappy.places.v1`: reason `params` (`value`, `count`, `km`, `priceVnd`, `stars`, `minutes`), view-level `pickUnmatched: Bool`, `preliminary: Bool` | `chat/PlaceCardCopy.kt`, `chat/PlacesLiveView.kt` (`positionsRanked()`), shared fixture `shared/place-card/copy-fixtures.json` | `src/lib/recommendation/reasonText.ts`, `src/lib/recommendation/priceBand.ts`, `src/components/chat/PlaceDecision.tsx` |
| **Honest shopping offer label** (`7487b4d`, `041bda7`). iOS today: **wrong** — `ShoppingDecisionCardView.swift` `offerRow` labels every link "Xem". | Google/marketplace search redirect → "Tìm trên {platform}" / "Search on …"; only a genuine product page → "Xem" / "Xem trên {platform}". | none (client-side from offer URL) | `chat/OfferDestination.kt`, `chat/SellerPlatform.kt`, `chat/ShoppingDecisionCard.kt` | `src/components/chat/structured/OfferRow.tsx` |
| **Share an answer as a public page (G1 share-out)** (`47f2d5e`, `8a01877`). iOS today: **missing** (plan share exists: `Core/Share/PlanShareService.swift`). | Message action "Share publicly": preview → show sanitised payload → confirm → publish → system share sheet with `url`. Signed-in only (anonymous may only publish a child of an opened share). | `POST /api/shared-results/preview` and `POST /api/shared-results`, body `{ conversationId: uuid, messageIndex: int 0..500, title?, locale?: "vi"\|"en", parentSlug? }`; server reads the message from the user's OWN saved conversation (RLS), never trusts client text. Preview → `{ payload:{title,query,body,images[],buttons[{label,url}]}, listed }`; publish → `{ id, slug, url, title, domain, listed }`. | `chat/data/SharedResultApi.kt`, `chat/data/SharedResultRepository.kt`, `chat/SharePublicDialog.kt` | `src/components/share/SharePreviewDialog.tsx`, `src/lib/share/shareRequest.ts`, `src/lib/share/sharePolicy.ts` |
| **Copyright policy reachable while music is hidden** (`229ace4`). iOS today: **unknown** — `CopyrightPolicyView` lives under `Features/Music`. | Settings → Legal: "Copyright Policy" row opening `https://www.tappyai.com/copyright`, independent of `showMusic`. | none (web page) | `profile/SettingsScreen.kt` (Legal row) | `src/app/copyright` |

### P2 — nice to have / server-blocked

| Item | What iOS must do | API contract | Android reference | Web reference |
|---|---|---|---|---|
| **Push registration** (`7ba545d`). iOS today: **broken server-side** — `NotificationManager.swift` posts `{provider:"apns", token}` but `src/app/api/notifications/subscribe/route.ts` only branches on `fcm`; anything else is treated as Web Push → **400**. | Needs a server APNs branch first (not in this release). Then copy Android timing: register when the session becomes authenticated, skip anonymous. | `POST /api/notifications/subscribe` accepts `{provider:"fcm", token}` or Web Push `{endpoint, keys}` | `notifications/data/PushRegistration.kt`, `notifications/data/NotificationSubscriptionApi.kt`, `navigation/AppNavHostViewModel.kt` | — |
| **Progress frames on place turns** (`b00a8cb`, `43a32a2`). iOS today: ignored (`8:` → `.unknown`), harmless. | Show the server sentence instead of generic dots; accept a `preliminary` place frame and keep the LAST place frame. | `8:[{kind:"tappy.progress.v1", v:1, stage:"searching"\|"found"\|"writing"\|"finishing", count?, text}]` — decode per element by `kind` (a mixed array fails if decoded as `[PlacesLiveView]`). | `chat/data/ChatStreamFrames.kt` | `src/lib/recommendation/progressAnnotation.ts` |
| **Declare the surface**. iOS today: no header. | Optionally send `x-tappy-surface: ios` (commerce links/events then carry `platform=ios`). Does **not** switch to card mode (server treats only `web`/`android` as card surfaces). | request header on `POST /api/chat` | `chat/data/RealChatRepository.kt` (`SURFACE_HEADER`) | `src/components/ChatInterface.tsx`, `src/lib/ai/decisionSurface.ts` |
| **Video upload formats** (`7f48b13`, `6a8d12e`). iOS today: `CreateReviewService.swift` still maps `.webm`. | Upload MP4/MOV only; remove the webm branch; show the server `message` on 422. | `422 { error:"unsupported_format", message }` (judged from bytes) | `reviews/ui/ReviewComposerViewModel.kt` | `src/app/reviews/new/page.tsx` |
| **Quota wording** (`24b9fb8` family). Backward compatible. | Guest allowance is a **lifetime** trial; word the paywall from `quotaPeriod`/`isAnonymous`. | `GET /api/subscription` adds `quotaPeriod: "day"\|"lifetime"`, `isAnonymous: Bool` | — | `src/app/api/subscription/route.ts` |
| **Scam Shield message check + verdict share** (`24b9fb8`, `8a01877`, `ca1418d`). iOS today: URL check only. | Add the "message" tab; never accept phone/bank numbers as input; verdict share optional. | `POST /api/scam-shield/analyze` (shared AI quota), `POST /api/scam-shield/share` | `scamshield/ScamShieldViewModel.kt` | `src/app/scam-shield/*` |
| **Analytics** (`8a5354c`, `b9ade29`, `041bda7`, `254c622`). iOS today: none. | Only if Firebase is added: same closed GA4 taxonomy + allowlisted params; never send ids, queries or URLs. | — | Android `core:analytics` (`8a5354c`) | `src/lib/analytics/ga4.ts` |
| **Inbound share (Share Extension)** (`19569f1`) | "Share → Tappy" of text/link opens chat prefilled; no new backend. | none | `navigation/IncomingShareParser.kt` | `src/lib/growth/shareTarget.ts` |
| **Profile bio/cover, QR card, profile share sheet** (`9f85cde`, `befa5a7`, `f9d0993`) | Web-only this release. `GET`/`PATCH /api/profile` return/accept `bio`, and `cover_url` (clear only, `null`). | `/api/profile` | — | `src/app/users/[id]/PublicProfileView.tsx`, `src/lib/qr/brandedCard.ts`, `src/components/share/ShareMenu.tsx` |

**Already done on iOS (re-check when compiling):** `flags.showMusic`; `freemium.anonLifetimeLimit` and `upload.maxPhotoSizeMb` (`AppConfigService.swift`); commerce handoff `platform:"ios"` (`CommerceHandoffReporter.swift`); plan share `POST /api/plans/share` (`PlanShareService.swift`); `GET /api/reviews/liked` + `/api/reviews/shared` (`ReviewsService.swift`); Zalo login `platform=ios` (`ZaloAuthController.swift`).

---

## 2. Server-only (no iOS work)

- **Answer first, ask after:** clarify gate only for truly vague asks; one `askAfter` question appended at the END of prose (`9ab1858`, `33a66dd`, `526129a`, `d965363`, `6f6630a`, `f3a29e3`, `23ee1d0`, `f87b748`; Consultative V1 default ON `74b6f10`).
- **Flights:** `get_flight_prices` pre-search; date asked after (`d9a8c14`).
- **Reply language follows the conversation**, not the UI locale (ADR-027 amended, `c740d21`). Keep sending `Accept-Language` (last tie-breaker only).
- **Plan completion:** a planning turn that stops early gets `[TAPPY_PLAN]` from one extra call (`bda3845`, `a6ae158`).
- **Turn length:** `/api/chat` `maxDuration` 120 s, turn deadline 110 s (`acb2c4b`); the completion can be silent ≤45 s, under the iOS 60 s idle timeout (`ChatService.swift timeout: 60`) — do not lower it.
- **Truncated `[CTA_BUTTONS]`** dropped server-side (`95c22cb`, `71df07a`).
- **Grounding guards** — unsupported claims, venue lock, distances, budget-fit, plan price, hours (`483c8fb`, `3e7126c`, `3169afd`, `ecbfaa7`, `b79b358`, `7ab8e53`, `eb45ffd`, `5a954be`, `e7c66ff`).
- **Stream repeat guard (server half)** `stepRepeatGuard` (`84f9307`, `6d036f3`); client half is P1 above.
- **Long threads no longer 413:** server compacts old assistant turns (`364f3e0`); raw body ceiling 256 KB text (`6080db7`). iOS sends only `{role, content}` — no change.
- **Topic / lexicon fixes** (`9ad61cc`, `21ea532`).
- **Commerce:** ACCESSTRADE live deep links with pseudonymous `sub1` (`edd6111`, `3a18909`); hotel booking links (`15e0d86`, `41bcd42`, `2e16f4c`); runtime provider registry (`ad59f2d`, `902f383`, `9cfb7b9`); Google Places removed — Serper only (`6b16c49`).
- **Security:** C1 JSON-LD XSS on `/r/<slug>` (`e8c6326`); C2 Apple Root CA G3 pin for App Store JWS (`e81117a`) — transparent to StoreKit; H1/M1 column grants + service-role review INSERT (`e977967b`, `12681d6`) — iOS reads `profiles.onboarded` with SELECT only, unaffected.
- **Account/data hygiene:** deletion cascades (`ee481d8`, `cfe6654`), cron drains the queue (`e965a57`), audit retention (`94395ec`), `decision_evidence` sweep (`aefe4bd`), failed AI turn not charged (`fb466c1`), spend caps (`f6a75a6`).
- **Media:** EXIF/location strip, private one-day cache, random names (`0dd61eb`, `1fce328`, `11855e8`, `0bff106`, `0ee8e82`).
- **Zalo:** login finishes server-side, `/api/auth/zalo/complete` deleted (`5becb31`, `e5488ae`); iOS flow (`/api/auth/zalo?platform=ios` → `tappyai://auth/callback`) unchanged.
- **Web-only UI:** pinned-dark theme fix (`8003408`), Home category row hidden (`e269276`), sidebar Feedback removed (`5f8f57d`), `/register` redesign (`8ee4ca8`, `bbacc14`), bad image never breaks a page (`8439330`, F-057), public/app boundary (`6900362`), web request stripping (`8c24481`), inline affiliate tap analytics (`254c622`).
- **New routes iOS does not call:** `cron/*` (account-deletion-jobs, audit-retention, decision-evidence-sweep, feed-ingest), `admin/analytics/growth`, `qr/entry`, `oembed`, `zalo/mini/verify`, `group/[id]/avatar`; debug routes removed (`a74499f`).

---

## 3. Lessons from Android that apply to iOS

1. **Default fields that never reach the wire** (`7ba545d`, `41d4495`): Android's Json has `encodeDefaults=false`, so constant-default `provider`/`platform` were silently dropped (every FCM subscribe 400; handoffs had no platform). Swift: synthesised `Encodable` omits nil Optionals, and synthesised `Decodable` **ignores property defaults and throws on a missing key** — make new optional server fields `Optional`/`decodeIfPresent`, and pin every request body with an encode test.
2. **Bookings go before Maps** (`30799a6`) — pin the order in a test for all six kinds.
3. **Reply follows the conversation language** (`c740d21`) — do not "fix" client-side or force the locale into the prompt.
4. **Location: ask once per install, never swallow a message** (`d059ae1`): only the "📍 Tìm quanh đây" chip may ask again; when a prompt shows, the send WAITS and then goes out regardless; with no location the server asks for the district.
5. **Register push after sign-in, not at token time** (`7ba545d`); skip anonymous.
6. **Gate annotations by `kind`, per element** (`b00a8cb`); take the LAST place frame.
7. **Merges drop wiring** (`2153944`) — after any merge test plan card → Share → `POST /api/plans/share` 200 → `/plan/<id>`; a sheet with no block must end in "no plan", not a spinner.
8. **Server-owned copy is generated, not re-typed** (`src/lib/i18n/accountDelete.ts`, `shared/place-card/copy-fixtures.json`) — String Catalog + parity test on iOS.
9. **Never send `music`, never call a 410 route** (`ae2a777`).

---

## 4. How to verify on iOS (against https://www.tappyai.com or UAT)

- [ ] **Delete account:** `GET /api/config` → `flags.accountSelfDelete=true`; wrong word keeps the button disabled; "XÓA" → 200 + signed out; old account can't log in. Throwaway only.
- [ ] **Age gate:** fresh guest install gets the 18+ prompt before the first answer; `18plus` stored → chat works; under-18 → `age_ineligible` copy; account without DOB → `age_verification_required` → DOB entry.
- [ ] **Report:** report someone else's post ("copyright") → 2xx; again → still OK; own post shows no Report.
- [ ] **Music:** no tile/route/sound pill; zero `/api/music|/api/sound` calls; posted review has no `music` key.
- [ ] **Hotels:** "khách sạn Đà Nẵng gần biển dưới 1 triệu/đêm" → Trip.com booking button before "Xem bản đồ".
- [ ] **Repeats:** a long clarify-style reply is shown and saved once, no duplicate paragraph after reload.
- [ ] **3-day plan:** card appears (60–110 s, no timeout); Local tips when present; no "chưa có giá" in a price chip; Share → link opens.
- [ ] **VI thread on an EN device:** "len ke hoach 2 ngay 1 dem" answered in Vietnamese.
- [ ] **"quán ăn ngon gần đây" with location denied:** message still sends, reply asks for the district, no second system prompt.
- [ ] **Shopping reply:** search links "Tìm trên Shopee/…", product pages "Xem".
- [ ] **Place card:** VI reasons on a VI device; price band "dưới 100.000 ₫", not "1-100.000 ₫".
- [ ] **Regressions:** `TappyAITests` (ShareArtifactTests, ShoppingComparisonTests, CCP fixtures) + a TestFlight build via `ci/ios-build-rc`.
