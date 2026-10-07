import Header from '@/components/Header'
import { PUBLISHED_GUIDELINES_TITLE, type GuidelineBlock, type GuidelineSection } from '@/lib/legal/communityGuidelinesPublished'

// Phase 7 closeout CP6 — the canonical Community Guidelines exactly as published (Vietnamese; 28 sections, verbatim from the
// owner's document). Same frame and type scale as LegalDocument. Rendered only when the three legal facts are configured.

function Runs({ block }: { block: GuidelineBlock }) {
  return <>{block.runs.map((r, i) => (r.bold ? <strong key={i} className="font-semibold text-gray-900 dark:text-white">{r.text}</strong> : <span key={i}>{r.text}</span>))}</>
}

function Blocks({ blocks }: { blocks: GuidelineBlock[] }) {
  // Consecutive list items render as one <ul>; paragraphs as <p>.
  const groups: Array<{ kind: 'p' | 'li'; items: GuidelineBlock[] }> = []
  for (const b of blocks) {
    const last = groups[groups.length - 1]
    if (b.kind === 'li' && last?.kind === 'li') last.items.push(b)
    else groups.push({ kind: b.kind, items: [b] })
  }
  return (
    <>
      {groups.map((g, i) => g.kind === 'li' ? (
        <ul key={i} className="space-y-2.5">
          {g.items.map((b, j) => (
            <li key={j} className="flex gap-3 text-fluid-body text-gray-600 dark:text-gray-300">
              <span aria-hidden="true" className="mt-[0.65em] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-500" />
              <span><Runs block={b} /></span>
            </li>
          ))}
        </ul>
      ) : (
        <p key={i} className="text-fluid-body text-gray-600 dark:text-gray-300"><Runs block={g.items[0]} /></p>
      ))}
    </>
  )
}

export default function PublishedGuidelines({ meta, sections }: { meta: string[]; sections: GuidelineSection[] }) {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
      <Header showBack backFallbackHref="/" />
      <main className="container-content py-10 sm:py-14" lang="vi" data-guidelines="published">
        <header className="mb-8 sm:mb-10">
          <h1 className="text-fluid-display font-bold text-gray-900 dark:text-white">{PUBLISHED_GUIDELINES_TITLE}</h1>
          <span aria-hidden="true" className="mt-4 block h-1 w-12 rounded-full bg-accent-500" />
          <div className="mt-4 space-y-1 text-sm text-gray-600 dark:text-gray-300">
            {meta.map((m, i) => <p key={i}>{m}</p>)}
          </div>
        </header>
        <div className="space-y-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10 sm:space-y-10 sm:p-8">
          {sections.map((s, i) => (
            <section key={i} id={`muc-${i + 1}`} aria-labelledby={`muc-${i + 1}-heading`} className="scroll-mt-20 space-y-3" data-guideline-section>
              <h2 id={`muc-${i + 1}-heading`} className="text-fluid-h3 font-semibold text-gray-900 dark:text-white">{s.heading}</h2>
              <Blocks blocks={s.blocks} />
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
