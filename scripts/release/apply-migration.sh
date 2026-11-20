#!/usr/bin/env bash
# Apply ONE SQL file to PRODUCTION (fwznnobrdctuskgrvuik), or run a read-only probe.
# LEAD-RUN ONLY at release time, from Git Bash. Claude never runs this.
#
#   apply-migration.sh <file.sql> --i-have-a-valid-backup <backup-dir> [--after-web-deploy]
#                      [--after-smoke-passed] [--rollback] [--yes] [--dry-run]
#   apply-migration.sh --check <file.sql>            # read-only session, no backup needed
#
# How it connects: docker postgres:17 psql, host from D:/TappyAI-backups/pghost.txt, password ONLY via
# the libpq password file D:/TappyAI-backups/pgpass (copied to a 0600 file inside the container —
# libpq ignores a world-readable pgpass, which is what a Windows bind mount looks like). The password
# is never read by this script, never exported, never printed.
#
# Apply mode = psql -X -1 -v ON_ERROR_STOP=1 -f <file> : one transaction, first error rolls it all back.
# Refuses unless <backup-dir>/CHECKS-PASSED.json (written by backup-prod.ps1 only when §0.3 a-c passed)
# exists, its prod.dump still hashes to the recorded sha256, and it is recent enough.
# Also refuses files the release plan marks SKIP / DEFER / VERIFY-ONLY, and gates S1 (after the web
# deploy) and H1/M1 (after the prod smoke test) behind explicit flags. Policy source:
# docs/uat/RELEASE-PLAN-2026-09-29.md §1.
set -euo pipefail

PGPASS_WIN="${TAPPY_PGPASS:-D:/TappyAI-backups/pgpass}"
PGHOST_FILE="${TAPPY_PGHOST_FILE:-D:/TappyAI-backups/pghost.txt}"
DB_USER="postgres.fwznnobrdctuskgrvuik"
IMAGE="postgres:17"
MAX_AGE_H="${TAPPY_MAX_BACKUP_AGE_HOURS:-12}"   # any apply
MAX_AGE_H_SEC=2                                  # H1/M1: checklist §1-SEC step 3 wants a FRESH dump

die() { printf '\n\033[31mREFUSED: %s\033[0m\n' "$*" >&2; exit 2; }
say() { printf '%s\n' "$*"; }

