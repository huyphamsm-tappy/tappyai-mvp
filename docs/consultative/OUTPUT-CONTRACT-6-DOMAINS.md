# /api/chat reply output contract: 6 areas

> **Update 2026-09-29 — the owner-approved 6-area frames are IMPLEMENTED** (commit `83853cc`,
> `src/lib/ai/consultative/domainFrames.ts`). The 26/9 design turned out to be a request that had never
> run; the owner approved the frames below on 2026-09-29. §0 is the approved frame per area; §1–§5 (written
> from `f8a26b7` by reading the code) still describe the transport, markers and annotations, which did NOT
> change — the frames change the PROSE the model writes, not the stream format.

## 0. Approved frames (what each reply contains, in order)

Per turn the server loads ONE area frame + a small shared core (V1 block; the area comes from the turn's
domain, a trip plan → TRAVEL, an evening plan → ENTERTAINMENT, anything else → MAIN).

**Shared core (every area):** no personal info requested · booking/buy buttons are system-placed, search links
say they are a search and what the user must type · never invent hours, prices, showtimes, promotions,
availability (one sentence + official source instead) · spending shows arithmetic · no unbacked "phù hợp",
"giá hợp lý" · **the main pick is the FIRST name in the text** (the card's #1 follows it, so text = card).

| Area | Reply shape |
|---|---|
| FOOD | pick + reason (tool numbers) · 1–2 options at another price level · dish to order (only if in data) · price per person (only from tool) · timing: today's closing time; busy hours / booking only if a review says so · parking / alley only if data says so · booking/delivery buttons |
| SHOPPING | one product of the RIGHT category INSIDE the stated budget (else say so) · 1 alternative + real trade-off · what to check before paying (used goods keep the risk rule) · where to buy, honest link labels · say "chờ" / "không đáng mua" plainly when that is the answer |
| TRAVEL | uses `[TAPPY_PLAN]`: 1-line summary (days, people, total budget) · day-by-day by time · rain option · where/what to eat · **code-written budget line** `💰 Ngân sách: X ÷ N người = …/người · ÷ D ngày = …/người/ngày` (right after `[/TAPPY_PLAN]`, only when the user stated a budget) · tips & traps (grounded) · to-do before leaving · flight/hotel links labelled as search. Date / origin / transport never assumed — the server's closing question asks. |
| ENTERTAINMENT | pick matching district / time / company, open at that time · real experience (from data) · book ahead / arrive early / parking (only if data says) · showtimes/tickets: official page, never invented. Evening plans: fixed stages + code-written queries, personalised by who/mood/budget. |
| SPA | pick by area + budget · service + price (tool, "giá tham khảo") else "gọi hỏi trước" · experience from reviews · booking contact from data · one caution line |
| MAIN | detect the area; multi-area requests answered area by area with shared constraints; out-of-scope questions answered directly without pretending to be a local-service tool; constraints and corrections carried across turns |

**Android impact:** none on parsing — same frames (`0:`, `8:`), same markers. New visible text: the `💰 Ngân sách: …`
line after a budgeted plan block (plain text; render it like any prose line after a marker block).

---

## 1. Transport

### 1.1 Request

- `POST /api/chat`. The JSON body carries `messages` plus optional fields. `decisionEvidenceId` echoes
  the previous turn's `X-Decision-Evidence-Id` (web: `src/components/ChatInterface.tsx:851`; the
  server reads it at `src/app/api/chat/route.ts:812-813`).
- **`x-tappy-surface` request header** (`src/app/api/chat/route.ts:1433-1434`,
  `src/lib/ai/decisionSurface.ts:24-29`):
  - `web` (sent by `src/components/ChatInterface.tsx:841`) and `android`
    (`android/.../chat/data/RealChatRepository.kt:203`) → `rendersDecisionCard = true`.
  - No header, or any other value (iOS, scripts) → `false`.
  - When it is `true`:
    1. The model gets `buildRenderedDecisionBlock` (`src/lib/ai/promptBuilder.ts:305-316`, wired at
       `route.ts:1530`). It says the card already shows photo, rating, address, hours and actions,
       so the prose must not repeat them, must still name the pick, and must not write the
       aggregate Maps link.
    2. The stream filter does **not** inject per-place photo lines, order/provider links or the
       batch TikTok line into the prose, but only when a card actually exists for the turn
       (a places view or a shopping marker) (`src/lib/ai/streamEnrichment.ts:1988-1990`, `:2655`).
  - When it is `false`: the prose carries injected `![…](…)` photo lines and provider link rows under
    each venue (`injectPlaceEnrichment`, `streamEnrichment.ts:998`). The `8:` card annotation is
    **still emitted**. The header changes only the text.

