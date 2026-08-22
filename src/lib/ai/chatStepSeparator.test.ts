import { describe, it, expect } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

/**
 * B12 — the model's preamble and its answer must not run together.
 *
 * A tool turn is two model steps. The model says what it is about to do, the tool runs, then it
 * answers. Both steps emit ordinary `0:` text frames, and the frames were concatenated with
 * nothing between them, so a real reply read:
 *
 *     I'll find some great coffee shops in District 1 for you!Here are my top picks for you:
 *
 * Reproduced on Web and Android from the SAME stream, which is why the separator is inserted here
 * once instead of as a space added in each client.
 */

const text = (s: string) => `0:${JSON.stringify(s)}`
const toolCall = (name: string) => `9:${JSON.stringify({ toolCallId: 't1', toolName: name, args: { query: 'q' } })}`
const toolResult = (results: unknown[] = []) => `a:${JSON.stringify({ toolCallId: 't1', result: { results } })}`
const finish = 'd:{"finishReason":"stop"}'

async function run(lines: string[]): Promise<string> {
  const filtered = applyPlaceEnrichmentStreamFilter(new Response(lines.join('\n') + '\n'))
  return await new Response(filtered.body).text()
}

/** The assistant text the user ends up reading, reassembled from `0:` frames. */
function rendered(out: string): string {
  return out.split('\n')
    .filter(l => l.startsWith('0:'))
    .map(l => { try { return JSON.parse(l.slice(2)) as string } catch { return '' } })
    .join('')
}

describe('a tool step separates the preamble from the answer', () => {
  it('🚨 the exact production shape no longer runs together', async () => {
    const out = await run([
      text("I'll find some great coffee shops in District 1 for you!"),
      toolCall('search_places'),
      toolResult([{ name: 'Lacàph', photo_url: '' }]),
      text('Here are my top picks for you:'),
      finish,
    ])
    const body = rendered(out)
    expect(body).not.toContain('for you!Here')
    expect(body).toContain("for you!\n\nHere are my top picks")
  })

  it('works the same on a non-place tool, which streams live instead of buffering', async () => {
    // `bufferMode` only turns on for PLACE tools. A weather or gold-price turn streams straight
    // through and had exactly the same two-step concatenation, so both paths are covered.
    const out = await run([
      text('Let me check the weather for you.'),
      toolCall('get_weather'),
      toolResult([]),
      text('It is 32°C and sunny.'),
      finish,
    ])
    expect(rendered(out)).toContain('for you.\n\nIt is 32°C')
  })
})

describe('a separator is only ever inserted BETWEEN two pieces of speech', () => {
  it('nothing is added before the first word', async () => {
    // A turn where the tool runs before the model says anything must not start with blank lines.
    const out = await run([toolCall('search_places'), toolResult([]), text('Here you go.'), finish])
    expect(rendered(out)).toBe('Here you go.')
  })

  it('nothing is added when the model already ended with a newline', async () => {
    const out = await run([
      text('Searching now.\n'),
      toolCall('search_places'),
      toolResult([]),
      text('Done.'),
      finish,
    ])
    // One newline of the model's own, not three.
    expect(rendered(out)).toBe('Searching now.\nDone.')
  })

  it('nothing is added when the model never speaks again after the tool', async () => {
    const out = await run([text('Looking that up.'), toolCall('search_places'), toolResult([]), finish])
    expect(rendered(out)).toBe('Looking that up.')
  })

  it('no separator at all on a turn with no tool', async () => {
    const out = await run([text('Hello '), text('there.'), finish])
    expect(rendered(out)).toBe('Hello there.')
  })

  it('consecutive deltas within ONE step still join seamlessly', async () => {
    // The boundary marker is consumed by the first text frame after the tool, so the rest of the
    // answer keeps streaming as one paragraph. A "did a tool ever run" flag would have inserted a
    // break before every delta and shredded the reply.
    const out = await run([
      text('Ok.'),
      toolCall('search_places'),
      toolResult([]),
      text('Here '), text('are '), text('three '), text('options.'),
      finish,
    ])
    expect(rendered(out)).toBe('Ok.\n\nHere are three options.')
  })

  it('two tool steps each get one break, not a doubled one', async () => {
    const out = await run([
      text('First I check A.'),
      toolCall('search_places'), toolResult([]),
      text('Now B.'),
      toolCall('search_places'), toolResult([]),
      text('Final answer.'),
      finish,
    ])
    const body = rendered(out)
    expect(body).toBe('First I check A.\n\nNow B.\n\nFinal answer.')
    expect(body).not.toContain('\n\n\n')
  })
})
