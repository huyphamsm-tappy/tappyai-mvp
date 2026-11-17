import { describe, it, expect, afterEach } from 'vitest'
import {
  KNOWLEDGE_CACHE_MS, KNOWLEDGE_FAILURE_CACHE_MS, __resetKnowledgeCache, __setKnowledgeStore, allScenarios, formatKnowledgeDate, getKnowledgeMeta, staticKnowledgeMeta,
  type KnowledgeVersionRow, type KnowledgeVersionStore,
} from '../index'

const row = (over: Partial<KnowledgeVersionRow> = {}): KnowledgeVersionRow => ({
  version: 1, source_url: 'https://bocongan.gov.vn/bai-viet/a-1', host: 'bocongan.gov.vn', title: 'Cảnh báo A', published_at: '2026-11-11',
  fetched_at: '2026-11-17T03:00:00.000Z', verified_at: '2026-11-17T03:00:00.000Z', content_hash: 'a'.repeat(64), status: 'approved', body: 'x', structured: null, ...over,
})
const storeOf = (listApproved: KnowledgeVersionStore['listApproved']): KnowledgeVersionStore & { calls: number } => {
  const s = { calls: 0, listApproved: async (n: number) => { s.calls++; return listApproved(n) }, hasHash: async () => false, insert: async () => true, touchVerified: async () => {} }
  return s
}

afterEach(() => { __setKnowledgeStore(null); __resetKnowledgeCache() })

describe('getKnowledgeMeta — the latest approved version first, the static file as the fallback', () => {
  it('no store, or an empty table: the static dataset (the module behaves exactly as before the sync)', async () => {
    const st = staticKnowledgeMeta()
    expect(st).toMatchObject({ origin: 'static', verifiedAt: '2026-09-15', organization: 'Bộ Công an', recent: [] })
    expect(st.sourceUrl).toMatch(/^https:\/\/bocongan\.gov\.vn\//)
    expect(await getKnowledgeMeta()).toEqual(st)
    expect(await getKnowledgeMeta({ store: storeOf(async () => []) })).toEqual(st)
  })

  it('approved rows win: newest date, source link of the newest article, recent warnings newest first', async () => {
    const meta = await getKnowledgeMeta({ store: storeOf(async () => [
      row({ source_url: 'https://bocongan.gov.vn/bai-viet/old-1', title: 'Cũ', published_at: '2026-10-01', verified_at: '2026-11-10T03:00:00.000Z' }),
      row({ source_url: 'https://bocongan.gov.vn/bai-viet/new-2', title: 'Mới', published_at: '2026-11-11', verified_at: '2026-11-17T03:00:00.000Z' }),
    ]) })
    expect(meta).toMatchObject({ origin: 'database', verifiedAt: '2026-11-17', sourceUrl: 'https://bocongan.gov.vn/bai-viet/new-2', sourceTitle: 'Mới' })
    expect(meta.recent.map(r => r.title)).toEqual(['Mới', 'Cũ'])
  })

  it('serves only APPROVED rows on an official https host, whatever the table holds', async () => {
    const meta = await getKnowledgeMeta({ store: storeOf(async () => [
      row({ status: 'pending' }),
      row({ status: 'rejected' }),
      row({ source_url: 'https://evil.example/bai-viet/x', host: 'evil.example' }),
      row({ source_url: 'http://bocongan.gov.vn/bai-viet/x' }),
    ]) })
    expect(meta).toEqual(staticKnowledgeMeta())
  })

  it('never goes backwards: a verified date older than the static dataset is ignored', async () => {
    const meta = await getKnowledgeMeta({ store: storeOf(async () => [row({ verified_at: '2026-01-01T00:00:00Z', fetched_at: '2026-01-01T00:00:00Z' })]) })
    expect(meta.verifiedAt).toBe('2026-09-15')
  })

  it('FAIL-OPEN: a database error (migration not applied) returns the static dataset and never throws', async () => {
    const store = storeOf(async () => { throw new Error('relation "scam_knowledge_versions" does not exist') })
    await expect(getKnowledgeMeta({ store })).resolves.toEqual(staticKnowledgeMeta())
  })

  it('FAIL-OPEN: a slow database does not hold the request past the timeout', async () => {
    const store = storeOf(() => new Promise(() => {})) // never answers
    const t0 = Date.now()
    await expect(getKnowledgeMeta({ store, timeoutMs: 40 })).resolves.toEqual(staticKnowledgeMeta())
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it('caches for a few minutes (one read), and a failure for one minute', async () => {
    const ok = storeOf(async () => [row()])
    const t = 1_000_000
    await getKnowledgeMeta({ store: ok, now: t })
    await getKnowledgeMeta({ store: ok, now: t + KNOWLEDGE_CACHE_MS - 1 })
    expect(ok.calls).toBe(1)
    await getKnowledgeMeta({ store: ok, now: t + KNOWLEDGE_CACHE_MS + 1 })
    expect(ok.calls).toBe(2)

    __resetKnowledgeCache()
    const bad = storeOf(async () => { throw new Error('down') })
    await getKnowledgeMeta({ store: bad, now: t })
    await getKnowledgeMeta({ store: bad, now: t + KNOWLEDGE_FAILURE_CACHE_MS - 1 })
    expect(bad.calls).toBe(1)
    await getKnowledgeMeta({ store: bad, now: t + KNOWLEDGE_FAILURE_CACHE_MS + 1 })
    expect(bad.calls).toBe(2)
  })

  it('the test seam injects a store; the synchronous dataset API is untouched by it', async () => {
    const before = allScenarios().length
    __setKnowledgeStore(storeOf(async () => [row()]))
    expect((await getKnowledgeMeta()).origin).toBe('database')
    expect(allScenarios()).toHaveLength(before)
    expect(before).toBe(25)
  })

  it('structured fields written beside the official text are passed through, the policy bookkeeping is not', async () => {
    const meta = await getKnowledgeMeta({ store: storeOf(async () => [
      row({ structured: { policy: { reasons: [] }, ai: { machine_made: true, name: 'X' } } }),
      row({ source_url: 'https://bocongan.gov.vn/bai-viet/b-2', published_at: '2026-11-01', structured: { policy: { reasons: [] } } }),
    ]) })
    expect(meta.recent[0].structured).toEqual({ ai: { machine_made: true, name: 'X' } })
    expect(meta.recent[1].structured).toBeUndefined()
  })
})

describe('formatKnowledgeDate', () => {
  it('ISO to dd/mm/yyyy', () => {
    expect(formatKnowledgeDate('2026-11-17')).toBe('17/11/2026')
    expect(formatKnowledgeDate('2026-11-17T03:00:00Z')).toBe('17/11/2026')
    expect(formatKnowledgeDate('soon')).toBe('soon')
  })
})