### 1.2 Pre-stream errors (not a stream)

These come back as JSON bodies with a non-200 status: 400 `invalid_request` (`route.ts:170-183`),
429 `rate_limit` with `Retry-After` (`:145-147`, `:727-729`), 401 `anon_limit_reached` (`:616-620`,
`:859-863`, `:881-883`), 429 `free_limit_reached` / `pro_daily_limit_reached` /
`share_follow_up_limit` (`:745-748`, `:761-763`, `:900-902`), 403 age gate (`:564-594`),
and 502 `ai_error` (`:2341-2343`).

### 1.3 Response headers

| Header | Value | Source |
|---|---|---|
| `X-Decision-Evidence-Id` | a UUID per turn (`route.ts:514`) | model path `route.ts:2483`; canned path `:1700`; deferred path `:2611` |
| `content-type` | `text/plain; charset=utf-8` + `x-vercel-ai-data-stream: v1` (SDK and canned, `src/lib/ai/cannedReply.ts:97-107`) **or** `text/event-stream` when the turn pre-searches (`route.ts:2611`). The line format is the same in both cases. | |

Clients should store `X-Decision-Evidence-Id` and send it back as `decisionEvidenceId` on the next
turn. That is what web does (`ChatInterface.tsx:856-857`). The id is not a capability
(`route.ts:2480-2482`).

### 1.4 Frames

The stream is AI SDK 4.3.19 (`node_modules/ai/package.json`). Each frame is one line:
`<code>:<json>\n`. The codes are defined at `node_modules/@ai-sdk/ui-utils/dist/index.mjs:474-693`.
Android also accepts an SSE `data: ` prefix (`android/.../ChatStreamFrames.kt:48`).

| Code | Meaning | Client action |
|---|---|---|
| `0:` | text delta (JSON string) | **Render.** Concatenate in order. The concatenation is the message and holds every marker (§2). |
| `8:` | message annotations (JSON **array**) | **Render by `kind` only** (§3). Skip unknown kinds. Never persisted. |
| `9:` | tool call `{toolCallId, toolName, args}`; pre-search calls are server-written (`src/lib/ai/consultative/presearch.ts:125-127`) | Ignore. Optionally use it as a "searching" hint. |
| `a:` | tool result `{toolCallId, result}`. The raw tool payload can be large. | **Ignore.** It is not user content. |
| `f:` / `e:` | start step / finish step (SDK) | Ignore. |
| `d:` | finish message `{finishReason, usage}` | End of turn. It is held until every server append has been sent (`askAfter.ts:47,70`; `eveningPlan.ts:175,191`). |
| `3:` | error string. The SDK default text is `"An error occurred."` (`node_modules/ai/dist/index.mjs:6169`). | Show an error state. No ask-after is appended on an errored turn (`src/lib/ai/consultative/askAfter.ts:51,62`). |

Stream order on a buffered place turn with pre-search (`route.ts:2390`, `:2606-2611`;
`streamEnrichment.ts:3155-3195`, `:2785`, `:2805`):

```
8:[progress searching]           deferredBody(searchingFrame)            presearch.ts:153-154
9:{presearch call}  a:{result}    prefixBody                               presearch.ts:125-130
8:[progress found,count]  8:[tappy.places.v1 preliminary:true]           streamEnrichment.ts:3159-3168
0:"…"  (only money-free sentences released before any place tool)         streamEnrichment.ts:2873-2881
f:/e:/9:/a: (model steps)
8:[progress finishing]                                                    streamEnrichment.ts:3195
0:"<settled reply: prose + markers>"                                      streamEnrichment.ts:2785
8:[tappy.places.v1 final]                                                 streamEnrichment.ts:2805
0:"\n\n<ask-after question>[FOLLOWUPS]…"   (optional)                    askAfter.ts:63-66
d:{…}
```

