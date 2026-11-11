import { describe, it, expect } from 'vitest'
import { MCP_GATEWAY_FLAG, mcpGatewayOn } from './gatewayFlag'

describe('MCP_GATEWAY flag', () => {
  it('is OFF by default and for anything but the exact value "1"', () => {
    expect(mcpGatewayOn({})).toBe(false)
    for (const v of ['0', 'true', 'TRUE', ' 1', '1 ', '01', 'yes', '']) expect(mcpGatewayOn({ [MCP_GATEWAY_FLAG]: v })).toBe(false)
  })
  it('is ON for "1" outside a production runtime', () => {
    expect(mcpGatewayOn({ [MCP_GATEWAY_FLAG]: '1' })).toBe(true)
    expect(mcpGatewayOn({ [MCP_GATEWAY_FLAG]: '1', VERCEL_ENV: 'preview' })).toBe(true)
  })
  it('is LOCKED in a production runtime (NODE_ENV or VERCEL_ENV), whatever the variable says', () => {
    expect(mcpGatewayOn({ [MCP_GATEWAY_FLAG]: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(mcpGatewayOn({ [MCP_GATEWAY_FLAG]: '1', NODE_ENV: 'production' })).toBe(false)
  })
  it('reads the real environment by default (off in the test run)', () => {
    expect(mcpGatewayOn()).toBe(false)
  })
})
