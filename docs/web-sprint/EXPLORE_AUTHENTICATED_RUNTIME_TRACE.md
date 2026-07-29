# Explore — Authenticated Runtime Trace: Google vs Zalo

**Date:** 2026-07-29 · Production `8d565f8` · **Evidence only. No cause claimed beyond what is measured. No fix proposed.**
**Method:** sessions minted for the Owner's own accounts with the app's own mechanism (admin `generateLink` → `verifyOtp`), then the production API called with `Authorization: Bearer <jwt>`. Read-only; no secrets printed; nothing mutated.

## Side-by-side, in the order requested

| # | Item | GOOGLE `huypham.sm@gmail.com` | ZALO `zalo_7571374941361288576@…` | Diverges? |
|---|---|---|---|---|
| 1 | Session object | valid, `session.access_token` issued | valid, `session.access_token` issued | no |
| 2 | JWT claims | `role=authenticated`, `aud=authenticated`, `is_anonymous=false`, `exp` set | identical shape | no |
| 3 | User id (`sub`) | `4dcce7cf-5f49-4c58-9901-2d586e31352d` | `d2883fba-5fd6-4a1e-9ee7-1a82a9ecd71f` | expected |
| 4 | Provider | `app_metadata.provider="google"`, `providers=["google"]` | `provider="email"`, `providers=["email"]`, `user_metadata.provider="zalo"` (magic-link bridge) | expected |
| 5 | Exact HTTP request | `GET /api/reviews/feed?page=0&limit=12&sort=trending` | **byte-identical** | **no** |
| 6 | Exact JSON response | `200` · keys `[reviews,page,limit]` · **10 reviews** · authors `{d2883fba:3, 4dcce7cf:6, 0f864f05:1}` · first three `546d5c77(d2883fba)`, `7a7ca930(4dcce7cf)`, `2fd1deeb(d2883fba)` | **200 · 10 reviews · identical author counts · identical first three, identical order** | **no** |
| 7 | **React state after parsing** | order `[4dcce7cf, 4dcce7cf, d2883fba, 4dcce7cf, d2883fba, 4dcce7cf, 0f864f05, d2883fba, 4dcce7cf, 4dcce7cf]` | order `[d2883fba, d2883fba, 4dcce7cf, 4dcce7cf, 0f864f05, d2883fba, 4dcce7cf, …]` | **★ FIRST DIVERGENCE** |
| 8 | Feed filtering logic | server: none identity-dependent. Client: hashtag re-sort | same code, different input | ordering only |
| 9 | Virtualized feed input | not virtualized — all 10 rows passed to render | same, 10 rows | no |
| 10 | Rendered cards | 10 cards in DOM; `renderVideo` only for `|i − activeIndex| ≤ 1`; **slide 0 is the only one on screen** (full-viewport snap scroll) | same mechanics, **slide 0 = the Zalo account's own clip** | consequence of #7 |

## The first divergence, precisely located

**`src/app/reviews/page.tsx:594-600`** — client-side re-sort inside `fetch_`:

```ts
const ht = topHashtagsRef.current
if (ft === 'for-you' && ht.length > 0) {
  rows = [...rows].sort((a, b) =>
    (b.hashtags||[]).filter(t => ht.includes(t)).length -
    (a.hashtags||[]).filter(t => ht.includes(t)).length)
}
```

fed by **`page.tsx:516-523`** — `topHashtags` = the 10 most frequent hashtags across the caller's 20 most recent `review_interactions`.

**Measured inputs:**

| Identity | `topHashtags` (first 5) | `city` | own review addresses |
|---|---|---|---|
| Google | `bánh bao, ăn vặt, đồ ăn ngon, street food, food lover` | `""` | none |
| Zalo | `#nailart, #nailsofinstagram, #redmani, #naildesign, #beautyblogger` | `""` | none |

Each account's interaction history is dominated by **its own posts**, so the re-sort ranks **that account's own clips first**. Result at the top of the feed:

- Google → slides 0,1 = `4dcce7cf` (own), first other author at slide **2**.
- Zalo → slides 0,1 = `d2883fba` (own), first other author at slide **2**.

Because Explore is a **one-clip-per-viewport snap feed**, the user sees **only slide 0** until they scroll. For the Zalo identity slide 0 and slide 1 are both its own content.

**Observation (labelled ASSUMPTION, not a claim):** this ordering is a plausible mechanism for "Zalo login shows only one author" — the first two screens are the Zalo account's own clips — but it is **symmetric** (Google also gets its own first), so it does **not** by itself explain why Google appeared to show three authors and Zalo one. The Owner's observation remains the active hypothesis; the exact scroll depth reached during the Owner's UAT is unknown to the AI.

**Secondary data note (evidence, not a cause):** hashtag storage is inconsistent — the Zalo account's tags carry a leading `#` (`#nailart`), the Google account's do not (`bánh bao`). Since matching is exact string equality, tags from the two conventions can never match each other.

## What was ruled out by this trace

Session validity · JWT claim shape · request URL · server response body · server-side filtering · row count · author set. **All identical.** Nothing in items 1–6 differs beyond the expected identity fields.

## Assumption register

| ID | Statement | Status |
|---|---|---|
| C1 | Both identities receive the same feed payload from production | **EVIDENCE** (byte-identical author counts, same first three ids, same order) |
| C2 | The only identity-dependent transformation is the client hashtag re-sort | **EVIDENCE** (code path + measured order delta) |
| C3 | Each account's own clips rank first because its interaction history is self-dominated | **EVIDENCE** (measured `topHashtags` per identity) |
| C4 | This ordering is what the Owner observed as "only one author" | **ASSUMPTION — not claimed** (mechanism is symmetric across identities) |
| C5 | Mixed `#`-prefixed and bare hashtags prevent cross-account matching | **EVIDENCE** (exact-string comparison at `:596-597`) |
