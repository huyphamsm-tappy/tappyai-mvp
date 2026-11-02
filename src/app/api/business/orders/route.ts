import { NextResponse } from 'next/server'
import { apiError } from '@/lib/http/apiError'
import { logBusinessError } from '@/lib/business/logging'
import { requireMerchant } from '@/lib/business/routeGuard'
import {
  MerchantOrderListQuerySchema,
  decodeOrderCursor,
  encodeOrderCursor,
} from '@/lib/business/schema'
import { listMerchantOrders } from '@/lib/business/repositories/orders'
import { toMerchantOrderSummary } from '@/lib/business/views'

// GET /api/business/orders — the merchant's own order inbox.
//
// AUTH          Controller session; `requireMerchant` resolves the merchant.
// AUTHORIZATION Resource ownership. `merchant_id` comes from the session and is
//               never read from the query, body, path or headers — there is no
//               parameter here through which another shop could be named.
// PII           The merchant's OWN customers' names and phones. This is an
//               authenticated merchant surface and P0 §6 makes the merchant the
//               party who has to contact them.
// ERRORS        401 · 403 merchant_required / merchant_suspended
//               · 422 validation_error (bad query or cursor) · 500
//
// ORDERING is `created_at DESC, public_id DESC`, and the second key is not
// decoration: two orders placed in the same millisecond would otherwise make a
// page boundary ambiguous, and an order a merchant never sees is a sale they
// never make.
//
// PAGINATION is a keyset cursor, following src/app/api/admin/users/schema.ts —
// including its rule that a malformed cursor is a 422 and never a silent
// restart at page one.

export async function GET(req: Request) {
  try {
    const gate = await requireMerchant(req)
    if (!gate.ok) return gate.response

    const url = new URL(req.url)
    const parsed = MerchantOrderListQuerySchema.safeParse({
      status: url.searchParams.get('status') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    })
    if (!parsed.success) return apiError(req, 'validation_error', 'validation.invalid', 422)

    const keyset = parsed.data.cursor ? decodeOrderCursor(parsed.data.cursor) : null
    if (parsed.data.cursor && !keyset) {
      return apiError(req, 'validation_error', 'validation.invalid', 422)
    }

    // One more than asked for, so "is there another page" is answered by the
    // query rather than by a second count that could disagree with it.
    const rows = await listMerchantOrders(gate.ctx, {
      status: parsed.data.status,
      limit: parsed.data.limit + 1,
      cursor: keyset,
    })

    const hasMore = rows.length > parsed.data.limit
    const page = hasMore ? rows.slice(0, parsed.data.limit) : rows
    const last = page[page.length - 1]

    return NextResponse.json({
      orders: page.map(toMerchantOrderSummary),
      page: {
        cursor: hasMore && last ? encodeOrderCursor(last.created_at, last.public_id) : null,
        hasMore,
      },
    })
  } catch (e) {
    logBusinessError('orders.list', e)
    return apiError(req, 'server_error', 'server.error', 500)
  }
}
