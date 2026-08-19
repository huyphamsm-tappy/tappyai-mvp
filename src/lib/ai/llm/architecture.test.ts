import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

// ── T9: AI Platform boundary guard (static scan) ─────────────────────────────
//
// The architecture promise is that business code names a JOB (a ModelRole) and
// never a vendor. One directory is allowed to know a vendor exists:
// src/lib/ai/llm/providers/. This test is what makes that promise enforceable
// instead of aspirational.
//
// It is a STATIC scan, not a behavioural test, because the failure mode it
// catches is invisible at runtime while only one provider is registered:
// reading `providerMetadata.anthropic` works perfectly today and returns null
// the moment anything else serves the request. A behavioural test would pass in
// both cases.
//
// Scanned: every .ts/.tsx under src/, minus full-line comments (see below).
// Exempt:
//   - src/lib/ai/llm/providers/**  — the sanctioned vendor zone. Adapters and
//     their own tests must name their vendor; that is their entire job.
//   - this file                    — it contains the patterns it searches for.
//
// Test files are otherwise NOT exempt. A measurement harness that reaches past
// the boundary is the same defect as production code doing it — it just breaks
// later and more confusingly.
//
// SCOPE NOTE: these rules are about LLM vendors specifically. `src/lib/scam-
// shield/providers/` (Web Risk, WHOIS, DNS, SSL) and Google's product APIs
// (Places, Calendar, Web Risk) are unrelated subsystems that legitimately own
// the words "provider" and "GOOGLE_*_KEY". The patterns below are deliberately
// narrow enough to leave them alone — verified by the negative controls.

const SRC = fileURLToPath(new URL('../../../', import.meta.url))
const SELF = 'lib/ai/llm/architecture.test.ts'
const VENDOR_ZONE = 'lib/ai/llm/providers'
const LLM_LAYER = 'lib/ai/llm/'
const REGISTRY = 'lib/ai/llm/registry.ts'

/** LLM credential env names. Product-API keys (GOOGLE_PLACES_API_KEY,
 *  GOOGLE_CLIENT_SECRET, GOOGLE_WEB_RISK_API_KEY, SERPER_API_KEY…) are NOT
 *  vendor credentials in this sense and must not appear here. Grows only when a
 *  new LLM adapter lands. */
const LLM_CREDENTIAL_ENV = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY',
  'DEEPSEEK_API_KEY',
  'XAI_API_KEY', 'GROK_API_KEY',
  'MISTRAL_API_KEY', 'COHERE_API_KEY',
] as const

interface Rule {
  readonly name: string
  readonly why: string
  readonly pattern: RegExp
  /** Strings that MUST match — proves the pattern is not inert. */
  readonly positiveControls: readonly string[]
  /** Strings that MUST NOT match — pins the false-positive boundary. */
  readonly negativeControls: readonly string[]
  /** Repo-relative POSIX paths allowed to violate this rule. */
  readonly exempt?: readonly string[]
  /** Restricts the rule to part of the tree. Default: everything scanned. */
  readonly appliesTo?: (path: string) => boolean
}

