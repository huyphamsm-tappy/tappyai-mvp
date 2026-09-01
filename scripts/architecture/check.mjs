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
// The client-input trust boundary. It must be able to NAME vendor option shapes in order to
// strip them from client payloads — see the note on `no-vendor-cache-logic`.
const SECURITY_BOUNDARY = 'src/lib/ai/security/'

// The ONLY sanctioned construction point for a Supabase service-role client.
// It applies `{ auth: { autoRefreshToken: false, persistSession: false } }`; an
// ad-hoc client omits that and tries to refresh tokens inside a serverless
// handler. Controller V2 Component 9a.
const SUPABASE_ADMIN = 'src/lib/supabase/admin.ts'

// Documented exception. This route READS the key to decide whether the admin
// path is available at all — it never constructs a client; it calls
// createAdminClient() like everyone else. Verified in Component 9a, and
// admin.test.ts asserts the file contains no createClient( of its own so this
// exemption cannot quietly grow into a bypass.
const SERVICE_ROLE_FLAG_READ = 'src/app/api/users/search/route.ts'

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

// Controller V2 kernel + its modules. 01_CONTROLLER_V2_ARCHITECTURE.md §1 makes
// this a boundary: nothing here may import consumer-app code, so extracting the
// Controller to its own deployment stays a build-config change rather than a
// rewrite. That extraction is still an OPEN owner decision (00_LEGACY_AUDIT.md
// §5.3), which is exactly why the invariant needs enforcing rather than luck.
const CONTROLLER_LAYER = 'src/lib/controller/'

