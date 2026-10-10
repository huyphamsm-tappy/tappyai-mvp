# `serperAbortDedup` B1 — flake investigation (2026-10-10)

**Verdict: scheduler/timer noise, not a cancellation or de-duplication regression.** The test file and all Serper runtime code are **unchanged** (the Serper area is frozen); this note proposes a change for the owner to approve.

## The assertion
Test "the leader is cancelled, a follower is not…" (`src/lib/ai/tools/serperAbortDedup.test.ts`, B1) starts a leader (cancellable), `sleep(5)`, starts a follower (same query, not cancellable), arms `setTimeout(abort, 15)`, with a stubbed fetch that answers after 60 ms. It asserts the leader returns `null` (cancellation honoured), the follower gets the real result, one request is sent, the ledger shows ok — and that the leader's exit time `Date.now() - t0` is `< 50` ms ("independent and immediate").

## Evidence
- **Reproduced without synthetic load:** whole-file runs, 1 failure in 10 (`at = 51`); under 12 busy loops, 2 failures in 10 (`at = 68`, `133`). Isolated single-test runs (`-t`, cold) measured 50–53 ms on every run. In the full `npm test` of Checkpoint 2 it failed once with `expected 53 to be less than 50`.
- **Where the time goes** (temporary probe, not committed: the same scenario repeated 40× in one process, `performance.now()`; 3 runs normal + 3 runs under load = 240 iterations):
  - *leader exit **after** the abort fired:* **0 ms in 240/240 iterations** — the leader leaves in the same tick as the abort;
  - *leader result:* `null` in 240/240; *follower got the real result* in 240/240 (the semantics under test hold every time);
  - *abort-timer lateness* (scheduled 15 ms after a `sleep(5)`): median **16 ms**, p90 22–33 ms, max 44 ms — the timer fires ~16 ms late because of the ~15.6 ms Windows timer granularity (the 5 ms `sleep` also takes ~16 ms);
  - *total exit time from `t0`:* median **31 ms**, p90 32–49 ms, max **59 ms**; 3 of 240 iterations were ≥ 50 ms.
- **What a real regression would look like:** if the leader waited for the shared request it would return at ≈ 60 ms **after** its start with a non-null value (`leaderNull` false) and `exit-after-abort` ≈ 30–45 ms. None of that was observed.

## Why the assertion is fragile
`50 ms` is ~1.6× the median of a quantity that is dominated by two OS timers (5 ms and 15 ms, both rounded up by the platform tick). The headroom (~19 ms) is smaller than the platform's timer jitter under any CPU contention. The test measures the *clock*, while the property it names ("cancellation is immediate, independent of the shared request") is a *relation* between the abort and the leader's return.

## Proposed change (NOT applied — needs owner approval because it edits a Serper test)
Keep the 50 ms intent but test the relation instead of the clock, e.g. (a) record `abortAt` when the abort fires and assert `leaderDoneAt - abortAt < 20` (measured 0 ms in 240/240), and/or (b) raise the stub's fetch delay from 60 ms to ~500 ms and bound the leader exit at ~250 ms, which keeps a 4× margin against timer noise while still failing if the leader waits for the shared request. Either keeps every other assertion (null leader, follower result, one request, ledger).

## Not concluded
This characterises the machine used here (Windows, 12 cores). It does not prove the absence of any other nondeterminism in the Serper tests, and the `npm test` outcome of any single run remains evidence of that run only.
