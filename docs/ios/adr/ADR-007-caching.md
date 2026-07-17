# ADR-007 — Caching

**Status:** Accepted · **Date:** 2026-07-10

## Context
The app is server-driven; rules, prices, quotas, and entitlements must always be fresh (`14`). But feeds, catalogs, and images benefit from caching for performance and connectivity.

## Decision
Cache **presentation data only**: feed pages, music catalog, images, place cards, recommendations (short TTL). **Never cache decisions** — quota/limit results, entitlement/Pro status, pricing math, moderation, ranking inputs are always fetched fresh from the server. Use **URLCache** for HTTP GETs where appropriate, an image cache with downsampling, and an optional lightweight on-disk cache (SQLite/Core Data) for the feed's first page and catalog. Cache is a performance/offline affordance, not a source of truth. Respect `Cache-Control` from the backend where present.

## Alternatives Considered
- **Aggressive full-content offline DB** — rejected: risks stale rules/prices and drift; only presentation data is cached.
- **No caching** — rejected: poor perf on the image/video-heavy feed and flaky networks.

## Consequences
- Fast, resilient UI without risking rule/price staleness.
- Requires clear separation in code between "cacheable presentation" and "always-fresh decision" calls.

## Future Evolution
Tune TTLs from telemetry; add prefetch for the next feed page. If the backend adds ETags, adopt conditional requests.
