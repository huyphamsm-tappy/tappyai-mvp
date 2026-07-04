import { NextResponse } from 'next/server'
import { getCategories } from '@/modules/music/services/musicService'

// GET /api/music/categories
export async function GET() {
  const categories = await getCategories()
  return NextResponse.json({ categories })
}
