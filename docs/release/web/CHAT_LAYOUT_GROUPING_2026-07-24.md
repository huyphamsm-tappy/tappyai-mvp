# AI Reply Layout — position-aware place enrichment — Production Release Notes

- **Date:** 2026-07-24
- **Commit:** `0cdc9be` (ff-merge of `preview/chat-layout-grouping` → `main`)
- **Live:** `GET /api/version` → `{"v":"0cdc9be…"}`
- **Deployment risk:** low — only `src/lib/ai/streamEnrichment.ts` changed. No DB/schema/API-contract/auth changes.

## Regression fixed

Place recommendations rendered all prose first, then every photo piled in one
trailing `📸 Hình ảnh & link review` block at the bottom. Root cause: the
deterministic image backfill appended omitted photos as a single end-of-message
block, and `formatMessage` renders markdown top-to-bottom.

## Fix (scope: only streamEnrichment.ts)

`injectPlaceEnrichment(places, fullText)` rebuilds the assistant text with each
place's still-missing photo / review / order-link markdown spliced in immediately
after that place's block (snap to the next place's header line; last place → before
CTA / end). Positions are found with index-preserving `normalizeVN` (diacritic
tolerant); a length-mismatch guard falls back to the legacy trailing block. The
stream filter buffers only the text after a place-search tool call and re-emits it
repositioned at `d:`; pre-tool intro and chitchat still stream live. All existing
dedup / normalization / carousel logic preserved.

## Production UAT (2026-07-24, live `/api/chat` capture)

Query "3 quán cà phê đẹp quận 1" → reconstructed displayed text structure:

```
1. Tonkin Specialty Coffee → rating → IMG → review → ShopeeFood · GrabFood · BeFood
2. rêu.coffee              → rating → IMG → review → ShopeeFood · GrabFood · BeFood
3. Beanthere Cafe          → rating → IMG → review → ShopeeFood · GrabFood · BeFood
```

| Check | Result |
|---|---|
| Every place: Name → Info → Image → Review link → Order/Booking link | ✅ grouped |
| No trailing "📸 Images & Reviews" section | ✅ (`hasTrailingBlock: false`) |
| No duplicated images | ✅ (3 images / 3 places) |
| No duplicated links | ✅ (each order link once per place) |
| Vietnamese diacritic names matched | ✅ (rêu.coffee, Hồ Hảo Hớn positioned right) |
| Product / hotel path still works | ✅ ("tai nghe Sony" → valid Shopee links, no break) |
| finishReason | `stop` (complete, not truncated) |

Carousel: `formatMessage` unchanged; multi-photo places still emit consecutive
image lines (unit-tested) that it groups into a swipe strip.

## Streaming UX tradeoff (owner decision)

Repositioning needs the full text, so the place-list portion is buffered and
appears at the end of generation instead of typing out live (intro + chitchat +
the "searching" indicator still stream live). Per owner: if acceptable → resolved;
if it noticeably hurts UX → keep production (do NOT revert) and open a follow-up
"Streaming Positional Injection" (streaming boundary-interleave variant).

## Test / build

222 unit tests pass on `0cdc9be` (+11 for this change: multiple places, dup photos,
dup links, VN diacritics, missing photos, missing review links, carousel, CTA
boundary, no-op, 2 transform E2E). Build clean.

## Status

Functional UAT: PASS. **Resolve vs follow-up pends the owner's streaming-UX observation.**