A shopping turn also sends the `[TAPPY_SHOPPING]` marker early, as its own `0:` frame, right after the
product tool result (`streamEnrichment.ts:3189-3192`). The final send then leaves it out
(`:2767`).

Turns without buffering (weather, gold, news, chitchat) stream `0:` live
(`streamEnrichment.ts:2846-2877`). `stepRepeatGuard` then drops a step's text if it repeats the previous
step (≥80% similar) (`src/lib/ai/stepRepeatGuard.ts:1-24`, `route.ts:2606`).

---

## 2. In-text markers (inside the `0:` text)

Clients must extract these blocks and remove them from the visible text. Every guard treats text from
the first marker onward as machine data (`src/lib/ai/groundingGate.ts:33`, `hoursGuard.ts:99`).

| Marker | Syntax | Produced by | Status |
|---|---|---|---|
| `[TAPPY_PLAN]` | `[TAPPY_PLAN]{json}[/TAPPY_PLAN]` | model (`promptBuilder.ts:158-160`), or server for the evening frame (`eveningPlan.ts:130`), or a completion call (`planCompletion.ts:1-15`) | live |
| `[TAPPY_SHOPPING]` | `[TAPPY_SHOPPING]{SynthesisView}[/TAPPY_SHOPPING]` | server (`consultative/synthesisView.ts:254-260`) | live |
| `[TAPPY_PLACES]` | `renderPlacesMarker` (`src/lib/recommendation/marker.ts:160`) | server | **OFF**: `EMIT_TAPPY_PLACES = false` (`src/lib/config/product.ts:355`). Replaced by the `8:` places annotation. |
| `[TAPPY_FUTURE]` | none | none | **Not emitted.** It appears only in a sanitizer test (`src/lib/share/publicSanitizer.test.ts:100`). |
| `[CTA_BUTTONS]` | `[CTA_BUTTONS]{"buttons":[{label,type,url,primary}]}[/CTA_BUTTONS]` | model (`promptBuilder.ts:463-505`). The server-authored CTA is **OFF** (`product.ts:394`). | live |
| `[FOLLOWUPS]` | `[FOLLOWUPS]a\|b\|c[/FOLLOWUPS]` on one line | model (R6, `promptBuilder.ts:228`) and server (below) | live |

### 2.1 `[TAPPY_PLAN]` schema (`promptBuilder.ts:159`)

```jsonc
{ "type": "trip" | "evening", "title": str, "people": int, "budget_total": str /* with unit, or "chưa có giá" */,
  "days": [{ "label": "Ngày 1" | "Tối nay", "items": [{
      "time": "HH:MM", "emoji": str, "category": "hotel|food|spa|entertainment|transport" /* evening frame also "drinks" */,
      "name": str, "description": str, "price": str /* or "chưa có giá" */, "address": str,
      "maps_link": url|"", "booking_link": url|"", "place_id": str,
      "photo_url": url /* server-added */ }]}],
  "cost_breakdown": { "<category>": str },            // model plans; absent in evening frame
  "local_tips": [{ "text": str, "basis": "tool", "place": str } | { "text": str, "basis": "general" }], // trip only, optional, ≤4
  "share_text": str }
```

- Field names stay English. Values are in the reply language (`promptBuilder.ts:137-140`, `:642`).
- `photo_url` is added by the server from retrieved rows (`injectPlanPhotos`,
  `streamEnrichment.ts:849-860`). The evening frame adds it too (`eveningPlan.ts:117-118`).
- Blank `maps_link` / `booking_link` mean "no link". A URL that is not allowed is blanked, never
  removed (`streamEnrichment.ts:521-545`).

**Plan guards.** These run in this order on the parsed JSON (`streamEnrichment.ts:2005-2036`):
1. `guardPlanPrices` (`src/lib/ai/planPriceGuard.ts:193`). An amount survives only if the user stated
   it or a tool retrieved it for that item. Otherwise it becomes the sentinel `chưa có giá` / localized
   text (`:40`).