# ---------------- policy (RELEASE-PLAN §1) ----------------
policy_of() {
  case "$1" in
    20260922_music_soundhelix_attribution.sql|20260705_seed_music_demo_catalog.sql|20260706c_repoint_music_audio_local.sql)
      echo SKIP ;;
    20260911b_user_memory_auth_fk.sql|20260925_account_deletion_cascade_gaps.sql|20260925c_account_deletion_f096.sql)
      echo DEFER ;;
    20260905_chat_messaging_phase1.sql|20260906_phase6_messenger_reachability.sql|20260915_review_shares.sql)
      echo VERIFY-ONLY ;;
    20260904_group_read_boundary.sql)
      echo AFTER-DEPLOY ;;
    # AI-consent table for POST /api/ai-consent (20261018) and its client-role REVOKE ALL (20261019). Additive / revoke-only,
    # and the code on production before the consent branch never reads the table. Both go BEFORE the web deploy, so the
    # endpoint can store iOS decisions from its first request and no client role ever holds the default grants.
    20261018_ai_data_consent.sql|20261019_ai_data_consent_client_acl.sql)
      echo APPLY ;;
    # AI usage ledger (owner 01/11/2026, cost reporting only). Additive; the code writes it only with AI_USAGE_LEDGER=1, so it may go
    # before or after the web deploy - turn the flag on only after this file is applied.
    20261101_ai_usage_events.sql)
      echo APPLY ;;
    # Tappy (Promax) plan ids (owner 01/11/2026). Widens the allowed plan lists only (constraints + p8_apply_entitlement); apply it
    # BEFORE the web release that sells promax1m / promax3m - until then the database refuses those orders and purchases.
    20261102_plans_promax.sql)
      echo APPLY ;;
    # Messenger send idempotency (Inbox & Messenger audit 04/11/2026). One nullable column + one partial unique index on chat_messages; nothing
    # reads it until the web release that sends `clientId`, so apply it BEFORE that release (the route writes the column only when a clientId is sent).
    20261105_chat_messages_client_id.sql)
      echo APPLY ;;
    # Messenger notification collapse (DR-4, owner approved D1–D10 on 04/11/2026): a unique partial index + three functions. Nothing calls them until the web
    # release behind MESSAGE_NOTIFICATIONS_ENABLED (OFF until Web, Android and iOS handle the 'message' type), so apply it BEFORE that release.
    20261106_messenger_notification_collapse.sql)
      echo APPLY ;;
    # Messenger hardening (audit 04/11/2026): a stricter chat_reads UPDATE policy + a 120/min per-sender backstop trigger on chat_messages. Nothing in the
    # old web breaks (it sends far below 120/min); the new route maps SQLSTATE 53400 to 429. Apply before or with the web release.
    20261107_chat_hardening.sql)
      echo APPLY ;;
    # Report a message (owner 04/11/2026): widens the user_reports target_type CHECK to include 'message'. Requires 20261001b (AFTER-SMOKE group).
    # The route that writes the new value ships with the web release and is invisible while REPORTS_ENABLED is off; applying this first is safe.
    20261108_user_reports_message_target.sql)
      echo AFTER-SMOKE ;;
    # Messenger images (owner 04/11/2026): four nullable media columns on chat_messages, a relaxed body rule (empty only with an image), a unique index and the
    # PRIVATE bucket chat-media (no storage policy). Nothing reads them until the web release that sends images; apply BEFORE it (the upload route needs the bucket).
    20261109_chat_media.sql)
      echo APPLY ;;
    # Picture retention (owner 04/11/2026, like Zalo): one nullable column, one partial index and a service-role-only function that LISTS orphan objects. Nothing reads them
    # until the retention cron ships with the web release; apply BEFORE it (the web GET selects the column).
    20261110_chat_media_retention.sql)
      echo APPLY ;;
    # Explore video, part 1 (owner 05/11/2026): two NEW tables (video_assets, video_asset_events) and their functions/trigger. Purely additive: nothing reads or writes
    # them until the video routes ship AND EXPLORE_VIDEO_PIPELINE_ENABLED=true (OFF by default), so it can be applied at any time.
    20261111_video_assets.sql)
      echo APPLY ;;
    # Explore video, part 3 (owner 05/11/2026): two nullable columns on video_assets, one partial index and three service-role-only functions (what to clean up, the legal hold,
    # the removal record). Requires 20261111 (same group). Nothing calls them until the video-source-cleanup cron has a source bucket, so it can be applied at any time.
    20261112_video_asset_cleanup.sql)
      echo APPLY ;;
    # Explore video, part 4 (owner 05/11/2026): three columns on video_assets (has_audio, transcode_attempts, transcode_error), a partial index, and the clean-up function recreated
    # with an owner_id column in its result (a changed result type, so it is dropped and created again in the same file). Requires 20261111 and 20261112. Nothing reads them until
    # the video routes are on, so it can be applied at any time, BUT only together with or after 20261112 (the video-source-cleanup cron reads owner_id from this function).
    20261113_video_transcode.sql)
      echo APPLY ;;
    # Explore video, VID-03 (owner 05/11/2026): the moderation decision history and the automatic / human decide functions. Additive, service-role only. Apply only after
    # 20261111-20261113. Nothing calls them until EXPLORE_VIDEO_PIPELINE_ENABLED is on. Rollback drops the decision history, so use it only if the feature never ran.
    20261114_video_moderation.sql)
      echo APPLY ;;
    # Explore video, VID-02 / VID-04 (owner 05/11/2026): the overlay documents and the download-render table. Additive, service-role only, owner-scoped by the routes.
    # Requires 20261111. Nothing reads them until EXPLORE_VIDEO_PIPELINE_ENABLED is on.
    20261115_video_overlays.sql)
      echo APPLY ;;
    # Explore video, publishing and delivery (owner 05/11/2026): three columns, three functions and two indexes on video_assets (the post link, the delivery copy, the claim that
    # makes a retried publish resume the same post). Additive. Requires 20261111-20261114. Nothing calls them until EXPLORE_VIDEO_PIPELINE_ENABLED is on.
    20261116_video_publish_delivery.sql)
      echo APPLY ;;
    # Explore video, clip consent (owner 05/11/2026: every account must accept the clip conditions before it can post a clip): one NEW table, service-role only. Independent of the other
    # video migrations. Nothing reads it until EXPLORE_VIDEO_PIPELINE_ENABLED is on.
    20261117_video_clip_consent.sql)
      echo APPLY ;;
    # Chat workspace, slice 2 (owner 10/11/2026): two additive boolean columns on conversations (pin, archive). Existing rows read as false. Nothing uses them until
    # NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED is on.
    20261118_conversation_pin_archive.sql)
      echo APPLY ;;
    # Chat workspace, slice 3 (owner 10/11/2026): projects — one new owner-only table (chat_projects), a nullable conversations.project_id and a trigger that refuses another account's
    # project. Nothing uses them until NEXT_PUBLIC_CHAT_WORKSPACE_ENABLED is on.
    20261119_chat_projects.sql)
      echo APPLY ;;
    # TVI core, R13 §8 slice 2a (owner 10/11/2026): eight NEW service-role-only tables (entities, facts, immutable versions, state, append-only events, evidence, sources, fact-evidence)
    # and three write functions. Independent of the other migrations; nothing reads or writes them until a later flagged slice wires the chat to the store.
    20261120_tvi_core.sql)
      echo APPLY ;;
    # MCP gateway durable jobs (12/11/2026): one new service-role-only table and its SECURITY DEFINER functions. Nothing uses it until MCP_GATEWAY is on and the gateway ships, and the file has never been applied
    # anywhere: held (DEFER, the script refuses it) until the owner lifts it when the gateway is released.
    20261121_mcp_jobs.sql)
      echo DEFER ;;
    # Scam Shield weekly knowledge sync (18/11/2026): one NEW service-role-only table (scam_knowledge_versions). Independent of every other migration; until it is applied the reader
    # fails open to the static dataset and the weekly cron answers 503 "store_unavailable" without crawling. Owner applies it (UAT first); the file has not been applied anywhere.
    20261201_scam_knowledge_versions.sql)
      echo APPLY ;;
    # 18+ gate as ONE BUTTON (owner 18/11/2026): three additive nullable columns on user_demographics, a new record_age_declaration() and user_age_status() with one more column (`declaration`).
    # Old code ignores the extra column, so it is safe before the new code; the new code FAILS CLOSED (503, nobody admitted) until this is applied. Applied to UAT only; production needs the owner.
    20261202_age_adult_declaration.sql)
      echo APPLY ;;
    # Payments never refund (owner 18/11/2026): a short transfer stays on the order until topped up, a surplus becomes extra time at the plan's rate, a second transfer on a paid order
    # becomes time too. One additive column (payment_orders.bonus_seconds) and a replaced p8_payments_apply_sepay (same signature and grants). Needs 20261011_p8_payments.sql first.
    20261203_payments_no_refund.sql)
      echo APPLY ;;
    # Group dining is private (owner 20/11/2026): a join is a request the leader accepts (status pending|member, a trigger forces pending on a self-insert, RLS read boundary), then votes on the
    # suggested venues and the bill split. Three files in this order: 20261204 (join approval), 20261205 (suggestion votes), 20261206 (bills). Applied to UAT only; each has a rollback in
    # supabase/migrations/rollback/. The new web code needs all three (it reads the new tables); apply them just before the single web deploy.
    20261204_group_join_approval.sql|20261205_group_suggestion_votes.sql|20261206_group_bills.sql)
      echo APPLY ;;
    # H1 → M1 first, then the security-branch migrations in MIGRATION_ORDER.txt order (owner 30/09): 20260928b needs the
    # deal-click code (service role) on production; the others are code-independent but ride the same verified window.
    20260927_owner_update_column_privileges.sql|20260928_revoke_reviews_insert.sql|\
    20260928b_revoke_increment_deal_click_public.sql|20260928c_review_comments_publication_boundary.sql|\
    20260930_content_reports_insert_check.sql|20260930b_review_interactions_bounds.sql|\
    20261001_user_blocks.sql|20261001b_user_reports.sql|20261001d_moderation_standards.sql|\
    20261001e_banned_identity_hash.sql|20261005_account_deletion_cleanup.sql|20261009_content_reports_to_queue.sql|20261010_content_reports_flood_guard.sql|\
    20261018_chat_honours_user_blocks.sql)
      echo AFTER-SMOKE ;;
    20260913_g1_growth_foundation.sql|20260913_plan_shares.sql|20260915_profile_public_presentation.sql|\
    20260915b_review_likes_private.sql|20260918_g1b_share_ancestry.sql|20260920100000_commerce_providers.sql|\
    20260920110000_commerce_feed_items.sql|20260927100000_commerce_providers_portal_state.sql|\
    20260920_f028_dob_self_correct_while_ineligible.sql|20260921_f032_admin_role_actor_from_authuid.sql|\
    20260921_music_tracks_lockdown.sql|20260921_user_events_ga4_event_types.sql|\
    20260921_user_events_shopping_search_event.sql|20260922_groups_avatar_url.sql|\
    20260925b_decision_evidence_sweep.sql|20260925d_audit_log_pii_retention.sql|d3-one-off-sweep.sql|\
    20260929130000_commerce_click_attributions.sql|20260929140000_commerce_click_attributions_r21.sql|\
    20261001c_commerce_providers_cinemas.sql|20261005_p8_cost_indexes.sql|\
    20260924_p8_subscriptions_plan_model.sql|20261011_p8_payments.sql|20261015_p8_subscriptions.sql|20261016_p7_pip_one_time.sql|20261017_p7_pip_trial_any_source.sql)
      echo APPLY ;;
    *) echo UNLISTED ;;
  esac
}

