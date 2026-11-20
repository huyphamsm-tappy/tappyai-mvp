// A tiny in-memory stand-in for the Supabase query builder, used only by the group route tests: select / insert / update / delete, eq / in / gt filters, order, single / maybeSingle,
// exact counts with head. `getDb` returns the tables the test owns; a unique (group_id, user_id) pair on group_members and a unique (group_id, user_id) pair on group_votes answer 23505.
type Row = Record<string, unknown>
export type FakeDb = Record<string, Row[]>

export function fakeClient(getDb: () => FakeDb) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
      let payload: Row = {}
      let count: { head: boolean } | null = null
      let orderBy: { col: string; asc: boolean } | null = null
      let limitN: number | null = null
      const match = (r: Row) => filters.every(f => f(r))
      const run = () => {
        const db = getDb()
        const rows = (db[table] ??= [])
        if (op === 'insert' || op === 'upsert') {
          const uniq = ['group_members', 'group_votes'].includes(table) ? rows.find(r => r.group_id === payload.group_id && r.user_id === payload.user_id) : undefined
          if (uniq && op === 'insert') return { data: null, error: { code: '23505' }, count: null }
          if (uniq) { Object.assign(uniq, payload); return { data: [uniq], error: null, count: null } }
          const row = { id: `${table}-${rows.length + 1}`, created_at: new Date().toISOString(), ...payload }
          rows.push(row)
          return { data: [row], error: null, count: null }
        }
        if (op === 'update') { rows.filter(match).forEach(r => Object.assign(r, payload)); return { data: null, error: null, count: null } }
        if (op === 'delete') { db[table] = rows.filter(r => !match(r)); return { data: null, error: null, count: null } }
        let found = rows.filter(match)
        if (orderBy) { const { col, asc } = orderBy; found = [...found].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1)) }
        if (limitN !== null) found = found.slice(0, limitN)
        return { data: count?.head ? null : found, error: null, count: count ? found.length : null }
      }
      const q: Record<string, unknown> = {
        select(_cols?: string, o?: { count?: string; head?: boolean }) { if (o?.count) count = { head: !!o.head }; return q },
        eq(k: string, v: unknown) { filters.push(r => r[k] === v); return q },
        in(k: string, vs: unknown[]) { filters.push(r => vs.includes(r[k])); return q },
        gt(k: string, v: unknown) { filters.push(r => String(r[k]) > String(v)); return q },
        order(col: string, o?: { ascending?: boolean }) { orderBy = { col, asc: o?.ascending !== false }; return q },
        limit(n: number) { limitN = n; return q },
        insert(p: Row) { op = 'insert'; payload = p; return q },
        upsert(p: Row) { op = 'upsert'; payload = p; return q },
        update(p: Row) { op = 'update'; payload = p; return q },
        delete() { op = 'delete'; return q },
        single() { const r = run(); const row = (r.data as Row[] | null)?.[0] ?? null; return Promise.resolve({ data: row, error: row ? null : { code: 'PGRST116' } }) },
        maybeSingle() { const r = run(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: null }) },
        then(resolve: (v: unknown) => unknown) { return Promise.resolve(run()).then(resolve) },
      }
      return q
    },
  }
}
