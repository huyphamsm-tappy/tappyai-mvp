// The connector's client-approval resolver, wired to the real lookup. Kept apart from defaultDeps.ts so the consent screen's route can use it WITHOUT loading the gateway's paid adapters.
import { createClientResolver, parseRedirectRules, type ClientLookup } from './clientApproval'
import { createSupabaseClientLookup } from '@/lib/auth/oauthClientDirectory'

type Env = Record<string, string | undefined>

// One resolver (and so one cache) per server instance, shared by the gateway verifier and the consent-screen check.
let sharedResolver: ReturnType<typeof createClientResolver> | null | undefined
export function approvalResolver(env: Env, lookup?: ClientLookup | null): ReturnType<typeof createClientResolver> | null {
  if (lookup === undefined && sharedResolver !== undefined) return sharedResolver
  const l = lookup === undefined ? createSupabaseClientLookup(env) : lookup
  const r = l ? createClientResolver({ lookup: l, rules: parseRedirectRules(env.MCP_REDIRECT_RULES) }) : null
  if (lookup === undefined) sharedResolver = r
  return r
}
