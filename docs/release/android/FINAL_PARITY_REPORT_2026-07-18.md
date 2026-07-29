# FINAL PARITY REPORT — Android vs Web (post-implementation audit)

**Date:** 2026-07-18 · Web (`src/`) = source of truth.
**Method:** Six parallel read-only bug-audit agents across the full surface; every finding re-verified by hand against the exact Web `file:line` before classification. Category (1) = Android bug (implemented but wrong behavior). **Only category (1) was implemented**; (2)–(5) are reported, not changed. Owner-approved hidden (App Connections, Membership) excluded.

**Build/verify:** `assembleDebug testDebugUnitTest` → BUILD SUCCESSFUL, tests green; emulator launch clean (0 crashes); `TEMP_VERIFY_HACK` → 0.

---

## Category 1 — Android bugs — ALL FIXED this audit (16)

### Composer / Reviews (post-blocking — in the just-shipped composer)
| # | Bug | Web ref | Fix |
|---|-----|---------|-----|
| 1 | **Placeless post sent empty `placeName` → 400 on every post without a place.** | `reviews/new/page.tsx:528` `placeName.trim() || 'Chia sẻ'` | `ReviewComposerViewModel.submit` now falls back to the `"Chia sẻ"` sentinel (recognised by `isShareOnlyName`). |
| 2 | **Attached-sound post dropped `version` (encodeDefaults off) → backend rejects `music.version !== 1` (400).** | `page.tsx:535` sends `{version,trackId,startSec,volume}` | `MusicSelectionDto` fields annotated `@EncodeDefault(ALWAYS)`. |
| 3 | **Video review used a place-scoped `slugify` placeId → 2nd video at same place = 409 duplicate.** | `page.tsx:522-524` video → `video_${Date.now()}` | Video placeId now `video_<ts>`. |
| 4 | **Video-tab `canPost` allowed a body-only post with no finished upload.** | `page.tsx:510` video `canPost = uploadStep === 'done'` | Video `canPost` now `videoState.isReady` only. |
| 5 | **Comment-count header showed loaded rows (≤50), not the authoritative total.** | `page.tsx:171` renders API `count` | `reviewCommentItems` takes `totalCount = review.commentCount`. |
| 6 | **Author handle inserted dots (`@the.coffee.house`) vs Web's stripped whitespace (`@thecoffeehouse`).** | `page.tsx:256` `replace(/\s+/g,'')` | `ReviewCard` strips all whitespace, no separator. |