2. `guardPlanLocalTips` (`planLocalTipsGuard.ts:88`). A tip is dropped if it is malformed, contains
   digits or fact words, or names an ungrounded venue.
3. `guardPlanItems` (`planItemGuard.ts:89`). A venue item must be a place a tool returned this turn,
   otherwise it is replaced or dropped. `booking_link` is set only from `buildActions`, so a
   model-written URL never survives. Markdown is stripped from text fields.
4. `guardPlanTripFacts` (`planTripFactsGuard.ts:40`). If the user gave no date, dates are removed from
   labels and the title, and prose sentences stating a date are dropped. If the user gave no origin
   or transport, inter-city legs are removed from the plan and cost breakdown.
5. `normalizeReplyMarkdown`. Unpaired `**` are balanced, and markdown is stripped inside block string
   values (`src/lib/chat/markdownNormalize.ts:172-187`, applied at `streamEnrichment.ts:2617-2623`).
6. The plan link egress check (`guardPlanLinks`, `streamEnrichment.ts:525`).

**Evening fixed frame** (`src/lib/ai/eveningPlan.ts`). Used when `usesEveningFrame` is true: an
evening plan that is not inherited and names only dinner, bar or cafe (`:46-49`; `route.ts:351`).
- Stages: 18:30 dinner 🍽️ → 20:00 night 🎶 → 21:30 drinks 🍹, each with **code-written** searches
  (`:36-43`). Each stage picks the first row open at that time that no earlier stage used (`:82-86`).
  Searches run server-side (`route.ts:2104-2141`).
