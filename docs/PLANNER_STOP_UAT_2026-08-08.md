# Planner Stop UAT — 2026-08-08

Device: `R58RC0V30BH` (Samsung SM-A127F, Android 12, build `A127FXXU5BVE4`)
Build under test: `com.tappyai.app.debug` `0.1.0-debug`, installed 2026-08-07 18:57 from
`feat/backoffice-phase0` @ **`13b5e33`**
Fixes in scope: `d9f9f0f` (persist itinerary when Stop is pressed) · `e61c2eb` (plan item width)

# RESULT: NOT PASS — the specified test could not be executed

Not a failure of the fix. **No defect was observed.** The test as specified is not executable against
this build + backend, for a reason that was measured rather than assumed (§3).

---

## 1. Preconditions

| Step | Result |
|---|---|
| adb sees the device | ✅ `R58RC0V30BH … device` (after the owner reconnected it) |
| Quota reset | ✅ device clock past VN midnight; 14 chat turns accepted during the session |
| Build provenance | ✅ planner path is exactly `13b5e33` — the 13 uncommitted `android/` files in that worktree are bookings/groupdining/memory i18n only, none touching chat, planner or streaming |

Interruption worth recording: at 10:19 a **Samsung system update** seized the foreground mid-test and
rebooted the phone (offline 10:23→10:34). Later, an "update ready to install" screen stole focus
again. I did not touch `Cài đặt ngay` / `Lịch cài đặt` — that is the owner's decision. All subsequent
driver versions guard every tap on the app being foreground so a stray tap can never hit it.

## 2. What was exercised, with evidence

| # | Scenario | Observed | Verdict |
|---|---|---|---|
| A | Natural completion (no Stop) | Full plan card: header `2 người · 4.800.000 VND`, day tabs `Ngày 1 (9/8) / Ngày 2 / Ngày 3`, timeline slots, per-item images, price badges, `Bản đồ` + **`Đặt ngay`** booking buttons, `Chi phí ước tính` + `Tổng ước tính 4.800.000 VND`, `📤 Chia sẻ lịch trình`, CTA buttons (Booking.com / Agoda / ShopeeFood / Maps), `Lưu địa điểm`, follow-up chips. No raw markers, no raw JSON | ✅ healthy |
| B | Stop pressed at **+40s**, mid-reply | Partial reply preserved and rendered — prose truncated mid-word (`quán ăn ngon như **Quán`) with enrichment images shown, no raw `[TAPPY_PLAN]` markers, no raw JSON, conversation persisted | ✅ cancel path preserves what arrived |
| C | Stop pressed at **+52s / +55s**, stream provably open | Assistant message empty (nothing had arrived yet), no crash, conversation persisted | ✅ graceful |
| D | **Stop immediately after `[/TAPPY_PLAN]`** | **NEVER REACHED** — see §3 | ⛔ not executed |

## 3. Why D is not executable (measured, not inferred)

An instrumented observation run (no Stop pressed) sampled the UI every ~3.3s for the whole stream:

```
+4s len=593 stop=1      ...      +58s len=593 stop=1
+61s len=1583 stop=0    <- stream closed
```

**The visible text never changed for 18 consecutive samples across 58 seconds**, then the entire
reply appeared at close. Two consequences:

1. **There is no observable signal for "the closing `[/TAPPY_PLAN]` has arrived."** Not for
   automation and not for a human either — during streaming the user sees only the typing indicator.
   `ChatViewModel.streamAssistantReply` sets `plan` in exactly two places (the success path after
   `collect{}`, and the `catch (CancellationException)` Stop path), so the TripPlanCard *cannot*
   render mid-stream by design.
2. **The interval between the plan arriving and the stream closing is effectively zero**, because the
   whole payload lands in a final burst. Direct evidence: Stop with the stream *provably open*
   (Stop button present in the dump immediately before tapping that node) at +52s and +55s both
   yielded an **empty** reply — nothing had arrived — while the stream closed at +56s and +61s in
   other runs.

Measured stream durations: **38s, 56s, 61s** — ±23s of variance, with the payload arriving in the
last moment of each. Hitting a sub-second window inside that spread by timing is not a test, it is a
lottery.

14 attempts were made across 9 driver revisions before concluding this.

## 4. Discarded result — recorded so it is not reused

One run (`v8`, press at +52s) reported `PASS_CANCEL_PATH`. **It was discarded.** It tapped a fixed
coordinate without proving the stream was open, and judged the cancel path by "CTA buttons absent" —
but `uiautomator dump` only reports **on-screen** nodes, and the CTA buttons sit below the fold.
Scrolling revealed they were present, meaning that run was a natural completion, not a cancel.
🔑 Never treat "absent from a uiautomator dump" as "absent from the screen".

## 5. Criteria status

| Criterion | Status |
|---|---|
| Plan card still renders after Stop | ⛔ NOT VERIFIED (§3) |
| No raw `[TAPPY_PLAN]` markers | ✅ verified in A and B |
| No raw JSON | ✅ verified in A and B |
| Conversation persisted | ✅ verified in B and C |
| Reopen from History | ⛔ NOT VERIFIED — gated on D producing a stopped plan |
| Plan restores correctly | ⛔ NOT VERIFIED — same gate |
| Images still render | ✅ verified in A and B |
| Booking buttons render | ✅ verified in A (`Đặt ngay`) |
| Share still works | ⚠️ control present (`Chia sẻ lịch trình`); not activated — that opens the system share sheet |
| No regression | ✅ nothing broken observed in 14 runs |

## 6. Related finding (reported, not fixed — out of scope)

The cancel path introduced by `d9f9f0f` has **no automated coverage**: no file under
`android/app/src/test/` references `CancellationException` or `onStop`. `ChatPlanTest.kt` covers
marker hiding and plan deserialization, `PlanItemPriceWidthTest.kt` covers `e61c2eb`. Given the
device test is not reachable, a ViewModel-level test that cancels the stream after feeding a complete
`[TAPPY_PLAN]` block is the only practical way to gate this behaviour. **Not written — outside the
"no new code" scope of this task.**

## 7. Device state restored

`svc power stayon` reset to `false`; scratch PNG/XML files removed from `/sdcard`. No app data
cleared, no settings changed, no system update installed.
