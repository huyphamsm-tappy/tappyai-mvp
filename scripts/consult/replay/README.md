# Offline replay — chat route

Owner rule (2026-09-29): fix and test by **offline replay**. Never against UAT or production.

The suite imports the real `POST` from `src/app/api/chat/route.ts` and drives multi-turn conversations
through it with the **real model** (Anthropic, Haiku defaults) and the **real tool modules**.
Supabase, auth (signed-in `u1`), age (eligible), rate limit are mocked like
`memoryDrift.route.test.ts` / `consultativeV1.route.test.ts`. No memory row. Quota is reset every turn.

## Run

```sh
REPLAY=1 REPLAY_SUITE=scenarios npx vitest run scripts/consult/replay
REPLAY=1 REPLAY_SUITE=scenarios REPLAY_ONLY=ENT-1,SPA-1 npx vitest run scripts/consult/replay
REPLAY=1 REPLAY_SUITE=firstTurns npx vitest run scripts/consult/replay
REPLAY=1 REPLAY_SUITE=owner59 REPLAY_ONLY=F1,F5 npx vitest run scripts/consult/replay
REPLAY=1 REPLAY_SUITE=all npx vitest run scripts/consult/replay
```

(PowerShell: `$env:REPLAY='1'; $env:REPLAY_SUITE='scenarios'; npx vitest run scripts/consult/replay`.)

| env | meaning |
|---|---|
| `REPLAY=1` | required; without it the file is skipped (so `npm test` never pays) |
| `REPLAY_SUITE` | `scenarios` · `firstTurns` · `owner59` · `all` · comma list. Required — nothing runs without it |
| `REPLAY_ONLY` | comma list of ids (`ENT-1`, `IE-007`, `F5` …) |
| `REPLAY_NO_RECORD=1` | fully offline: a Serper miss is answered `{}` and counted as `missing` |
| `REPLAY_STRICT=1` | fail the vitest test on any criteria failure (default: fail only on a crash) |
| `REPLAY_ENV_FILE` | audit env file (default: the g1-place-guard `.env.local`) |
| `REPLAY_OWNER59_MANIFEST` | override for the owner review manifest |
| `REPLAY_TURN_TIMEOUT_MS` | per-turn timeout (default 180000) |

## What is real, what is not

- **Keys**: only `ANTHROPIC_API_KEY` and `SERPER_API_KEY` are read from the audit env file, into
  `process.env`, never printed. The run refuses unless the file's `NEXT_PUBLIC_SUPABASE_URL` names the
  audit ref `zdaprdfgpbpnxyofagmc`. KV/Upstash vars are deleted (shared Serper cache off).
- **Network** (`lib/serperReplay.ts`, a stub on `globalThis.fetch`):
  - `google.serper.dev` → `recordings/<sha1(url+body)>.json`. A hit is served from disk; a miss calls
    the real Serper once and saves the answer. Commit-worthy: the recordings make later runs offline.
  - `api.anthropic.com` → passed through.
  - anything else → `{}` with status 200, no network (counted per host in `raw/*.json` → `net.stubbed`).
- **Flags**: `CONSULT_V2=1 CONSULTATIVE_V1=1 SNIPPET_PRICE_GUARD_V2=1 MEDIA_PLACEMENT_V2=1`.
- **Request**: headers `x-tappy-surface: web`, `accept-language: vi`; body
  `{messages, userLocation:{lat:10.7769,lng:106.7009,address:'Quận 1, TP.HCM'}}`. The assistant
  history is the reply text exactly as streamed (markers included), as the web client keeps it.
- **Serper counts**: the route's meter (`serperCalls` in the `tappy.turn.v1` annotation, and its `usd`)
  counts every call, replayed or not. The harness reports `real` / `replayed` / `missing` separately.
- Placeholders `{pick}` / `{alt}` take the latest reply that had a `Mình chọn` pick, and its first
  alternative line. An unresolved placeholder fails the turn (`placeholders`).

## Output

`out/<suite>-<timestamp>/` (git-ignored):
`summary.md` (cost, aggregates, failures, every turn with its reply) · `results.json` (all rows) ·
`raw/<conv>-t<n>.json` (the full data stream, parsed frames, route `tappyai_*` log events) ·
`usage.jsonl` (the route's own AUDIT_USAGE_LOG_FILE records: token sections per turn).

## Criteria (owner §9) — `lib/criteria.ts`

The turn type checked is the scenario's `expect`; for `firstTurns`/`owner59` it is the server's
`turnType`. `turn_type_matches` is reported but informational.

| type | checks |
|---|---|
| all | `no_crash`, `annotation` present, `never_phrases` ("không có chức năng", "chưa hỗ trợ tìm") |
| ask | `[TAPPY_ASK]` with 2–3 questions, each ≥2 options; `serperCalls == 0` |
| pick / more / reject | exactly one `Mình chọn`; ≤2 `- **Name**:` alternatives; `Mình còn N lựa chọn` when the tool rows (from `a:` frames) exceed the names shown; `[FOLLOWUPS]` with `Xem thêm` and `Lên kế hoạch chi tiết` |
| more | `serperCalls` reported; new pick vs. shown names reported (info) |
| reject | the main pick is not a name shown earlier in the conversation |
| followup / compare | `serperCalls == 0`; compare contains `Mình chọn` |
| plan | every `PLAN_HEADINGS[area]` heading present; ≥2 lines under the `Mẹo…` heading (spa has none → `Lưu ý`); a cost arithmetic sign (`×`, `÷`, `=`) |

Cost: per turn `usd`, `tokensIn/Out`, `serperCalls` aggregated by area, turn type and both; a 6-turn
session (ask→pick→followup→compare→more→plan at each type's observed mean); 900 turns/month at the
observed turn-type mix.

Conversations run one at a time: the route's Serper meter is process-global, so parallel turns would
corrupt each other's counts.