### Chat
| # | Bug | Web ref | Fix |
|---|-----|---------|-----|
| 7 | **Copy/Share kept bare URLs + mangled code/quotes/bullets** — not equivalent to Web. | `MessageActionBar.tsx:38-46` `stripMd` (strips bold/italic/heading/link/**bare URL**, trim) | `MessageActionBar.stripMarkdown` now mirrors `stripMd` exactly. |
| 8 | **Resume from a conversation outside the 20-most-recent left `conversationId` set → next send PUT-overwrote it with empty history (data loss).** | `/chat/[id]` loads by id | Empty-result resume now clears `conversationId` (same guard the Error branch already had). |

### Discovery / Price-Tracking / Deals
| # | Bug | Web ref | Fix |
|---|-----|---------|-----|
| 9 | **VND compact formatting** — "k" branch truncated (`249,500`→"249k") and "triệu" branch tied-to-even, both diverging from Web `toFixed` half-up. | `price-watches/page.tsx:18-21` | `MoneyFormatter.formatCompactVnd` now half-up on both branches (`250k`, `1.3 triệu`). |
| 10 | **Price-watch dates** showed English "18 Jul" (dropped year+time). | `price-watches/page.tsx:23-27` vi-VN `dd/MM/yyyy HH:mm` | `formatWatchDate` → `dd/MM/yyyy HH:mm`. |
| 11 | **Deals badge always red** — `MỚI` should be blue. | `DealsView.tsx:24-27` `HOT`=red, `MỚI`=blue | Badge color branches on `deal.badge`. |
| 12 | **Active watch dropped the "will check soon" line when never checked.** | `price-watches/page.tsx:135-139` | Always renders the line; placeholder when `lastChecked == null`. |

### Profile / Memory / Group / Home / Auth
| # | Bug | Web ref | Fix |
|---|-----|---------|-----|
| 13 | **Group-detail creator briefly saw the non-creator join form** (auth loaded in a separate coroutine). | `group/[id]/page.tsx:135` gate on `!authChecked` | Added `authChecked`; Success content gated until the auth read resolves. |
| 14 | **Memory screen showed the ResponseStyleCard during the initial load** (Web shows only the spinner). | `tappy-knows/page.tsx:241-246` | Card + content/empty now gated behind `!isLoading`. |
| 15 | **Home greeting used 4 hour-buckets (added a "night" state)** — disagreed with Web at 00–04, 17:00, 22–23. | `components/Header.tsx:30` (3 buckets: `<12`/`<18`/else) | `greetingForHour` now exactly Web's 3 buckets. |
| 16 | **Email-OTP omitted `createUser` → supabase-kt default (false) would silently block new-user email signup.** | `login/page.tsx:188-191` `shouldCreateUser: true` | `sendEmailOtp` now sets `createUser = true`. |

**Owner UAT:** items 1–5, 13 need a signed-in session (composer post / comment count / group detail) to see on-screen; 16 needs a real never-seen email. All are compile+test-verified and source-matched.

---

## Category 2 — Missing parity features (NOT implemented; reported)
- **Reviews:** URL-video inline playback (YouTube iframe / TikTok-Facebook external link) — Android shows a dead poster (`VideoPlayer.tsx:186-235`); music disc shown for fewer clips than Web (`page.tsx:429`); "For You" lacks the hashtag re-rank + city boost (`page.tsx:1211,1223`); anon like/save/comment/follow use a backend 401 rather than a pre-emptive login redirect (contingent on guest access).
- **Chat:** `userLocation` never sent (no location bias / Nearby); action-chips row; dynamic time-based general prompts + `/api/suggested-prompts`; first-run preferences modal; memory indicator chip; emoji picker.
- **Tools:** Split-Bill screen absent; Tarot 22 vs 78 cards; Tu-Vi lifetime/by-year/monthly engines; date-seeded fortune variation + lucky number/color; Sound-detail "videos using this sound" grid + CC-BY attribution + report-length cap.
- **Deals/Home:** daily-push opt-in button + footer hint + date header (Deals); dynamic hero headline + hero search bar (Home).

## Category 3 — Backend missing (NOT implementable on Android alone; reported)
- **Preferences gender** — a rendered/selectable control silently dropped on save; Web persists via `supabase.auth.updateUser` (direct SDK), which native can't call, and neither `/api/profile` nor `/api/preferences` accepts a `gender` field. Needs a backend field.
- **Chat history 50 vs 20** — Web reads Supabase directly with `.limit(50)`; `/api/conversations` is hard-capped at 20 (also the root cause behind bug #8; a GET-by-id or higher limit would fully resolve it).
- **Chat `/api/track` analytics** not sent from Android; **bookings** capped at 20; **profile conversation-count pill**; **Zalo login** (mobile token contract) — all backend-constrained.

## Category 4 — Product decisions (reported)
- Deals-vs-Maps 4th nav tab swap; anonymous/guest home (deferred); email+password `/register` (OTP-only); header inline theme toggle (Android: Settings only); bookings date format (`dd/MM/yyyy` vs `d MMM uuuu`); group budget chip labels (VI vs EN free-text); chat streaming reveal (skeleton-then-full vs smooth typewriter); voice-input UX (system recognizer vs live transcript); Sound Save/Follow/Report 401→login redirect (moot until guest access exists — Android currently has no anon sessions, so a 401 = genuine session expiry, correctly messaged).
- Deals title copy/emoji; deals card category-color chip.

## Category 5 — Infrastructure (reported)
- Native push (FCM) — the Notifications toggle + Deals daily push are cosmetic without an FCM device-token path.
- Share canonical review/sound URLs (no production deep-link domain configured).

---

## Verified clean (faithful parity — no diff)
Chat: messageIndex mapping, vision image shape, scan resize params, stream part-type parsing, message-feedback contract, error-code→message mapping. Reviews: video-upload Blob handshake, My Reviews, feed-tab sort/following, follow contract. Tools: Currency, Translate, VietWriter, Games (SuperTux), Music library, Tu-Vi Can (fixed earlier), Tarot odds (fixed earlier), zodiac Capricorn boundary. Profile: edit-profile limits/avatar, service booking form, group create/join, onboarding, settings, delete-account email flow. Auth: Facebook-hide, Google/Email OTP flows, OTP validation, theme+language persistence. Recommendations, price-watch delete contract, Deals disclosure (fixed earlier).

**Conclusion:** Every category-1 Android bug found by this audit was verified and fixed (16 total), built, and smoke-verified. Categories 2–5 are documented above with exact Web references for owner/backend decisions. **Stopping here — not proceeding to the RC Audit.**
