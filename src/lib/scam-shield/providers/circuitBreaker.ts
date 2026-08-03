import { CB_FAILURE_THRESHOLD, CB_RECOVERY_MS } from '../config'

type CBState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

interface CircuitState {
  state: CBState
  failures: number
  lastFailure: number
  lastSuccess: number
}

const circuits = new Map<string, CircuitState>()

function getCircuit(providerId: string): CircuitState {
  let c = circuits.get(providerId)
  if (!c) {
    c = { state: 'CLOSED', failures: 0, lastFailure: 0, lastSuccess: 0 }
    circuits.set(providerId, c)
  }
  return c
}

export function isCircuitOpen(providerId: string): boolean {
  const c = getCircuit(providerId)
  if (c.state === 'CLOSED') return false
  if (c.state === 'OPEN') {
    if (Date.now() - c.lastFailure >= CB_RECOVERY_MS) {
      c.state = 'HALF_OPEN'
      return false
    }
    return true
  }
  // HALF_OPEN: allow one probe request
  return false
}

export function recordSuccess(providerId: string): void {
  const c = getCircuit(providerId)
  c.state = 'CLOSED'
  c.failures = 0
  c.lastSuccess = Date.now()
}

export function recordFailure(providerId: string): void {
  const c = getCircuit(providerId)
  c.failures++
  c.lastFailure = Date.now()
  if (c.failures >= CB_FAILURE_THRESHOLD) {
    c.state = 'OPEN'
  }
}

export function getCircuitState(providerId: string): CBState {
  const c = getCircuit(providerId)
  if (c.state === 'OPEN' && Date.now() - c.lastFailure >= CB_RECOVERY_MS) {
    return 'HALF_OPEN'
  }
  return c.state
}
