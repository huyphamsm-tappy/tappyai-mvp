// Calls the UAT web API as a seeded account (bearer from a password-grant session made in code).
// A session lives ~1 hour and a full run is longer: on a 401 the session is made again once (01/10: the
// long suite's late flows read `{error}` instead of a list and died with "x.filter is not a function").
import { UAT_BASE, bypassSecret } from './env.mjs'
import { sessionFor } from './supabase.mjs'

const cache = new Map()
export async function asUser(email) {
  const call = async (path, init, s) => {
    const res = await fetch(UAT_BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${s.access_token}`, 'x-vercel-protection-bypass': bypassSecret(), 'Content-Type': 'application/json', ...(init.headers || {}) },
    })
    const text = await res.text()
    let json; try { json = JSON.parse(text) } catch { json = text }
    return { status: res.status, json }
  }
  return async (path, init = {}) => {
    if (!cache.has(email)) cache.set(email, await sessionFor(email))
    let out = await call(path, init, cache.get(email))
    if (out.status === 401) {
      cache.set(email, await sessionFor(email))
      out = await call(path, init, cache.get(email))
    }
    return out
  }
}