# ---------------- args ----------------
MODE=apply FILE="" BACKUP="" AFTER_DEPLOY=0 AFTER_SMOKE=0 ROLLBACK=0 YES=0 DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check; FILE="${2:-}"; shift 2 ;;
    --i-have-a-valid-backup) BACKUP="${2:-}"; shift 2 ;;
    --after-web-deploy) AFTER_DEPLOY=1; shift ;;
    --after-smoke-passed) AFTER_SMOKE=1; shift ;;
    --rollback) ROLLBACK=1; shift ;;
    --yes) YES=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    -*) die "unknown option $1" ;;
    *) [ -z "$FILE" ] || die "only one SQL file per call"; FILE="$1"; shift ;;
  esac
done
[ -n "$FILE" ] || die "no SQL file given (see --help)"
[ -f "$FILE" ] || die "file not found: $FILE"
case "$FILE" in *.sql) ;; *) die "not a .sql file: $FILE" ;; esac
command -v docker >/dev/null || die "docker not found"
docker info >/dev/null 2>&1 || die "Docker Desktop is not running"
command -v cygpath >/dev/null || die "run this from Git Bash (cygpath needed)"
[ -f "$PGPASS_WIN" ] || die "pgpass missing: $PGPASS_WIN (RELEASE-PLAN §3b)"
[ -f "$PGHOST_FILE" ] || die "host file missing: $PGHOST_FILE (RELEASE-PLAN §3b)"
PGHOST_VAL="$(tr -d '\r\n\t ' < "$PGHOST_FILE")"
[[ "$PGHOST_VAL" =~ ^[a-z0-9.-]+$ ]] || die "pghost.txt must hold only a host name"
[[ "$PGHOST_VAL" != db.*.supabase.co ]] || die "pghost.txt holds the DIRECT host; use the Session pooler host"

