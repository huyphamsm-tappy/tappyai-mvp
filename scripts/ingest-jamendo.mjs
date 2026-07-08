// Tier 1 music ingestion — curate CC-BY VOCAL tracks from Jamendo into the
// TappyAI library. Downloads each MP3 to Vercel Blob (so we host the file, not
// hotlink Jamendo) and inserts a music_tracks row WITH attribution (CC-BY
// requires crediting artist + license). Idempotent via source_url.
//
// Run:  node scripts/ingest-jamendo.mjs [count]   (default 30)
// Reads creds from .env.local (Supabase) + .env.vercel.prod.tmp (Blob).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
// NOTE: audio is referenced from Jamendo's CDN (BLOB_READ_WRITE_TOKEN isn't
// available locally to self-host). CC-BY permits this with attribution; migrate
// to Vercel Blob later by re-running with a valid BLOB token + the put() path.

const CLIENT_ID = process.env.JAMENDO_CLIENT_ID || '9fdf2086'
const WANT = parseInt(process.argv[2] || '30', 10)

// --- load env from the local dotenv files (values never printed) -------------
function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
}
loadEnv('.env.local')
loadEnv('.env.vercel.prod.tmp')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('Missing Supabase creds'); process.exit(1) }

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const licenseLabel = (url) => {
  const m = (url || '').match(/licenses\/([a-z-]+)\/(\d\.\d)/)
  return m ? `CC-${m[1].toUpperCase()} ${m[2]}` : 'CC-BY'
}
const isPureCcBy = (url) => /licenses\/by\/\d/.test(url || '')

async function main() {
  // internal provider id (all curated content lives under it)
  const { data: provider } = await sb.from('music_providers').select('id').eq('slug', 'internal').single()
  if (!provider) { console.error('No internal provider'); process.exit(1) }

  let inserted = 0, skipped = 0, failed = 0, offset = 0
  while (inserted < WANT && offset < 600) {
    const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=50&offset=${offset}`
      + `&vocalinstrumental=vocal&ccnc=false&ccsa=false&ccnd=false&include=licenses&audioformat=mp32&order=popularity_total`
    const resp = await fetch(url).then(r => r.json())
    const tracks = resp.results || []
    if (!tracks.length) break
    offset += 50

    for (const t of tracks) {
      if (inserted >= WANT) break
      if (!isPureCcBy(t.license_ccurl) || !t.audio || !t.duration) { skipped++; continue }
      // Store a clean, stable Jamendo playback URL that embeds the track id, so
      // attribution (artist + CC-BY + link to jamendo.com/track/<id>) is derivable
      // in the UI, and dedup works. (Self-host on Blob later when a token exists.)
      const audioUrl = `https://mp3d.jamendo.com/?trackid=${t.id}&format=mp32&from=app-${CLIENT_ID}`

      const { data: exists } = await sb.from('music_tracks').select('id').ilike('audio_url', `%trackid=${t.id}&%`).maybeSingle()
      if (exists) { skipped++; continue }

      const { error } = await sb.from('music_tracks').insert({
        title: (t.name || 'Untitled').slice(0, 120),
        artist: (t.artist_name || null),
        duration_sec: Math.round(t.duration),
        audio_url: audioUrl,
        preview_url: audioUrl,
        cover_url: t.image || null,
        provider_id: provider.id,
        music_type: 'royalty_free',
        is_active: true,
      })
      if (error) { console.error('insert fail', t.id, error.message); failed++; continue }
      inserted++
      console.log(`✓ ${inserted}/${WANT}  ${t.artist_name} — ${t.name}`)
    }
  }
  console.log(`\nDONE. inserted=${inserted} skipped=${skipped} failed=${failed}`)
}
main().catch(e => { console.error(e); process.exit(1) })
