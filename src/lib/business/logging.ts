// Tappy Business — the one way this capability writes to the log.
//
// ============================================================================
// 🚨 WHY `console.error(scope, e)` IS NOT SAFE HERE
// ============================================================================
// PostgreSQL puts the OFFENDING ROW into an error's `detail` field. A CHECK or
// NOT NULL violation on `business_orders` therefore carries:
//
//     Failing row contains (…, Nguyễn Thị Lan, 0901234567, 128 Nguyễn Văn Cừ…)
//
// The Supabase client surfaces that as `error.details`, and passing the error
// object to `console.error` serialises all of it. Every Business route was
// doing exactly that, so a single constraint violation would have written a
// customer's name, phone number and delivery address into the platform log —
// somewhere with a different retention policy and a different audience than the
// database those columns were designed for.
//
// So nothing here logs a message body. What is logged is the SHAPE of the
// failure — its class and, for a database error, its SQLSTATE — plus a safe
// identifier the operator can use to find the row themselves.
//
// ============================================================================
// WHAT COUNTS AS A SAFE IDENTIFIER
// ============================================================================
// An order's PUBLIC id. Not the tracking token, not its hash, not the internal
// UUID, not the phone. The public id is already in the merchant's dashboard and
// means nothing to someone who cannot authenticate as that merchant.

/** Fields we are willing to put in a log line. */
interface SafeContext {
  /** Order or product public id. Never a token, hash, internal UUID or phone. */
  reference?: string
  /** Machine outcome, e.g. 'idempotency_conflict'. Never free text from a user. */
  outcome?: string
}

/** A PostgREST/pg error, as far as we are prepared to look at one. */
function sqlState(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const code = (error as { code?: unknown }).code
  // SQLSTATE is five alphanumerics. Anything else is not a code we recognise,
  // and echoing it could echo a message.
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null
}

function errorClass(error: unknown): string {
  if (error instanceof Error) return error.name || 'Error'
  return typeof error
}

/**
 * Log a Business failure without logging what failed on.
 *
 * `scope` is a fixed literal at the call site (`'orders.create'`), never
 * interpolated from a request.
 */
export function logBusinessError(scope: string, error: unknown, context: SafeContext = {}): void {
  const parts = [`[business][${scope}]`, errorClass(error)]
  const state = sqlState(error)
  if (state) parts.push(`sqlstate=${state}`)
  if (context.reference) parts.push(`ref=${context.reference}`)
  if (context.outcome) parts.push(`outcome=${context.outcome}`)
  // 🚨 `error` itself is deliberately NOT passed. Neither is `.message`,
  // `.details` or `.hint` — the first can quote a value, the second contains
  // the failing row, and the third suggests one.
  console.error(parts.join(' '))
}

/**
 * Log an operational event worth seeing in production.
 *
 * Deliberately thin: this is not an analytics system and must not become one.
 * It exists so that "orders stopped being created at 14:00" is answerable
 * without reading the database.
 */
export function logBusinessEvent(event: string, context: SafeContext = {}): void {
  const parts = [`[business][${event}]`]
  if (context.reference) parts.push(`ref=${context.reference}`)
  if (context.outcome) parts.push(`outcome=${context.outcome}`)
  console.info(parts.join(' '))
}
