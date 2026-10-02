# CLEANUP PLAN — 2026-09-18 (STEP G, overnight job) — PLAN ONLY, NOTHING DELETED

Rules: every branch tip was tagged `archive/<branch>-2026-09-17` in STEP 0 (381 tags), so DELETE means "the ref is
recoverable from its tag". ARCHIVE means keep the tag, drop the working copy / branch pointer later. KEEP means the
V3 line or unmerged owner work. `git branch --merged origin/main` is the SSOT for "merged" (131 merged, 264 not).

## Summary
| bucket | branches | worktrees |
|---|---|---|
| ARCHIVE | 236 | 64 |
| DELETE (after tag) | 130 | 0 |
| DELETE (worktree dir) | 0 | 21 |
| KEEP | 12 | 6 |
| KEEP (until merged) | 18 | 0 |

## Non-git artefacts
| item | verdict | why |
|---|---|---|
| `.claude/launch.json` entries `audit-nonprod`, `audit-flags-on` (v3-phase4-design worktree) | KEEP | the audit runtime (:3101) and the flags-on variant used by STEP D/F |
| `.claude/launch.json` entries `audit-nonprod-3410`, `audit-flags-on-3410` | DELETE | port-3410 duplicates from a session that had :3101 busy; never used tonight |
| `hookv3.py` capture hook (uncommitted, audit-nonprod worktree) | ARCHIVE → `docs/audit/` then remove | pre-guard capture for the G1/G2 replay; the replay JSONs already live in `docs/audit/` (untracked there) |
| `docs/audit/capture-main/`, `capture-v3/`, `g1-replay*.json`, `g2-replay*.json`, `g3-render/`, `_untracked-before-2cfa09d/` (untracked in audit-nonprod worktree) | ARCHIVE (commit to a docs branch or zip) | replay evidence for the G1/G2/G3 decisions; not needed at runtime |
| scratchpad eval runners (`eval40.mjs`, `andeval.py`, `clearmem2.mjs`, `remint.mjs`, `shotchat.mjs`) | KEEP → copied to `scripts/audit/` tonight | re-runnable; read the audit `.env.local` at runtime, print no secret |
| `docs/audit/eval/runs/pass1/`, `pass2/` | ARCHIVE | superseded raw runs, kept for the before/after diff |
| `docs/audit/overnight/stepC/profile-v2-notmerged/*.txt`, `g1-growth-wip-notmerged.patch`, `ShoppingParityTest.kt.notmerged` | KEEP until the owner decides on profile-v2 / g1-growth | the only copies of the parked work outside their wip branches |
| emulator AVD `Pixel_8_uat` (emulator-5558) + `~/.android/avd` | KEEP | 2 debug guest identities used; `pm clear` resets |
| `android/app/build/outputs/apk/debug/app-debug.apk` (base URL 10.0.2.2:3101) | ARCHIVE | audit build; rebuild from `gradle-audit.properties` when needed |
| `C:/wt*` and `~/Claude/Projects/TappyAI/tappyai-*` worktree dirs on merged branches | DELETE (dirs) | see the worktree table; each is a full checkout (~1–2 GB with node_modules) |

