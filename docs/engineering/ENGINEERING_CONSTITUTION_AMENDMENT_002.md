# TappyAI Engineering Constitution — Amendment 002 · Article VII

**VII** Linguistic Realism in Verification

**Status:** BINDING · **Scope:** Web · Android · iOS — every language-behavior bug, every session, every agent
**Date:** 2026-07-31 · **Origin:** the AI response-language incidents of 2026-07-29 (`f68836d`) and 2026-07-30 (`33eb188`) — two production bugs, each preceded by an AI-issued PASS (see ADR-016 §7)
**Relationship:** extends Articles I–VI (Amendment 001); does not modify them. Article I's classification gate, Article III's Owner supremacy, and Article IV's path-equivalence matrix all applied to these incidents — this Article adds the *linguistic* dimension those Articles did not name explicitly.

---

## Article VII — Linguistic Realism in Verification

> **A language-behavior test is only as valid as its inputs are real. Synthetic-convenient text is a substituted scenario under Article I §1.**

### §1. The founding failure

Both incidents were false-PASSed the same way: Vietnamese test inputs were typed **without diacritics** ("Banh mi ngon o Ha Noi") because plain ASCII was easier to script. Under the code then shipping, those inputs **never entered the Vietnamese code path at all** — every "Vietnamese → Vietnamese PASS" was coincidental model behavior, not verified code behavior. Meanwhile the single most common real-world query shape — a **correctly-diacritized proper noun inside a foreign-language sentence** ("Phú Quốc itinerary…", "i wanna fo to eat Phở") — was never tested, and was precisely the failing class the Owner found in minutes.

### §2. Rules (binding)

1. **Diacritic realism.** Vietnamese test inputs MUST carry real diacritics exactly as a Vietnamese-typing user produces them. An undiacritized "Vietnamese" input tests the *English* path and MUST be labelled as such. (Encoding difficulties are a tooling problem, never a justification — put inputs in a UTF-8 data file; see ADR-016 §7.)
2. **Proper-noun cases are mandatory.** Every language-behavior verification MUST include correctly-diacritized Vietnamese proper nouns (places, dishes) embedded in non-Vietnamese sentences, and the reverse (foreign loanwords inside Vietnamese sentences). ADR-016 §6 is the canonical minimum set; it is permanent and append-only.
3. **Both directions, every time.** Any change touching language detection/localization MUST verify EN→EN, VI→VI, mixed, and explicit-override cases in the same run. A fix verified in one direction only is `PARTIALLY VERIFIED` (Article IV §3).
4. **Preview PASS is insufficient to close.** A language bug — however verified by the AI, at whatever gate — is closed **only** by Product Owner verification on Preview or Production (Article III §4, Article VI §1 applied specifically). The AI's evidence is input to the Owner's verdict, never a substitute for it.
5. **Locale is a material path dimension.** Under Article IV §1, input language/diacritic profile and the authenticated-vs-anonymous state are declared **material** for all AI-response bugs: verification on inputs of a different linguistic shape than the Owner's, or on a different auth state, caps the verdict at `PARTIALLY VERIFIED`.

### §3. Compliance signals

- Language-behavior bug records show the exact test strings (with diacritics visible), not descriptions of them.
- `src/lib/ai/intent.test.ts` contains every ADR-016 §6 case; PRs deleting cases are rejected absent a superseding ADR.
- Closure notes for language bugs cite the Owner's verification message, not an AI-run result.

---

> **Engineering Constitutions exist to preserve hard-earned lessons, not to accumulate rules. Every amendment should be justified by a real production incident.** This Article is justified by two.

---

**Adopted as Article VII of the TappyAI Engineering Constitution.** Companion documents: `docs/architecture/ADR-016-ai-language-detection-and-localization.md` (strategy + regression suite), Amendment 001 (Articles I–VI).