ABS_FILE="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"
FILE_DIR_WIN="$(cygpath -m "$(dirname "$ABS_FILE")")"
BASE="$(basename "$ABS_FILE")"
SQL_SHA="$(sha256sum "$ABS_FILE" | cut -d' ' -f1)"

run_psql() {  # $1 = psql flags placed before -f (e.g. a -c "SET ..." that runs first in the same session)
  MSYS_NO_PATHCONV=1 docker run --rm \
    -e PGHOST="$PGHOST_VAL" -e PGPORT=5432 -e PGUSER="$DB_USER" -e PGDATABASE=postgres \
    -e PGSSLMODE=require -e PGAPPNAME=tappyai-release-migrate \
    -v "$(cygpath -m "$PGPASS_WIN"):/secrets/pgpass:ro" -v "$FILE_DIR_WIN:/sql:ro" \
    "$IMAGE" sh -c "cp /secrets/pgpass /tmp/.pgpass && chmod 600 /tmp/.pgpass && export PGPASSFILE=/tmp/.pgpass && psql -X $1 -f '/sql/$BASE'"
}

# ---------------- read-only probe ----------------
if [ "$MODE" = check ]; then
  say "READ-ONLY probe of production with $BASE (default_transaction_read_only=on)"
  [ "$DRY" = 1 ] && { say "(dry run — nothing executed)"; exit 0; }
  # SET first, in the same session (-c before -f): every statement after it is read-only.
  run_psql "-P pager=off -c 'SET default_transaction_read_only = on'"
  exit $?