## Worktrees (91)
| path | branch | HEAD | verdict | why |
|---|---|---|---|---|
| `D:/Claude/Projects/TappyAI/tappyai-mvp` | `feat/consultative-d1-d2-r1-r2-d3` | `77b0bb7` | KEEP | active overnight / V3 worktree |
| `C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/bug011-location-scope` | `fix/bug-011-destination-scope` | `cc9ef8b` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/c3b10-2-verify` | `fix/c3b10-2-money-guard` | `3b45001` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/ctrl-v2-final` | `feat/controller-v23-login` | `ecb6d62` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/ctrlfixture` | `fix/controller-suspend-fixture-expiry` | `587921c` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/phase0-hardening` | `fix/phase0-production-hardening` | `0e9a31e` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/v3-integration` | `integration/v3-foundation` | `2caff4b` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/v3-phase1-ai-consultative` | `feat/v3-ai-consultative` | `ff55c27` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/.worktrees/v3-phase3-security` | `security/v3-phase3` | `a711181` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-android-integration` | `feat/android-anonymous-chat-on-main` | `27b3cfb` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-android-rc` | `v2/android-rc-build` | `8cb9cc6` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-android-uat` | `uat/android-release-fixes` | `772e6b0` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-anon-android` | `feat/anonymous-chat-android` | `155767a` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-anon-chat` | `feat/anonymous-chat-backend` | `aa3bf00` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-consult` | `fix/consultative-quality-round1` | `b933058` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-consultative` | `feat/consultative-v2-ranking` | `207658b` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-controller-v2` | `feat/controller-v2-foundation-integration` | `3a15fc4` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-d3` | `feat/consultative-d3` | `8feaed6` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-deals-i18n` | `feat/deals-i18n` | `ab6c716` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-f08` | `feat/controller-v2-f08` | `5c69bf4` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-games-repro` | `release/android-games-hidden-clean` | `3ad7980` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-i18n-recover` | `feat/account-settings-i18n` | `4387d25` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-ios-rc` | `release/v2-ios-rc` | `54e8999` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-ios-sprint` | `feat/backoffice-phase0` | `3516bce` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-label` | `fix/controller-shell-terminology` | `9b83ff6` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-langfix-vi` | `chore/android-target-sdk-36` | `2ac7afc` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-loginfix` | `fix/login-return-to-param` | `08a461c` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-m08` | `feat/controller-v2-k3-event-sink` | `5e50e5a` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-memberapi` | `docs/controller-v2-phase2-m08-migration-artifact` | `d8412a8` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/adoring-stonebraker-13f20e` | `claude/ecstatic-mclaren-c5aa0e` | `ff0480e` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/cool-vaughan-b3c7ff` | `claude/admiring-euler-fd4c48` | `43ebadf` | KEEP | active overnight / V3 worktree |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/eloquent-diffie-cb87f5` | `feat/v3-qr-profile` | `4e3673d` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/gcs-media-bridge` | `rca/place-id-flow` | `4a849e8` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/modest-roentgen-d36e92` | `claude/exciting-hertz-2b213e` | `17400c4` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/v3-phase4-design` | `design/v3-phase4` | `f6712b8` | KEEP | active overnight / V3 worktree |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-notif` | `feat/notif-unification-impl` | `8a1be53` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-optionb` | `feat/controller-v2-option-b` | `92739c1` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-privacy-play` | `fix/legal-back-navigation` | `73c126c` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-r2` | `fix/consultative-round2-finalize` | `e366cf6` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-rc` | `release/v2-rc` | `4117f1d` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-release` | `fix/android-plan-item-name-wrap` | `33d13ed` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-release-vc7` | `release/android-vc7` | `a4defa9` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-safety` | `safety/explore-moderation-audit` | `df385eb` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-scamfix` | `fix/scam-shield-inconclusive` | `68d34db` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-sec-next` | `security/next-14.2.35` | `7fa2c31` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-secfix` | `fix/platform-owner-revoke-public` | `3219e7f` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-settings-delete` | `feat/settings-delete-account-link` | `185814e` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-stabilization` | `fix/web-production-stabilization` | `4ecd74d` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-supertux` | `fix/supertux-preload-removal` | `a04c52a` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-telemetry` | `feat/chat-stage-telemetry` | `6c29826` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-v2-recon` | `main` | `3e23586` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-v2fix` | `feat/consultative-decision-experience` | `933da94` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/Users/Admin/Claude/Projects/TappyAI/tappyai-web-release` | `fix/spec-guard-lone-connector` | `4dce9cb` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `C:/wt404` | `fix/deleted-review-404` | `23999bc` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wta5` | `chore/remove-temp-diag` | `e2bd84f` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtandroid` | `fix/android-scan-gallery-decode` | `e621f7f` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtbroadcast` | `feat/phase-c-broadcast` | `cb6e0bd` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtclip` | `fix/notification-clip-context` | `d1a1d7c` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtcta` | `fix/web-cta-marker-leak` | `5d4fa20` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtctrl24` | `feat/controller-v24-login` | `ca8bfd2` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtdocs` | `docs/controller-v2-status-sync` | `3453edb` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtdq` | `feat/consultative-decision-quality` | `2319603` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtfix` | `fix/optimistic-state-rollback` | `af87c56` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtios` | `ios/marker-leak-parity` | `883be30` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtlike` | `fix/like-list-count-click` | `5424e7e` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtmusic` | `fix/ios-music-library-entry` | `0321ae0` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtobs` | `feat/gcp-observability` | `3598864` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtorigin` | `fix/controller-origin-gate` | `eb3b9c4` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtperf` | `fix/og-share-card-otter-logo` | `97f02ff` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtphasec` | `docs/phase-c-broadcast-contract` | `832743c` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtpush` | `fix/push-credential-ownership` | `06e7ef0` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtpush2` | `fix/push-identity-reconcile` | `0bc4aaf` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtrecord` | `docs/marketing-phase2-progress` | `393218a` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtssrf` | `guard/ai-image-url-ssrf` | `d74e553` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtstatus` | `docs/status-production-revision` | `3a577c7` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtuat` | `(detached)` | `7deee03` | ARCHIVE | detached HEAD — record the SHA, then remove the worktree |
| `C:/wtux` | `fix/login-return-and-touch-target` | `9649e9c` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `C:/wtvid` | `fix/canonical-video-viewer` | `534d50d` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `D:/Claude/Projects/TappyAI/.worktrees/affiliate-xplat` | `feat/affiliate-cross-platform` | `475f31c` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `D:/Claude/Projects/TappyAI/.worktrees/ccp-canonical` | `feat/ccp-canonical` | `4b84aa9` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `D:/Claude/Projects/TappyAI/.worktrees/ccp-mvp` | `feat/ccp-mvp` | `56a5726` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `D:/Claude/Projects/TappyAI/.worktrees/g1-growth` | `feat/g1-growth` | `8a01877` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `D:/Claude/Projects/TappyAI/.worktrees/tappy-business-p0` | `feat/tappy-business-p0` | `23f5e30` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `D:/Claude/Projects/TappyAI/.worktrees/v3-user-data-foundation` | `feat/v3-user-data-foundation` | `08a6aed` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `D:/Claude/Projects/TappyAI/.worktrees/web-uat-rc` | `rc/web-uat` | `b0896e7` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/audit-nonprod` | `(detached)` | `a7faf54` | KEEP | active overnight / V3 worktree |
| `D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/determined-knuth-609039` | `(detached)` | `842379b` | ARCHIVE | detached HEAD — record the SHA, then remove the worktree |
| `D:/Claude/Projects/TappyAI/tappyai-mvp/.claude/worktrees/g1-place-guard` | `merge/main-into-v3` | `6eabd3b` | KEEP | active overnight / V3 worktree |
| `D:/Claude/Projects/TappyAI/tappyai-places-contract` | `fix/places-marker-contract` | `d675990` | ARCHIVE | branch not merged; keep the branch (tagged), remove the worktree dir once `git status` is clean |
| `D:/Claude/Projects/TappyAI/tappyai-shopping-contract` | `fix/shopping-marker-product-identity` | `b85ddd9` | DELETE (worktree dir) | branch fully merged into origin/main; check `git status` is clean first |
| `D:/Claude/Projects/TappyAI/tappyai-v3-canonical` | `integration/v3-canonical` | `c1e1227` | KEEP | active overnight / V3 worktree |

