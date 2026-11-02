// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { selectTools } from './toolRegistry'
import { tool } from 'ai'
import { z } from 'zod'

// Prompt cache: the tool list is the first part of the cached prefix. Chosen from a sliding window of user messages it changed between turn 2 and
// turn 3 of one conversation (live 2026-10-11: cache read 11,050 → 0 tokens). The flag feeds selectTools EVERY user message of the request.

const mk = () => tool({ description: 'x', parameters: z.object({}), execute: async () => ({}) })
const TOOLS = { search_places: mk(), web_search: mk(), read_page: mk(), search_products: mk(), get_transport_options: mk() } as never
const T1 = 'Mình đang cân nhắc mua tai nghe chống ồn để đi làm bằng xe buýt, bạn tư vấn giúp mình nhé.'
const T2 = 'Ngân sách của mình khoảng 3 triệu và mình hay dùng iPhone.'
const T3 = 'Vậy mình nên chọn loại over-ear hay in-ear?'

describe('tool list stability across a conversation', () => {
  it('a two-message window DROPS a hint word at turn 3 (the defect); all messages keep it (the flag)', () => {
    const w2 = selectTools(TOOLS, { texts: [T2, T3] }).exposed
    const all = selectTools(TOOLS, { texts: [T1, T2, T3] }).exposed
    const t2 = selectTools(TOOLS, { texts: [T1, T2] }).exposed
    expect(t2).toContain('get_transport_options')
    expect(w2).not.toContain('get_transport_options')
    expect(all).toEqual(t2) // turn 3 exposes exactly what turn 2 did → same cache prefix
  })
  it('the list only grows as a conversation goes on', () => {
    const e = (n: number) => selectTools(TOOLS, { texts: [T1, T2, T3].slice(0, n) }).exposed
    for (let n = 1; n < 3; n++) for (const name of e(n)) expect(e(n + 1)).toContain(name)
  })
})
