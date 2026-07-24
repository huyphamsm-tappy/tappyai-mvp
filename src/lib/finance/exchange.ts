// Exchange-rate math for the finance library. Rates are a USD-based table
// (units of CODE per 1 USD, so rates.USD === 1). Cross rate A→B is derived as
// A→USD→B = rates[B] / rates[A].

export class MissingCurrencyError extends Error {
  constructor(public readonly code: string) {
    super(`No exchange rate available for currency: ${code}`)
    this.name = 'MissingCurrencyError'
  }
}

function isValidRate(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

// Cross rate from → to. Throws MissingCurrencyError when either side is absent or
// invalid — it NEVER silently falls back to 1 (the Bug #15 hardening: a missing
// currency must stop the conversion and surface an error, not produce a wrong number).
export function crossRate(rates: Record<string, number>, from: string, to: string): number {
  const fromRate = rates[from]
  const toRate = rates[to]
  if (!isValidRate(fromRate)) throw new MissingCurrencyError(from)
  if (!isValidRate(toRate)) throw new MissingCurrencyError(to)
  return toRate / fromRate
}
