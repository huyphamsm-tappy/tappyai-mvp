// Tier 1 music ingestion — curate CC-BY VOCAL tracks from Jamendo into the
// TappyAI library. Downloads each MP3 to Vercel Blob (so we host the file, not
// hotlink Jamendo) and inserts a music_tracks row WITH attribution (CC-BY
// requires crediting artist + license). Idempotent via source_url.
//
// Run:  node scripts/ingest-jamendo.mjs [count]                  (ingest + backfill)
// Or:   node scripts/ingest-jamendo.mjs [count] --backfill-only  (classify existing rows only)
// Reads creds from .env.local (Supabase) + .env.vercel.prod.tmp (Blob).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { categorySlugForTrack } from './musicGenreCategory.mjs'
// NOTE: audio is referenced from Jamendo's CDN (BLOB_READ_WRITE_TOKEN isn't
// available locally to self-host). CC-BY permits this with attribution; migrate
// to Vercel Blob later by re-running with a valid BLOB token + the put() path.

const CLIENT_ID = process.env.JAMENDO_CLIENT_ID || '9fdf2086'
const WANT = parseInt(process.argv[2] || '30', 10)
/**
 * `--backfill-only`: classify rows that are ALREADY in the catalog and add nothing.
 *
 * The category backfill and a fresh ingest are the same walk of Jamendo's
 * popularity-ordered feed, so without this flag a run whose only purpose is to
 * fill in `category_id` also inserts up to WANT brand-new tracks once it has
 * walked past the rows it already has. That is correct for an ingest and wrong
 * for a repair, so the repair says which one it means.
 */
const BACKFILL_ONLY = process.argv.includes('--backfill-only')

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

  // 🚨 CATEGORY IDS, RESOLVED ONCE - THE ROWS THIS SCRIPT WROTE HAD NONE.
  // Every track it inserted went in with category_id NULL, so the Music Library's
  // six tabs each filtered a catalog in which nothing had ever been classified and
  // every one of them came up empty except "All". The slugs come from
  // music_categories itself; a slug the database does not have resolves to
  // undefined and the track stays uncategorised rather than mis-filed.
  const { data: categoryRows } = await sb.from('music_categories').select('id, slug').eq('is_active', true)
  const categoryIdBySlug = new Map((categoryRows || []).map((c) => [c.slug, c.id]))
  if (categoryIdBySlug.size === 0) console.warn('No active music_categories - tracks will be ingested uncategorised')

  let inserted = 0, skipped = 0, failed = 0, updated = 0, offset = 0
  while ((BACKFILL_ONLY || inserted < WANT) && offset < 600) {
    const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${CLIENT_ID}&format=json&limit=50&offset=${offset}`
      + `&vocalinstrumental=vocal&ccnc=false&ccsa=false&ccnd=false&include=licenses+musicinfo&audioformat=mp32&order=popularity_total`
    const resp = await fetch(url).then(r => r.json())
    const tracks = resp.results || []
    if (!tracks.length) break
    offset += 50

    for (const t of tracks) {
      if (!BACKFILL_ONLY && inserted >= WANT) break
      if (!isPureCcBy(t.license_ccurl) || !t.audio || !t.duration) { skipped++; continue }
      // Store a clean, stable Jamendo playback URL that embeds the track id, so
      // attribution (artist + CC-BY + link to jamendo.com/track/<id>) is derivable
      // in the UI, and dedup works. (Self-host on Blob later when a token exists.)
      const audioUrl = `https://mp3d.jamendo.com/?trackid=${t.id}&format=mp32&from=app-${CLIENT_ID}`

      // Jamendo's own genre tags are the source of truth for the category, and the
      // arrival position is its popularity ranking (we request popularity order).
      const categorySlug = categorySlugForTrack({
        genres: t.musicinfo?.tags?.genres,
        popularityRank: inserted + updated,
      })
      const categoryId = categorySlug ? categoryIdBySlug.get(categorySlug) ?? null : null

      const { data: exists } = await sb.from('music_tracks').select('id, category_id').ilike('audio_url', `%trackid=${t.id}&%`).maybeSingle()
      if (exists) {
        // Backfill only. A row that already carries a category keeps it - this
        // script must never overwrite a classification someone else set.
        if (!exists.category_id && categoryId) {
          const { error: backfillError } = await sb.from('music_tracks').update({ category_id: categoryId }).eq('id', exists.id)
          if (backfillError) { console.error('backfill fail', t.id, backfillError.message); failed++; continue }
          updated++
          console.log(`~ backfilled [${categorySlug}]  ${t.artist_name} - ${t.name}`)
          continue
        }
        skipped++
        continue
      }

      // Nothing to repair on a track we do not have yet.
      if (BACKFILL_ONLY) { skipped++; continue }

      const { error } = await sb.from('music_tracks').insert({
        title: (t.name || 'Untitled').slice(0, 120),
        artist: (t.artist_name || null),
        duration_sec: Math.round(t.duration),
        audio_url: audioUrl,
        preview_url: audioUrl,
        cover_url: t.image || null,
        category_id: categoryId,
        provider_id: provider.id,
        music_type: 'royalty_free',
        is_active: true,
      })
      if (error) { console.error('insert fail', t.id, error.message); failed++; continue }
      inserted++
      console.log(`✓ ${inserted}/${WANT}  [${categorySlug ?? 'uncategorised'}]  ${t.artist_name} — ${t.name}`)
    }
  }
  console.log(`\nDONE. inserted=${inserted} backfilled=${updated} skipped=${skipped} failed=${failed}`)
}
main().catch(e => { console.error(e); process.exit(1) })
