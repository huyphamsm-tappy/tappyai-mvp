import { fetchPlacePhotoByName } from '@/lib/ai/tools/common'

// Dev works without a token; production requires Bearer CRON_SECRET so this
// paid-API diagnostic can't be hit anonymously.
function authorized(req: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const serperKey = process.env.SERPER_API_KEY
  const testPlaces = [
    { id: 'ChIJtest1', name: 'Atispho - Pho Atiso' },
    { id: 'ChIJtest2', name: 'Hai San Hoang Gia quan 1' },
  ]

  // Test 1: Direct Serper call (no fetchPlacePhotoByName)
  const directSerperResults = await Promise.all(testPlaces.map(async (p) => {
    if (!serperKey) return { name: p.name, error: 'no_key' }
    try {
      const t0 = Date.now()
      const resp = await Promise.race([
        fetch('https://google.serper.dev/images', {
          method: 'POST',
          headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: p.name, gl: 'vn', hl: 'vi', num: 3 }),
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ])
      const data = await (resp as Response).json()
      const imgs = data?.images || []
      return { name: p.name, ms: Date.now() - t0, status: (resp as Response).status, count: imgs.length, url: imgs[0]?.imageUrl?.slice(0, 60) }
    } catch (e) {
      return { name: p.name, error: String(e).slice(0, 60) }
    }
  }))

  // Test 2: Via fetchPlacePhotoByName
  const viaFunctionResults = await Promise.all(testPlaces.map(async (p) => {
    const t0 = Date.now()
    const url = await fetchPlacePhotoByName(p.id, p.name)
    return { name: p.name, ms: Date.now() - t0, url: url?.slice(0, 60) ?? null, success: !!url }
  }))

  return Response.json({
    hasSerperKey: !!serperKey,
    directSerper: directSerperResults,
    viaFunction: viaFunctionResults,
  })
}
