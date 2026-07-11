#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Architecture Guard — automated enforcement of docs/architecture/AI_PLATFORM.md
//
// Zero-dependency Node script (no npm install needed — CI runs it directly).
// Run locally:  npm run architecture:check
// Runs in CI:   .github/workflows/architecture-guard.yml (push + pull_request)
//
// The guard is GENERIC by design: rules are data (patterns + allowed zones +
// fix hints). Protecting a new provider = extending the pattern lists below —
// the engine never changes. Comments are stripped before matching, so prose
// like "// per @ai-sdk/react's ..." never false-positives; string literals ARE
// scanned (model ids live in strings).
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

// Zones where vendor knowledge is ALLOWED (posix-style path prefixes).
const AI_LAYER = 'src/lib/ai/llm/' // the capability layer itself (uses the AI SDK core)
const PROVIDER_LAYER = 'src/lib/ai/llm/providers/' // vendor SDKs, model ids, keys, cache logic

// Raw vendor SDK packages that must never be dependencies at all — they bypass
// the neutral AI SDK entirely. (@ai-sdk/* adapter packages ARE allowed as deps;
// their IMPORTS are restricted to the provider layer by rule 1.)
const BANNED_DEPENDENCIES = [
  '@anthropic-ai/sdk',
  '@anthropic-ai/bedrock-sdk',
  '@anthropic-ai/vertex-sdk',
  'openai',
  '@google/generative-ai',
  '@google-cloud/vertexai',
]

