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
    20260927_owner_update_column_privileges.sql|20260928_revoke_reviews_insert.sql)
      echo AFTER-SMOKE ;;
    20260913_g1_growth_foundation.sql|20260913_plan_shares.sql|20260915_profile_public_presentation.sql|\
    20260915b_review_likes_private.sql|20260918_g1b_share_ancestry.sql|20260920100000_commerce_providers.sql|\
    20260920110000_commerce_feed_items.sql|20260927100000_commerce_providers_portal_state.sql|\
    20260920_f028_dob_self_correct_while_ineligible.sql|20260921_f032_admin_role_actor_from_authuid.sql|\
    20260921_music_tracks_lockdown.sql|20260921_user_events_ga4_event_types.sql|\
    20260921_user_events_shopping_search_event.sql|20260922_groups_avatar_url.sql|\
    20260925b_decision_evidence_sweep.sql|20260925d_audit_log_pii_retention.sql|d3-one-off-sweep.sql)
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
