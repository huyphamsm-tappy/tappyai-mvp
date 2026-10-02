// Loads the AUDIT Supabase credentials from a file OUTSIDE the repo and refuses anything that is not
// the audit project. Values are never printed.
import fs from 'node:fs'

export const AUDIT_REF = 'zdaprdfgpbpnxyofagmc'
export const UAT_BASE = process.env.UAT_BASE || 'https://uat.tappyai.com'
const ENV_FILE = process.env.UAT_E2E_ENV || 'D:/TappyAI-backups/uat-e2e.env'
const BYPASS_FILE = process.env.UAT_BYPASS_FILE || 'D:/TappyAI-backups/vercel-bypass.txt'

function load() {
  const out = {}
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  if (out.SUPABASE_URL !== `https://${AUDIT_REF}.supabase.co`) {
    throw new Error('uat-e2e.env does not point at the AUDIT Supabase project — refusing to run')
  }
  const payload = JSON.parse(Buffer.from(out.SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64url').toString())
  if (payload.ref !== AUDIT_REF) throw new Error('service key belongs to another project — refusing to run')
  return out
}

export const env = load()
export const bypassSecret = () => fs.readFileSync(BYPASS_FILE, 'utf8').trim()
