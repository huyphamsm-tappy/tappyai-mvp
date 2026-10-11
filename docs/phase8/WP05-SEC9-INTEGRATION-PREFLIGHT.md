# WP-05 (C1–C3) and SEC9 — local integration preflight (2026-10-09) — STOPPED, nothing cherry-picked

Target: `p8/agent-runtime` @`89fbea5` (main `f9f2b12` lineage + the Agent Runtime work). Sources: `dbc41e5` (P8-02, C1–C3 and more) and `c3db9ba` (P8-01, the registry + the SEC9 code), both on `phase8-master` / `sec/phase8-hardening` @`d1c8208`, merge-base with the target `d7a830d`. Method: both commits were dry-run (`cherry-pick -n`) in a throwaway worktree that has been removed; the real tree was never touched. Result: the preflight is **not clean** → per the owner's rule, stop and report; no migration was improvised and no contract changed.

## 1. dbc41e5 (C1–C3) — not applicable as a commit
| Hunk | Item | Dry-run | Note |
|---|---|---|---|
| `route.ts` (memory prompt → `memoryMessageText`) + `costWins.ts` + flag `p8_cost_memory_text` | **C1** | applies | needs `costWins.ts` → imports `p8Enabled` from `src/lib/p8/flags` |
| `scam-shield/cache/redisCache.ts` (read `KV_*` too) + `costWins.scamCacheRedisEnv` + flag `p8_cost_scam_cache_kv` | **C2** | applies | same prerequisite |
| `20261005_p8_cost_indexes.sql` + rollback + `supabase/tests/p8_cost_indexes.test.ts` | **C3** | files apply | the test imports `startP8Db`/`loadProdSchema` from `p8Harness` — a file that exists in the target with a DIFFERENT content (from the Phase 7 subscription work) and in P8-01 (add/add conflict); manifest entry and order check still to do |
| `common.ts`: Places photo-URI mode (`p8_cost_places_photo_uri`) and `serperSearchTtlMs` (`p8_cost_serper_ttl`) | not C1–C3 (a photo cost item, and **C5 = "Serper TTL P8", listed in the Phase 8 document as already absorbed**) | **CONFLICT** with the Serper cost-control work in `common.ts` | must not come in |
| `messaging/media.ts` (`p8_cost_signed_url_window`) | not C1–C3 | **CONFLICT: file deleted in the target** (the Messenger media module, P8-06, is not in this line) | must not come in |
| `PHASE8_MASTER.md` | doc | CONFLICT (deleted in the target) | |
Prerequisite missing: **`src/lib/p8/flags.ts`** (the flag registry, created by `c3db9ba`).

## 2. c3db9ba (P8-01, carries SEC9) — not applicable as a commit
44 files; the dry run conflicts in **11 files** (`auth/anonymous/route.ts`, `profile/route.ts`, `reviews/upload/route.ts`, `upload/audio/route.ts`, `accountStatus.ts`, `media/providers/gcs.ts`, `media/types.ts`, `media/uploadCompletion.ts`, `supabase/tests/p8Harness.ts` (add/add), plus `PHASE8_MASTER.md` and `auth/zalo/complete/route.ts` deleted in the target). It bundles items the Phase 8 document says are already absorbed or removed: the P8 limiter (`limiter.ts`), the Zalo identity binding, the account-status fail-closed flag, plus two P8 migrations (`20260924_p8_group_roster_privacy`, `20260924_p8_ugc_column_guard`), `supabase/config.toml`, group routes and TTS limit changes.
**SEC9 inside it** (the part that is wanted): flags `p8_upload_content_verify` (magic bytes of client-direct uploads against the declared type) and `p8_strip_exif` (metadata strip for client-direct photos), implemented in `uploadCompletion.ts` (hooks at the tip: `p8Enabled('p8_upload_content_verify')`, `p8Enabled('p8_strip_exif') && sniffableRaster(...)`, using `sniffImageType` that the target already has) + `stripMetadata.ts` (+ test) + small `gcs.ts`/`types.ts` changes + `uploadCompletion.p8.test.ts`. This covers the **client-upload path**. Both flags are DEFAULT OFF in the registry (`p8Enabled` is true only for `'1'`/`'true'`), so integrating them would not enable anything. Later P8 commits (`23f157d`, `48decc4`, `4510501`, `8c30294`, `059e51a`) also touch the same media files (Messenger media, user safety, rc merge, clean-up), so no single commit isolates SEC9.

## 3. Exact blockers
1. The flag registry is not in the target and exists only inside the 44-file `c3db9ba`.
2. `dbc41e5` is wider than C1–C3 (C5, a photo item, signed-URL window) and two of its hunks conflict / hit a module that is absent.
3. SEC9 cannot be isolated as a commit; extracting it means hand-merging `uploadCompletion.ts`, `gcs.ts`, `types.ts` with the Phase 7 UP-3 versions already in the target.
4. `p8Harness.ts` differs between the lines (add/add).
5. The official acceptance criteria for SEC9 and C1–C3 are not in any readable file (`PHASE 8.docx` names them only), so "covers the required scope" cannot be proven; the mapping is inferred (SEC9 = client-direct magic-byte verification; C1 = memory text; C2 = scam cache on KV; C3 = indexes).

## 4. Options for the owner (pick one; each is a separate local task)
- **A. Port by path, not by commit (recommended).** One reviewed local commit that carries ONLY: a trimmed registry with 4 flags (`p8_upload_content_verify`, `p8_strip_exif`, `p8_cost_memory_text`, `p8_cost_scam_cache_kv`, all default OFF); `stripMetadata.ts` (+test), the two `uploadCompletion.ts` hooks, `uploadCompletion.p8.test.ts`; `costWins.ts` reduced to `memoryMessageText` and `scamCacheRedisEnv`, the `route.ts` memory hunk, `redisCache.ts`; the C3 migration + rollback + test (using the target's harness or adapting the test to it) + a `MIGRATION_ORDER.txt` line. This hand-merge is a scope decision and needs the owner's OK.
- **B. Cherry-pick whole commits** (`c3db9ba`, then `dbc41e5`) and resolve the 11 conflicts of the first plus about 2 more in the second (estimate from the dry runs), then remove the duplicates the document lists — larger and riskier.
- **C. Defer** until the Phase 8 integration branch is chosen (the Agent branch is web-only, based on main).
After A or B the checks to run: `migrationOrder.test.ts`, the security suites, `uploadCompletion.p8.test.ts`, `costWins.test.ts`, the real-Postgres `p8_cost_indexes.test.ts`, tsc, lint, the full suite.

## 5. Evidence that the code itself works (on its own branch, not integrated)
`sec/phase8-hardening@d1c8208`: `limiter.test.ts`, `uploadCompletion.p8.test.ts`, `auditChainInvariants.test.ts` = 29 pass; `costWins.test.ts` = 8 pass; real-Postgres `p8_cost_indexes.test.ts` = 4 pass.
