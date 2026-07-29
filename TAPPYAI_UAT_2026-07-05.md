# TappyAI — User Acceptance Testing (Real User Session)

Date: 2026-07-05 · Tester: automated, driving the owner's real Chrome (Claude-in-Chrome) as the logged-in user **PHẠM ĐOÀN HUY** (huypham.sm@gmail.com). **Target: production `www.tappyai.com`** (Google OAuth redirected to the prod domain, not the local dev port — so this UAT reflects the *deployed* build that real users actually hit, which is the correct target for a go-live UAT). Some pending remediation fixes are **not yet deployed**; cross-referenced where relevant.

**Scope honesty:** browser automation was intermittently flaky (repeated screenshot/CDP timeouts) and each AI turn takes ~30s, so I tested a **strong representative subset thoroughly** rather than all 30 features exhaustively. Tested vs not-tested is stated explicitly. No other users' data was modified; I declined actions that would notify real users.

---

## 1. Features Tested

| Feature | Result | Notes |
|---|---|---|
| Home (first-time visitor) | **PASS** | Clean hero, category chips, Bói cards, Scan, Tappy Together, bottom nav |
| Home (returning/logged-in) | **PASS** | Personalized greeting "Xin chào, HUY", dark theme honored |
| Anonymous chat attempt | **WARN** | Finding #1 — generic error, not a login prompt |
| Authentication — Google login | **PASS** | Seamless via existing session, no consent friction, fast |
| AI Chat — Food domain | **PASS (strong)** | High-quality result; 3 presentation bugs (#2–#4) |
| Explore / Reviews feed (read) | **PASS** | TikTok-style feed renders; heavy (see #5) |
| Profile hub | **PASS** | 285 conversations, full settings menu, email via session |
| Chat History | **WARN** | Renders, but hung on interaction (#5) |
| Memory (indicator) | **PARTIAL** | "Tappy đang dùng trí nhớ của bạn để trả lời" shown in chat; management page not opened |
| Fortune — Tarot | **PASS** | Instant draw, good content, responsible disclaimer |

## 2. Features Passed
Home (both states), Google login, AI Chat/Food (functionality + quality), Explore feed rendering, Profile hub, Fortune/Tarot.

## 3. Features Failed
None hard-failed. Two **WARN**: anonymous-chat error UX (#1), Chat History interaction hang (#5).

## 4. Features NOT Tested (require more time / staging / mobile / would notify real users)
Logout, Email-OTP login, Zalo login, session-restore/expiration; AI Chat **Travel/Shopping/Spa/Entertainment/General**; Reviews **create/edit/delete/like/save/comment/report** (declined — would post public content / notify real creators); Favorites, Saved Places, Price Tracker (create/edit/delete), Search, Maps, Recommendations, Notifications, Games (all 7), Weather, Gold Price, Bill Split, Affiliate destinations (parameter-level), Upload/Video, Settings, Onboarding; **mobile/tablet responsiveness**, accessibility, offline/slow-network. These need a staging DB (to write freely) and mobile viewports for a complete sign-off.

---

## 5. Bugs & UX Issues Found

### Finding #1 — Anonymous chat shows a generic error, not a login prompt · **UX · Medium**
- **Repro:** Logged out → type a question in the home chat box → submit.
- **Expected:** A clear "đăng nhập để chat" prompt or redirect to `/login`.
- **Actual:** Navigates to `/chat`, shows *"Mình gặp trục trặc khi trả lời — tin nhắn của bạn vẫn được giữ nguyên. Bạn thử lại nhé?"* with a **"Thử lại"** button that can never succeed (server returns 401 `auth_required`).
- **Impact:** New visitors who try the headline feature hit a dead-end confusing error. **Frequency:** every anon chat attempt. **Priority:** High-ish (it's on the first-impression path). *Note: the anon-block itself is correct/intended (pending remediation); only the client 401 handling needs a login redirect.*

### Finding #2 — Raw `[FOLLOWUPS]` marker leaks into the AI message · **Bug · Medium-High**
- **Repro:** Ask any food question; scroll the response.
- **Actual:** The literal text **`[FOLLOWUPS]Gọ…`** appears in the rendered message (the follow-up-suggestions markup isn't parsed/stripped).
- **Impact:** Looks broken/unpolished on the product's core output. **Frequency:** appeared on the food response; likely whenever the model emits a FOLLOWUPS block. **Priority:** High (visible on the happy path).

### Finding #3 — Redundant trailing "Hình ảnh & link review" section · **Bug/UX · Medium**
- **Actual:** After a rich main list (numbered places with photos, Google ratings, addresses, ShopeeFood/GrabFood + "Xem review TikTok"), the message repeats the same places in a second "📁 Hình ảnh & link review" block — this time **BeFood-only links and no images**.
- **Impact:** Cluttered, duplicative, and the second block looks empty/broken next to the rich first one. **Priority:** Medium.

### Finding #4 — Markdown italics render literally · **Polish · Low**
- **Actual:** `_Hình ảnh & link review:_` shows literal underscores instead of italic text. **Priority:** Low.

### Finding #5 — Chat History (and heavy feed) unresponsiveness · **Stability/Perf · Medium**
- **Repro:** Open `/profile/history` (285 conversations) and interact (click delete).
- **Actual:** The page never reached idle (90s+); the tab had to be recovered by navigating away. The Reviews feed also loaded slowly with one transient freeze.
- **Caveat (important, honest):** the *lightweight* Tarot page also timed out a screenshot yet its action completed instantly — so a substantial part of the "freezes" is **CDP/browser-automation flakiness, not the app**. The genuine app signal is: **History renders all 285 conversations with no pagination** (heavy) and hung on interaction; the feed is heavy (no virtualization — matches the code audit). **Priority:** Medium — add pagination/virtualization to History and the feed.

---

## 6. Screens Requiring Improvement
1. **Chat message rendering** — strip `[FOLLOWUPS]` markers; drop or merge the redundant "Hình ảnh & link review" block; render markdown italics.
2. **Anonymous `/chat`** — redirect to login (or show a login CTA) instead of a generic retry error.
3. **`/profile/history`** — paginate/virtualize (285 items rendered at once).

## 7. Edge Cases Observed
- Anon chat → 401 handled gracefully server-side (message preserved) but mis-messaged client-side (#1).
- Rapid submit right after a page reload dropped the first keystrokes (had to re-focus the input) — minor input-focus race on the home chat box.

## 8. Regression Issues
None observed relative to prior behavior. Email display on Profile works via the session fallback (consistent with the verified prod state where `profiles.email` no longer exists).

## 9. Performance Observations
- Google login → home: fast.
- Food AI turn (with place search + image enrichment): ~25–35s to fully settle — acceptable but on the slow side; a visible streaming answer appears within ~5s.
- Reviews feed + History: heavy; History unresponsive at 285 items.

## 10. Cleanup Confirmation
- **Test data created:** 1 chat conversation ("Gợi ý 3 quán bún bò Huế ngon ở quận 3", id `55b88f78…`) on the owner's real account.
- **Cleanup status:** deletion was attempted via `/profile/history` but that page hung; **deletion is unconfirmed** — the owner should verify/remove that one conversation from Chat History. No other test data (no reviews, favorites, uploads, price-watches, or notifications) was created. No other users' data was touched.

## 11. Remaining Risks
- Large untested surface (see §4) — verdict is provisional on the tested subset.
- Testing ran against **production with the real account**; a **staging environment** is needed to safely exercise write flows (reviews CRUD, favorites, price-watch, uploads) and to test without real-user side effects.
- Mobile/tablet responsiveness and accessibility were not exercised.

---

## Final Product Score (tested subset)

| Dimension | Score (1–10) | Why |
|---|---|---|
| User Experience | 7 | Polished core; the `[FOLLOWUPS]` leak + anon-chat error dent the first impression |
| Stability | 6 | History page hung; feed heavy (some of it is automation flakiness) |
| Performance | 6 | Heavy feed/history; AI turn 25–35s |
| AI Quality | 8 | Strong, grounded food result (real ratings/photos/addresses/ordering+TikTok); memory-aware |
| Ease of Use | 8 | Clear nav, seamless login, obvious CTAs |
| Discoverability | 8 | Categories, Bói, Scan, Together all surfaced on home |
| Reliability | 6 | History hang + unconfirmed cleanup |
| Mobile Readiness | N/A | Not tested this session |
| Overall Product Quality | **7** | A capable, polished product with a few user-visible polish/stability issues |

---

## Final Verdict

### READY WITH MINOR IMPROVEMENTS

**Basis (tested features only, per instructions):** the core journeys I actually exercised — first-visit home, Google login, AI Chat (Food), Explore feed, Profile, Fortune — **work and feel polished**, and the AI food result is genuinely strong (grounded, image-rich, memory-aware). The issues found are **minor and mostly presentation/stability**, not data-loss or security: the `[FOLLOWUPS]` marker leak (#2) and the anonymous-chat error UX (#1) are the two worth fixing before a wide launch because they sit on first-impression paths; the History page needs pagination (#5).

**Important qualifier:** this is **not** a full sign-off — a large surface (most AI domains, reviews CRUD, favorites, maps, games, search, price tracker, notifications, upload, settings, and all mobile/responsiveness) was **not tested** this session and should be covered on a **staging environment** (to write freely without touching production/real users) and on **mobile viewports** before declaring READY FOR PUBLIC USERS outright. On the evidence gathered, the product is close — minor improvements, not major engineering, stand between it and a public launch of the tested surface.
