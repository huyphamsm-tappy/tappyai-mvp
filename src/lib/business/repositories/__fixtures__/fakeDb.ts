// A recording stand-in for the Supabase client, used by the repository tests.
//
// ⚠️ WHAT THIS PROVES AND WHAT IT DOES NOT.
//
// It proves the SHAPE OF THE QUERY the repository builds: which table, which
// filters, which payload. That is exactly the property the IDOR tests need —
// "did this read carry `merchant_id` from the context" is a question about the
// query, not about PostgreSQL.
//
// It does NOT prove that PostgreSQL honours those filters, that the grants are
// right, or that a constraint fires. `supabase/tests/tappy_business_p0_boundary.test.ts`
// applies the real migration to a real PostgreSQL 17 and does that.
//
// The repository under test is never mocked — only the store beneath it is,
// following src/lib/security/distributedRateLimit.test.ts. A mocked repository
// would prove the mock.

export interface RecordedCall {
  /** Table name, or the function name for an `rpc` call. */
  table: string
  op: 'select' | 'insert' | 'update' | 'delete' | 'rpc'
  /** Every `.eq()` / `.in()` applied, in the order the repository applied them. */
  filters: Record<string, unknown>
  /** The row(s) handed to insert/update. */
  payload?: unknown
  columns?: string
}

type Result = { data: unknown; error: unknown }

export interface FakeDb {
  /** Passed to `__setBusinessDb`. Shaped like the client, not like a mock library. */
  client: unknown
  calls: RecordedCall[]
  /** Queue a result for the next terminal call on `table`. */
  queue(table: string, result: Partial<Result>): void
  reset(): void
}

export function createFakeDb(): FakeDb {
  const calls: RecordedCall[] = []
  const queued = new Map<string, Result[]>()

  function nextResult(table: string): Result {
    const q = queued.get(table)
    if (q && q.length > 0) return q.shift()!
    return { data: null, error: null }
  }

  function builder(call: RecordedCall) {
    const settle = () => Promise.resolve(nextResult(call.table))

    const api = {
      select(columns?: string) {
        call.columns = columns
        return api
      },
      eq(column: string, value: unknown) {
        call.filters[column] = value
        return api
      },
      in(column: string, values: unknown[]) {
        call.filters[column] = values
        return api
      },
      order() {
        return api
      },
      limit() {
        return api
      },
      maybeSingle: settle,
      single: settle,
      // A Supabase filter builder is a thenable, so `await db.from(..).select(..)`
      // resolves without a terminal call. The fake must be one too, or the
      // repository's list queries would hang instead of failing.
      then(onFulfilled: (r: Result) => unknown, onRejected?: (e: unknown) => unknown) {
        return settle().then(onFulfilled, onRejected)
      },
    }
    return api
  }

  const client = {
    /** `rpc(fn, args)` is recorded with the args as its payload. */
    rpc(fn: string, args: unknown) {
      const call: RecordedCall = { table: fn, op: 'rpc', filters: {}, payload: args }
      calls.push(call)
      return Promise.resolve(nextResult(fn))
    },
    from(table: string) {
      return {
        select(columns?: string) {
          const call: RecordedCall = { table, op: 'select', filters: {}, columns }
          calls.push(call)
          return builder(call).select(columns)
        },
        insert(payload: unknown) {
          const call: RecordedCall = { table, op: 'insert', filters: {}, payload }
          calls.push(call)
          return builder(call)
        },
        update(payload: unknown) {
          const call: RecordedCall = { table, op: 'update', filters: {}, payload }
          calls.push(call)
          return builder(call)
        },
        delete() {
          const call: RecordedCall = { table, op: 'delete', filters: {} }
          calls.push(call)
          return builder(call)
        },
      }
    },
  }

  return {
    client,
    calls,
    queue(table, result) {
      const list = queued.get(table) ?? []
      list.push({ data: result.data ?? null, error: result.error ?? null })
      queued.set(table, list)
    },
    reset() {
      calls.length = 0
      queued.clear()
    },
  }
}

/** Every call the repository made against `table`. */
export function callsFor(db: FakeDb, table: string): RecordedCall[] {
  return db.calls.filter((c) => c.table === table)
}
