# ADR-026 — Reporter provenance in the moderation queue

**Status:** Accepted — Owner Decision B, 2026-08-21
**Supersedes:** nothing
**Required by:** `00_Constitution.md` §8.2 — a resolution between two conflicting authorities is a Design Change and needs an ADR.

## Context

Module 09 needs a moderation queue. `04_Database_Architecture.md` §4.4 defines one, and it stores the reporter:

```sql
reported_by  UUID REFERENCES profiles(id) ON DELETE SET NULL
```

Two report tables already exist in production and are the only real sources a queue could have:

| Table | Created by | Reporter identity |
|---|---|---|
| `music_track_reports` | `20260711_music_ugc_combined.sql` | `reporter_id UUID REFERENCES auth.users(id)` — the raw id |
| `content_reports` | `20260817_content_safety_gate.sql` | `reporter_source_id TEXT` — **opaque and non-reversible; the raw id is deliberately absent** |

`content_reports` states its own reasoning in its column comments:

> *Opaque non-reversible source identifier. Distinguishes reporters; identifies none. The raw user id is intentionally not stored.*

and, on why there is no SELECT policy at all:

> *a report set is a map of who reported whom*

So a reporter cannot read back even their own report, and the raw identity does not exist anywhere to be recovered.

**The conflict is about a privacy property, not a schema detail.** `04` §4.4 wants an identity that `content_reports` was deliberately built not to have — and could not supply even if asked, because the derivation is one-way.

## Decision — Owner Decision B, 2026-08-21

For a report originating in `content_reports`:

1. **`moderation_queue.reported_by` is `NULL`.** The raw reporter id is not stored, not derived, and not looked up.
2. **`reporter_source_id` is carried into `moderation_queue.metadata`** as an opaque provenance identifier.
3. The Content Safety Gate's schema and privacy contract are **unchanged**. No column is added to `content_reports`, and no reverse path from `reporter_source_id` to an auth user is created anywhere.
4. `metadata.reporter_source_id` exists to **distinguish and corroborate sources**. It must not be used to infer or reconstruct a real identity.
5. It is **never exposed to an end user**, and is not returned by any public API.

For a report originating in `music_track_reports`, the existing contract is unchanged: **`reported_by` carries the real reporter UUID**, because that table stores it and always has.

## Why B rather than the alternatives

**A — leave `reported_by` NULL and carry nothing.** Preserves anonymity equally, but throws away the one signal the gate deliberately kept. `content_reports` has `UNIQUE (content_id, reporter_source_id, reason)` precisely so *"duplicate submissions must not manufacture corroboration"*. A moderator who cannot tell two sources apart loses that protection at exactly the moment it matters: five reports from one person look like five people.

**C — store raw reporter ids in the gate.** Reverses a shipped, deliberate privacy design, and would require re-collecting identity the system chose not to hold. Rejected.

**B costs nothing that A preserves and restores what A discards.** The queue learns that two reports came from different sources without learning who either source is.

## Consequences

- `moderation_queue.reported_by` is **nullable by design**, and a NULL there is a fact about the *source*, not missing data. §4.4 already declares it nullable.
- The ingestion path must never join `content_reports` to `profiles` or `auth.users`. There is nothing to join on, and a future column that made one possible would break this ADR.
- `metadata` is service-tier only. `moderation_queue` is revoked from `anon` and `authenticated` (ADR-019) and reached solely through the PDP, so `reporter_source_id` cannot leave the server by the table's own access rules.
- An API that returned `metadata` verbatim would leak the provenance id to any client permitted to read the queue. The queue API therefore projects an explicit column list and **excludes `metadata`**; a moderator-facing "distinct sources" count is derived server-side.

## Invariants, each machine-checked

| # | Invariant |
|---|---|
| I-1 | A queue row ingested from `content_reports` has `reported_by IS NULL` |
| I-2 | A queue row ingested from `music_track_reports` has `reported_by` = the real reporter id |
| I-3 | The ingestion function contains no reference to `profiles` or `auth.users` on the `content_reports` path |
| I-4 | `content_reports` gains no column and loses no policy |
| I-5 | No API response and no audit entry contains `reporter_source_id` |
| I-6 | `anon` and `authenticated` hold no privilege on `moderation_queue` |

## Status of the surrounding work

`content_reports` **currently has no writer anywhere in `src/`** — the table and its INSERT policy exist, but the reporting surface that would fill it was never built. `music_track_reports` does have a live writer. The ingestion contract above covers both sources as specified; only the music path produces rows today. That is recorded here so a later reader does not mistake an empty content-safety branch for a broken one.