// ── Rules ────────────────────────────────────────────────────────────────────
// id/title show in the report; patterns run per source line (comments stripped);
// allow = path prefixes exempt from the rule; hint = how to fix.
const RULES = [
  {
    id: 'no-vendor-sdk-imports',
    title: 'Vendor SDK imports outside the provider layer',
    patterns: [
      /from\s+['"]@ai-sdk\/(?!react)[^'"]+['"]/, // @ai-sdk/react is neutral UI glue — allowed anywhere
      /require\(\s*['"]@ai-sdk\/(?!react)/,
      /from\s+['"]@anthropic-ai\/[^'"]+['"]/,
      /require\(\s*['"]@anthropic-ai\//,
      /from\s+['"]openai['"]/,
      /from\s+['"]@google\/generative-ai['"]/,
    ],
    allow: [PROVIDER_LAYER],
    hint: "import { AI } from '@/lib/ai/llm' and call AI.generate/stream/vision. Vendor SDKs live only in src/lib/ai/llm/providers/.",
  },
  {
    id: 'no-hardcoded-model-ids',
    title: 'Provider model ids outside the provider layer',
    patterns: [
      /\bclaude-(haiku|sonnet|opus|instant|\d)/i,
      /\bgpt-[\do]/i,
      /\bo[134]-(mini|preview|pro)\b/i,
      /\bgemini-\d/i,
      /\bgrok-\d/i,
      /\bdeepseek-(chat|coder|reasoner|r\d|v\d)/i,
      /\bllama-?\d/i,
      /\bmistral-(large|medium|small|\d)/i,
    ],
    allow: [PROVIDER_LAYER],
    hint: "pass a semantic role instead: AI.generate({ role: 'fast' | 'smart' | 'planning' | 'vision' }). Concrete ids belong in the adapter's DEFAULT_MODELS or LLM_*_MODEL env.",
  },
  {
    id: 'no-vendor-api-keys',
    title: 'Vendor API keys referenced outside the provider layer',
    patterns: [
      /\b(ANTHROPIC|OPENAI|GEMINI|GOOGLE_GENERATIVE_AI|XAI|GROK|DEEPSEEK|MISTRAL|TOGETHER|FIREWORKS)_API_KEY\b/,
    ],
    allow: [PROVIDER_LAYER],
    hint: 'use AI.isConfigured() to gate on credentials. Only the matching adapter may read its vendor key.',
  },
  {
    id: 'no-direct-provider-instantiation',
    title: 'Direct provider instantiation outside the provider layer',
    patterns: [
      /\bcreateAnthropic\s*\(/,
      /\bnew\s+Anthropic\b/,
      /\bcreateOpenAI\s*\(/,
      /\bnew\s+OpenAI\b/,
      /\bcreateGoogleGenerativeAI\s*\(/,
      /\bcreateVertex\s*\(/,
      /\bcreateXai\s*\(/,
      /\bcreateDeepSeek\s*\(/,
      /\bcreateMistral\s*\(/,
    ],
    allow: [PROVIDER_LAYER],
    hint: 'providers are instantiated exactly once, in src/lib/ai/llm/registry.ts via the adapter factory. Business code never constructs one.',
  },
  {
    id: 'no-facade-bypass',
    title: "AI SDK core called directly instead of the AI facade",
    patterns: [
      /\b(generateText|streamText|generateObject|streamObject|embedMany)\s*\(/,
      /\bembed\s*\(/,
      /import\s*\{[^}]*\b(generateText|streamText|generateObject|streamObject|embedMany)\b[^}]*\}\s*from\s*['"]ai['"]/,
    ],
    allow: [AI_LAYER],
    hint: "business code reaches models only through AI.generate / AI.stream / AI.vision from '@/lib/ai/llm'. (Importing { tool } or types from 'ai' is fine — tool defs are neutral.)",
  },
  {
    id: 'no-vendor-cache-logic',
    title: 'Vendor-specific cache/options logic outside the provider layer',
    patterns: [
      /\bcacheControl\b/,
      /\bcache_control\b/,
      /anthropic-beta/,
      /prompt-caching/,
      /providerOptions\s*:\s*\{\s*['"]?(anthropic|openai|google|xai|deepseek|mistral|vertex)\b/,
    ],
    allow: [PROVIDER_LAYER],
    hint: "vendor optimizations live in the adapter's decorateMessages() (src/lib/ai/llm/providers/*). The application must not know whether prompt caching exists.",
  },
]

// ── Engine ───────────────────────────────────────────────────────────────────

/** Strip // and /* *​/ comments while PRESERVING string/template contents and
 * line numbers (comments become spaces). State machine, not regex — so URLs
 * ("https://…") and comment-looking text inside strings survive intact. */
function stripComments(source) {
  let out = ''
  let state = 'code' // code | line | block | single | double | template
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    const n = source[i + 1]
    switch (state) {
      case 'code':
        if (c === '/' && n === '/') { state = 'line'; out += '  '; i++ }
        else if (c === '/' && n === '*') { state = 'block'; out += '  '; i++ }
        else if (c === "'") { state = 'single'; out += c }
        else if (c === '"') { state = 'double'; out += c }
        else if (c === '`') { state = 'template'; out += c }
        else out += c
        break
      case 'line':
        if (c === '\n') { state = 'code'; out += c } else out += ' '
        break
      case 'block':
        if (c === '*' && n === '/') { state = 'code'; out += '  '; i++ }
        else out += c === '\n' ? c : ' '
        break
      case 'single':
        out += c
        if (c === '\\') { out += n ?? ''; i++ }
        else if (c === "'" || c === '\n') state = 'code'
        break
      case 'double':
        out += c
        if (c === '\\') { out += n ?? ''; i++ }
        else if (c === '"' || c === '\n') state = 'code'
        break
      case 'template':
        out += c
        if (c === '\\') { out += n ?? ''; i++ }
        else if (c === '`') state = 'code'
        break
    }
  }
  return out
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      yield* walk(full)
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      yield full
    }
  }
}

function toPosix(p) {
  return p.split(sep).join('/')
}

function checkSources() {
  const violations = [] // { ruleId, title, hint, file, line, text }
  for (const file of walk(SRC)) {
    const rel = toPosix(relative(ROOT, file))
    const stripped = stripComments(readFileSync(file, 'utf8'))
    const lines = stripped.split('\n')
    for (const rule of RULES) {
      if (rule.allow.some((prefix) => rel.startsWith(prefix))) continue
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of rule.patterns) {
          if (pattern.test(lines[i])) {
            violations.push({ ruleId: rule.id, title: rule.title, hint: rule.hint, file: rel, line: i + 1, text: lines[i].trim().slice(0, 120) })
            break // one report per line per rule
          }
        }
      }
    }
  }
  return violations
}

function checkDependencies() {
  const violations = []
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const banned of BANNED_DEPENDENCIES) {
    if (deps[banned]) {
      violations.push({
        ruleId: 'no-raw-vendor-dependencies',
        title: 'Raw vendor SDK present in package.json',
        hint: `remove "${banned}" — raw vendor SDKs bypass the neutral AI SDK. Adapters use @ai-sdk/* packages instead.`,
        file: 'package.json',
        line: 0,
        text: `"${banned}": "${deps[banned]}"`,
      })
    }
  }
  return violations
}

// ── Report ───────────────────────────────────────────────────────────────────

const violations = [...checkSources(), ...checkDependencies()]
const totalRules = RULES.length + 1 // + dependency rule

console.log('Architecture Guard — AI Platform (docs/architecture/AI_PLATFORM.md)')
console.log('')

if (violations.length === 0) {
  console.log(`  ✓ All ${totalRules} architecture rules passed.`)
  console.log('')
  process.exit(0)
}

const byRule = new Map()
for (const v of violations) {
  if (!byRule.has(v.ruleId)) byRule.set(v.ruleId, [])
  byRule.get(v.ruleId).push(v)
}

for (const [ruleId, list] of byRule) {
  console.log(`  ✖ [${ruleId}] ${list[0].title}`)
  for (const v of list) {
    console.log(`      ${v.file}${v.line ? ':' + v.line : ''}  ${v.text}`)
  }
  console.log(`      → Fix: ${list[0].hint}`)
  console.log('')
}

console.log(`Result: ${violations.length} violation(s) across ${byRule.size} rule(s).`)
console.log('The AI architecture is FROZEN — see docs/architecture/AI_PLATFORM.md before changing anything above.')
process.exit(1)
