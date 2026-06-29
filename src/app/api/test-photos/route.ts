import { searchPlaces } from '@/lib/ai/tools/food'

export async function GET() {
  try {
    const result = await searchPlaces('pho ngon', 'quan 3', 'restaurant', 'vi', null)
    const r = result as { results?: Array<{ name: string; photo_url?: string }> }
    const summary = r.results?.map(item => ({
      name: item.name,
      has_photo: !!item.photo_url,
      photo_url_preview: item.photo_url ? item.photo_url.slice(0, 80) : null,
    })) ?? []
    return Response.json({ summary, count: r.results?.length ?? 0 })
  } catch (e) {
    return Response.json({ error: String(e) })
  }
}
