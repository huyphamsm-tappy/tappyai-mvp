// Read-only grammar probe: what URL shapes does the search index hold for a marketplace?
//   npx tsx --env-file=.env.local scripts/ccp-grammar-probe.ts "<query>" <site-scope> [...]
//   A scope may be an OR group: "shopee.vn|shop.tiktok.com/vn"
import { serperSearch } from '../src/lib/ai/tools/common'

async function main() {
  const [q, ...scopes] = process.argv.slice(2)
  for (const scope of scopes) {
    const sites = scope.split('|')
    const operand = sites.length === 1 ? `site:${sites[0]}` : `(${sites.map(s => `site:${s}`).join(' OR ')})`
    const rows = await serperSearch(`${q} ${operand}`)
    console.log(`\n## ${q} ${operand} → ${(rows ?? []).length} rows`)
    for (const r of (rows ?? []).slice(0, 10)) console.log(`  ${r.link.slice(0, 120)}\n     ${r.title}`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
