// Read-only grammar probe: what URL shapes does the search index hold for a marketplace?
//   npx tsx --env-file=.env.local scripts/ccp-grammar-probe.ts "<query>" <site-scope> [...]
import { serperSearch } from '../src/lib/ai/tools/common'

async function main() {
  const [q, ...scopes] = process.argv.slice(2)
  for (const scope of scopes) {
    const rows = await serperSearch(`${q} site:${scope}`)
    console.log(`\n## ${q} site:${scope} → ${(rows ?? []).length} rows`)
    for (const r of (rows ?? []).slice(0, 8)) console.log(`  ${r.link}\n     ${r.title}`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
