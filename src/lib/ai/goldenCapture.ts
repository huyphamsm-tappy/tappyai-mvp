import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * F-094 measurement (owner 2026-09-25): "make the harness record the pre-guard text too, so
 * truncation is measurable". The golden harness sends `x-tappy-golden-capture: <id>`; the chat
 * route then writes the model's RAW reply — every text delta before any guard ran — to
 * <tmpdir>/tappy-golden-capture/<id>.txt, and the harness reads it back beside what the client got.
 *
 * NEVER in production: the sink does not exist there (NODE_ENV === 'production'), whatever the
 * header says. The id is a strict slug, so it can never name a path outside the capture folder.
 */
export const GOLDEN_CAPTURE_DIR = join(tmpdir(), 'tappy-golden-capture')
const ID_RE = /^[A-Za-z0-9_.-]{1,96}$/

export function goldenCaptureSink(req: Request, nodeEnv: string | undefined = process.env.NODE_ENV): ((raw: string) => void) | undefined {
  if (nodeEnv === 'production') return undefined
  const id = req.headers.get('x-tappy-golden-capture')
  if (!id || !ID_RE.test(id) || id.includes('..')) return undefined
  return (raw: string) => {
    try {
      mkdirSync(GOLDEN_CAPTURE_DIR, { recursive: true })
      writeFileSync(join(GOLDEN_CAPTURE_DIR, `${id}.txt`), raw, 'utf8')
    } catch { /* measurement only — never affects the reply */ }
  }
}
