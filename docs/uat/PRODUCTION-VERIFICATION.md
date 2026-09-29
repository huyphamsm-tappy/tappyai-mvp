# PRODUCTION VERIFICATION — after the release (prepared 2026-09-29, NOT run on production)

Step 9 of `RELEASE-GOVERNANCE.md` §4 (and again after H1/M1). One command, read-only except what a **test** account
does in the product. Nothing here uses a service-role key against production.

## 1. Before-release baseline (taken 2026-09-29 16:45 VN, production `f42ae4b`)

`gs://tappyai-uat-evidence/evidence/prod-baseline-f42ae4b/` (`baseline.json`, screenshots):

| Check | Result |
|---|---|
| `/` | 200 (0.4 s HTML) |
| `/login` | 200 |
| `/reviews` (feed) | 200 (0.2 s HTML; the video feed keeps loading media) |
| public review `/reviews/9d4cdf3b-…` | 200, `og:title` "Chia sẻ — 5/5 sao", `og:image`, `og:url` correct |
| guest chat, 1 question | **401 → "Cần đăng nhập để trò chuyện với Tappy"** — production has no guest chat today (anonymous sign-ins off / old code). After the release it must answer (RELEASE-PLAN §2f: Allow anonymous sign-ins = ON). |

## 2. Run (lead, after `/api/version` = release SHA)

```bash
# public values (as shipped in the page) + two production TEST accounts (Huy types the passwords)
export VERIFY_SUPABASE_URL=https://<prod-ref>.supabase.co VERIFY_SUPABASE_ANON_KEY=<anon key>
export VERIFY_A_EMAIL=<prod test A> VERIFY_A_PASSWORD=<…> VERIFY_B_EMAIL=<prod test B> VERIFY_B_PASSWORD=<…>
export PLAYWRIGHT_CORE_DIR=<dir with node_modules/playwright-core>
node scripts/release/verify-prod.mjs --sha <release sha> --baseline <dir of prod-baseline-f42ae4b> --out verify-prod-<sha>
```

Exit 0 = all PASS. Output `report.md` / `report.json` / screenshots → upload to
`gs://tappyai-uat-evidence/evidence/<sha>/verify-prod/`.

What it covers: `/api/version`; the signed-out smoke (`smoke-prod.mjs`: pages, guest chat per area, buy controls, OG);
pages `/`, `/login`, `/reviews`, `/deals`, a public review with OG; sign-in A and B; A's chat in food, spa,
entertainment, shopping, travel (hotel + flight) with merchant links; **every** `go.isclix.com` link carries `sub1`
(24 hex), and one link each of Trip.com, Traveloka, Lazada (tracked) and Shopee (direct) is followed hop by hop to
`click.accesstrade.vn` (sub1 present) and on to the merchant; a video upload (session → PUT → complete) and an avatar
upload (UI); a plan share opened signed-out (200, `noindex`); B reads **0** of A's rows in `conversations`,
`chat_messages`, `user_memory`, `user_preferences`, `notifications` and cannot modify A's `plan_shares`; comparison
with the baseline above.

**Dry run on UAT `400da54` (2026-09-29, `--auth audit-magiclink`): 31 PASS · 1 FAIL**, the FAIL being the script's own
reading of ACCESSTRADE's `<meta refresh>` for Trip.com (fixed after the run; decode checked on the captured page).
Evidence: `gs://tappyai-uat-evidence/evidence/400da54/verify-dryrun2/`.

## 3. Checks only Huy can do (dashboards; right after the script, same hour)

**GA4 production — affiliate click reaches analytics**
1. analytics.google.com → property **TappyAI (549975015)**, stream `G-8GP7L7N516`.
2. Reports → **Realtime overview**.
3. On a phone (not signed in to anything special), open www.tappyai.com, ask "Khách sạn Đà Nẵng 10/10 đến 12/10 cho 2
   người", tap a Trip.com button on the card, then tap a link in the reply text.
4. Within ~1 minute, the card "Event count by Event name" must show **`affiliate_click`** (2 events: card + text link, never 2
   for one tap). Click it → parameter `provider` = `tripcom`, `tracked` = `true`.

**ACCESSTRADE — the click is recorded with sub1**
1. pub2.accesstrade.vn → **Báo cáo → Báo cáo click** (click report), date = today.
2. Campaign **Trip.com** (6455552313033835511) and **Lazada** (5087153089503673507) show new clicks at the time of the run.
3. Open the click detail / export: column **sub1** contains the value(s) printed in `report.md`
   ("sub1 value(s) to find in the ACCESSTRADE click report"). A click with an empty sub1 = FAIL (tell the lead).

**Play Console — the build is the release build and still hidden**
1. play.google.com/console → **TappyAI** → Test and release → **Internal testing** → release with **versionCode 10**,
   status "Available to internal testers"; its build is the AAB from the release SHA (`build-aab.sh` log).
2. Install from the internal-testing link on your phone; sign in; one chat; one share.
3. **Production** track: only after your test; **Publishing overview → Managed publishing ON** (the app stays hidden
   until you publish it).