## Branches (396)
| branch | verdict | why |
|---|---|---|
| `arcade-v2/android` | ARCHIVE | not merged into main; tag exists |
| `arcade-v2/web` | ARCHIVE | not merged into main; tag exists |
| `audit/anon-eligibility` | DELETE (after tag) | fully merged into origin/main; tag present |
| `audit/c14-discovery` | DELETE (after tag) | fully merged into origin/main; tag present |
| `audit/db-access-docs` | DELETE (after tag) | fully merged into origin/main; tag present |
| `audit/final` | DELETE (after tag) | fully merged into origin/main; tag present |
| `audit/k3-baseline` | DELETE (after tag) | fully merged into origin/main; tag present |
| `audit/marketing-discovery` | DELETE (after tag) | fully merged into origin/main; tag present |
| `audit/v22-readonly` | DELETE (after tag) | fully merged into origin/main; tag present |
| `backup/ios-windows-sprint-pre-rebase` | ARCHIVE | not merged into main; tag exists |
| `backup/pre-scrub-v1` | ARCHIVE | not merged into main; tag exists |
| `bl002/audit` | DELETE (after tag) | fully merged into origin/main; tag present |
| `blob-cleanup` | ARCHIVE | not merged into main; tag exists |
| `chore/android-target-sdk-36` | ARCHIVE | not merged into main; tag exists |
| `chore/controller-v2-phase6-legacy-removal` | ARCHIVE | not merged into main; tag exists |
| `chore/landing-remove-copyright` | DELETE (after tag) | fully merged into origin/main; tag present |
| `chore/publication-boundary-migrations-in-git` | ARCHIVE | not merged into main; tag exists |
| `chore/remove-temp-diag` | ARCHIVE | not merged into main; tag exists |
| `ci/regression-gate` | DELETE (after tag) | fully merged into origin/main; tag present |
| `ci/supertux-wasm` | ARCHIVE | not merged into main; tag exists |
| `claude/admiring-euler-fd4c48` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `claude/cool-vaughan-b3c7ff` | DELETE (after tag) | fully merged into origin/main; tag present |
| `claude/determined-knuth-609039` | DELETE (after tag) | fully merged into origin/main; tag present |
| `claude/ecstatic-mclaren-c5aa0e` | ARCHIVE | session branch, not merged; tag exists |
| `claude/ecstatic-turing-0cf4b7` | DELETE (after tag) | fully merged into origin/main; tag present |
| `claude/eloquent-bardeen-42212c` | DELETE (after tag) | fully merged into origin/main; tag present |
| `claude/eloquent-diffie-cb87f5` | DELETE (after tag) | fully merged into origin/main; tag present |
| `claude/exciting-hertz-2b213e` | ARCHIVE | session branch, not merged; tag exists |
| `claude/gifted-shannon-a63c5a` | DELETE (after tag) | fully merged into origin/main; tag present |
| `claude/keen-goodall-04a982` | ARCHIVE | session branch, not merged; tag exists |
| `claude/lucid-albattani-08512a` | ARCHIVE | session branch, not merged; tag exists |
| `claude/modest-roentgen-d36e92` | DELETE (after tag) | fully merged into origin/main; tag present |
| `claude/nifty-sammet-44374f` | DELETE (after tag) | fully merged into origin/main; tag present |
| `claude/optimistic-lovelace-c2c517` | ARCHIVE | session branch, not merged; tag exists |
| `claude/zealous-merkle-4c7b3d` | DELETE (after tag) | fully merged into origin/main; tag present |
| `crossdomain-place-flood` | ARCHIVE | not merged into main; tag exists |
| `debug/vi-tool-provider-request` | ARCHIVE | not merged into main; tag exists |
| `design/v3-phase4` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `diag/media-identity-source` | DELETE (after tag) | fully merged into origin/main; tag present |
| `diag/web-client-error-capture` | ARCHIVE | not merged into main; tag exists |
| `docs/anon-eligibility-measured-zero` | ARCHIVE | not merged into main; tag exists |
| `docs/b8-applied` | ARCHIVE | not merged into main; tag exists |
| `docs/ban-revocation-status` | ARCHIVE | not merged into main; tag exists |
| `docs/bl002-accepted` | ARCHIVE | not merged into main; tag exists |
| `docs/c10-accepted` | DELETE (after tag) | fully merged into origin/main; tag present |
| `docs/c10-contract` | DELETE (after tag) | fully merged into origin/main; tag present |
| `docs/c11-session-security-contract` | ARCHIVE | not merged into main; tag exists |
| `docs/c11-surface-status` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-alert-well-status` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-b5-status` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-closeout` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-closure-index` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-command-palette-status` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-context-bar-status` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-foundation-closure` | DELETE (after tag) | fully merged into origin/main; tag present |
| `docs/controller-v2-k2-applied` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-layout-presets-blocked` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-m01-applied` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-m04-status` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-owner-uat-closure` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-phase0-reconciliation` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-phase2-m08-migration-artifact` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-phase5-event-bus-audit` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-phase8-authority-resolved` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-phase8-founder-status` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-phase8-module-authority-audit` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-phase8-module-ordering` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-phase8-schema-authority-closed` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-post-foundation-status` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-shell-ux-deferral` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-sot-reconciliation-m08` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-status-closeout` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-status-corrections` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v2-status-sync` | ARCHIVE | not merged into main; tag exists |
| `docs/controller-v21-uat` | ARCHIVE | not merged into main; tag exists |
| `docs/correct-m30-export-target` | ARCHIVE | not merged into main; tag exists |
| `docs/f10-activation-analysis` | DELETE (after tag) | fully merged into origin/main; tag present |
| `docs/f10-flag-forensic` | DELETE (after tag) | fully merged into origin/main; tag present |
| `docs/f10-uat-closeout` | DELETE (after tag) | fully merged into origin/main; tag present |
| `docs/feature-usage-guidance` | DELETE (after tag) | fully merged into origin/main; tag present |
| `docs/k1-released` | ARCHIVE | not merged into main; tag exists |
| `docs/m04-retention-applied` | ARCHIVE | not merged into main; tag exists |
| `docs/marketing-phase2-contract` | ARCHIVE | not merged into main; tag exists |
| `docs/marketing-phase2-progress` | ARCHIVE | not merged into main; tag exists |
| `docs/module09-applied` | ARCHIVE | not merged into main; tag exists |
| `docs/module09-decision` | ARCHIVE | not merged into main; tag exists |
| `docs/phase-c-broadcast-contract` | ARCHIVE | not merged into main; tag exists |
| `docs/policy-architecture-contract` | ARCHIVE | not merged into main; tag exists |
| `docs/policy-trust-safety-map` | DELETE (after tag) | fully merged into origin/main; tag present |
| `docs/production-read-only-access` | ARCHIVE | not merged into main; tag exists |
| `docs/reconcile-marketing-contract-status` | ARCHIVE | not merged into main; tag exists |
| `docs/release-closure` | ARCHIVE | not merged into main; tag exists |
| `docs/roadmap-m30-export-target` | ARCHIVE | not merged into main; tag exists |
| `docs/status-production-revision` | ARCHIVE | not merged into main; tag exists |
| `docs/user-notes-applied` | ARCHIVE | not merged into main; tag exists |
| `docs/v3-nav-reconciliation` | ARCHIVE | not merged into main; tag exists |
| `entertainment-movie-intent` | ARCHIVE | not merged into main; tag exists |
| `feat/account-settings-i18n` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/affiliate-cross-platform` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `feat/android-anonymous-chat-on-main` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/android-appconnections-status` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/android-chat-suggested-prompts` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/android-membership-status` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/android-reviews-comment-posting` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/android-reviews-feed-tabs` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/android-reviews-follow` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/android-reviews-link-sharing` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/android-reviews-photo-upload` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/android-reviews-video-playback` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/android-split-bill` | ARCHIVE | not merged into main; tag exists |
| `feat/anonymous-chat-android` | ARCHIVE | not merged into main; tag exists |
| `feat/anonymous-chat-backend` | ARCHIVE | not merged into main; tag exists |
| `feat/backoffice-phase0` | ARCHIVE | not merged into main; tag exists |
| `feat/backoffice-phase0-clean` | ARCHIVE | not merged into main; tag exists |
| `feat/ban-revokes-sessions` | ARCHIVE | not merged into main; tag exists |
| `feat/c10-distributed-rate-limit` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/c11-session-surface` | ARCHIVE | not merged into main; tag exists |
| `feat/c14-broadcast-ui` | ARCHIVE | not merged into main; tag exists |
| `feat/c6-plugin-registry-lifecycle` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/c8-event-bus` | ARCHIVE | not merged into main; tag exists |
| `feat/c9b-typed-config` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/ccp-canonical` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `feat/ccp-mvp` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `feat/chat-stage-telemetry` | ARCHIVE | not merged into main; tag exists |
| `feat/consultative-d1-d2-r1-r2-d3` | ARCHIVE | not merged into main; tag exists |
| `feat/consultative-d3` | ARCHIVE | not merged into main; tag exists |
| `feat/consultative-decision-experience` | ARCHIVE | not merged into main; tag exists |
| `feat/consultative-decision-quality` | ARCHIVE | not merged into main; tag exists |
| `feat/consultative-evidence-contract` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/consultative-evidence-contract-a51` | ARCHIVE | not merged into main; tag exists |
| `feat/consultative-evidence-provenance` | ARCHIVE | not merged into main; tag exists |
| `feat/consultative-v2-ranking` | ARCHIVE | not merged into main; tag exists |
| `feat/consultative-v2-web` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/controller-home-design` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-membership-api` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/controller-password-auth` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-architecture-guard-rules` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-b14-module-data-ownership` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-b5-alert-well` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-b5-command-palette` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-b5-context-bar` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-b5-denial-ux` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-b8-break-glass` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-component3-rbac` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/controller-v2-component4-audited-pdp` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/controller-v2-component5-capability-registry` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-component7-audit-chain` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/controller-v2-component9a-admin-client` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/controller-v2-f08` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/controller-v2-final-closure` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-foundation` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/controller-v2-foundation-integration` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/controller-v2-k1-capability-binding` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-k3-event-sink` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-login` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-m01-daily-snapshots` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-m04-user-analytics` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-m08-account-status` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-m08-admin-users-surface` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-option-b` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/controller-v2-phase4-capability-binding` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-phase7-hub-shell` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-phase8-founder-hub` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-public-home` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-remove-dept-switcher` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2-signout` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v2.1-dark-theme` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v22-entry` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v23-login` | ARCHIVE | not merged into main; tag exists |
| `feat/controller-v24-login` | ARCHIVE | not merged into main; tag exists |
| `feat/deals-brand-logos` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/deals-i18n` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/decision-evidence-state` | ARCHIVE | not merged into main; tag exists |
| `feat/delete-account-page` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/delete-legacy-broadcast-route` | ARCHIVE | not merged into main; tag exists |
| `feat/evidence-provenance-contract` | ARCHIVE | not merged into main; tag exists |
| `feat/g1-growth` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `feat/gcp-observability` | ARCHIVE | not merged into main; tag exists |
| `feat/gcs-media-bridge` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/link-video-pipeline-v1` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/m04-retention-cohort-metrics` | ARCHIVE | not merged into main; tag exists |
| `feat/m08-admin-users-api` | ARCHIVE | not merged into main; tag exists |
| `feat/m08-consumer-enforcement` | ARCHIVE | not merged into main; tag exists |
| `feat/m08-user-notes` | ARCHIVE | not merged into main; tag exists |
| `feat/marketing-activation` | ARCHIVE | not merged into main; tag exists |
| `feat/marketing-audience` | ARCHIVE | not merged into main; tag exists |
| `feat/marketing-campaigns` | ARCHIVE | not merged into main; tag exists |
| `feat/marketing-consent-api` | ARCHIVE | not merged into main; tag exists |
| `feat/marketing-governance-foundation` | ARCHIVE | not merged into main; tag exists |
| `feat/marketing-retention` | ARCHIVE | not merged into main; tag exists |
| `feat/media-wif-check` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/module09-moderation` | ARCHIVE | not merged into main; tag exists |
| `feat/notif-unification-impl` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/notification-unification` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/phase-c-broadcast` | ARCHIVE | not merged into main; tag exists |
| `feat/plan-brochure-flight-links` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/privacy-policy-play` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/remove-tiktok-v1` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/retire-legacy-broadcast-410` | ARCHIVE | not merged into main; tag exists |
| `feat/settings-delete-account-link` | DELETE (after tag) | fully merged into origin/main; tag present |
| `feat/shopping-early-frame` | ARCHIVE | not merged into main; tag exists |
| `feat/tappy-business-p0` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `feat/tappyai-v2` | ARCHIVE | not merged into main; tag exists |
| `feat/tiktok-consultative-review-links` | ARCHIVE | not merged into main; tag exists |
| `feat/v3-ai-consultative` | ARCHIVE | not merged into main; tag exists |
| `feat/v3-qr-profile` | ARCHIVE | not merged into main; tag exists |
| `feat/v3-scam-shield-ui` | ARCHIVE | not merged into main; tag exists |
| `feat/v3-user-data-foundation` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `feature/notification-mvp` | ARCHIVE | not merged into main; tag exists |
| `fix/a5-food-price-no-retrieval` | ARCHIVE | not merged into main; tag exists |
| `fix/ai-language-consistency` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/android-account-deletion-entry` | ARCHIVE | not merged into main; tag exists |
| `fix/android-games-parity` | ARCHIVE | not merged into main; tag exists |
| `fix/android-plan-item-name-wrap` | ARCHIVE | not merged into main; tag exists |
| `fix/android-release-config` | ARCHIVE | not merged into main; tag exists |
| `fix/android-scan-gallery-decode` | ARCHIVE | not merged into main; tag exists |
| `fix/bug-011-destination-scope` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/c3b10-2-money-guard` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/canonical-video-viewer` | ARCHIVE | not merged into main; tag exists |
| `fix/chat-image-layout` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/chat-latency-release-pre-tool-sentence` | ARCHIVE | not merged into main; tag exists |
| `fix/chat-route-mojibake` | ARCHIVE | not merged into main; tag exists |
| `fix/chat-streaming-latency-after-a5` | ARCHIVE | not merged into main; tag exists |
| `fix/chrome-shortcut-brand-icon` | ARCHIVE | not merged into main; tag exists |
| `fix/consultative-condition-provenance-claims` | ARCHIVE | not merged into main; tag exists |
| `fix/consultative-quality-round1` | ARCHIVE | not merged into main; tag exists |
| `fix/consultative-round2` | ARCHIVE | not merged into main; tag exists |
| `fix/consultative-round2-finalize` | ARCHIVE | not merged into main; tag exists |
| `fix/consultative-round2-wiring` | ARCHIVE | not merged into main; tag exists |
| `fix/controller-analytics-view-payload-binding` | ARCHIVE | not merged into main; tag exists |
| `fix/controller-home-login-destination` | ARCHIVE | not merged into main; tag exists |
| `fix/controller-origin-gate` | ARCHIVE | not merged into main; tag exists |
| `fix/controller-shell-terminology` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/controller-suspend-fixture-expiry` | ARCHIVE | not merged into main; tag exists |
| `fix/controller-v2-audit1-deals-upload` | ARCHIVE | not merged into main; tag exists |
| `fix/controller-v2-f04-grant-model-source-sync` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/deals-android-parity` | ARCHIVE | not merged into main; tag exists |
| `fix/delete-account-accuracy` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/deleted-review-404` | ARCHIVE | not merged into main; tag exists |
| `fix/enrichment-name-matching` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/explore-deleted-clip-visibility` | ARCHIVE | not merged into main; tag exists |
| `fix/f01-reconciled` | ARCHIVE | not merged into main; tag exists |
| `fix/f01-weather-country` | ARCHIVE | not merged into main; tag exists |
| `fix/f01-weather-location-identity` | ARCHIVE | not merged into main; tag exists |
| `fix/f03-anonymous-price-watch` | ARCHIVE | not merged into main; tag exists |
| `fix/g1-place-guard-attribution` | ARCHIVE | not merged into main; tag exists |
| `fix/ios-music-library-entry` | ARCHIVE | not merged into main; tag exists |
| `fix/ios-platform-links-tiktok-parity` | ARCHIVE | not merged into main; tag exists |
| `fix/landing-hero-logo-founder-bio` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/language-persistence` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/legacy-410-recorder-await` | ARCHIVE | not merged into main; tag exists |
| `fix/legal-back-navigation` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/legal-single-source` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/like-list-count-click` | ARCHIVE | not merged into main; tag exists |
| `fix/login-email-entry` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/login-return-and-touch-target` | ARCHIVE | not merged into main; tag exists |
| `fix/login-return-to-param` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/media-credential-stage-diagnostic` | ARCHIVE | not merged into main; tag exists |
| `fix/media-deployment-identity` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/media-server-completion` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/money-guard-dong-bypass` | ARCHIVE | not merged into main; tag exists |
| `fix/music-cover-jamendo` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/music-track-lookup-list` | ARCHIVE | not merged into main; tag exists |
| `fix/native-composer-link-provider-parity` | ARCHIVE | not merged into main; tag exists |
| `fix/nav-comment-accuracy` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/notification-clip-context` | ARCHIVE | not merged into main; tag exists |
| `fix/notification-otter-logo` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/og-share-card-otter-logo` | ARCHIVE | not merged into main; tag exists |
| `fix/optimistic-state-rollback` | ARCHIVE | not merged into main; tag exists |
| `fix/pg06-07-deterministic-snapshot-probe` | ARCHIVE | not merged into main; tag exists |
| `fix/phase0-production-hardening` | ARCHIVE | not merged into main; tag exists |
| `fix/place-website-ssrf` | ARCHIVE | not merged into main; tag exists |
| `fix/places-marker-contract` | ARCHIVE | not merged into main; tag exists |
| `fix/platform-owner-revoke-public` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/pre-uat-f1-f2` | ARCHIVE | not merged into main; tag exists |
| `fix/privacy-single-source` | ARCHIVE | not merged into main; tag exists |
| `fix/profile-avatar-zalo` | ARCHIVE | not merged into main; tag exists |
| `fix/profile-feed-keeps-unrenderable` | ARCHIVE | not merged into main; tag exists |
| `fix/profile-grid-filler` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/push-credential-ownership` | ARCHIVE | not merged into main; tag exists |
| `fix/push-identity-reconcile` | ARCHIVE | not merged into main; tag exists |
| `fix/qr-ssrf-guard` | ARCHIVE | not merged into main; tag exists |
| `fix/refuse-anonymous-push-subscribe` | ARCHIVE | not merged into main; tag exists |
| `fix/release-closure-class-a` | ARCHIVE | not merged into main; tag exists |
| `fix/restore-anonymous-claim-route` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/scam-shield-i18n` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/scam-shield-inconclusive` | ARCHIVE | not merged into main; tag exists |
| `fix/shopping-marker-product-identity` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/spec-guard-lone-connector` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/spec-guard-unit-no-space` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/ssrf-dns-pinning` | ARCHIVE | not merged into main; tag exists |
| `fix/streaming-markdown-image-flash` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/supertux-preload-removal` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/thumbnail-self-healing` | ARCHIVE | not merged into main; tag exists |
| `fix/travel-dynamic-fact-guard` | ARCHIVE | not merged into main; tag exists |
| `fix/tts-language-voice` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/v2-cleanup-profile-sync-explore-audio` | ARCHIVE | not merged into main; tag exists |
| `fix/v2-fix-phase` | ARCHIVE | not merged into main; tag exists |
| `fix/vi-response-language` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/vi-tool-path-lang-2` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/vi-tool-path-language` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/vietnamese-detection-ratio` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/vietnamese-short-query-language` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/web-cta-marker-leak` | ARCHIVE | not merged into main; tag exists |
| `fix/web-owner-profile-held-visibility` | ARCHIVE | not merged into main; tag exists |
| `fix/web-production-stabilization` | ARCHIVE | not merged into main; tag exists |
| `fix/wif-check-token-reader` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/wif-health-presence-test` | DELETE (after tag) | fully merged into origin/main; tag present |
| `fix/youtube-poster-hqdefault` | ARCHIVE | not merged into main; tag exists |
| `guard/ai-image-url-ssrf` | ARCHIVE | not merged into main; tag exists |
| `integration/android-parity` | DELETE (after tag) | fully merged into origin/main; tag present |
| `integration/scam-shield-v3` | ARCHIVE | not merged into main; tag exists |
| `integration/v3-canonical` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `integration/v3-foundation` | ARCHIVE | not merged into main; tag exists |
| `ios/marker-leak-parity` | ARCHIVE | not merged into main; tag exists |
| `ios/shopping-decision-evidence-parity` | ARCHIVE | not merged into main; tag exists |
| `main` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `merge/main-into-v3` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `perf-audit` | DELETE (after tag) | fully merged into origin/main; tag present |
| `perf/chat-cost-phase-b` | ARCHIVE | not merged into main; tag exists |
| `perf/chat-model-timing` | ARCHIVE | not merged into main; tag exists |
| `perf/chat-pre-model-parallel` | ARCHIVE | not merged into main; tag exists |
| `perf/chat-prose-budget` | ARCHIVE | not merged into main; tag exists |
| `perf/drop-debug-budget-field` | DELETE (after tag) | fully merged into origin/main; tag present |
| `perf/phase0-instrumentation` | ARCHIVE | not merged into main; tag exists |
| `perf/phase1-early-shopping-frame` | DELETE (after tag) | fully merged into origin/main; tag present |
| `perf/phase2-photo-instrumentation` | ARCHIVE | not merged into main; tag exists |
| `perf/phase2-photo-overlap` | DELETE (after tag) | fully merged into origin/main; tag present |
| `phase1-blob` | DELETE (after tag) | fully merged into origin/main; tag present |
| `phase1-ios` | DELETE (after tag) | fully merged into origin/main; tag present |
| `phase1-photos` | DELETE (after tag) | fully merged into origin/main; tag present |
| `phase1-shopping-search-quality` | ARCHIVE | not merged into main; tag exists |
| `phase2-evidence-normalization` | ARCHIVE | not merged into main; tag exists |
| `phase3-entity-offer-model` | ARCHIVE | not merged into main; tag exists |
| `phase4-synthesis-decision` | ARCHIVE | not merged into main; tag exists |
| `phase9-decision-polish` | ARCHIVE | not merged into main; tag exists |
| `phase9-shopping-marker` | ARCHIVE | not merged into main; tag exists |
| `phase9-ui-synthesis` | ARCHIVE | not merged into main; tag exists |
| `platform/hardening-phase0` | DELETE (after tag) | fully merged into origin/main; tag present |
| `polish/landing-branding` | DELETE (after tag) | fully merged into origin/main; tag present |
| `preview/auth-provider-contract` | ARCHIVE | not merged into main; tag exists |
| `preview/bugfix-video-counters` | DELETE (after tag) | fully merged into origin/main; tag present |
| `preview/chat-layout-grouping` | DELETE (after tag) | fully merged into origin/main; tag present |
| `preview/deals-catalog` | DELETE (after tag) | fully merged into origin/main; tag present |
| `preview/deals-promo-polish` | DELETE (after tag) | fully merged into origin/main; tag present |
| `preview/deals-v1` | DELETE (after tag) | fully merged into origin/main; tag present |
| `preview/exchange-rate-precision` | DELETE (after tag) | fully merged into origin/main; tag present |
| `preview/truncation-fix` | DELETE (after tag) | fully merged into origin/main; tag present |
| `probe/cron-capacity` | ARCHIVE | not merged into main; tag exists |
| `rc/web-uat` | KEEP | V3 line / owner work not yet merged (see overnight log) |
| `rca-main` | DELETE (after tag) | fully merged into origin/main; tag present |
| `rca/place-id-flow` | DELETE (after tag) | fully merged into origin/main; tag present |
| `redeploy-7e` | DELETE (after tag) | fully merged into origin/main; tag present |
| `release/android-games-hidden` | ARCHIVE | not merged into main; tag exists |
| `release/android-games-hidden-clean` | ARCHIVE | not merged into main; tag exists |
| `release/android-vc7` | ARCHIVE | not merged into main; tag exists |
| `release/games-hidden` | ARCHIVE | not merged into main; tag exists |
| `release/scam-shield` | DELETE (after tag) | fully merged into origin/main; tag present |
| `release/v2-android-rc` | ARCHIVE | not merged into main; tag exists |
| `release/v2-ios-rc` | ARCHIVE | not merged into main; tag exists |
| `release/v2-rc` | ARCHIVE | not merged into main; tag exists |
| `release/vc6` | ARCHIVE | not merged into main; tag exists |
| `release/web-rc-2026-07` | DELETE (after tag) | fully merged into origin/main; tag present |
| `safety/explore-moderation-audit` | ARCHIVE | not merged into main; tag exists |
| `security/next-14.2.35` | DELETE (after tag) | fully merged into origin/main; tag present |
| `security/v3-phase3` | ARCHIVE | not merged into main; tag exists |
| `share-menu` | DELETE (after tag) | fully merged into origin/main; tag present |
| `share-preview` | DELETE (after tag) | fully merged into origin/main; tag present |
| `share-ui` | ARCHIVE | not merged into main; tag exists |
| `test/c8-runtime-sql` | ARCHIVE | not merged into main; tag exists |
| `tmp/i18n-sprint-base` | ARCHIVE | not merged into main; tag exists |
| `uat/android-release-fixes` | ARCHIVE | not merged into main; tag exists |
| `v2-closeout` | DELETE (after tag) | fully merged into origin/main; tag present |
| `v2/android-rc-build` | ARCHIVE | not merged into main; tag exists |
| `verify/c3-merged` | DELETE (after tag) | fully merged into origin/main; tag present |
| `verify/c4-merged` | DELETE (after tag) | fully merged into origin/main; tag present |
| `verify/c9a-merged` | DELETE (after tag) | fully merged into origin/main; tag present |
| `video-5min` | ARCHIVE | not merged into main; tag exists |
| `wip/adoring-stonebraker-13f20e-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/audit-nonprod-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/cool-vaughan-b3c7ff-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/g1-growth-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/gcs-media-bridge-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/main-repo-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/tappy-business-p0-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/tappyai-controller-v2-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/tappyai-i18n-recover-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/tappyai-ios-sprint-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/tappyai-label-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/tappyai-memberapi-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/tappyai-notif-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/tappyai-shopping-contract-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/tappyai-v3-canonical-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/v3-phase4-design-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/v3-user-data-foundation-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |
| `wip/wtandroid-2026-09-17` | KEEP (until merged) | uncommitted work snapshotted on 2026-09-17; merge or park explicitly |

## How to execute (owner, later — none of this ran tonight)
1. For each DELETE branch: confirm `git tag -l archive/<branch>-2026-09-17` exists, then `git branch -d <branch>` (lower-case d refuses unmerged).
2. For each worktree marked DELETE/ARCHIVE: `git -C <path> status --short` must be empty (or snapshot to a `wip/` branch first), then `git worktree remove <path>`.
3. `wip/*` branches: merge the ones listed as "keep newest owner work" in the overnight log into `merge/main-into-v3`, park the rest under `archive/`.
4. Never delete `archive/*` tags before the V3 line is merged to `main` and deployed.
