# UAT4 findings — 2026-09-27

**Environment.**

| | |
|---|---|
| Branch | `rc/web-uat` from `befa5a7` |
| Server | :3007 (next dev), audit Supabase `zdaprdfgpbpnxyofagmc` |
| Web client | headless Chrome over CDP (harness in the session scratchpad) |
| Android client | emulator `Pixel_8_uat` (`ANDROID_SERIAL=emulator-5554`), debug build → :3007 |
| Evidence | `docs/uat/evidence/uat4-2026-09-27/` |

**Accounts.** Eight throwaway accounts were created on audit and deleted at the end:
- `golden`, `web`, `android` and `member` were Pro, so the long runs were not capped at 15 questions a day;
- `free`, `delweb` and `delandroid`;
- `nodob`.

## Results by item

| item | web | Android | result | evidence |
|---|---|---|---|---|
| B1 five verticals, 12 queries per platform | 12/12 × 200. Prose sits above the carousel (3 cards). Shopping shows product rows. No inline images, no "ShopeeFood · GrabFood" line. | 12/12 sent, no error bubble, prose above the carousel | ⚠️ layout OK. No booking/order CTA on cards (U4-P1-2); one duplicated reply (U4-P1-1) | `B1-web.json`, `B1-web-*.png`, `B1-android-v-*` |
| B1 queries with diacritics | ✓ (web queries mix accented and unaccented) | unaccented only. The emulator has no ADBKeyboard, and Telex mangles `input text`. | Android accented typing not tested | — |
| B2 entertainment | cinema / karaoke / water park / aquarium: cards OK. Showtimes are honestly "chưa có"; no invented tickets. | same | ⚠️ Đầm Sen is called "thủy cung" (U4-P2-16) | `B1-web-ent*.png` |
| B3 buy/book links | picked product → Shopee/Lazada/CellphoneS product page; flights → Trip.com/Traveloka; hotels: none | — | ⚠️ U4-P1-2/P1-3 | this report |
| B4 long thread | **413 from turn 12 before the fix** → fixed: 22/22 × 200; reload / Back / Forward keep 22 messages; no blank screen | 25/25 × 200, no topic mixing, no 413 | ✅ after the P0 fix | `B4-web.json`, `after-413-fix/`, `B4-android-thread.json` |
| B5 trip plan | tips shown on the card (2 tool tips). Share → `/plan/<id>` opens signed out. The brochure has no tips. The plan list still shows the blue glyph. | tips exist in the plan JSON (Vũng Tàu); the rendered tips were not captured. A second plan request in the long thread produced no plan. | ⚠️ U4-P2-13/14, U4-P1-6 | `B5-web*.png`, `B5-web.json` |
| B6 golden + consultative-40 | see the sections below | — | ⚠️ | `golden-grading.md`, `c40-grading.md` |
| B7 location permission | — | 1 prompt on the first place turn; after "Không cho phép" the message is still sent; 0 prompts on later turns; the 📍 chip asks again | ✅ | `B7-android-*` |
| C1 guest | 18+ gate (403 + "xác nhận bạn đủ 18 tuổi"); after declaring, 5 × 200, the 6th is 401 "Đăng nhập để có 15 câu…" | same flow inline: 403 → age → 5 answers → "Bạn đã dùng hết 5 câu hỏi AI dùng thử" | ✅ | `C1-web-guest*.png/json`, `C1-android-guest-*` |
| C2 registration email | Supabase rejects `example.test`; the error is raw English | — | ❌ not verifiable (owner) | `C2-web-register-result.png` |
| C3 Free quota | `/subscription` "còn 14 / 15" after 1 question; API `remaining` 15 → 14 | — | ✅ | `C3-web-quota-*.png` |
| C4 delete account | XÓA: wrong word keeps the button disabled; auth 0, profile 0, 1 file-cleanup job queued, old token 401 | English + dark: DELET keeps it disabled, DELETE enables it; auth 0, profile 0, push row 1 → 0, job 1, old token 401 | ✅ | `C4-web-*`, `C4-android-*` |
| C5 Android push | — | guest: 0 subscribe calls; signed in: 200 + `provider=fcm, enabled=true` (plus one duplicate 500, U4-P2-3) | ✅ (⚠️ duplicate) | `C5-logcat-*` |
| D1 profile / share / QR | name and bio saved; share sheet matches the design; downloaded card and on-screen QR decode to the right user | name and bio saved (DB); the QR decodes to the right user at 1080 / 540 / 413 / 300 px; share opens the OS chooser; the old name stays on screen | ✅ web / ⚠️ Android (U4-P2-8/9) | `D1-*` |
| D2 groups | create; member joins via link; owner sees member; member avatar API 403; no rename | joins the web group via deep link ("2 thành viên") | ⚠️ no rename (U4-P2-12) | `D2-*` |
| D3 explore / review | feed 12 items, 0 broken images, no crash; like 200, comment 200 (stored), unlike 200 | Explore tab loads | ✅ | `D3-*` |
| D4 messenger | a direct thread needs mutual follow (by design: 400 before, 200 after); text + post link delivered to the receiver | — | ✅ web; Android not driven | `D4-web.json` |
| D5 Home | 4 sections, no category row, no Feedback, no gap, no overflow (VI/EN × light/dark × desktop/phone) | no Music / category row | ✅ (U4-P2-4 label) | `D5-*` |
| D6 deals / scam / music | deals load; Scam Shield has URL / QR / message tabs (no phone lookup); `/music` and `/marketplace` are 404; 0 music links | Deals empty; no music on Home | ✅ | `D6-*` |
| E console / logcat | hydration errors on `/chat`; guest `/api/conversations` 401 | no crash, no ANR; app HTTP errors explained (subscribe 500, guest 401, recommendations 403 = 18+ gate) | ⚠️ P2 | `E-android-logcat-final.txt` |
| E theme | **chat unreadable under a light theme** → fixed | Settings EN + dark OK | ✅ after the P0 fix | `after-theme-fix/` |

