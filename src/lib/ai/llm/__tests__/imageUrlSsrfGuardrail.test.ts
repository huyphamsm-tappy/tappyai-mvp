/**
 * The one flag that keeps a user-supplied image URL from becoming a TappyAI SSRF sink.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 * `POST /api/explore/process` takes a `thumbnail_url` from the caller and hands it to
 * `AI.vision({ image: new URL(thumbnailUrl) })`. That LOOKS like a server-side download of an
 * attacker-supplied URL, which is exactly the shape of BUG-007 and BUG-010. It is not, and the
 * reason is a single boolean in the adapter:
 *
 *   `@ai-sdk/anthropic` reports `supportsImageUrls: true`
 *      → the AI SDK's `downloadAssets` FILTERS the image part out
 *      → the URL travels to Anthropic, and Anthropic fetches it
 *      → no socket is opened by us, so there is nothing to point inward
 *
 * ============================================================================
 * WHAT HAPPENS IF THAT FLAG FLIPS
 * ============================================================================
 * 🚨 The SDK downloads the URL itself, with a bare `fetch()` living inside `node_modules/ai`:
 *
 *     async function download({ url }) { const response = await fetch(url.toString()) … }
 *
 * There is no interception point. `convertToLanguageModelPrompt` accepts a `downloadImplementation`
 * parameter, but the call site never passes one and it is absent from the package's public types —
 * so `safeFetch` cannot be injected into that path. Checked, not assumed.
 *
 * The only safe answer at that moment is for the adapter to fetch the URL ITSELF through
 * `safeFetch` and hand the model bytes. `scripts/architecture/check.mjs` holds the other half of
 * this guardrail: no raw network call may appear in the provider layer, so writing that download
 * the naive way fails CI.
 *
 * ============================================================================
 * WHAT IS ASSERTED
 * ============================================================================
 * Not the flag's value alone — a constant compared to itself proves little. These tests drive the
 * REAL AI SDK with both settings and count TCP connections arriving at a real listening socket, so
 * the `false` case demonstrates the failure mode rather than describing it.
 *
 * 🚨 No second provider is faked and no SDK is installed. The `false` case is a bare
 * `LanguageModelV1` object handed straight to `generateText` — the SDK's own branch, exercised.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import net from 'node:net'
import { generateText, type LanguageModelV1 } from 'ai'

/** Counts TCP connections. If the SDK downloads, the connection lands here. */
const connections: string[] = []
const server = net.createServer(sock => {
  connections.push(sock.remoteAddress ?? '?')
  sock.destroy()
})
const port: number = await new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port))
})

/** The url the model is asked to look at. Nothing serves it — the question is who dials. */
const IMAGE_URL = () => `http://127.0.0.1:${port}/thumb.jpg`

/** Whatever the model was actually handed, captured for inspection. */
let seenPrompt: unknown = null

function stubModel(supportsImageUrls: boolean): LanguageModelV1 {
  return {
    specificationVersion: 'v1',
    provider: 'test',
    modelId: 'test-vision',
    defaultObjectGenerationMode: undefined,
    supportsImageUrls,
    async doGenerate(options) {
      seenPrompt = options.prompt
      return {
        text: 'ok',
        finishReason: 'stop',
        usage: { promptTokens: 1, completionTokens: 1 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      }
    },
    async doStream() { throw new Error('not used') },
  } as unknown as LanguageModelV1
}

const run = (model: LanguageModelV1) =>
  generateText({
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', image: new URL(IMAGE_URL()) },
        { type: 'text', text: 'describe' },
      ],
    }],
  }).then(() => 'ok' as const).catch((e: unknown) => `error:${String((e as Error).message).slice(0, 40)}`)

beforeEach(() => { connections.length = 0; seenPrompt = null })
afterAll(() => { server.close() })

describe('the production configuration', () => {
  it('🔑 the model AI.vision uses reports supportsImageUrls: true', async () => {
    // The tripwire. Swap the provider, upgrade the SDK, or add an adapter that answers `false`,
    // and this fails — which is the entire point. Read through the sanctioned registry rather
    // than importing the vendor SDK, which the architecture guard forbids outside the adapter.
    process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used-for-network'
    const { getProvider } = await import('../registry')

    const model = getProvider().model('vision')

    expect(model.supportsImageUrls).toBe(true)
  })
})

describe('what that flag actually decides', () => {
  it('🔑 supportsImageUrls: true — the URL goes to the provider and WE open no socket', async () => {
    await run(stubModel(true))

    expect(connections.length).toBe(0)
    // And the model really was handed the url, rather than the part being dropped altogether.
    expect(JSON.stringify(seenPrompt)).toContain('127.0.0.1')
  })

  it('🚨 supportsImageUrls: false — the SDK downloads it FROM US, and the socket proves it', async () => {
    // The failure mode, demonstrated rather than described. This is what a future adapter
    // answering `false` would do with a `thumbnail_url` a stranger supplied: our process dials
    // whatever that URL resolves to, through a `fetch()` we cannot reach or wrap.
    //
    // If this ever reports 0, the SDK's behaviour has changed and the reasoning above needs
    // rechecking — the test failing in EITHER direction is a signal worth reading.
    await run(stubModel(false))

    expect(connections.length).toBe(1)
  })
})

describe('the safe download primitive is available to the adapter layer', () => {
  it('safeFetch exports what a provider would need', async () => {
    // If the flag ever flips, the fix is for the adapter to fetch the image itself through this
    // module and pass bytes. Asserting it exists keeps the hint in `check.mjs` honest — a rule
    // pointing at a primitive that had been renamed away would send the next person nowhere.
    const mod = await import('@/lib/security/safeFetch')

    expect(typeof mod.safeGetText).toBe('function')
    expect(typeof mod.safeHeadRequest).toBe('function')
    expect(typeof mod.safeLookup).toBe('function')
  })
})
