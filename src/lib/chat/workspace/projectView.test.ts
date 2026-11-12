import { describe, it, expect, vi } from 'vitest'
import { projectRows, projectViewStore } from './projectView'
import type { HistoryConversation } from './historyModel'

const conv = (o: Partial<HistoryConversation> & { id: string }): HistoryConversation => ({ title: o.id, updated_at: '2026-11-10T10:00:00Z', ...o })

describe('projectRows', () => {
  const items: HistoryConversation[] = [
    conv({ id: 'a', project_id: 'p1', updated_at: '2026-11-09T10:00:00Z', messages: [{ role: 'user', content: 'Đi Phú Quốc' }, { role: 'assistant', content: 'Nên đi **tháng 12** vì biển êm.' }] }),
    conv({ id: 'b', project_id: 'p1', updated_at: '2026-11-11T10:00:00Z', is_pinned: true, category: 'travel' }),
    conv({ id: 'c', project_id: 'p1', is_archived: true }),
    conv({ id: 'd', project_id: 'p2' }),
    conv({ id: 'e', project_id: null }),
  ]
  it('is the project\'s own live conversations, newest first, with the real preview and counts', () => {
    const rows = projectRows(items, 'p1')
    expect(rows.map(r => r.id)).toEqual(['b', 'a'])
    expect(rows[1].preview).toBe('Nên đi tháng 12 vì biển êm.')
    expect(rows[1].messages).toBe(2)
    expect(rows[0]).toMatchObject({ pinned: true, category: 'travel', preview: null, messages: 0 })
  })
  it('an unknown or empty project has no rows (the empty state)', () => {
    expect(projectRows(items, 'p9')).toEqual([])
    expect(projectRows([], 'p1')).toEqual([])
  })
})

describe('projectViewStore', () => {
  it('notifies only on a change', () => {
    const l = vi.fn()
    const off = projectViewStore.subscribe(l)
    projectViewStore.set('p1'); projectViewStore.set('p1'); projectViewStore.set(null)
    off()
    expect(l).toHaveBeenCalledTimes(2)
    expect(projectViewStore.getSnapshot()).toBeNull()
  })
})