## Golden set (24 cases, 51 turns) — `golden-grading.md`

- Hand-graded: **8 PASS / 15 PARTIAL / 1 FAIL**. The previous runs, graded the same way, were 8 / 10 / 6.
- The repo scorer (`goldenCompare.mjs post-f094d uat4-golden`) gives **52/58 → 52/58**.
- **Regressions:** G3a (PARTIAL → FAIL, the guard deleted the picked café) and B3 (PASS → PARTIAL).
- **Improved:** G3b, G5a–G5d, M1 and M4.
- 0 non-200 responses; mean 19.9 s per turn.
- Caveat: one account ran every case, so memory bled between cases (Defects 2).

## Consultative-40 (48 turns) — `c40-grading.md`

- **22/40 (4 ✅ / 18 ⚠️ / 18 ❌)** against the 2026-09-19 FINAL gate's **38/40**.
- Clarify follow-ups: 6/8 (T5b and E2b fail).
- ❌ Comparability is **not clean**:
  - different grader;
  - memory was cleared only before the run and accumulated during it (43 memory calls);
  - the code has changed a lot since 19/09;
  - `.env.local` variable NAMES match the baseline env; the values were not read, per the rules.
- The grader's leading hypothesis is that the server-side clarify step is not firing: every clarifying question was model-written and billed, with no chips. Actionable queries got questions, and vague ones searched.
- **Treat as P1 (U4-P1-7) to investigate before release** by re-running both envs on one commit with per-turn memory reset.

## Cost / latency (server-side, `AUDIT_USAGE_LOG_FILE`, `costseg.mjs`)

| run | turns | $/turn | LLM | Serper | memory | cache hit | avg ms | p50 | p90 |
|---|---|---|---|---|---|---|---|---|---|
| baseline final40 (2026-09-18) | 40 | **$0.0287** | $0.0227 | $0.0058 | $0.0002 | 73% | — | — | — |
| UAT4 original 40 | 40 | **$0.0279** (−2.8%) | — | — | — | — | 13,352 | 14,255 | 22,243 |
| UAT4 all 48 | 48 | $0.0282 | $0.0217 | $0.0052 | $0.0013 | 72% | 13,361 | 14,359 | 19,957 |
| UAT4 first 20 (food + shopping) | 20 | $0.0322 | | | | | 12,655 | | |

Memory extraction now costs $0.0013 per turn, against $0.0002 at the baseline, because it ran on 43 of 48 turns; the baseline ran it on 6. Evidence: `c40-usage.jsonl`, `c40-cost-summary.txt`.

## P0 — fixed in this round (one commit each, with a test)

