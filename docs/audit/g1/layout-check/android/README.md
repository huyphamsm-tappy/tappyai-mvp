# Android chat reply — pre-merge backend, real data (2026-09-17)

Backend: audit worktree at tag `layout-approved-2026-09-17` (`f6712b8`), `next dev` on **:3410**
(the port the debug build on emulator-5554 targets; launch config `audit-nonprod-3410`), non-prod
Supabase, no mock. Question typed exactly (host clipboard → emulator paste):
"Tìm quán ăn tối ngon gần Quận 1 cho 2 người".

## Which build, and "guest"

- The Android app has **no guest entry**: every build shows the sign-in wall (Google / Zalo only) —
  `android-v3-audit-build-signin-wall.png` is the V3 build installed today on emulator-5558
  (source `design/v3-phase4`, API base :3101). OAuth is never clicked, so that build could not chat.
- Screenshots therefore come from the debug build on **emulator-5554** (`com.tappyai.app.debug`
  0.1.3-debug, installed 2026-09-15 11:46, APK from worktree
  `D:/Claude/Projects/TappyAI/.worktrees/ccp-canonical` = branch `feat/ccp-canonical`, built
  2026-09-15 11:45). That app is signed in with the owner's production account; its Bearer is a
  production JWT, which the audit backend cannot verify → `getRequestUser` returns `user: null`
  and the turn ran on the **guest** path server-side (IP-metered; tag allows guests, no age gate).
  Server log: `POST /api/chat 200`, provider `serper_maps`.

## Screenshots (`android-premerge-chat-reply-01…12.png`, top → bottom)

01 prose start + first inline photo · 02 second inline photo + "Bạn muốn đặt bàn hay order online?"
+ third inline photo + TikTok link · 03–12 eight stacked place cards (Vua Chả Cá · Nhà hàng chay
Phương Mai · Hải Sản Hoàng Gia · Quán nhậu Quý Dậu · Hàng Dương Quán · Quán Bụi Original · Ann Quán
· NHÀ HÀNG NGON) · 12 action bar, "Lưu địa điểm", follow-up chips.

## Yes / no

- **Horizontal swipeable card carousel present? NO.** The eight place cards are a vertical stack
  (`PlaceCards` = `Column { places.forEach { PlaceCard(it) } }`), full-width, one below the other.
- **Inline images or "ShopeeFood · GrabFood · BeFood" lines in prose? YES.** Three inline photos
  and three "ShopeeFood · GrabFood · BeFood" link lines sit inside the prose (01–02), plus a
  "🎵 Video liên quan trên TikTok" line — the v1 server injection for a non-web surface — AND the
  eight cards below them, so the same venues appear twice.
- Prose (v1 guard, flags OFF): the pick sentence was cut — the reply opens "Mình sẽ tìm…" then
  "Quán mở từ 10:30-22:30 hàng ngày." with no venue named (the same v1 truncation class seen on web).

## Where the place-card code lives (repo-wide search, 663 refs)

| Component | Path | Branches | Layout |
|---|---|---|---|
| `PlaceCards` / `PlaceCard` (place decision cards in chat) | `android/app/src/main/java/com/tappyai/app/chat/PlaceCard.kt` (+ `PlacesLiveView.kt`, `PlacesMarkerView.kt`, `TravelPlaceFilter.kt`, `strings_chat.xml`) | `feat/ccp-canonical`, `integration/v3-canonical`, `feat/affiliate-cross-platform`, `feat/g1-growth`, `origin/backup/ccp-canonical-2026-09-17` (all carry `60df033` "durable and live Place Card", 2026-09-11; `66efcd7` CCP contract 2026-09-14) | vertical `Column`, not a carousel |
| Older partial versions | same paths | `fix/places-marker-contract` (6 files), `feat/consultative-d1-d2-r1-r2-d3`, `feat/ccp-mvp` (4) | — |
| `ChatImageCarousel` (photos only) | `android/app/src/main/java/com/tappyai/app/chat/ChatImageCarousel.kt` | `design/v3-phase4` and most branches | `LazyRow` + snap — images from the inline markdown, no card fields |
| Other `LazyRow`s | `reviews/ui/ReviewPhotoCarousel.kt`, `discovery/DiscoveryCategoryScreen.kt`, `maps/MapsScreen.kt`, `music/*` | various | not chat |

- **`design/v3-phase4` (the V3 branch, merge target) and `origin/main` do NOT contain
  `PlaceCard.kt`** (`git merge-base --is-ancestor 60df033` → no for both). On V3 the `8:` places
  frame is parsed only for the share artifact (`share/PlacesLiveView.kt`, `takeLatestPlacesView`);
  chat replies render prose + `ChatImageCarousel` galleries, nothing else. That is why the V3 audit
  build would show no cards even if it could chat, and why `docs/audit/android-app-tasks.md` item 4
  calls the card renderer a prerequisite — the renderer exists, on another branch.
- On `feat/ccp-canonical` the cards are fed from the live `8:` frame (`message.livePlaces?.items`
  → `PlaceCards(cards, commerce = …)` in `ChatScreen.kt:307–312`); the `[TAPPY_PLACES]` marker path
  is parsed too but the server flag `EMIT_TAPPY_PLACES` is `false` on the tag and on V3.
- No branch has a horizontal place-card carousel for chat; the web's carousel
  (`src/components/chat/PlaceDecision.tsx`) has no Android twin.
