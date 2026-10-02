# UAT deploy — `rc/web-uat` @ `526129a` (2026-09-28)

## What is deployed

- **`uat.tappyai.com` already serves `526129a`.** The domain is attached to the `rc/web-uat` branch in Vercel, so the
  push deployed it automatically. Deployment `dpl_EGtPvchciQRSXsVgkzZFmWGqkP5b`
  (`tappyai-epkueehno-…vercel.app`) is a Preview build, Ready. GitHub shows the Vercel status on `526129a` as
  `success`.
- The site is behind Vercel SSO. Sign in with the team account to test.
- Production was not touched: no production deploy, no production env change, no production DB write.

## Configuration this release depends on (Preview env; only variable names were read, never values)

| Item | State | Effect on UAT |
|---|---|---|
| `CONSULTATIVE_V1` | **not set** → ON by default in code since `74b6f10` | the answer-first gate, pre-search, V1 prompt. Kill switch: `CONSULTATIVE_V1=0` |
| `ACCESSTRADE_PUBLISHER_ID`, `CCP_ATTRIBUTION_SECRET` | set (Preview) | tracked Accesstrade links with sub1 (PR #255) |
| `TRAVELPAYOUTS_TOKEN` | **not set** | flight answers have no live fares. The reply says so honestly and gives dated booking links. Set it for real reference prices |
| `ANTHROPIC_API_KEY` | **one variable shared by Production, Preview and Development** | 🚨 the 2026-09-27 spend-limit stop hit every environment, production included. Consider separate keys or limits |
| `NEXT_PUBLIC_SUPABASE_URL` | one variable shared by Production, Preview and Development | UAT likely uses the production Supabase project; not verifiable from here (SSO). Confirm before writing test data on UAT |
| `ZALO_VERIFY_URL/SECRET` | set (Preview, `rc/web-uat`) | Zalo login works on UAT |
| Migration `20260927100000_commerce_providers_portal_state.sql` | not applied by this session | owner-applied rows per `docs/commerce/AFFILIATE_STATUS.md`; without them the code registry states apply (Lazada / Vexere approved) |

## What to test by hand on UAT (this round)

1. **Answer first.** "rap phim nao gan q1", "ăn gì ngon giờ" and "massage" should give cards straight away, with exactly one
   question at the end (budget). "đi chơi ở đâu" should ask first with the chips ăn uống / đi chơi / spa. Test on web and on Android.
2. **Dish kept.** "Quán phở ngon ở Quận 3" should show phở cards, not "quán ăn khuya".
3. **M4.** "tiện mua máy sấy tóc Philips dưới 1 triệu" should show product cards, not "Bạn muốn mua món gì?".
4. **Language.** On an English-UI phone, a Vietnamese thread should stay Vietnamese on "len ke hoach 2 ngay 1 dem" and "ok
   con cai nao gan hon".
5. **Flights.** "Vé máy bay Sài Gòn Hà Nội tuần sau rẻ nhất" should search first, give links, and end by asking the date.
6. **P1 (UAT4).** Repeated replies collapse. Hotel cards show "Book on Trip.com" above "Open in Maps". A planning turn always
   ends with a plan card.

## Measured before this deploy

The blind grader, rubric C1–C9 as amended 2026-09-28, is recorded in `docs/uat/evidence/c40-ab-2026-09-27/`
(`blind-grading-round*.md`). The owner chose not to run a full re-run until after UAT preview: one full c40 + golden
run on the final release commit.