| id | finding | fix | proof |
|---|---|---|---|
| U4-P0-1 | **Long web threads return 413 from turn 12 on.** Every later turn fails, so the conversation is dead. `useChat` keeps `parts` (the raw reply a second time) and each tool invocation's full result rows on every message. Compaction only rewrote `content`, so the body passed the 256 KB raw-text ceiling before the server could compact it. | `8c24481`: the web client strips `parts`, `toolInvocations` and `annotations` before sending. The server already dropped these by construction. | Before: `B4-web.json`, turns 12–22 = 413. After: `after-413-fix/B4-web.json`, 22/22 = 200; reload keeps 22 messages; Back/Forward are not blank. The regression test fails on the old code. |
| U4-P0-2 | **Chat is unreadable under a light app theme.** Product names and prices are white on white. Chat, a conversation, the plan brochure, Explore and a public profile pin `class="v3-theme dark"` on one element. The dark token block was `.dark .v3-theme`, which needs an ancestor, so these surfaces kept the light ground while the Tailwind `dark:` text inside them turned light. | `8003408`: the dark token block also matches `.v3-theme.dark`. | Before: `E-web-chat-prose-oslight.png`. After: `after-theme-fix/E-web-chat-prose-oslight.png` and `after-theme-fix/pinned-users.png`. The CSS test fails on the old code. |

## P1 — not fixed (report only)

| id | finding | repro | evidence | suggestion |
|---|---|---|---|---|
| U4-P1-1 | **The duplicated reply is still there.** Web, "thuy cung sai gon": step 1 asks 3 questions, step 2 repeats a shorter version of them, step 3 answers. The shorter copy scores below the 0.8 similarity threshold, so `stepRepeatGuard` misses it. On Android (long thread, turn 7) a fragment is repeated: "(1 giờ sáng) nhé! 🌙" appears twice. | a fresh chat, "thuy cung sai gon" | `B1-web.json` (ent4), `B4-android-thread.json` (row 7) | Compare the next step against the previous step's prose by containment, not only symmetric Dice; also collapse repeated sentences. |
| U4-P1-2 | **No booking or order CTA on place cards.** Food cards have no delivery-order button, and hotel cards have no Booking/Agoda link: "Xem bản đồ" is the primary CTA. Flights do get Trip.com/Traveloka links. | B1 food1/food2, travel1 | `B1-web.json` (`cardLinks`), `B1-web-*.png` | Put the partner handoff (order / book) first on food and stay cards when a partner is known. |
| U4-P1-3 | **Shopping links are plain, not affiliate.** The picked product links straight to Shopee/Lazada/CellphoneS product pages, which is good, but no affiliate parameter is added. Every other product row only offers "Tìm trên Google". The label "· cần đăng nhập" shows even to a signed-in user. | "mua nồi chiên không dầu 5 lít" | `s-links` output in this report (the Shopee/Lazada URLs) | Route the handoffs through the affiliate redirect once the program is live; fix the label. |
| U4-P1-4 | **The golden guard deletes whole sentences and leaves fragments.** G3a is a FAIL: the name of the picked café is deleted. Also seen in B3 t2, T4 t1, M1 t10, B4 t2, D2 and T1 t1. | golden `uat4-golden` | `golden-grading.md` (Defects 1) | Redact the claim inside the sentence rather than the sentence. |
| U4-P1-5 | **Invented prices inside plan item descriptions.** The `price` field says "chưa có giá", but the description says "Giá vé: 250.000" (T1, L1, M1 t8, G4a). `guardPlanPrices` does not read descriptions. | golden T1 | `golden-grading.md` (Defects 4) | Run the plan price guard on `description` too. |
| U4-P1-6 | **Android: a trip-plan request inside a long thread produced no plan.** At turn 26 the reply narrated its searches ("Mình đang tìm lại…") and ended with advice, with no `[TAPPY_PLAN]`. The narration of internal steps leaks on web too. | Android long thread, then "len ke hoach di da lat 2 ngay 1 dem cho 2 nguoi budget 5 trieu" | `B5-android-plan-top.png`, DB check in this session | Investigate planning-mode inheritance in long threads; drop step narration from the visible reply. |

| U4-P1-7 | **Consultative quality: 22/40, against 38/40 on 2026-09-19** (see the caveats above). Candidate causes: the server clarify step is not firing; evidence guards leave fragments or let invented facts through (F4 parking, F5 price, P8 "mở khuya"); a hotel answer gets a showtime disclaimer (T2, T8). | `eval40.mjs all --loc` on :3007 | `c40-grading.md`, `c40/` | Re-run baseline vs current on one env with memory reset per turn; bisect if confirmed. |

## P2 — not fixed

