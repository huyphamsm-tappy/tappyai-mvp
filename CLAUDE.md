# TappyAI — working rules for Claude Code

## Editing source
- Edit code **only** through the Edit / Write tools (or a `.py` patch script written with the Write tool and then executed).
- **Never** author or modify source through the shell: no heredocs (`cat <<EOF`), no `sed -i`, no inline `python -c` / `python - <<EOF`, no `echo … >`.
  Measured repeatedly in this repo: the shell layer mangles `\n`, `\p{L}`, backticks and quotes, and a silent mangle either corrupts the file or makes a patch "apply" to the wrong text.
- Shell is for running things (tests, git, scripts), reading (`cat`, `grep`, `sed -n`), and for scratch files under the session scratchpad — not for writing project files.

## Line endings
- The repository is LF (`.gitattributes`: `* text=auto eol=lf`). Write files as LF; never commit a CRLF conversion of an existing file.

## Repositories and worktrees
- One repository, one main branch per platform, one working worktree per platform:
  - Web: `D:/TappyAI-wt/wt-integration`, branch `integration/canonical-20261020`.
  - Android: `D:/TappyAI-wt/wtk-android`, branch `android/phase-k-web-parity`.
  - iOS: `D:/TappyAI-wt/wtk-ios`, branch `ios/phase-k-web-parity`.
- Do not create extra worktrees, repository copies or parallel development branches. Do not delete worktrees or change the repository layout.

## Commits
- Every complete logical change is its own commit with a descriptive message. Do not end a task with changes the task created left uncommitted. Never discard the user's existing changes or unrelated work.
- Do not push without explicit authorization. A read-only task needs no commit.
- Commit trailers (owner instruction): `Co-Authored-By: <display name of the model actually running in the session that creates the commit> <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01592sxjoQizby1bPvYCCpzY`. The model name comes from the session's own metadata, never from a configuration file, an example, or an earlier commit. If the running model cannot be verified, do not guess: stop and report the uncertainty. This rule applies to future commits only; historical commits and their metadata are not rewritten.
- A deliberately red test may be committed only as `it.fails` or `skip`, with the gate ID in a comment and the gate listed under "Open gates" in `docs/PROJECT-STATE.md`. Remove the mark in the same commit as the fix.
- Stage named files only. Never `git add .` or `git add -A`.

## Backups
- A recovery point is a Git tag or an archive branch, only when there is a concrete need. No ZIP folders, copied source trees or extra worktrees on drive D as backups. Never overwrite or delete an existing recovery ref.

## Feature flags and production
- New behaviour sits behind an explicit feature flag, default OFF, verified on a test environment before production. Do not change flags, production configuration, deploy or release unless the owner says so.

## Root cause, not symptoms
- Trace the data and fix the verified cause. Do not make a test green by loosening validation, disabling a guard broadly, adding a side path or a bypass.
- Do not change an expected output to match behaviour that loses data. Add regression tests for both the wanted behaviour and the safety limits.

## Single source of truth
- `docs/PROJECT-STATE.md` is the only record of the canonical branch, verified SHAs, feature status, flags, test evidence, open gates and owner decisions. Update it in the same commit as the change that alters what it records. Old reports are history; when they conflict with code or evidence, trust the code and evidence.
- Do not create a second status or rules document.

## End-of-task checklist
- Repository/worktree path, branch, HEAD and final `git status`.
- Files changed and the root cause addressed, if any.
- Test commands run and their exact results.
- Commit SHA, or the reason no commit was needed.
- State of `docs/PROJECT-STATE.md` and what was updated.
- Remaining risks, what is unverified, and the owner decisions still needed.
- Do not declare a task done while a required test is not passing, the task's own changes are uncommitted, or the project state is not updated.
