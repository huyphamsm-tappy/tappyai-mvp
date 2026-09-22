# TappyAI — Manual UAT Handoff

Prepared 2026-09-21 for a full manual UAT on localhost. This is the document to work
from. It assumes the audit (non-production) Supabase project `zdaprdfgpbpnxyofagmc`.

> **This session's fixes to spot-check** (all committed on `uat/release-audit-2026-09`):
> - **F-029** — sharing a large Vietnamese plan no longer 500s (byte-based trim). *Test: item 6 below.*
> - **F-031** — a content-report channel is restored (`POST /api/reviews/[id]/report` + a Report menu on other people's clips). *Test: item 7 below.*
> - **Android music-reuse removed** — no "use this sound"/sound sheet/music tile; clips still play their own audio. *Test: item 4 below.*

---

## 1. Start everything from cold

### Web (required for everything, including the Android app)
```bash
npm install        # first time only
npm run dev        # Next.js on http://localhost:3000
```
- Expect: `▲ Next.js 14.2.35 … Local: http://localhost:3000`, ready in a few seconds.
- Env is already in `.env.local` (points at the audit Supabase, Serper key, Anthropic key). Do **not** commit it.
- Open http://localhost:3000 and sign in with an account from §2.

### Reset to a clean state (if you break the dev server / caches)
```bash
npm run dev:reset          # stop port 3000 → clear .next + node_modules/.cache → reinstall only if corrupt → health-check → stop
npm run dev:reset -- --keep   # same, but leaves the server running
```
- This resets the **dev environment only**. It never touches the database, your env files, or app code. The seeded accounts and data in §2/§3 persist across resets. If you need fresh data, re-run the provisioning (ask, or see §3).

### Android (debug build, against your local web server)
- Prereqs: Android Studio installed; an emulator running; the web dev server up on :3000.
- The debug build's API base URL defaults to **`http://10.0.2.2:3000/`** (the emulator's route to your host's localhost) — so the **emulator**, not a physical device, is the zero-config path.
- Build/install from the `android/` folder:
  ```bash
  cd android
  # Windows (Git Bash): point Gradle at Android Studio's bundled JDK 21
  export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
  ./gradlew :app:installDebug      # installs com.tappyai.app.debug on the running emulator
  ```
- Supabase URL/anon key for the debug build come from `android/gradle.properties` (already set to the audit project). App id: `com.tappyai.app.debug`.
- A **physical device** needs the API base overridden to your machine's LAN IP: `./gradlew :app:installDebug -PTAPPYAI_API_BASE_URL_DEBUG=http://<your-LAN-ip>:3000/` (and the phone on the same network).
- iOS: **not buildable here** (no macOS) and **must not be released** — see §5.

---

## 2. Accounts (persistent — created directly, log in with email + password)

All four use the same password: **`TappyUAT!2026`**. All are 18+ (age gate passed) and onboarded, so they land straight in the app.

| Role | Email | What it's for |
|---|---|---|
| **Plain user, with history** | `manual.uat.user@tappyai.com` | The product should not look empty: 2 saved conversations (a food chat + a Đà Lạt trip), 1 posted review (Phở Phú Vương, published), 1 saved review. Use for the "returning user" experience. |
| **Fresh plain user** | `manual.uat.fresh@tappyai.com` | A brand-new signed-in user, no history. Use to see empty states and first-run flows. |
| **Pro user** | `manual.uat.pro@tappyai.com` | Has an **active subscription** (`status=active`, expires ~1 year out), so it skips the free-question quota and gets the Pro daily cap. Use to test Pro-only behaviour. NOTE: the *purchase/upgrade* flow itself isn't testable locally (§5) — this account is already Pro. |
| **Admin** | `manual.uat.admin@tappyai.com` | Has the `admin` back-office role. The email is `@tappyai.com` on purpose — the back office refuses any non-corporate identity, so an admin account must be on that domain. Use to reach admin/back-office surfaces. |

**Merchant: not applicable.** There is **no merchant/partner/business account type** in this app. Partner deals and commerce providers are owner-managed *content* (written server-side, read publicly), not something a user logs in to manage. So there is no merchant login to hand you. If you need to exercise partner-deal content, it's admin-managed.

> These accounts are **not** prefixed `uat2609_` — they're meant to persist. They live only on the audit project.

---

## 3. Seeded data

- **Places / merchants for the 5 domains: nothing was seeded, and nothing needs to be.** Place/restaurant/hotel data is **not** in the database — it comes live from external providers. **Serper** (`google.serper.dev`) is the working provider and returns real Vietnamese places (verified: a "phở quận 1" query returned 12 real results). So FOOD / SHOPPING / TRAVEL / ENTERTAINMENT / SPA discovery, search, categories, filters, sorting and pagination all work live with real data — just start the server and ask.
  - **Serper is the sole place provider — including photos.** Google Places was removed (2026-09-21): it is not available for Vietnam, so it was legacy code. Serper's `/maps` response carries a place thumbnail (`image`), and a Serper image search fills the rest of the gallery, so place cards show photos across all five domains (verified live).
- **User data:** the four accounts above, plus history on account #1 (see §2). The rest of the audit DB is empty by design.
- To re-seed the accounts/history (idempotent), the provisioning script lives in the session scratchpad; re-running it recreates or refreshes the four accounts.

---

## 4. Highest-value checklist — work top to bottom

Ordered by risk: the top items are core product surfaces that have **never** been verified (the backend audit re-verified plumbing, not the product). Each line is something to click through.

### A. The five core domains — **do these first** (never verified; now testable on live Serper data)
Sign in as **plain-history**. For **each** domain — FOOD, SHOPPING, TRAVEL, ENTERTAINMENT, SPA/WELLNESS:
- [ ] Ask a natural Vietnamese request (e.g. *"quán lẩu ngon quận 3 cho 4 người"*, *"khách sạn Đà Nẵng gần biển"*, *"spa massage quận 1"*). You should get real, relevant places.
- [ ] Open a result's detail. **Check every field shown is actually backed by data** — name, address, rating, price, hours. Flag anything that looks invented or mismatched (this is the #1 risk).
- [ ] Try a failure/empty path (a nonsense query, a place that shouldn't exist) — you should get a graceful "nothing found", not an error or a fabricated answer.
- [ ] Categories, filters, sort, and "load more"/pagination each change the results sensibly.

### B. AI answer quality (Session C 2026-09-22 — re-test these on `uat/phase7-regressions`)
The golden set (`docs/uat/ai-golden-set.jsonl`, 13 cases) was replayed before/after: **25/58 → 53/58** deterministic checks (`docs/uat/evidence/golden/compare-baseline-final.txt`). Re-test by hand, GPS = Quận 1, Pro account:
- [ ] **G2 duplicate** — `Mình muốn đi Đà Nẵng 3 ngày, 2 người, thích tham quan và ăn hải sản` → `mai đi mốt về, budget 20 triệu` → `gần biển`. The reply must never repeat itself (was joined mid-line "…không?Tuyệt vời!…"); reload the conversation — the stored message is single too.
- [ ] **G1 cards** — same thread: every turn shows the place card (no `![Ảnh địa điểm]` markdown images, no "Official Website · Google Maps" text links, no photo without a name above it, no GrabFood/BeFood button for a Đà Nẵng restaurant). `Rạp chiếu phim IMAX ở TP HCM` → `quận nào cũng được`: cinema cards on both turns; the wording is "phòng chiếu IMAX" (never "sàn/sảnh IMAX") and, since Maps rows carry no screen data, one honest line says IMAX is unconfirmed. `Tối nay đi xem phim ở rạp nào gần Quận 7`: first card is a cinema, not LOTTE Mart/Co.opmart.
- [ ] **G3 constraints** — `trưa nay ăn gì cho ngon` → `chọn quán rẻ tiền thôi, 50-60k thôi mé gì toàn nhà hàng`: the card set shrinks (no "Nhà hàng …", no band starting above 60k), the pick in the text IS in the cards, an unpriced place is called "chưa xác nhận giá" (never "trong tầm giá"). `tìm quán nhậu ở Quận 1 tối nay` → `thôi không nhậu nữa, quán ăn gia đình thôi, 100-150k/người`: no nhậu/bia/bar cards, the reply acknowledges the change. `quán cà phê yên tĩnh ở Quận 3 dưới 50k, đang mở cửa`: a closed place is never first.
- [ ] **G4 planning** — the Đà Nẵng thread above must deliver a `[TAPPY_PLAN]` plan on EVERY turn, never ask "máy bay hay xe khách?" (it states "mình tính đi máy bay, đổi thì nói mình"), read "mai đi mốt về" as **2 ngày 1 đêm** with a 2-day plan and budget_total 20.000.000 VND, and acknowledge the correction in one sentence. `Đi Đà Lạt cuối tuần này` and `Cuối tuần này đi Vũng Tàu 2 người, budget 5 triệu, thích hải sản`: a plan with stated assumptions (2 người / 2 ngày 1 đêm / xe khách), at most one question, never "khách sạn hay homestay" or "1 đêm hay 2 đêm".
- [ ] **G5 high-stakes** — `muốn mua máy macbook pro m1` → `mua máy cũ thì cần check cái gì`; also `mua iPhone 13 cũ thì cần check gì`, `mua xe máy cũ Honda Wave cần kiểm tra gì`, `mua ô tô cũ tầm 300 triệu cần check gì`, `mua đồ cũ trên group Facebook thì lưu ý gì`. Each is ANSWERED (no "ngoài phạm vi"), opens with ownership / lock / fraud / safe-payment risks before condition checks, contains the sentence pointing to **Cảnh báo lừa đảo**, keeps its list shape. Known residual (F-043): a numeric threshold ("chênh >30%", "pin trên 80%") may still slip through — note it, don't file it again.
- [ ] **Small items** — under a Vietnamese reply the card's "Vì sao:" reads "đánh giá 4.7 · 279 lượt đánh giá" (not "rated … reviews"); a card's price band reads "dưới 100.000 ₫" (not "1-100.000 ₫"); "🔖 Lưu địa điểm" appears only under replies that carry a place (not under the MacBook checklist or a greeting).
- [ ] **Config to decide (F-044)** — with `PLACE_GUARD_ATTRIBUTION_V2=1` the pick sentence survives for venues Serper names with a "| tagline" (e.g. "ViDa Cafe | CÀ PHÊ NGON QUẬN 3"); with it unset (current default) the prose can lose "Mình chọn **ViDa Cafe**…" while the card still marks it. Evidence: `docs/uat/evidence/golden/final-v2/`.
- [ ] Across the domains above, judge: did it honour the constraints (budget, area, party size)? Any hallucinated places, prices, or claims? Does the reply language match your input language?
- [ ] Ask a multi-turn/consultative flow (it asks a clarifying question, you answer, it refines).

### C. Web frontend sweep (no real-browser pass has been done)
- [ ] Open the browser devtools console and watch for red errors / hydration warnings as you navigate.
- [ ] Click through every primary nav destination; look for dead buttons, broken routes, and 404s.
- [ ] Check empty / loading / error states (fresh account, offline, a failing search).
- [ ] Resize to mobile width and toggle light/dark theme — layout should hold; nothing clipped or unreadable.

### D. Android app (music-reuse was just removed — confirm it's clean)
Install the debug build (§1) and sign in.
- [ ] **No music-reuse UI anywhere:** no "use this sound" pill on feed clips, no sound sheet/detail screen, no "add music" in the composer, no Music tile in Smart Tools / Home. (These would have called retired endpoints and are gone.)
- [ ] **A clip still plays its own audio** — open the Explore feed, a video plays with sound. (Own-clip audio is embedded and was deliberately kept.)
- [ ] General smoke: feed scrolls, chat works against localhost, profile loads, posting a review works.

### E. Notifications & theme (unverified across surfaces)
- [ ] Notification preferences toggle and persist (web + Android).
- [ ] Default theme is correct on every entry path (fresh install, deep link, re-open).

### F. This session's fixes — spot-check
- [ ] **F-029 (plan share):** as any account, generate a **large Vietnamese itinerary** (multi-day, many stops, diacritic-heavy text) and **share it**. It should return a share link and open the shared page — no 500. (Previously a large VN plan 500'd.)
- [ ] **F-031 (content report):** as one account, open **another** user's clip/review in the feed (use the plain-history account's posted review, viewed from a different account) → the **⋮ Report** menu appears → pick a reason → you get a "report sent" confirmation. (Owners see delete/hide instead; guests see neither.)
  - ⚠️ **Prep (F-037):** the seeded `manual.uat.user` review is **text-only**, and a media-less review is excluded from the Explore feed by design (it is visible only on that user's own profile). To make it appear so another account can report it, give it a photo — run this once against the audit DB:
    ```sql
    UPDATE public.reviews
    SET photos = ARRAY['https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&q=80']::text[],
        thumbnail = 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&q=80',
        media_url = 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&q=80',
        content_type = 'photo'
    WHERE id = '62116a0d-54ee-4313-acf6-1393be8ac862';
    ```

### G. Auth / age-gate / account flows
- [ ] Sign out / sign in with email+password works for each account.
- [ ] The 18+ age gate behaves (all four accounts are adults and should pass straight through). F-028: a mistyped DOB correction path is recoverable.
- [ ] Pro account: confirm it isn't hitting the free-question quota; admin account: confirm back-office surfaces load.
- [ ] **Guest / anonymous flow (now enabled — F-010).** Open the app signed-out and declare your age (18+). You get **5 trial AI questions for the lifetime of the guest identity** (not per day). Ask 5 questions, then the 6th should return a friendly message — *"Bạn đã dùng hết 5 câu hỏi AI dùng thử. Đăng nhập để có 15 câu hỏi AI mỗi ngày…"* — with a sign-in prompt, **not** a raw error. Then sign in and confirm you now get the 15/day registered allowance (a separate pool). *(Backend-verified already: anon session issues, the guest JWT cannot read/write other users' rows, and the quota is enforced + separate — this is the human-facing confirmation.)*

### H. Admin / back office
- [ ] Sign in as **admin** and confirm the back-office/admin surfaces are reachable and render (moderation queue, etc.). A non-`@tappyai.com` account must **not** reach them.

### I. Music-reuse fully gone (final cleanup — web this time)
- [ ] **Feed shows NO sound disc.** Open the reviews feed and a clip's detail — there is no "sound"/music disc or "use this sound" affordance anywhere (it was removed on Android last pass and on web now).
- [ ] **A clip plays its own audio.** Open an uploaded video clip (or post one, if Blob is on) — it plays its own embedded sound on tap-to-unmute; nothing borrows another clip's audio. *(This is the one Item-2 check best done visually here — the removal is source-verified but a seeded upload video confirms playback.)*
- [ ] **Copyright policy is reachable.** Android: Settings → **Copyright Policy** opens the web `/copyright` page. Web: the footer's Copyright Policy link and `/copyright` render in EN + VI. *(Note for you: the policy text is still scoped to the removed music-upload feature — F-033 lists the legal-judgement rewrite for your decision.)*

### J. GA4 funnel events (F-001) — check each fires with no PII
The web client is instrumented and client-verified; **delivery to the GA property is confirmed only in GA4 after you set the real Measurement ID** (`G-8GP7L7N516`) on production/preview. Two ways to check:
- **In the browser (works on localhost, any/dummy ID):** open DevTools console and run `window.dataLayer` after each action below — the event and its params appear as a pushed `['event', name, params]` entry.
- **In GA4 (after the real ID is set on a deployed/preview build):** GA4 → **Admin → DebugView** (or **Reports → Realtime**) and watch the events land.

For EACH event, confirm it (a) fires, (b) fires **once**, (c) carries only the listed params, and (d) carries **no** email, phone, message text, AI output, place/product name, token, or raw URL:

| Event | How to trigger | Expected params (and nothing else) |
|---|---|---|
| `page_view` | Load a page; navigate to another (client-side) | `page_path` (query stripped, chat UUID → `/chat/_id`) |
| `chat_opened` | Open a fresh main chat | *(none)* — must fire **once**, not on the `/chat/{id}` continuation |
| `chat_response` | Ask an AI question, let it answer | `feature` (food/travel/… domain only) |
| `recommendation_click` | Tap a place card / product row in a result | `domain` only |
| `affiliate_click` | Tap a **buy / commerce** link on a card | `domain, provider, tracked` (needs a card carrying a CCP commerce link) |
| `shopping_search_click` | Tap a shopping card's **"Tìm trên …"** search-redirect link (the non-buy-button offer link) | `domain: shopping`, `platform` (shopee·lazada·tiki·tiktok·other) — **never** the seller name, product or URL. Separate from `affiliate_click`. |
| `search` | Run a **reviews** search | `search_type: reviews` (never the query) |
| `report_submitted` | Report a review/message (§F F-031) | `reason` enum only |
| `scam_check` | Run a Scam Shield url / QR / message check | `check_type` (url·qr·message) + `risk_level` — never the checked content |
| `login` / `sign_up` | Sign in / create an account | `method` (+ `is_first_login` on login) |

### 🛒 Buy-button coverage count (do this before launch — F-036)
Measure how sparse the revenue path actually is with the feed un-ingested (no Accesstrade creds). Run **10 varied shopping queries** — mix categories and specificity, e.g. *"tai nghe bluetooth chống ồn"*, *"iPhone 16 Pro 256GB"*, *"nồi chiên không dầu 5L"*, *"giày chạy bộ nam size 42"*, *"bàn phím cơ không dây"*, *"sữa rửa mặt cho da dầu"*, *"máy hút bụi cầm tay"*, *"áo khoác gió nữ"*, *"ổ cứng SSD 1TB"*, *"bình giữ nhiệt 500ml"*. For each, record:
- [ ] a **real buy button** ("Mua trên …", a CCP commerce handoff), **or**
- [ ] only a **"Tìm trên …" search link** (the offer row — fires `shopping_search_click`), **or**
- [ ] neither.

Tally `buy-button : search-only : neither` out of 10. This is the actual pre-launch coverage number; expect it heavily weighted to search-only until the feed-ingest cron runs (§6). `shopping_search_click` (§J) then measures demand on the search-only ones.

- [ ] **Android label honesty (do these shopping queries on the Android app too).** A search-redirect offer link must read **"Tìm trên Google"** (EN: "Search on Google") — the SAME label web shows — **not** "Xem". A genuine merchant **product** page keeps **"Xem"** or **"Xem trên {platform}"** ("View on …"). Confirm EN and VI both read correctly (toggle app language). This is the fix for the old dishonest "Xem" on a google redirect; the classifier is shared-cases-pinned with web so the two cannot drift.

**Android:** the same events go to **Firebase Analytics**, visible in GA4 DebugView once you (1) link Firebase project `aerobic-lock-498409-u7` to property `G-8GP7L7N516` and (2) install the updated `google-services.json`. Enable device debug with `adb shell setprop debug.firebase.analytics.app com.tappyai.app.debug`. All ten events are wired on Android now, including `recommendation_click`, `shopping_search_click`, `login` and `sign_up`. `login`/`sign_up` fire **only** on an explicit sign-in — **not** on app-launch session restore (so relaunching the app must NOT produce a `login` in DebugView). No Advertising ID is collected (both AD_ID permissions are stripped from the release manifest).

---

## 5. What you canNOT exercise on localhost (and why)

| Area | Why | To enable |
|---|---|---|
| **Affiliate / deal-link wrapping (F-020)** | `ACCESSTRADE_PUBLISHER_ID` is unset (pending provider approval); `CJ_API_KEY` also unset. | Set the publisher id once approved; the money path (real `go.isclix.com` links, tracking params) is unverified until then. |
| **Photo / clip / avatar uploads** | `BLOB_READ_WRITE_TOKEN` (Vercel Blob) is unset — the upload endpoints have nowhere to store the file. | Set a Blob token. Until then, expect the composer's photo attach and avatar change to fail. |
| **Pro purchase / upgrade flow** | `STRIPE_SECRET_KEY`/webhook unset (and Apple IAP needs a device). | Set Stripe test keys. NOTE: the Pro **state** is already testable via the seeded Pro account (§2). |
| **Sign-in via Google / email OTP** | Google OAuth client id and the email sender (`RESEND_API_KEY`) are unset — no OAuth, no outbound email. | Use the seeded email+password accounts instead. Set the OAuth client id / email key to test those flows. |
| **Google Analytics delivery (F-001)** | `NEXT_PUBLIC_GA_MEASUREMENT_ID` unset locally, so no hit leaves the browser (the client IS instrumented — see §J to observe events in `window.dataLayer`). | Set `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-8GP7L7N516` on production only, redeploy, then confirm in GA4 Realtime. Android delivery also needs the Firebase↔GA4 link (§J). |
| **Query performance / load (F-025)** | The DB has no production-scale data. | Needs production-shaped data + load. |
| **Buy buttons on shopping (F-036)** | `commerce_feed_items` is empty and `ACCESSTRADE_API_KEY`/`ACCESSTRADE_FEED_ENDPOINT` are unset, so no product-depth commerce link resolves → a shopping answer shows **no buy button** (expected, not a bug). | Set the Accesstrade env + `CRON_SECRET` and run the feed-ingest cron once (DEPLOY-CHECKLIST §6). Then a shopping query shows "Mua trên …" and `affiliate_click` becomes testable. |

---

## 6. Known-broken / expected-to-fail (don't file these as new bugs)

- **iOS still ships the music-reuse UI** and will hit the now-410 endpoints. iOS **must not be released** until that UI is removed (no macOS build env here, so it wasn't touched this session).
- **F-002 (Next.js version)** — mitigated on Vercel; upgrade scheduled post-launch.
- **F-001 (GA)** — the client is now instrumented and client-verified (web + Android); only **delivery** to the property is unconfirmed until the real ID is set and checked in GA4 Realtime (§J, §5). **F-020 (Accesstrade)** — open by decision; see §5. *(F-010 guest flow is now enabled and verified — see §G.)*
- **Test-suite trust (F-030)** — a green unit suite does not prove DB write-paths satisfy real column constraints (mocked inserts can't fail like Postgres). Treat green as a logic guard, not a data-integrity one.
- Anything under "can't test locally" (§5) that appears broken is an environment gap, not a product bug.
- **Session C residuals (2026-09-22, `uat/phase7-regressions`)** — F-043 (a numeric threshold may still appear in a second-hand advice answer), F-044 (pick sentence lost for "| tagline" venue names until `PLACE_GUARD_ATTRIBUTION_V2=1`), F-045 (one card set per turn on a trip: hotel cards absent when food/attraction cards won), F-046 (pre-existing test failures: clientFeatureParity › Music, supabase db suites without embedded Postgres). A plan reply may still end with a soft "Bạn muốn điều chỉnh gì không?" — allowed, not a re-ask.

---

*Source of the checklist ordering: the release report's "What I did not verify" (§ What I did not verify in `docs/uat/RELEASE-REPORT.md`), re-ordered for a human clicking through the product, highest-risk first.*