const RULES: readonly Rule[] = [
  {
    name: 'vendor-sdk-import',
    why: 'Only a provider adapter may import a vendor SDK. Business code imports the neutral "ai" package (LanguageModelV1) or nothing at all.',
    pattern: /\b(?:from|import|require)\s*\(?\s*['"](?:@ai-sdk\/|@anthropic-ai\/|openai|@google\/generative-ai|@mistralai\/|cohere-ai|ollama)/,
    positiveControls: [
      `import { createAnthropic } from '@ai-sdk/anthropic'`,
      `const x = await import("@ai-sdk/google")`,
      `const OpenAI = require('openai')`,
    ],
    negativeControls: [
      `import { streamText } from 'ai'`,
      `import { AI } from '@/lib/ai/llm'`,
      `import { tool } from 'ai'`,
    ],
  },
  {
    name: 'concrete-model-id',
    why: 'A model id is a per-deployment configuration value. It belongs in the adapter (overridable by LLM_*_MODEL env), never inlined at a call site.',
    // Branch 1 — the general heuristic: a vendor prefix whose suffix contains a
    // digit SOMEWHERE, so real ids match wherever the digit falls ("gpt-4o-mini",
    // "claude-haiku-4-5-20251001") while prose ("the claude-style adapter") does
    // not. Branch 2 — the digit-less ids that heuristic cannot see; extend it
    // when a new adapter's model names need it.
    pattern: /\b(?:(?:claude|gpt|gemini|grok|deepseek|llama|mistral|command)-(?=[a-z0-9.-]*\d)[a-z0-9][a-z0-9.-]*|(?:deepseek-(?:chat|reasoner)|command-r(?:-plus)?))\b/i,
    positiveControls: [
      `fast: 'claude-haiku-4-5-20251001',`,
      `model: "gpt-4o-mini"`,
      `const m = 'gemini-2.0-flash'`,
      `'deepseek-chat'`,
    ],
    negativeControls: [
      `export type ProviderId = 'claude' | 'openai' | 'gemini' | 'grok' | 'deepseek'`,
      `case 'deepseek':`,
      `const role: ModelRole = planningIntent ? 'planning' : 'smart'`,
    ],
  },
  {
    name: 'vendor-provider-metadata',
    why: 'Per-step usage/cache counters are vendor-shaped. Read them through AI.usageMetrics() so telemetry survives a provider swap instead of silently going null.',
    pattern: /providerMetadata\s*(?:\?\.|\.|\[\s*['"])\s*(?:anthropic|openai|google|bedrock|deepseek|xai|mistral|vertex)/i,
    positiveControls: [
      `const meta = step.providerMetadata?.anthropic as`,
      `const meta = (r.providerMetadata?.anthropic ?? {}) as {`,
      `usage.experimental_providerMetadata["openai"]`,
    ],
    negativeControls: [
      `const { cacheReadTokens } = AI.usageMetrics(step)`,
      `for (const step of steps ?? []) {`,
    ],
  },
  {
    name: 'vendor-credential-read',
    why: 'LLM credentials are read only inside the matching adapter. Documenting the convention in a comment is fine; reading the value is not.',
    pattern: new RegExp(`process\\.env\\.(?:${LLM_CREDENTIAL_ENV.join('|')})\\b`),
    positiveControls: [
      `apiKey: process.env.ANTHROPIC_API_KEY!,`,
      `isConfigured: () => !!process.env.OPENAI_API_KEY`,
      `process.env.GEMINI_API_KEY`,
    ],
    negativeControls: [
      `const key = process.env.GOOGLE_PLACES_API_KEY`,
      `const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!`,
      `const apiKey = process.env.GOOGLE_WEB_RISK_API_KEY`,
      `process.env.GOOGLE_APPLICATION_CREDENTIALS`,
      `apiKey: process.env.SERPER_API_KEY`,
    ],
  },
  {
    name: 'llm-adapter-import-relative',
    why: 'Inside the AI layer, only the registry may reach into providers/. Any other importer has bound itself to one vendor by construction.',
    pattern: /\b(?:from|import|require)\s*\(?\s*['"](?:\.{1,2}\/)+providers\//,
    positiveControls: [
      `import { createClaudeProvider } from './providers/claude'`,
      `const p = await import('../providers/openai')`,
    ],
    negativeControls: [
      `import type { AIProvider } from './provider'`,
      `import { getProvider } from './registry'`,
    ],
    // Only the AI layer. scam-shield has its own unrelated providers/ dir.
    appliesTo: path => path.startsWith(LLM_LAYER),
    exempt: [REGISTRY],
  },
  {
    name: 'llm-adapter-import-absolute',
    why: 'No module anywhere may import an LLM adapter by absolute path — the public entry point is @/lib/ai/llm.',
    pattern: /\b(?:from|import|require)\s*\(?\s*['"]@\/lib\/ai\/llm\/providers\//,
    positiveControls: [
      `import { createClaudeProvider } from '@/lib/ai/llm/providers/claude'`,
    ],
    negativeControls: [
      `import { AI, type ModelRole } from '@/lib/ai/llm'`,
      `import { webRiskProvider } from '@/lib/scam-shield/providers/webRisk'`,
    ],
    exempt: [REGISTRY],
  },

  // ── P1: routing boundaries ─────────────────────────────────────────────────
  {
    name: 'router-enable-flag-is-unread',
    why: 'P1 is shadow-only. LLM_ROUTER_ENABLED is RESERVED and must be read nowhere — a flag that cannot be honoured cannot be switched on by accident. Reading it is how "prepared but off" silently becomes "on".',
    pattern: /LLM_ROUTER_ENABLED/,
    positiveControls: [
      `if (process.env.LLM_ROUTER_ENABLED === '1') applyDecision(d)`,
      `const on = process.env.LLM_ROUTER_ENABLED`,
    ],
    negativeControls: [
      `if (process.env[SHADOW_FLAG] !== '1') return`,
      `export const SHADOW_FLAG = 'LLM_ROUTER_SHADOW'`,
    ],
    appliesTo: path => !path.endsWith('.test.ts'),
  },
  {
    name: 'test-fixtures-never-ship',
    why: 'Synthetic providers exist to make routing tests non-vacuous. Production code importing them would put fake models — and fake prices — into the real fleet.',
    pattern: /\b(?:from|import|require)\s*\(?\s*['"][^'"]*__fixtures__/,
    positiveControls: [
      `import { FLEET } from './__fixtures__/syntheticCandidates'`,
      `const f = await import('../__fixtures__/syntheticCandidates')`,
    ],
    negativeControls: [
      `import { getModelCandidates } from './modelRegistry'`,
      `// fixtures live in __fixtures__ and are test-only`,
    ],
    appliesTo: path => !/\.test\.tsx?$/.test(path),
  },
  {
    name: 'only-the-capability-layer-evaluates-routing',
    why: 'The router is evaluated ONCE, pre-generation, inside AI.*. Any other caller — especially a tool — could re-route from untrusted runtime data, handing routing control to a fetched web page.',
    pattern: /\b(?:from|import|require)\s*\(?\s*['"][^'"]*routing\/(?:shadow|router)['"]/,
    positiveControls: [
      `import { observeRouting } from './routing/shadow'`,
      `import { route } from '../llm/routing/router'`,
    ],
    negativeControls: [
      `import { estimateMessageTokens } from './routing/signals'`,
      `import { getModelCandidates } from './routing/modelRegistry'`,
    ],
    appliesTo: path => !/\.test\.tsx?$/.test(path) && !path.startsWith('lib/ai/llm/routing/'),
    exempt: ['lib/ai/llm/ai.ts'],
  },
  {
    name: 'untrusted-surfaces-cannot-reach-routing',
    why: 'Tool implementations handle web-search results, scraped pages and uploaded content. Nothing there may touch routing, in any form.',
    pattern: /\b(?:from|import|require)\s*\(?\s*['"][^'"]*routing\//,
    positiveControls: [
      `import { route } from '@/lib/ai/llm/routing/router'`,
      `import type { TaskClass } from '../llm/routing/types'`,
    ],
    negativeControls: [`import { cacheKeyPart } from './cacheKeys'`],
    appliesTo: path => path.startsWith('lib/ai/tools/'),
  },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** Repo-relative, POSIX separators, so assertions read the same on Windows. */
function rel(file: string): string {
  return relative(SRC, file).split('\\').join('/')
}

/**
 * A full-line comment. Documentation must be able to NAME the thing it forbids
 * — index.ts says "Never import '@ai-sdk/*' … outside providers/", which is the
 * rule itself written down, not a breach of it. Only whole-line comments are
 * skipped; code with a trailing comment is still scanned, so nothing real can
 * hide behind a `//`.
 */
function isCommentOnly(line: string): boolean {
  return /^\s*(?:\/\/|\/\*|\*)/.test(line)
}

const FILES = walk(SRC)
  .map(f => ({ path: rel(f), body: readFileSync(f, 'utf8') }))
  .filter(f => f.path !== SELF && !f.path.startsWith(`${VENDOR_ZONE}/`))

interface Violation { file: string; line: number; text: string }

function scan(rule: Rule): Violation[] {
  const found: Violation[] = []
  for (const file of FILES) {
    if (rule.exempt?.includes(file.path)) continue
    if (rule.appliesTo && !rule.appliesTo(file.path)) continue
    file.body.split(/\r?\n/).forEach((text, i) => {
      if (isCommentOnly(text)) return
      if (rule.pattern.test(text)) found.push({ file: file.path, line: i + 1, text: text.trim() })
    })
  }
  return found
}

// ── S-00: the guard is not vacuous ───────────────────────────────────────────
// A boundary guard that scans nothing, whose regexes never match, or whose
// comment-skip swallows real code, passes forever while enforcing nothing.
// All three are checked before any rule is trusted.

describe('S-00 — the guard is not vacuous', () => {
  it('scans a real, substantial slice of src/', () => {
    expect(FILES.length).toBeGreaterThan(50)
  })

  it('reads real file bodies, not empty strings', () => {
    expect(FILES.every(f => f.body.length > 0)).toBe(true)
  })

  it('includes the chat route — the largest consumer of the AI layer', () => {
    expect(FILES.some(f => f.path === 'app/api/chat/route.ts')).toBe(true)
  })

  it('excludes the vendor zone, and the vendor zone really exists', () => {
    expect(FILES.some(f => f.path.startsWith(`${VENDOR_ZONE}/`))).toBe(false)
    expect(walk(SRC).map(rel).some(p => p.startsWith(`${VENDOR_ZONE}/`))).toBe(true)
  })

  it('skips whole-line comments but never code', () => {
    expect(isCommentOnly(`// Never import '@ai-sdk/*' or a vendor SDK`)).toBe(true)
    expect(isCommentOnly(`   * providerMetadata only carries the LAST step`)).toBe(true)
    expect(isCommentOnly(`/* apiKey: process.env.ANTHROPIC_API_KEY */`)).toBe(true)
    expect(isCommentOnly(`apiKey: process.env.ANTHROPIC_API_KEY!,`)).toBe(false)
    expect(isCommentOnly(`const meta = step.providerMetadata?.anthropic // sum`)).toBe(false)
  })

  it('applies the relative-adapter rule to the AI layer only', () => {
    const rule = RULES.find(r => r.name === 'llm-adapter-import-relative')!
    expect(rule.appliesTo!('lib/ai/llm/ai.ts')).toBe(true)
    expect(rule.appliesTo!('lib/scam-shield/index.ts')).toBe(false)
  })

  it.each(RULES.map(r => [r.name, r] as const))(
    '%s: matches every positive control (pattern is live)',
    (_name, rule) => {
      for (const control of rule.positiveControls) {
        expect(rule.pattern.test(control), `should match: ${control}`).toBe(true)
      }
    },
  )

  it.each(RULES.map(r => [r.name, r] as const))(
    '%s: matches no negative control (pattern is not overbroad)',
    (_name, rule) => {
      for (const control of rule.negativeControls) {
        expect(rule.pattern.test(control), `should NOT match: ${control}`).toBe(false)
      }
    },
  )
})

// ── P1: the router is a pure function ────────────────────────────────────────
// Purity is not a style preference here. It is what makes a routing decision
// replayable from a log line, unit-testable without mocks, identical across
// replicas, and impossible for untrusted runtime data to steer. A single
// process.env read or clock call in this file would quietly end all four.

describe('router purity', () => {
  const ROUTER = 'lib/ai/llm/routing/router.ts'
  const body = FILES.find(f => f.path === ROUTER)?.body ?? ''
  const codeLines = body.split(/\r?\n/).filter(l => !isCommentOnly(l))
  const code = codeLines.join('\n')

  it('the router file is actually being read', () => {
    expect(body.length).toBeGreaterThan(500)
    expect(code).toContain('export function route')
  })

  it.each([
    ['environment access', /process\.env/],
    ['the clock', /new Date\(|Date\.now/],
    ['randomness', /Math\.random/],
    ['network I/O', /\bfetch\(|XMLHttpRequest/],
    ['asynchrony', /\bawait\b|\basync\b/],
    ['console output', /console\./],
  ])('contains no %s', (_what, pattern) => {
    expect(pattern.test(code)).toBe(false)
  })

  it('imports types ONLY — it cannot reach the registry, an adapter or the SDK', () => {
    const imports = codeLines.filter(l => /^\s*import\b/.test(l))
    expect(imports.length).toBeGreaterThan(0)
    for (const line of imports) {
      expect(line, `router must not import a value: ${line.trim()}`).toMatch(/^\s*import\s+type\b/)
    }
  })

  it('reads no signal field that could carry untrusted free text', () => {
    // The decision may only be a function of the closed signal set. If the
    // router ever reached for content, this is where it would show up.
    expect(/signals\.(?:text|prompt|message|content|query|memory)/.test(code)).toBe(false)
  })
})

// ── The boundary itself ──────────────────────────────────────────────────────

describe('AI Platform boundary', () => {
  it.each(RULES.map(r => [r.name, r] as const))('%s', (_name, rule) => {
    const violations = scan(rule)
    const report = violations.map(v => `  ${v.file}:${v.line}  ${v.text}`).join('\n')
    expect(violations, `${rule.why}\n\n${report}`).toEqual([])
  })
})
