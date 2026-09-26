import { describe, it, expect } from 'vitest'
import { goldenCaptureSink } from './goldenCapture'

const req = (id?: string) => new Request('http://localhost/api/chat', { method: 'POST', headers: id ? { 'x-tappy-golden-capture': id } : {} })

describe('golden pre-guard capture (F-094 measurement)', () => {
  it('🚨 never exists in production, whatever the header says', () => {
    expect(goldenCaptureSink(req('T1-t1'), 'production')).toBeUndefined()
  })
  it('exists in development only when the harness asks', () => {
    expect(goldenCaptureSink(req(), 'development')).toBeUndefined()
    expect(typeof goldenCaptureSink(req('run.T1-t1'), 'development')).toBe('function')
  })
  it('🚨 an id that could leave the capture folder is refused', () => {
    for (const id of ['../x', 'a/b', 'a\b', '..', 'x'.repeat(97), 'a b']) {
      expect(goldenCaptureSink(req(id), 'development'), id).toBeUndefined()
    }
  })
})

describe('the stream filter hands the RAW model text to the capture hook', () => {
  it('receives what the model said before any guard, while the client receives the guarded text', async () => {
    const { applyPlaceEnrichmentStreamFilter } = await import('./streamEnrichment')
    const invented = 'https://attacker.example/c?d=X'
    const lines = ['0:' + JSON.stringify('Xem '), '0:' + JSON.stringify(`[day](${invented}) nhe.`), 'd:{"finishReason":"stop"}']
    let raw: string | null = null
    const filtered = applyPlaceEnrichmentStreamFilter(
      new Response(lines.join('\n') + '\n'),
      'vi', undefined, undefined, undefined, undefined, false, '', false, undefined, undefined, [],
      r => { raw = r },
    )
    const client = await new Response(filtered.body).text()
    expect(raw).toBe(`Xem [day](${invented}) nhe.`)
    expect(client).not.toContain('attacker.example')
  })
})
