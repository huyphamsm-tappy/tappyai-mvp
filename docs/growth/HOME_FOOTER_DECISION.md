# HOME FOOTER — OWNER DECISION: OPTION A (approved 2026-09-19, implemented as documented below)

## The finding

`/` (Home) carries no HTML link to the public discovery surfaces (`/food … /spa`, `/about`, `/scam-shield/kich-ban`, `/extension`). They are reachable from the root only through `sitemap.xml` and from each other. Crawl depth inside the discovery cluster is ≤ 2, but the root itself does not vouch for the cluster with a link — a real, if modest, discovery signal.

## What was done (in scope, no Home change)

`src/components/discovery/PublicFooter.tsx` — the minimal crawlable footer (Explore: five hubs · About: About TappyAI, Scam Shield, Kịch bản lừa đảo, Browser extension). Plain internal `<a href>`s, no parameters, bilingual through the dictionary (`footer.*`), two labelled `<nav>`s, server-rendered. **Mounted on** every hub, `/about`, `/extension`, `/scam-shield/kich-ban` and the 25 scenario pages (test: `publicFooter.test.tsx`). **Not mounted on Home.**

## Why Home was not changed

Home is the owner-locked V3 surface (locked at `a9d0afa`; its shell/nav is a pinned contract — `v3ShellPolish` and the Home suites), and the release freeze says frozen Web behaviour is not changed outside approved growth work. A footer is a visible layout change on the most-reviewed screen. The pinned tests would not fail — the change is additive below the panel grid — but the decision is the owner's, not the agent's.

## The exact minimal change, if approved (one import + one line)

`src/app/HomeV3.tsx`:
```diff
 import V3Shell from '@/components/v3/V3Shell'
+import PublicFooter from '@/components/discovery/PublicFooter'
 …
         </section>
+        <PublicFooter />
       </div>
     </V3Shell>
```
That is the whole change: the footer renders inside the existing scroll container below the last Home section, in the V3 palette's neutral greys, and adds nothing to the shell nav. `publicFooter.test.tsx` currently asserts Home does **not** contain `PublicFooter`; flip that assertion in the same commit.

Alternative if the owner prefers zero visual change on Home: keep Home as is. The discovery cluster is fully interlinked and in the sitemap; the cost is only the missing root→cluster link signal.