// The Security Core (FOUNDATION_01 §9) the Controller is REQUIRED to consume,
// plus the single admin-client construction point (C9a). Note this names
// `supabase/admin` and not the whole directory: `supabase/server` and
// `supabase/client` are request-scoped consumer clients.
const CONTROLLER_ALLOWED_IMPORTS = /@\/(?:lib\/(?:admin|controller|security)\/|lib\/supabase\/admin['"])/

// Where permission ids are DECLARED. Everywhere else must use the registry
// constant, so a permission no manifest declares cannot be referenced.
const PERMISSION_REGISTRY = 'src/lib/admin/permissions/'

// ── Rules ────────────────────────────────────────────────────────────────────
// id/title show in the report; patterns run per source line (comments stripped);
// allow = path prefixes exempt from the rule; hint = how to fix.
//
// Optional per-rule fields:
//   scope       = path prefixes the rule applies WITHIN (absent = everywhere).
//                 `allow` says "not here"; `scope` says "only here" — a boundary
//                 rule needs the second, and cannot be expressed with the first.
//   exemptTests = skip *.test.* files. Only for rules whose violation is the
//                 normal way to write a fixture.
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
      // `cacheControl` is NOT a vendor-exclusive identifier: it is also the Cloud Storage JSON
      // API's object-metadata field, which src/lib/media must spell exactly that way to set an
      // object's HTTP Cache-Control. Matching the bare token flagged storage code for an AI rule.
      // Anchor on Anthropic's cache VALUE instead — its cacheControl is always
      // `{ type: 'ephemeral' }` — so the AI usage is still caught and the storage field is not.
      // The multi-line form stays covered by the providerOptions pattern below, which matches the
      // opening line regardless of how the object is wrapped.
      /\bcacheControl\b[^\n]*\bephemeral\b/,
      /\bcache_control\b/,
      /anthropic-beta/,
      /prompt-caching/,
      /providerOptions\s*:\s*\{\s*['"]?(anthropic|openai|google|xai|deepseek|mistral|vertex)\b/,
    ],
    // 🚨 The security boundary is allowed to NAME these, because naming them is how it REJECTS
    // them. `validateClientInput` rebuilds every message from an allowlist precisely so a client
    // cannot smuggle `providerOptions: { anthropic: { cacheControl: … } }` into a request, and its
    // tests have to spell the forbidden shape out to prove the rejection works. Flagging those was
    // the rule catching its own enforcement — the one place the pattern appearing is evidence the
    // architecture is being upheld rather than broken.
    //
    // Narrow on purpose: `src/lib/ai/security/` only, not all tests. A vendor option constructed
    // anywhere else, test or not, is still a violation.
    allow: [PROVIDER_LAYER, SECURITY_BOUNDARY],
    hint: "vendor optimizations live in the adapter's decorateMessages() (src/lib/ai/llm/providers/*). The application must not know whether prompt caching exists.",
  },
  // 🚨 SSRF. Today no adapter opens a socket, and that is the only reason a user-supplied image
  // URL is not a TappyAI SSRF sink: `@ai-sdk/anthropic` reports `supportsImageUrls: true`, so the
  // AI SDK's `downloadAssets` skips the download and Anthropic fetches the URL itself.
  //
  // Flip that flag — a new adapter, or an SDK upgrade — and the SDK downloads the URL instead,
  // using a bare `fetch()` inside `node_modules/ai` that nothing here can reach: the call site
  // does not pass `downloadImplementation`, and it is absent from the package's public types.
  // There is no interception point. The only safe answer at that moment is for the adapter to
  // fetch the URL ITSELF through `safeFetch` and hand the model bytes.
  //
  // So the rule is placed where that code would have to be written. It costs nothing today and
  // turns "someone quietly adds a download" into a CI failure and a security review.
  // `src/lib/ai/llm/__tests__/imageUrlSsrfGuardrail.test.ts` holds the flag itself.
  {
    id: 'no-raw-network-in-provider-layer',
    title: 'Raw network call inside the AI provider layer',
    patterns: [
      /\bfetch\s*\(/,
      /\b(?:https?|axios|undici)\s*\.\s*(?:get|post|request)\s*\(/,
      /\bnew\s+Request\s*\(/,
      /from\s+['"]node:(?:https?|net|dns)['"]/,
      /require\(\s*['"]node:(?:https?|net|dns)['"]/,
    ],
    allow: [],
    scope: [PROVIDER_LAYER],
    hint: "adapters must not open sockets themselves. If a provider needs TappyAI to download a user-supplied URL (an image the model cannot fetch for itself), use safeGetText/safeHeadRequest from '@/lib/security/safeFetch' — it validates the resolved ADDRESS and pins the connection to it.",
  },
  {
    id: 'no-adhoc-service-role-client',
    title: 'Supabase service-role client constructed outside the admin module',
    patterns: [
      // The service-role key may only be READ where the client is built.
      /SUPABASE_SERVICE_ROLE_KEY/,
    ],
    allow: [SUPABASE_ADMIN, SERVICE_ROLE_FLAG_READ],
    hint: 'import { createAdminClient } from "@/lib/supabase/admin". A hand-rolled client omits the auth hardening (autoRefreshToken:false, persistSession:false) and quietly becomes a second admin factory — Component 9a removed two of those.',
  },
  {
    // Controller V2 — 01_CONTROLLER_V2_ARCHITECTURE.md §1, rule 4.
    id: 'no-consumer-app-import-in-controller',
    title: 'Consumer-app import inside the Controller',
    patterns: [
      // Any `@/` import that is NOT one of the Security Core zones. Written as a
      // negative lookahead because the rule is an allowlist: adding a new
      // consumer-app directory must not silently become permitted.
      new RegExp(`from\\s+['"](?!${CONTROLLER_ALLOWED_IMPORTS.source})@/`),
      new RegExp(`require\\(\\s*['"](?!${CONTROLLER_ALLOWED_IMPORTS.source})@/`),
      // F-1 (pre-UAT audit, 2026-08-21). The two patterns above both require
      // `from` or `require(`. A BARE SIDE-EFFECT IMPORT has neither:
      //
      //     import '@/lib/i18n/admin'
      //
      // It binds no name, so it cannot be used to CALL consumer code — but it
      // executes the consumer module inside the Controller at load time, and it
      // would break the extraction this rule exists to protect. Isolated by
      // testing all four import forms: the three `from`-bearing ones were
      // caught, this one was not.
      //
      // `import\s+['"]` matches ONLY the bare form: every other syntax puts an
      // identifier, `{` or `*` between `import` and the quote. The guard tests
      // line by line, so `^` needs no `m` flag.
      new RegExp(`^\\s*import\\s+['"](?!${CONTROLLER_ALLOWED_IMPORTS.source})@/`),
    ],
    allow: [],
    scope: [CONTROLLER_LAYER],
    hint: 'the Controller may import the Security Core (@/lib/admin/**, @/lib/security/**), the admin client (@/lib/supabase/admin) and itself — nothing else. Reach consumer-app behaviour through a capability, not an import: keeping this boundary is what makes extracting the Controller a build-config change instead of a rewrite (00_LEGACY_AUDIT.md §5.3).',
  },
  {
    // Controller V2 — 01_CONTROLLER_V2_ARCHITECTURE.md §1, rule 1:
    // "No module imports another module."
    //
    // Deferred for a long time as a guard with nothing to guard — and then, on
    // 2026-08-21, Module 09's manifest imported `userHub` from
    // `userManagementModule.ts`, because that is where the hub descriptor
    // happened to live. It compiled, every test passed, and Content Moderation
    // silently stopped being removable independently of User Management.
    //
    // The descriptor moved to `hubs.ts` and this rule now holds the line. It is
    // not decorative: it is written because the violation already happened once.
    //
    // Scoped to `modules/` only. A module may import the kernel, the registry,
    // shared descriptors (`hubs.ts`) and the Security Core — just not a sibling
    // MODULE file, which is what creates the dependency.
    id: 'no-module-imports-module',
    title: 'A Controller module importing another Controller module',
    patterns: [
      // Relative import of a sibling ending in `Module` — the naming convention
      // every module file in this directory follows.
      /from\s+['"]\.\/[a-zA-Z]+Module['"]/,
      /from\s+['"]\.\.\/modules\/[a-zA-Z]+Module['"]/,
    ],
    allow: [],
    scope: ['src/lib/controller/modules/'],
    hint: 'a module may not depend on a sibling module. If you need something a sibling declares — a hub descriptor, a shared constant — move it to `src/lib/controller/modules/hubs.ts` (or another shared file) and import it from there. A hub in particular CONTAINS modules (FOUNDATION_01_CONTRACTS §2), so defining it inside one of its members inverts the relationship and makes the other members depend on that member.',
  },
  {
    // Controller V2 — 01_CONTROLLER_V2_ARCHITECTURE.md §1, rule 5.
    id: 'no-permission-string-literal',
    title: 'Permission id written as a string literal instead of a registry constant',
    patterns: [
      // Argument positions of the two guards and the PDP.
      /requirePagePermission\(\s*['"]/,
      /requirePermission\([^)]*,\s*['"]/,
      /\.(?:can|authorize)\([^)]*,\s*['"][a-z_]+\.[a-z_]+\.[a-z_]+['"]/,
      // Manifest / hub declaration fields.
      /(?:visibilityPermission|permissionScope)\s*:\s*['"]/,
      /\bpermissions\s*:\s*\[\s*['"]/,
    ],
    // The registry is where these ids are DEFINED; it cannot import itself.
    allow: [PERMISSION_REGISTRY],
    exemptTests: true,
    hint: "use PERMISSIONS.<KEY> from '@/lib/admin/permissions/registry'. A raw string is a permission no manifest declares, which the architecture requires not to compile — and it is matched on the ARGUMENT POSITION, not the id shape, because i18n keys ('admin.nav.dashboard') are shaped identically.",
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
      // `scope` is the inverse of `allow`: the rule applies ONLY inside these
      // prefixes. Boundary rules need it — "no consumer-app import in the
      // Controller" cannot be written as "forbidden everywhere except X".
      if (rule.scope && !rule.scope.some((prefix) => rel.startsWith(prefix))) continue
      if (rule.exemptTests && /\.test\.[cm]?[jt]sx?$/.test(rel)) continue
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
console.log('                 + Controller V2 (docs/controller-v2/01_CONTROLLER_V2_ARCHITECTURE.md §1)')
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
console.log('These architectures are FROZEN — see docs/architecture/AI_PLATFORM.md and')
console.log('docs/controller-v2/01_CONTROLLER_V2_ARCHITECTURE.md §1 before changing anything above.')
process.exit(1)
