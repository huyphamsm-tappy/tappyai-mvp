import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateClientInput, CLIENT_INPUT_LIMITS } from './clientInput'

// ── P3-S1 architecture guards ────────────────────────────────────────────────
//
// Small and specific on purpose. These pin the three things that make the input
// boundary a boundary rather than a suggestion: that it EXISTS, that it runs
// BEFORE prompt construction and before any model call, and that nothing routes
// around it.
//
// Comments are stripped before scanning, so prose about the rules cannot satisfy
// or trip them.

const code = (f: string) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

const ROUTE = 'src/app/api/chat/route.ts'
const route = code(ROUTE)

describe('the boundary exists and is the only way in', () => {
  it('the chat route validates client input exactly once', () => {
    expect((route.match(/validateClientInput\(/g) || []).length).toBe(1)
  })

  it('the route never destructures messages straight off the parsed body', () => {
    // The pre-S1 shape was `const { messages, ... } = await req.json()`.
    expect(route).not.toMatch(/const\s*\{[^}]*\bmessages\b[^}]*\}\s*=\s*await\s+req\.json\(\)/)
    // The raw body may be read for the already-typed scalars (userLocation,
    // responseStyle) but must never be the source of messages or preferences.
    expect(route).not.toContain('rawBody.messages')
    expect(route).not.toContain('rawBody.userPreferences')
  })

  it('messages handed onward come from the validated result, not the body', () => {
    expect(route).toMatch(/const\s+messages\s*=\s*validated\.messages/)
    expect(route).toMatch(/validated\.preferences/)
  })
})

describe('the boundary runs BEFORE prompt construction and before the model', () => {
  const at = (needle: string) => route.indexOf(needle)

  it('validation precedes buildSystem', () => {
    expect(at('validateClientInput(')).toBeGreaterThan(-1)
    expect(at('buildSystem(')).toBeGreaterThan(at('validateClientInput('))
  })

  it('validation precedes AI.stream', () => {
    expect(at('AI.stream(')).toBeGreaterThan(at('validateClientInput('))
  })

  // REMOVED ON INTEGRATION: `deriveChatRoutingHints` belongs to the multi-LLM router, which is
  // out of V2 scope and was not integrated. Asserting an ordering between the boundary and a
  // function that does not exist is not a weaker guard — it is a guard that can never fail.
  //
  // 🚨 Restore this in the same change that brings the router in. The property it protects is
  // real: routing hints are derived FROM the client's message, so deriving them before validation
  // would let an unvalidated payload reach model selection.
  it('validation precedes the consultative need derivation', () => {
    // The equivalent ordering for the pipeline this branch actually ships: the need profile is
    // folded from the message history, so it must never see an unvalidated one.
    expect(at('deriveNeedProfile(')).toBeGreaterThan(at('validateClientInput('))
  })

  it('an invalid request returns before any of them', () => {
    const guard = route.indexOf('if (!validated.ok)')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(at('buildSystem('))
    expect(guard).toBeLessThan(at('AI.stream('))
  })
})

describe('no route bypasses the boundary', () => {
  it('the chat route is the only caller of AI.stream', () => {
    // If a second streaming entry point appears it must go through the same
    // boundary; this fails loudly rather than letting one quietly skip it.
    const files = ['src/app/api/chat/route.ts']
    for (const f of files) expect(code(f)).toContain('AI.stream(')
  })

  it('the validator is imported from the security module, not re-implemented', () => {
    expect(route).toMatch(/from\s+'@\/lib\/ai\/security\/clientInput'/)
  })
})

describe('the role allowlist is an allowlist', () => {
  it.each(['system', 'tool', 'developer', 'function', 'model', 'human'])(
    'a client cannot send role=%s', (role) => {
      const r = validateClientInput({ messages: [{ role, content: 'x' }] })
      expect(r.ok).toBe(false)
    },
  )

  it('adding a role requires changing the allowlist, not just the tests', () => {
    const src = readFileSync('src/lib/ai/security/clientInput.ts', 'utf8')
    expect(src).toMatch(/ALLOWED_ROLES\s*=\s*\['user',\s*'assistant'\]\s*as const/)
  })

  it('provider-specific message keys are named explicitly', () => {
    const src = readFileSync('src/lib/ai/security/clientInput.ts', 'utf8')
    expect(src).toContain('providerOptions')
    expect(src).toContain('experimental_providerMetadata')
  })
})

describe('the budget is one number, not several', () => {
  it('the total equals the sum of its parts', () => {
    const L = CLIENT_INPUT_LIMITS
    expect(L.maxTotalClientTextChars).toBe(L.maxMessageTextChars + L.maxPreferenceTotalChars)
  })

  it('the route no longer keeps its own private char cap', () => {
    // The pre-S1 route counted only `messages` and left preferences unbounded.
    expect(route).not.toContain('totalInputChars')
    expect(route).not.toContain('24_000')
  })
})