| id | finding | evidence |
|---|---|---|
| U4-P2-1 | Hydration errors on every `/chat` load (12 per page). The location chip in the composer is rendered only on the client, from `userLocation`. | `B1-web.json` errors, `ChatInterface.tsx` ~1803 |
| U4-P2-2 | A web guest calls `POST /api/conversations` on every turn and gets 401 each time; Android does the same (5× 401). | `C1-web-guest.json`, `C5-logcat-guest.txt` |
| U4-P2-3 | Android registers push twice at sign-in. One call returns 200 and the other 500 (Postgres 21000 in the upsert). The row ends up correct. | `C5-logcat-after-login.txt`, `E-android-logcat-final.txt` (3× 500) |
| U4-P2-4 | Home "Hỏi Tappy thử": the spa-image card is labelled GIẢI TRÍ, next to another GIẢI TRÍ card. | `D5-home-web-desktop-light-vi.png` |
| U4-P2-5 | Android sign-in sheet: the title "Đăng nhập TappyAI" is dark text on the dark sheet. | `C1-android-guest-start.png` |
| U4-P2-6 | Android greeting "Hi UAT4 android! 👋" is in English while the UI is Vietnamese. | `A-android-after-login.png` |
| U4-P2-7 | Android group join form: the budget chips "Under 100k" / "Over 200k" are English in the Vietnamese UI. | `D2-android-group-join.png` |
| U4-P2-8 | Android: after editing the profile, the QR sheet and the Me/Settings screens still show the old name. The DB is updated. | `D1-android-qr.png`, `D2-android-group-new.png` |
| U4-P2-9 | Android profile share opens the OS chooser. The approved "Chia sẻ với mọi người" sheet exists on web only. | `D1-android-share.png` |
| U4-P2-10 | Register: Supabase's raw English error ("Email address … is invalid") shows on the Vietnamese page. | `C2-web-register-result.png` |
| U4-P2-11 | The Pro plan card says "Tin nhắn không giới hạn", but the server caps Pro at 300 turns a day (`PRO_DAILY_CHAT_CAP`). | `C3-web-quota-after.png` |
| U4-P2-12 | Groups: no rename after creation (no API), and no picture UI. The avatar API exists and refuses non-creators (403, measured). | `D2-web.json` |
| U4-P2-13 | Plan list ("Kế hoạch của bạn") still shows the blue glyph box. This is awaiting the owner's pick; option A was proposed in UAT3. | `B5-web-planner-list.png` |
| U4-P2-14 | The shared brochure `/plan/<id>` does not show `local_tips`. The web card does. | `B5-web-plan-brochure-signed-out.png` |
| U4-P2-15 | `local_tips` gaps: general tips name landmarks ("Tháp Tam Thắng", "Cầu Vàng", "Quảng trường Lâm Viên"), because the guard only catches venue nouns. Tool tips make unverified claims ("cá tươi từ hồ Tuyền Lâm"). | `B5-web.json`, DB plan on the android account, `golden-grading.md` |
| U4-P2-16 | AI picks the wrong kind of place: Đầm Sen water park is called "thủy cung lớn nhất" (web + Android); Crescent Mall is called a cinema (golden G1b); a speaker-rental shop is listed as karaoke (M1 t8); "không dây" returns a wired headset (Android t8); an 8-review place is "ngon nhất Quận 1" (Android food1). | `B4-android-thread.json`, `golden-grading.md` |
| U4-P2-17 | Memory bleeds into later answers: "theo memory bạn hay đi cùng 10 người", "bạn thích hải sản" (from onboarding). | `B1-web.json` ent4, `after-413-fix/B4-web.json` t1 |
| U4-P2-18 | Plan stops are scheduled while the place is closed (G1a, G4a, L1). | `golden-grading.md` |
| U4-P2-19 | The web "Tappy muốn hiểu bạn hơn" quiz pops up again on every new browser session and when opening a conversation. | `E-web-chat-contrast-light.png` |
| U4-P2-20 | Android Deals is empty ("Hiện chưa có ưu đãi nào"). | `D6-android-deals.png` |

## Owner checklist (cannot be verified from the PC)

- [ ] **Google OAuth** on web and Android: sign in, reload, still signed in.
- [ ] **Zalo**: scan the QR with a real phone and land signed in.
- [ ] **QR with a phone camera**:
  - scan `/profile/qr` on screen and a printed copy of the downloaded card;
  - both must open your own profile.
  - OpenCV already decodes both here, and the encoder bug was fixed in UAT3.
- [ ] **Real push** after the deploy to uat.tappyai.com:
  - sign in on Android and trigger a notification;
  - it should arrive with the Tappy chime.
- [ ] **Uploads** (avatar, cover, group picture) on Vercel. They need the OIDC token, which is not available on local.
- [ ] **Registration email**: register with a real inbox you own and check the Brevo confirmation arrives. Also check its sender name and language.
