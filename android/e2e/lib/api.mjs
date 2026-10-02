// Calls the UAT web API as a seeded account (bearer from a password-grant session made in code).
import { UAT_BASE, bypassSecret } from './env.mjs'
import { sessionFor } from './supabase.mjs'

const cache = new Map()
export async function asUser(email) {
  if (!cache.has(email)) cache.set(email, await sessionFor(email))
  const s = cache.get(email)
  return async (path, init = {}) => {
    const res = await fetch(UAT_BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${s.access_token}`, 'x-vercel-protection-bypass': bypassSecret(), 'Content-Type': 'application/json', ...(init.headers || {}) },
    })
    const text = await res.text()
    let json; try { json = JSON.parse(text) } catch { json = text }
    return { status: res.status, json }
  }
}
