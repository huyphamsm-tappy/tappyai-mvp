// ============================================================================
// Jamendo genre tags -> the Music Library's own category slugs
// ============================================================================
// 🚨 THIS EXISTS BECAUSE THE CATALOG WAS INGESTED WITHOUT A CATEGORY AT ALL.
//
// `music_categories` has held six rows since the module shipped (trending,
// chill, upbeat, acoustic, electronic, cinematic) and `getTracks()` filters on
// `category_id` correctly. But `ingest-jamendo.mjs` — the script that actually
// populated the browsable catalog — never wrote `category_id`, so every one of
// its rows landed NULL. The tabs were not broken: they were filtering a catalog
// in which nothing had ever been classified, so each one honestly matched zero
// rows. Measured on the live catalog: 50 tracks, 50 with `categoryId: null`.
//
// The classification below is a mapping of data we ALREADY receive from the
// source of truth (Jamendo's own `musicinfo.tags.genres`), not an invention. A
// genre we do not recognise returns null and the track stays uncategorised —
// an honest gap is better than a track filed under a category it is not.
//
// Kept as `.mjs` next to its only consumer: the ingest script is plain Node and
// cannot import the module's TypeScript without a build step. If a server
// surface ever needs this too, move it into `src/modules/music/utils` and let
// the script import the compiled output — do not copy it.

/** The six category slugs seeded by `20260705_seed_music_demo_catalog.sql`. */
export const MUSIC_CATEGORY_SLUGS = Object.freeze([
  'trending',
  'chill',
  'upbeat',
  'acoustic',
  'electronic',
  'cinematic',
])

// Jamendo writes genres in several shapes for the same thing — "Chill Out",
// "chillout", "chill-out", "drum n bass". Reduce to bare lowercase letters so
// one entry per genre covers all of them.
function normalizeGenre(genre) {
  return String(genre ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

// One entry per genre we have actually seen on a CC-BY vocal track, grouped by
// the category it belongs to. Order matters only in that the FIRST recognised
// genre on a track wins, which mirrors Jamendo's own ordering (most
// representative genre first).
const GENRE_TO_CATEGORY = new Map(
  Object.entries({
    chill: ['chill', 'chillout', 'lounge', 'ambient', 'downtempo', 'relaxation', 'meditation', 'newage', 'triphop', 'jazz'],
    upbeat: ['pop', 'rock', 'dance', 'funk', 'disco', 'punk', 'metal', 'hiphop', 'rap', 'reggae', 'latin', 'ska', 'soul', 'rnb'],
    acoustic: ['acoustic', 'folk', 'singersongwriter', 'country', 'blues', 'bossanova', 'world'],
    electronic: ['electronic', 'electro', 'edm', 'house', 'techno', 'trance', 'dubstep', 'drumnbass', 'dnb', 'idm', 'synthpop', 'minimal', 'breakbeat'],
    cinematic: ['soundtrack', 'cinematic', 'orchestral', 'epic', 'classical', 'symphonic', 'score', 'filmscore'],
  }).flatMap(([category, genres]) => genres.map((genre) => [genre, category]))
)

/**
 * The category a set of genre tags belongs to, or null when none is recognised.
 * @param {string[]|undefined|null} genres
 * @returns {string|null}
 */
export function categorySlugForGenres(genres) {
  if (!Array.isArray(genres)) return null
  for (const genre of genres) {
    const category = GENRE_TO_CATEGORY.get(normalizeGenre(genre))
    if (category) return category
  }
  return null
}

/**
 * How many of the most popular tracks are filed under "Thịnh hành" / Trending.
 *
 * 🚨 TRENDING IS NOT A GENRE, SO IT CANNOT COME FROM THE GENRE TAGS. The ingest
 * requests `order=popularity_total`, so the rank a track arrives at IS
 * Jamendo's own popularity ranking — the only real trending signal in the
 * payload. A track carries exactly one `category_id`, so the most popular ones
 * are filed as trending instead of by genre, which is the same shape the demo
 * seed used.
 */
export const TRENDING_TOP_N = 8

/**
 * The category slug for one ingested track.
 * @param {{ genres?: string[]|null, popularityRank?: number, trendingTopN?: number }} track
 *   `popularityRank` is 0-based and is the position the track arrived in, which
 *   the ingest requests in popularity order.
 * @returns {string|null} a slug from MUSIC_CATEGORY_SLUGS, or null to leave the
 *   track uncategorised rather than guess.
 */
export function categorySlugForTrack({ genres, popularityRank, trendingTopN = TRENDING_TOP_N } = {}) {
  if (typeof popularityRank === 'number' && popularityRank >= 0 && popularityRank < trendingTopN) {
    return 'trending'
  }
  return categorySlugForGenres(genres)
}
