# Controller V2 — Backlog

Deferred work, deliberately not done now. Each item states its gate. Nothing here is scheduled until its gate is met.

---

## BL-001 — ADR Consolidation & Numbering Cleanup

**Status:** Backlog · **Gate:** after the Controller V2 Foundation (Phase 1) is complete
**Raised by:** [ADR-017 §7](../architecture/ADR-017-service-role-hardening-strategy.md) · **Owner decision 2026-08-03:** keep `ADR-017`, do not consolidate now

### Problem

The repository runs **two parallel, colliding ADR series**.

| Series | Location | Numbers |
|---|---|---|
| Inline | `docs/backoffice/22_Architecture_Decision_Records.md` (14 headings) | ADR-000 … ADR-013 |
| Standalone files | `docs/architecture/`, `docs/engineering/` | ADR-014 … ADR-017 |

Two concrete defects:

1. **`ADR-014` is ambiguous.** Two different documents claim it:
   - `docs/architecture/ADR-014-migration-apply-checklist.md`
   - `docs/architecture/ADR-014-notification-unification.md`

   **14 files reference "ADR-014"** and a reader cannot tell which document is meant. This is the real harm — not untidiness, but 14 citations that do not resolve.

2. **Numbers are allocated by guessing.** `ADR-015` was requested for the Service Role Hardening Strategy while already taken by `docs/engineering/ADR-015-bug-reproduction-gate.md` (binding; cited by Engineering Constitution Amendment I). Caught only because the number was checked before filing. There is no registry, so the next collision is a matter of time.

### Scale (measured 2026-08-03)

18 distinct ADR numbers in use, **~174 file references** in total.

| ADR | Files referencing | Note |
|---|---|---|
| 001 | 17 | |
| 008 | 16 | |
| **014** | **14** | **ambiguous — two documents** |
| 009 | 14 | |
| 003 | 12 | |
| 005, 011 | 11 | |
| 004, 007, 016 | 10 | |
| 002, 006 | 9 | |
| 010 | 8 | |
| 013, 015 | 6 | 015 is binding (Engineering Constitution) |
| 012, 017 | 5 | |
| 000 | 1 | |

### Proposed work

1. **Create an ADR registry** — one index file listing every ADR: number, title, status, canonical path. Allocation reads the registry; the registry is the source of truth for "what number is free".
2. **Resolve the `ADR-014` collision** — keep one, renumber the other to the next free number, update all 14 referencing files. Prefer renumbering the *migration-apply-checklist* (operational, fewer semantic citations) over *notification-unification*, but confirm by inspecting the actual references first.
3. **Decide one home for ADRs** — either promote the 14 inline ADRs in `docs/backoffice/22` to standalone files, or keep both forms and let the registry map them. Promoting is cleaner; it is also ~14 file moves plus reference rewrites.
4. **Add a guard** — extend `scripts/architecture/check.mjs` with a rule that fails CI when two files claim the same ADR number, or when an ADR is referenced but absent from the registry. The guard engine is already rules-as-data, so this is a new rule entry, not new machinery.

### Constraints

- **`ADR-015` (Bug Reproduction Gate) is binding** and cited by Engineering Constitution Amendment I. Renumbering it changes a governing document and needs its own explicit approval — do not fold it into a cleanup pass.
- Reference rewrites must be verified, not sed-and-hope: after the change, every `ADR-0NN` token must resolve to exactly one document.
- Do this as one atomic change. A half-renumbered state is worse than the current one.

### Why deferred

It touches binding governance documents and ~174 references across the doc set, while the Foundation is mid-build and the frozen `docs/backoffice` v1.1 set may itself be superseded by Controller V2 (open decision). Renumbering now risks doing the work twice.

**Not urgent:** the ambiguity is a documentation-navigation cost, not a correctness or security risk. No code reads ADR numbers.
