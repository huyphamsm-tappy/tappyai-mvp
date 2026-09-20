# Google Analytics 4 — web setup & event taxonomy

GA4 is the **interim production measurement layer** for the TappyAI web app. It sits beside, not
instead of, the in-app tracker (`/api/track`) and PostHog: it receives a *projection* of what the
in-app tracker already emits, nothing more.

## How it is wired (code)

| Piece | File | Role |
|---|---|---|
| Loader | `src/components/GoogleAnalytics.tsx` (mounted in `src/app/layout.tsx`) | Loads `gtag.js` **only** when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set. Renders nothing otherwise. |
| Module | `src/lib/analytics/ga4.ts` | `gtag` queue stub, init (`send_page_view: false`), page_view with dedup + URL sanitising, the **event allowlist** (`GA4_EVENT_MAP`). |
| Emitter | `src/lib/tracking/tracker.ts` → `track()` | Every in-app event passes through `mirrorToGa4()`. There is no other call site of gtag anywhere. |
| CSP | `next.config.mjs` | `script-src` + `www.googletagmanager.com`; `connect-src` + `*.google-analytics.com`, `*.analytics.google.com`, `www.googletagmanager.com`. |
| Build report | `scripts/check-env.mjs` (`CAPABILITY_ENV`) | Build output prints whether GA4 is active. Never fails the build. |
| Tests | `src/lib/analytics/ga4.test.ts` | Enablement, once-per-route page_view, query/hash stripping, allowlist, tracker integration. |

## Environment

```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

- **Vercel → Settings → Environment Variables → scope: Production ONLY.** Do not tick Preview or
  Development. This scope *is* the guard against preview/dev traffic landing in the production
  property: with the variable absent the tag is not even loaded.
- Local `.env.local`: leave it unset. To exercise the pipeline locally without touching the real
  property use a dummy id such as `G-TEST000000` (Google drops hits for an unknown stream).
- Being a `NEXT_PUBLIC_*` variable it is inlined at **build** time — after adding it, **Redeploy**
  the production deployment (Deployments → ⋯ → Redeploy). A promoted old build does not have it.

## Property configuration (manual, one-time, in GA4 admin)

1. Create a GA4 property → Web data stream for `https://www.tappyai.com` → copy the Measurement ID.
2. **Enhanced measurement**: keep *Page views* on, but open its ⚙ and turn **OFF "Page changes
   based on browser history events"**. The app sends its own `page_view` on every client-side
   route change; leaving this on would double-count SPA navigations.
   Leave *Scrolls*, *Outbound clicks*, *Site search* (see below), *File downloads*, *Form
   interactions*, *Video engagement* at your discretion — none of them carry app data.
   *Site search* would read query parameters; the app never reports query strings in
   `page_location`, so it will collect nothing and can stay off.
3. **Google Signals: OFF** (no ads personalisation, no cross-device joins). **Data retention:
   14 months** (default is 2).
4. Optionally register the custom dimensions you want to slice by (Admin → Custom definitions):
   `method`, `feature`, `source`, `search_type`, `reason`, `place_type` (event-scoped).

## Event taxonomy

All events originate from the in-app tracker; the "internal event" column is the `track()` name.

| GA4 event | Internal event | Params sent | Meaning |
|---|---|---|---|
| `page_view` | `page_view` | `page_location`, `page_path`, `page_title` | One per route change (hard load or client nav). Query string & hash stripped; UUID segments collapsed to `_id` (`/chat/_id`). |
| `sign_up` | `auth_signup_completed` | `method` | First-time account (google / zalo / apple / email…). Google recommended name. |
| `login` | `auth_login_completed` | `method`, `is_first_login` | One per real login (not per page load with an existing session). |
| `login_failed` | `auth_login_failed` | `method`, `reason` | `reason` ∈ invalid_credentials / expired / oauth_denied / network. |
| `logout` | `auth_logout_completed` | `method` | |
| `chat_response` | `chat_response_received` | `feature` | One per **completed** AI answer in Main Chat; `feature` = domain (food / travel / shopping / entertainment / spa …). This is the "AI query" engagement metric. |
| `save_place` | `search_result_saved` · `place_save` | `source` (chat / reviews), `place_type` | A place saved from a chat result or from the reviews feed. |
| `search` | `review_search` | `search_type: reviews` | A search on the reviews feed. **The term is not sent.** |
| `review_like` | `review_like` | `liked` | Like / unlike on a review. |
| `share` | `review_share` | `content_type: review` | Share of a review. Google recommended name. |

Baseline traffic / user / engagement metrics (users, sessions, engagement time, new vs returning,
geography, device, landing pages, referrers) come from `page_view` + GA4's own session logic —
no extra code.

### Not sent (by design)

- Any user identifier (`user_id` is never set — GA4 users are cookie-scoped only), e-mail, name.
- Message text, AI output, search terms, review ids, place names, coordinates, tokens.
- `page_time` (in-app only), `report` / `hide` / `not_interested` (moderation signals stay
  internal), and any internal event not in `GA4_EVENT_MAP`.
- Query strings and hashes of any URL (`/login?email=1`, `?returnTo=`, `?q=`).

### Adding an event

Add one entry to `GA4_EVENT_MAP` in `src/lib/analytics/ga4.ts` with the internal event name, the
GA4 name and the **explicit** list of low-cardinality params to forward; add a case to
`ga4.test.ts`. Do not call `gtag` from a component. If the internal event does not exist yet, it
belongs in the tracker first (Event Catalog), then here.

## Verifying

Local, production-safe (nothing reaches the real property):

```bash
# .env.local: NEXT_PUBLIC_GA_MEASUREMENT_ID=G-TEST000000
npm run build && npx next start -p 3107
```

Open the site, DevTools → Network, filter `collect`. Expect:
- `https://www.googletagmanager.com/gtag/js?id=G-…` loads (200, no CSP error in Console);
- one `…/g/collect?…&en=page_view&…` per navigation, `dl=` without a query string;
- `en=login` / `en=chat_response` etc. on the matching actions, with `ep.<param>` only from the
  table above; nothing in the URL that looks like an e-mail, a message or an id.

Production, after the env var + redeploy:
- GA4 → Reports → **Realtime** while browsing `www.tappyai.com` in a normal window: your page
  views and events appear within ~30 s. For per-event inspection use the *Google Analytics
  Debugger* browser extension, which turns on `debug_mode` in the browser and lights up
  **DebugView** (the app itself never sets `debug_mode`, and it strips query strings, so a
  `?debug_mode=1` URL does nothing).
- Check the CSP: Console must show no `Refused to load/connect` lines for Google hosts.
