import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { HOST_PLATFORMS } from './connectorContract'
import { parseClientRegistry } from './identity'
import { channelOf } from './attribution'

// 22/11/2026: Cursor, Grok, DeepSeek and Meta joined Claude, ChatGPT and Gemini. Every place that names a Host must follow the ONE list, including the database CHECK
// of the (not yet applied) 20261121 migration, or a job for a new Host would be refused at the database.
describe('every registered Host is accepted everywhere a Host is named', () => {
  it('the list is exactly the seven Hosts', () => {
    expect([...HOST_PLATFORMS]).toEqual(['claude', 'chatgpt', 'gemini', 'cursor', 'grok', 'deepseek', 'meta'])
  })
  it('the client registry accepts each Host and still rejects an unknown one', () => {
    const raw = JSON.stringify(Object.fromEntries([...HOST_PLATFORMS.map((h, i) => [`c${i}`, { host: h }]), ['bad', { host: 'bing' }]]))
    const reg = parseClientRegistry(raw)
    expect(Object.keys(reg).length).toBe(HOST_PLATFORMS.length)
    expect(reg['bad']).toBeUndefined()
    expect(reg['c3']).toEqual({ host: 'cursor' })
  })
  it('each Host has its own attribution channel', () => {
    expect(new Set(HOST_PLATFORMS.map(channelOf)).size).toBe(HOST_PLATFORMS.length)
    expect(channelOf('grok')).toBe('grok_mcp')
  })
  it('the mcp_jobs migration CHECK lists every Host', () => {
    const sql = readFileSync('supabase/migrations/20261121_mcp_jobs.sql', 'utf8')
    const m = sql.match(/host\s+text NOT NULL CHECK \(host IN \(([^)]*)\)\)/)
    expect(m).not.toBeNull()
    const listed = (m![1].match(/'([a-z]+)'/g) ?? []).map(s => s.replace(/'/g, ''))
    expect(listed.sort()).toEqual([...HOST_PLATFORMS].sort())
  })
})