- The server builds the plan: `type:"evening"`, a fixed title, `people` (default 2), `budget_total` (the
  user's figure or `chưa có giá`), every `price` = `chưa có giá`, and `booking_link` only from a
  direct/commerce book/order/ticket action (`eveningPlan.ts:98-133`).
- The intro text above the plan is **also code-written** (`eveningIntro`, `:147-161`).
  `fixedPlanStream` holds all model text, deletes any model plan block, and emits one `0:` frame
  (intro + block) before `d:` (`:170-194`; `route.ts:2360`). The model runs with `maxSteps: 1`
  (`route.ts:2211`).

**Plan completion.** On a planning turn with no complete block, the server holds `d:` and makes one
extra model call that supplies the block. It fails open (`src/lib/ai/planCompletion.ts:1-25,66`;
`route.ts:2362-2387`).

### 2.2 `[TAPPY_SHOPPING]` (`SynthesisView`, `consultative/synthesisView.ts:158-176`)

`{ v:1, entities: SynthesisEntityView[], recommendation: {entityKey, seller, reasons[], tradeOff, conditional} | null, requested?: string|null }`.
Each entity has `key, name?, config, specs?[{key:'chip'|'ram'|'storage'|'size', value}], condition?,
matchesRequest, recommended, priceLow, priceHigh, image, offers[{seller,url,price,currency,condition,rating?,ratingCount?}],
commerce?, commerceLinks?[]` (`:30-45`, `:105-139`).
Commerce views carry `labelKey` (resolved server-side), `kind` (`SEARCH_HANDOFF` = a search page),
`primary`, `loginRequired`, `depth` and similar fields (`:57-87`, `:211-233`). A malformed marker
degrades to no card (`parseShoppingMarker`, `:271-285`).

### 2.3 `[CTA_BUTTONS]`

This block is model-written, one per reply, and is placed at the end of the reply. The label language
follows the reply (`promptBuilder.ts:465`, `:502`). Per-domain templates are at `:475-494`. The server
validates it for every client:
- `validateModelCtaBlock` drops buttons for another merchant, mislabelled destinations and merchant
  front doors. It relabels over-promises on results pages
  (`src/lib/recommendation/ctaValidation.ts:376-397`). It also accepts a block with no closing tag,
  using brace matching (`:360-373`).
- `guardCtaButtons` drops a button whose URL is neither an allowed CTA host nor a URL given this turn
  or in an earlier reply (`streamEnrichment.ts:552-565`).

### 2.4 `[FOLLOWUPS]` (quick replies)

- Format: `[FOLLOWUPS]a|b|c[/FOLLOWUPS]`. At most **3** items, each 2-5 words, written as the user's
  next line, in the **reply language**, with full Vietnamese diacritics. It goes on the last line,
  after CTA/PLAN. It is skipped for greetings, thanks and small talk (`promptBuilder.ts:228`).
- The closing tag can be missing. Guards and Android read it up to end-of-line:
  `\[FOLLOWUPS\]([^\n]*?)(?:\[/FOLLOWUPS\]|\n|$)` (`sanitizePriorAssistantContent.ts:35`,
  `android/.../ChatResponse.kt:230`).
- Server sources:
  - the canned greeting (`cannedReply.ts:36,44`);
  - the clarify reply, which uses the first multi-option question's options, sliced to 3
    (`consultative/actionability.ts:289-295`);
  - ask-after options, added only when the reply has no `[FOLLOWUPS]` (`askAfter.ts:65`).
- ⚠ The ask-after question and its chips are appended **after** the model's CTA/FOLLOWUPS blocks
  (`askAfter.ts:63-66`). Clients must render visible text that comes after a block.

### 2.5 Server appends inside the settled text (`streamEnrichment.ts:2741`)

`finalText = prose + systemLinksSuffix + [TAPPY_SHOPPING] + [TAPPY_PLACES](off) + serverCTA(off)`.
- `systemLinksSuffix` is `🔗 Liên kết chính thức: [name](url) · …`. It is added only when none of the
  platform-resolved route/event/film links made it into the prose (`:2730-2740`).
- The batch TikTok line `🎵 [related video](url)` is added only when no card owns enrichment (`:2655`, `:2699-2701`).
- Server backstop sentences go **before** the first marker: the V1 pick, the shopping-none sentence
  (`:2606-2641`), and the risk backstop (`riskBackstop.ts:146`).

---

## 3. Annotations (`8:` frames)

There are only two annotation kinds. `tappyai_cards`, `tappyai_cards_preliminary` and
`tappyai_cards_error` are **server log event types**, not annotations
(`streamEnrichment.ts:1926,1951,1964,3167`). Clients never receive them.

### 3.1 `tappy.progress.v1` (`src/lib/recommendation/progressAnnotation.ts:15-40`)

`{ kind:"tappy.progress.v1", v:1, stage:"searching"|"found"|"writing"|"finishing", count?, text }`.
`text` is already localized (vi/en). Show the latest one, and drop it when text arrives.

### 3.2 `tappy.places.v1` (`src/lib/recommendation/liveView.ts:42-175`)

`EMIT_PLACES_ANNOTATION = true` (`product.ts:383`).

```jsonc
{ "kind":"tappy.places.v1", "v":1, "domain":"food|shopping|travel|entertainment|spa",
  "ranked"?: bool /* false ⇒ do not print "#1" */, "items": LivePlace[] /* whole ranked set */,
  "mapsSearchUrl"?: url, "picked"?: [id] /* model's named picks, pick first */,
  "shown"?: 3 /* CARDS_SHOWN, streamEnrichment.ts:35 */, "pickUnmatched"?: true, "preliminary"?: true }
```

`LivePlace` (`liveView.ts:68-117`) has `id, domain, kind('place'|'product'|'stay'), name, image?, address?,
rating?, ratingCount?, stars?, tappyRating?{avg,count}, openingHours?, openNow?, phone?, priceLevel?,
priceSignal?, priceRangeText?, openingHoursWeek?, distanceKm?, categories?, flags?[wifi|outdoorSeating|vegetarian],
rank, shortlistPosition?, recommended?, matchVerdict?, reasons?, tradeOff?, actions: LiveAction[]`.
Text fields are plain text, with markdown stripped by `plainTextDeep` (`streamEnrichment.ts:1953-1955`).

**LiveAction / canonical commerce action (CCP)** (`liveView.ts:47-66`, `src/lib/recommendation/actions.ts:35-100`):
`{ kind: maps|directions|website|order|delivery|booking|reservation|ticket|purchase|review|call|social,
urlKind: 'direct'|'search', url, labelKey, platform?, attributed?, commerce? }`.
- `labelKey` is resolved once on the server (`resolveActionLabel`,
  `src/lib/recommendation/actionLabel.ts:75-140`). Render that key and do not relabel it.
  `urlKind:'search'` always maps to a search label: `v3.action.orderSearch`, `bookingSearch`,
  `ticketSearch`, `searchOn` or `searchLoginOn`, shown to users as "Tìm trên …". Direct commerce
  actions use `…On`, `…LoginOn`, `…AppOn` or `v3.action.viewOn`.
- `commerce` (`actions.ts:70-100`) has `linkId, requestId, providerId, depth, guestDepth,
  authRequiredAt, loginRequired, handoff?, authenticatedDepth?, freshnessType, expiresAt, tracked,
  capability?, primary, facts?`.
- **Search-fallback rows:** a row with no page of its own gets ONE merchant search page, marked
  `fallback:'search'` with `kind:'SEARCH_HANDOFF'` and `primary:false`
  (`src/lib/ai/tools/commerce.ts:734-760,821`; `src/lib/ccp/row.ts:63-71`). It is labelled as a
  search, never leads, and is dropped when a real buy/order/booking action exists. Food uses a
  GrabFood search. Shopping uses Shopee, Lazada and CellphoneS. Entertainment uses Ticketbox, and
  only on an event-ticket ask. Hotel rows use Booking.com (`commerce.ts:745-758`). On the wire it
  appears as `urlKind:'search'` + `commerce.primary:false`.
- Per-domain action order (`actions.ts:102-109`):
  - food: order, delivery, reservation, maps, …
  - shopping: purchase, website, review
  - travel: booking, reservation, maps, …
  - entertainment: ticket, reservation, website, maps, …
  - spa: reservation, website, maps, call, …
- Client rule: a turn can carry **two** `tappy.places.v1` frames. The `preliminary:true` frame
  (unranked, no pick, no photos) is sent when rows arrive (`streamEnrichment.ts:3159-3168`). The final
  frame comes after the prose (`:2805`). **Use the last frame.** No places view is built for flights,
  transport, products, or turns with fewer than 2 candidates (`liveView.ts:378-389`), and
  `get_hotel_prices` hotel rows get no card (`streamEnrichment.ts:3158`).

---

## 4. Per area

The following apply to every area.
- `CONSULTATIVE_V1` is **ON by default**. Set `0|false|off` to disable it (`product.ts:465-468`).
- `PLACE_GUARD_ATTRIBUTION_V2` is ON by default (`:418-422`).
- `SNIPPET_PRICE_GUARD_V2` and `MEDIA_PLACEMENT_V2` are OFF by default (`:434-453`).
- `RISK_BACKSTOP` defaults to `live` (`:490-497`).
- Buffering (nothing reaches the client until guards finish, except safe pre-tool sentences) turns on
  for: travel intent, place intent, V1 decision turns, ticket words, and commerce handoff
  (`streamEnrichment.ts:1480-1522`).
- **Ask-after: one closing question.**
  - The gate's `askAfter` comes from the current turn's domain (`route.ts:467-482`;
    `consultative/actionability.ts:158-196`).
  - Trip turns replace it with the `tripFacts` question (`route.ts:490-499`;
    `consultative/tripFacts.ts:40-47`).
  - Flight searches with no date get "Ngày bay?" (`route.ts:1025-1027`).
  - `askAfterStream` appends the sentence only if the turn answered (it saw a `9:` or `a:` frame), did
    not error, and does not already end with a question (`askAfter.ts:16-73`, `route.ts:2606`).
  - No question is added if the previous reply already ended asking (`route.ts:481`).
- Prose rules: 2-4 distinct options, the pick sentence first, at most 3 bullets, no `##` headers, bold
  only for names and prices, and the reply ends on the recommendation (`promptBuilder.ts:190-228`).

### 4.1 FOOD
1. **Tools:** `search_places` (type restaurant/cafe). Pre-searched when the directive is exact
   (`presearch.ts:48-55`; queries such as `quán <dish> ngon` or `quán cà phê` come from
   `consultative/searchNow.ts:181-197`).
2. **Reply order:**
   - pick sentence + reasons, with no card facts when a card renders;
   - injected photos and links when there is no card;
   - `[CTA_BUTTONS]`: GrabFood search + Maps per venue, never a ShopeeFood/BeFood search, and no
     GrabFood in another city (`promptBuilder.ts:475-478`);
   - `[FOLLOWUPS]`;
   - ask-after "Tầm giá?" / "Mấy người?" (`actionability.ts:185-189`, `askAfter.ts:20-21`);
   - `8:` card (domain `food`).
3. **Order links** are search pages. The prompt forbids "có đặt online"
   (`promptBuilder.ts:460`), and an unbacked ordering claim is dropped
   (`streamEnrichment.ts:2206-2210`).
4. **Guards:**
   - snippet price guard: a price must trace to a retrieved snippet (`snippetPriceGuard.ts:126`,
     `streamEnrichment.ts:2131-2134`);
   - rating, review count, phone and distance provenance (`placeClaimGuard.ts:76-77,665`,
     `streamEnrichment.ts:2188-2202`);
   - hours (`hoursGuard.ts:49`, `streamEnrichment.ts:2221-2227`);
   - budget fit, format claim, district claim and unsupported claims (`streamEnrichment.ts:2240-2269`).

### 4.2 SHOPPING
1. **Tools:** `search_products`, which is not registered when location intent is offline
   (`route.ts:1877`).
2. **Reply order:**
   - `[TAPPY_SHOPPING]` is sent early as its own `0:` frame (`streamEnrichment.ts:3189-3192`);
   - prose;
   - `[CTA_BUTTONS]` marketplace searches (`promptBuilder.ts:480-482`);
   - `[FOLLOWUPS]`;
   - ask-after "Tầm giá sản phẩm?" when a subject is known without a budget (`actionability.ts:166`).
3. **No `8:` places card** (`liveView.ts:378-386`).
4. **Guards:**
   - money guard: a price must match a structured record, otherwise it is hedged
     (`moneyGuard.ts`, `streamEnrichment.ts:2044-2066`);
   - spec guard (`streamEnrichment.ts:2074-2076`);
   - shopping-none backstop sentence (`:2606-2615`);
   - risk backstop for second-hand purchases, appending fixed lines and a pointer to the scam checker
     (`riskBackstop.ts:1-16,158`).

### 4.3 TRAVEL
1. **Tools:** `get_hotel_prices`, `get_flight_prices`, `get_transport_options`, and `search_places`
   (hotel/attraction) (`route.ts:1961-2030`). A flight with a route in the text is pre-searched, with
   `departDate` taken from a `dd/mm` in the text (`presearch.ts:69-84`; `route.ts:1039`).
2. **Hotels without dates:** the model assumes next weekend and says so (`consultativeV1Prompt.ts:125`).
3. **Guard: travel fail-closed.** A fare, schedule time or availability claim with no live evidence
   is redacted (`travelGuard.ts:1-14,195`; `streamEnrichment.ts:2082-2084`). A trip plan holds the
   whole reply (`route.ts:2440-2442`).
4. **Trip plan:** `[TAPPY_PLAN]` with `type:"trip"` and optional `local_tips`, then 2-4 sentences, then
   `[CTA_BUTTONS]` (Booking.com by hotel name + Grab / Xanh SM, `promptBuilder.ts:484-486`), then
   `[FOLLOWUPS]`. The closing question names only the missing date, origin or transport
   (`tripFacts.ts:22-47`). `guardPlanTripFacts` removes invented dates and legs (§2.1).
5. **Cards:** hotel rows from `search_places` get an `8:` card (domain `travel`). Hotel-row fallback is
   a Booking.com search. Flights and transport get no card.

### 4.4 ENTERTAINMENT
1. **Tools:** `search_places` (cinema / attraction / bar), with directives such as `rạp chiếu phim`
   and `quán karaoke` (`searchNow.ts:150,183-187,200`). A movie-*recommendation* turn drops
   `search_places` (`route.ts:1737-1740`). Events use `get_news` / `web_search`.
2. **Reply order:**
   - pick;
   - `[CTA_BUTTONS]` Website (only if `website_uri`) + Maps (`promptBuilder.ts:492-494`);
   - `[FOLLOWUPS]`;
   - ask-after;
   - `8:` card (domain `entertainment`, ticket first).
3. **Ticket and showtime guard (buffered on ticket words, even with no place tool,
   `streamEnrichment.ts:1512-1513`):**
   - availability and showtime claims are **unconditionally** unsupported because no showtime
     provider exists (`placeClaimGuard.ts:241-300`);
   - ticket prices go through the ticket-unit guard (`streamEnrichment.ts:2124-2130`).
4. **Links:** the Ticketbox search fallback applies only to event-ticket asks (`commerce.ts:750-752`).
   Official links come from `systemLinksSuffix` (§2.5).

### 4.5 SPA-WELLNESS
1. **Tools:** `search_places` type `spa`. The pre-search query is `spa massage` (`searchNow.ts:199`).
2. **Reply order:**
   - pick;
   - `[CTA_BUTTONS]` Website (only if `website_uri`) + Google Maps (`promptBuilder.ts:488-490`);
   - `[FOLLOWUPS]`;
   - ask-after;
   - `8:` card (domain `spa`, reservation first).
3. **Guards:** the same as FOOD: snippet price, place claim, hours, unsupported claim. R4 covers a
   service the venue data never mentions, such as "massage couple" (`unsupportedClaimGuard.ts:1-15`).

### 4.6 MAIN CHAT (general / non-domain)
- **Greeting, thanks, ack, bye, laugh:** a canned reply with no model call. The body is
  `0:` + `d:` (`cannedReply.ts:47-57,97-107`). Only the greeting carries `[FOLLOWUPS]`.
- **Clarify turn:** when the domain is known but the area is missing, the server writes the reply:
  bullet questions followed by `[FOLLOWUPS]` (`actionability.ts:195-196,289-295`; `route.ts:1685`).
- **Chitchat and confirmation:** these are no-tool turns with `maxSteps:1` (`route.ts:1411,2211`).
- **News, weather, gold, `web_search`:**
  - streamed live and not buffered, unless ticket, commerce or risk-buffer words are present;
  - on the live path the server strips scaffolding tags and releases only links and images it can
    prove came from tools (`streamEnrichment.ts:1620`, `:2860-2877`);
  - no card and no `[CTA_BUTTONS]` (`promptBuilder.ts:501`);
  - `[FOLLOWUPS]` optional.
- **Recommendation turns:** at most 3 option lines; the pick comes first.

---

## 5. Android offline test (replaying a saved stream)

**Planned storage.** Raw golden-set turns will be stored at
`gs://tappyai-uat-evidence/evidence/<SHA>/golden-raw/`. Nothing has been uploaded yet, so this is the
format to expect:

- `<suite>-<caseId>-t<n>.stream.txt`: the **exact response body bytes** of `/api/chat`, not re-encoded. It is UTF-8
  and uses `\n` line endings.
- `<suite>-<caseId>-t<n>.json` (records which `x-tappy-surface` the turn was run with — the baseline run used the web client shape), with this shape:
  ```json
  { "sha": "<git sha of the server>", "request": { "url": "...", "method": "POST",
      "headers": { "x-tappy-surface": "android", "accept-language": "vi" }, "body": { "messages": [] } },
    "response": { "status": 200, "headers": { "X-Decision-Evidence-Id": "…", "content-type": "…" } } }
  ```
  Never store `authorization` or `cookie`.

**Replay procedure:**
1. Feed the `.stream.txt` bytes into the same line parser production uses (`ChatStreamFrames.kt`). Split on
   `\n`, strip an optional `data: ` prefix, and dispatch on the text before the first `:`.
2. Assert the following:
   - (a) The concatenated `0:` text equals the stored message content, markers included.
   - (b) After stripping, no `[TAPPY_*]`, `[CTA_BUTTONS]` or `[FOLLOWUPS]` text is visible, including
     text that comes after a block (the ask-after case).
   - (c) The card renders from the **last** `tappy.places.v1` frame, and `picked[0]` is card 1.
   - (d) Button labels come from `labelKey`. A `urlKind:"search"` action never shows a
     booking/ordering verb.
   - (e) Unknown `8:` kinds, `9:`, `a:`, `f:` and `e:` frames are ignored without error.
   - (f) A `3:` frame shows the error state.
3. Replaying with no header, or with `web`, changes only the prose (§1.1). Compare the `.json`
   `x-tappy-surface` before diffing.