fi

# ---------------- apply: policy gates ----------------
REL="${ABS_FILE//\\//}"
if [[ "$REL" == */supabase/migrations/rollback/* ]]; then
  [ "$ROLLBACK" = 1 ] || die "$BASE is a rollback file — pass --rollback to confirm you are rolling back"
  POLICY=ROLLBACK
else
  [ "$ROLLBACK" = 0 ] || die "--rollback given but $BASE is not under supabase/migrations/rollback/"
  POLICY="$(policy_of "$BASE")"
fi
case "$POLICY" in
  SKIP)        die "$BASE is SKIP for this release (RELEASE-PLAN §1)" ;;
  DEFER)       die "$BASE is DEFERRED by the owner (D1/D2/D4, 2026-09-29) — do not apply; ACCOUNT_SELF_DELETE_ENABLED must stay false" ;;
  VERIFY-ONLY) die "$BASE is already on prod — verify with --check scripts/release/sql/precheck-all.sql, never re-apply" ;;
  UNLISTED)    die "$BASE is not in the release migration table (RELEASE-PLAN §1). Add it there first, with a reason" ;;
  AFTER-DEPLOY) [ "$AFTER_DEPLOY" = 1 ] || die "$BASE (S1) goes AFTER the web deploy is live — re-run with --after-web-deploy once /api/version on www.tappyai.com shows the release SHA" ;;
  AFTER-SMOKE)  [ "$AFTER_SMOKE" = 1 ] || die "$BASE (H1/M1) goes only AFTER the production smoke test passed (DEPLOY-CHECKLIST §1-SEC) — re-run with --after-smoke-passed" ;;
esac
if grep -qiE '^[[:space:]]*(begin|commit|rollback)[[:space:]]*;' "$ABS_FILE"; then
  die "$BASE has its own BEGIN/COMMIT — psql -1 would nest it; apply it by hand after review"
fi

# ---------------- apply: backup gate ----------------
[ -n "$BACKUP" ] || die "missing --i-have-a-valid-backup <dir> (run scripts/release/backup-prod.ps1 first)"
[ -d "$BACKUP" ] || die "backup dir not found: $BACKUP"
MARKER="$BACKUP/CHECKS-PASSED.json"
[ -f "$MARKER" ] || die "no CHECKS-PASSED.json in $BACKUP — backup-prod.ps1 did not pass §0.3 (a)-(c) there"
[ ! -f "$BACKUP/CHECKS-FAILED.txt" ] || die "$BACKUP has CHECKS-FAILED.txt"
grep -q '"status": *"CHECKS-PASSED"' "$MARKER" || die "marker status is not CHECKS-PASSED"
WANT_SHA="$(grep -oE '"dumpSha256": *"[0-9a-f]{64}"' "$MARKER" | grep -oE '[0-9a-f]{64}')" || die "marker has no dumpSha256"
[ -f "$BACKUP/prod.dump" ] || die "prod.dump missing from $BACKUP"
say "Verifying prod.dump sha256 against the marker ..."
HAVE_SHA="$(sha256sum "$BACKUP/prod.dump" | cut -d' ' -f1)"
[ "$HAVE_SHA" = "$WANT_SHA" ] || die "prod.dump sha256 does not match the marker — the backup changed after its checks"
CREATED="$(grep -oE '"createdUtcEpoch": *[0-9]+' "$MARKER" | grep -oE '[0-9]+$')" || die "marker has no createdUtcEpoch"
AGE_H=$(( ( $(date +%s) - CREATED ) / 3600 ))
LIMIT=$MAX_AGE_H; [ "$POLICY" = AFTER-SMOKE ] && LIMIT=$MAX_AGE_H_SEC
[ "$AGE_H" -lt "$LIMIT" ] || die "backup is ${AGE_H}h old (limit ${LIMIT}h for $POLICY) — take a fresh one with backup-prod.ps1"
grep -q "\"host\": *\"$PGHOST_VAL\"" "$MARKER" || die "backup was taken from a different host than pghost.txt now names"

# ---------------- apply ----------------
LOGDIR="$BACKUP/applied"; mkdir -p "$LOGDIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$LOGDIR/$TS-$BASE.log"
say ""
say "  PRODUCTION apply: $BASE   (policy $POLICY)"
say "  sql sha256:       $SQL_SHA"
say "  host:             $PGHOST_VAL"
say "  backup:           $BACKUP (age ${AGE_H}h, dump sha verified)"
say "  mode:             psql -X -1 -v ON_ERROR_STOP=1  (single transaction)"
say "  log:              $LOG"
[ "$DRY" = 1 ] && { say "(dry run — nothing executed)"; exit 0; }
if [ "$YES" != 1 ]; then
  read -r -p "Type the file name ($BASE) to apply it to PRODUCTION: " ANSWER
  [ "$ANSWER" = "$BASE" ] || die "confirmation did not match"
fi
set +e
run_psql "-1 -v ON_ERROR_STOP=1 -P pager=off -e" 2>&1 | tee "$LOG"
RC=${PIPESTATUS[0]}
set -e
printf '%s\t%s\t%s\t%s\texit=%s\n' "$TS" "$POLICY" "$BASE" "$SQL_SHA" "$RC" >> "$BACKUP/APPLIED.tsv"
if [ "$RC" -ne 0 ]; then
  printf '\n\033[31mFAILED (exit %s). The transaction was rolled back. STOP: apply nothing else, do not deploy.\033[0m\n' "$RC" >&2
  printf 'Next: DEPLOY-CHECKLIST §0.4. Log: %s\n' "$LOG" >&2
  exit "$RC"
fi
printf '\n\033[32mAPPLIED %s. Now run its verify query (RELEASE-PLAN §1) — e.g. --check scripts/release/sql/precheck-all.sql\033[0m\n' "$BASE"
