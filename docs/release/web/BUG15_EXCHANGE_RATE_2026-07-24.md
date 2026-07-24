# Bug #15 — Exchange Rate precision — Production Release Notes

- **Date:** 2026-07-24
- **Commit:** `16a8e56` (ff-merge of `preview/exchange-rate-precision` → `main`)
- **Live:** `GET /api/version` → `{"v":"16a8e56…"}`
- **Deployment risk:** low — no DB migration, no schema/API-contract/storage/auth change. Client-side formatting + a pure conversion helper.

## Symptom

Some pairs displayed a wrong unit rate — e.g. **"1 VND = 0,0000 USD"** — for weak→strong
conversions (VND→USD/EUR/GBP/SGD/TWD). The main converted amount was correct; only the
rate-info lines were wrong.

## Root cause

`currency/page.tsx` formatted the two unit-rate lines with the **target currency's display
decimals** (`toCur.decimals > 0 ? 4 : 2`). When one unit of the source is worth a tiny
fraction of the target (~3.8e-5), that rounded to `0,0000`. The conversion math and the
main result were always correct.

## Fix

- **New `src/lib/finance/format.ts`** — reusable finance formatting (`formatAmount`,
  `formatRate`). `formatRate` scales fraction digits by magnitude (≥100→2, ≥1→4, <1→4
  significant digits) so a non-zero rate **never renders as 0**.
- **New `src/lib/finance/exchange.ts`** — `crossRate()` throws `MissingCurrencyError`
  instead of silently using `1` when a currency is absent/invalid (replaces `rates[x] || 1`).
- **`currency/page.tsx`** — uses the finance library, surfaces a user-friendly
  missing-rate error (`currency.missingRate`, vi/en), removed dead code
  (`fromUSD`/`toRate` + redundant if/else).

## Production smoke tests (2026-07-24, live render verified via browser)

| Pair | Main amount (1,000,000) | Unit-rate line | Result |
|------|-------------------------|----------------|--------|
| VND→USD | 38,09 USD | `1 VND = 0,00003809 USD` | ✅ not 0 |
| USD→VND | 26.250.538.817 VND | `1 VND = 0,00003809 USD` | ✅ |
| KRW→USD | 678,19 USD | `1 KRW = 0,0006782 USD` | ✅ not 0 |
| JPY→USD | 6.109,03 USD | `1 JPY = 0,006109 USD` | ✅ not 0 |
| TWD→USD | 30.906,17 USD | `1 TWD = 0,03091 USD` | ✅ not 0 |
| EUR→VND | 29.891.469.226 VND | `1 VND = 0,00003345 EUR` | ✅ not 0 |

- ✅ No exchange rate displays 0 when the actual value is non-zero (all 6 pairs).
- ✅ Main converted amount correct on every pair.
- ✅ Missing-currency guard: unit-tested (`crossRate` throws `MissingCurrencyError` for
  IDR — never returns 1); the `currency.missingRate` error branch is wired in the deployed
  page. Not reachable through the production UI because all 12 selectable currencies are
  always present in the payload.
- ✅ No console errors (checked on the live page).
- ✅ No server errors (`/api/rates` 200, `/currency` 200; API contract unchanged).

## Test / build

213/213 unit tests pass on `16a8e56` (+12: `formatRate` never-zero for the failing pairs;
`crossRate` correctness across VND/JPY/KRW/TWD/USD + IDR missing-currency throw). Build clean.
Regression suites `src/lib/finance/format.test.ts` + `exchange.test.ts` are permanent.

## Status

**Bug #15 — RESOLVED (production, owner-directed release, 2026-07-24).**
