# Bug Reproduction Gate — Workflow

**Binding:** Engineering Constitution Amendment I · **Rationale:** ADR-015 · Applies to Web, Android, iOS.

## The flow

```mermaid
flowchart TD
    A["Owner reports/assigns a bug"] --> B["Capture the Owner Reproduction Record<br/>(surface · identity · steps · expected vs actual · device)"]
    B --> C["Build the prerequisite inventory<br/>(11 categories, evidence per item)"]
    C --> D{"Every prerequisite<br/>SATISFIED by the AI?"}

    D -- "No" --> E["Classification:<br/>PARTIALLY or NOT REPRODUCIBLE"]
    E --> F["Write MISSING PREREQUISITES REPORT"]
    F --> G(["HARD STOP<br/>no code · no fix · no E2E<br/>no PASS · no concluded RCA"])
    G --> H["Owner satisfies the blocking item<br/>(e.g. signs in, shows browser pane,<br/>provides device/flag/data)"]
    H --> C

    D -- "Yes" --> I["Execute the Owner's EXACT path"]
    I --> J{"Did the AI observe<br/>the failure itself?"}

    J -- "No" --> K["Classification: NOT REPRODUCED<br/>(record what was seen instead)"]
    K --> F

    J -- "Yes" --> L["Classification: REPRODUCIBLE<br/>capture RED evidence<br/>(state + visual + build identity)"]
    L --> M["RCA on the reproduced failure"]
    M --> N(["Implementation UNLOCKED"])
    N --> O["Implement the fix"]
    O --> P["Re-run the SAME Owner path,<br/>same environment, new build identity"]
    P --> Q{"Same path now correct?"}
    Q -- "No" --> M
    Q -- "Yes" --> R["Capture GREEN evidence<br/>RED + GREEN, one path, both builds recorded"]
    R --> S["Regression + unit + build gates"]
    S --> T["Owner UAT — the only PASS that closes the bug"]
    T --> U["Release gate G0…Gn"]
```

## Gate decision table

| Situation | Classification | Implementation | Report to produce |
|---|---|---|---|
| AI ran the Owner's path and saw the failure | REPRODUCIBLE | **Unlocked** | RED evidence pack |
| Path ran anonymously; the bug needs a signed-in account | PARTIALLY | **Blocked** | Missing Prerequisites |
| Failure emulated (mock/injection/synthetic input) | PARTIALLY | **Blocked** | Missing Prerequisites |
| Only state observed; symptom is visual | PARTIALLY | **Blocked** | Missing Prerequisites |
| Surface/build the Owner used is unproven | PARTIALLY | **Blocked** | Missing Prerequisites |
| Path cannot run at all (no device, no permission, no data) | NOT REPRODUCIBLE | **Blocked** | Missing Prerequisites |
| AI ran the exact path and it worked correctly | NOT REPRODUCED | **Blocked** | Missing Prerequisites + divergence note |
| Owner issued a written waiver | NOT REPRODUCIBLE (waived) | Speculative only, `UNVERIFIED` | Waiver record; PASS still forbidden |

## Evidence pack — required fields

Both RED and GREEN captures must carry:

| Field | Example |
|---|---|
| Commit SHA | `f76e9c9…` |
| Artifact identity | bundle chunk hash / APK versionCode / IPA build |
| Surface | `http://localhost:3000/reviews` · `www.tappyai.com` · device model + OS |
| Identity | signed-in `uid=…` / anonymous — stated, never assumed |
| Exact steps | numbered, verbatim from the Owner Reproduction Record |
| Machine state | the app's own state dump (e.g. `__exploreSession.getState()`) |
| Visual | screenshot/recording for any user-visible symptom |
| Console + network | errors, relevant request counts |
| Timestamp | ISO, both captures |

## Standing vocabulary

`PASS` — RED+GREEN on the Owner's exact path (Amendment I §6).
`PARTIAL` — executed, prerequisites substituted.
`BLOCKED` — could not execute; prerequisite missing.
`UNVERIFIED` — hypothesis or reasoning only.
`FAIL` — executed and still failing.
**Product UAT: WAITING FOR PRODUCT OWNER** — the closing verdict is always the Owner's.
