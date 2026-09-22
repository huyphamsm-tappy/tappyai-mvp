import { NextResponse } from 'next/server'
import { getCategories } from '@/modules/music/services/musicService'

// Categories are curated DATA seeded independently of deploys, so this param-less
// route must not be statically cached at build time (that would freeze whatever was
// in the DB when `next build` ran, e.g. an empty catalog). Serve it fresh.
export const dynamic = 'force-dynamic'

// GET /api/music/categories
export async function GET() {
  const categories = await getCategories()
  return NextResponse.json({ categories })
}
