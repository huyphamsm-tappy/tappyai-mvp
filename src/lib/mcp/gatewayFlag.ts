// The Remote MCP Gateway switch (R13 §25, ADR-CONN-017/019). OFF unless the value is exactly "1", and locked off in a production runtime (the same rule as every consult flag: see lockedInProduction).
// Nothing is published to a Host and no connector is registered by this flag: it only decides whether the /api/mcp route answers at all.
import { lockedInProduction } from '@/lib/config/consultFlags'

type Env = Record<string, string | undefined>

export const MCP_GATEWAY_FLAG = 'MCP_GATEWAY'

/** Pure. ON only for the exact value "1", and never in a production runtime unless the owner lists the name in CONSULT_PRODUCTION_ALLOW. */
export const mcpGatewayOn = (env: Env = process.env): boolean => env[MCP_GATEWAY_FLAG] === '1' && !lockedInProduction(env, MCP_GATEWAY_FLAG)
