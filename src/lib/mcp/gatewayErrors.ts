// Error contract of the Gateway (connector doc §17): structured, stable and safe. No stack, no database or provider detail, no secret. The message is chosen HERE from the code,
// never taken from a thrown error, so a provider's text cannot leak out through an error.
import type { AdmissionError } from './connectorContract'

export const GATEWAY_ERROR_CODES = [
  'AUTH_REQUIRED', 'AUTH_INVALID', 'ACCESS_DENIED', 'QUOTA_EXCEEDED', 'BUDGET_EXCEEDED', 'MARKET_UNSUPPORTED', 'SUPPORTED_MARKET_REQUIRED', 'CONTEXT_REQUIRED',
  'INVALID_INPUT', 'RATE_LIMITED', 'ABUSE_RESTRICTED', 'PROVIDER_UNAVAILABLE', 'DEADLINE_EXCEEDED', 'JOB_NOT_FOUND', 'JOB_CANCELLED', 'INTERNAL_ERROR',
] as const
export type GatewayErrorCode = typeof GATEWAY_ERROR_CODES[number]

/** JSON-RPC protocol error codes (a malformed request or an unknown method/tool is a protocol error, not a tool result). */
export const RPC = { PARSE: -32700, INVALID_REQUEST: -32600, METHOD_NOT_FOUND: -32601, INVALID_PARAMS: -32602, INTERNAL: -32603 } as const

export const SAFE_MESSAGE: Readonly<Record<GatewayErrorCode, string>> = {
  AUTH_REQUIRED: 'Authentication is required.',
  AUTH_INVALID: 'The access token is invalid, expired or revoked.',
  ACCESS_DENIED: 'This connection is not permitted to use this tool.',
  QUOTA_EXCEEDED: 'The usage quota for this tool is exhausted.',
  BUDGET_EXCEEDED: 'TappyAI cannot serve this request right now. Please try again later.',
  MARKET_UNSUPPORTED: 'TappyAI currently serves Vietnam. Ask the user which destination in Vietnam they want, for example Ho Chi Minh City or Hanoi. Do not substitute a place.',
  SUPPORTED_MARKET_REQUIRED: 'A destination in Vietnam is required. Ask the user which destination in Vietnam they want, for example Ho Chi Minh City or Hanoi. Do not invent a location.',
  CONTEXT_REQUIRED: 'More context is required to answer this request.',
  INVALID_INPUT: 'The tool input is not valid.',
  RATE_LIMITED: 'Too many requests. Please slow down.',
  ABUSE_RESTRICTED: 'This request is temporarily restricted.',
  PROVIDER_UNAVAILABLE: 'The data source for this tool is currently unavailable.',
  DEADLINE_EXCEEDED: 'The request took too long and was stopped.',
  JOB_NOT_FOUND: 'The job does not exist or is not accessible.',
  JOB_CANCELLED: 'The job was cancelled.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
}

export interface ToolErrorResult {
  isError: true
  content: Array<{ type: 'text'; text: string }>
  structuredContent: { status: 'error'; error: { code: GatewayErrorCode; message: string; retryable: boolean; retry_after_s?: number } }
}

export function toolError(code: GatewayErrorCode, o: { retryable?: boolean; retryAfterS?: number } = {}): ToolErrorResult {
  const error = { code, message: SAFE_MESSAGE[code], retryable: o.retryable ?? false, ...(o.retryAfterS !== undefined ? { retry_after_s: o.retryAfterS } : {}) }
  const structuredContent = { status: 'error' as const, error }
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }
}

/** Admission errors from the connector contract, as Gateway codes. Pure. */
export function admissionToCode(e: AdmissionError): GatewayErrorCode | 'UNKNOWN_TOOL' {
  switch (e) {
    case 'unauthenticated': return 'AUTH_REQUIRED'
    case 'wrong_audience': case 'token_expired': case 'token_revoked': return 'AUTH_INVALID'
    case 'unknown_tool': return 'UNKNOWN_TOOL'
    case 'insufficient_scope': return 'ACCESS_DENIED'
    // a resource that belongs to someone else is indistinguishable from one that does not exist
    case 'principal_mismatch': return 'JOB_NOT_FOUND'
    case 'spend_pool_unavailable': return 'BUDGET_EXCEEDED'
  }
}
