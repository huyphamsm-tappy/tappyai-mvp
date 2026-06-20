import { readFile } from 'fs/promises'
import { join } from 'path'

// Serve supertux2.html with COOP+COEP so it can be embedded as an iframe inside a
// COEP parent.  Static files in /public can't receive middleware headers, so this
// route handler is the only way to attach the required headers in dev and on Vercel.
// We inject <base href="/games/supertux/"> so that the relative URLs in supertux2.html
// (supertux2.js, supertux2.wasm, etc.) resolve to /games/supertux/supertux2.* which
// are served as static files from public/.
export async function GET() {
  const raw = await readFile(
    join(process.cwd(), 'public', 'games', 'supertux', 'supertux2.html'),
    'utf-8'
  )
  // Inject base href so relative asset URLs resolve to the public/ static files
  const html = raw.replace('<head>', '<head><base href="/games/supertux/">')
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
