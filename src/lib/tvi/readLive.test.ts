// LIVE check of the TVI read path against the store the repo's own .env.local points to (15/11/2026). SKIPPED unless RUN_LIVE_TVI_READ=1. READ-ONLY: it selects, never writes, and prints counts only
// (never a key, a value or a credential). It proves the one thing the unit tests cannot: that the nested select of tviStore.readFacts (entity -> facts -> state -> current version, with the
// `knowledge_fact_versions!current_version_id` hint) is accepted by the real database and returns the shape the reader expects. Run:  RUN_LIVE_TVI_READ=1 npx vitest run src/lib/tvi/readLive.test.ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readFacts } from './tviStore'
import { mergeStoredFacts, placeRowKey } from './readPlaces'

const ON = process.env.RUN_LIVE_TVI_READ === '1'

describe.skipIf(!ON)('LIVE: TVI read path against the real store (read-only)', () => {
  it('reads current facts for real entities, and merges them into a row that lacks the field', async () => {
    try { process.loadEnvFile(join(process.cwd(), '.env.local')) } catch { throw new Error('env not loaded') }
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const db = createAdminClient()
    const { data, error } = await db.from('knowledge_entities').select('entity_key, canonical_name, city').eq('market_id', 'VN').limit(8)
    expect(error).toBeNull()
    const rows = (data ?? []) as Array<{ entity_key: string; canonical_name: string; city: string | null }>
    console.log('LIVE_TVI entities_sampled', rows.length)
    const facts = await readFacts(rows.map(r => r.entity_key), db)
    const byType: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    for (const f of facts) { byType[f.factType] = (byType[f.factType] ?? 0) + 1; byStatus[f.status] = (byStatus[f.status] ?? 0) + 1 }
    console.log('LIVE_TVI facts_read', facts.length, JSON.stringify(byType), JSON.stringify(byStatus))
    expect(facts.length).toBeGreaterThan(0)
    expect(facts.every(f => typeof f.retrievedAt === 'string' && f.retrievedAt.length > 10 && (f.status === 'ACTIVE' || f.status === 'CANDIDATE'))).toBe(true)
    // a row with the name and city of a stored place but NO fields: the stored facts fill it (the key is the one the capture wrote when the provider gave no id, else the provider id)
    const withName = rows.find(r => facts.some(f => f.entityKey === r.entity_key))
    expect(withName).toBeTruthy()
    const key = withName!.entity_key
    const probe = key.startsWith('place:name:') ? { name: withName!.canonical_name } : { name: withName!.canonical_name, place_id: key.replace(/^place:/, '') }
    expect(placeRowKey(probe, withName!.city)).toBe(key)
    const merged = mergeStoredFacts({ results: [probe] }, facts, { city: withName!.city })
    console.log('LIVE_TVI merged rowsFilled', merged.rowsFilled, 'factsAdded', merged.factsAdded)
    expect(merged.rowsFilled).toBe(1)
  }, 60000)
})
