// F-096 · bucket-level proof: a deleted account's uploads are gone FROM THE BUCKET, not just the DB.
//
// Chain exercised, all against the AUDIT project and a NON-PRODUCTION bucket:
//   1. create a synthetic test account on audit (admin API; never a pre-existing account — R11)
//   2. upload three files under that account's keys with the SAME provider.put() the app's upload
//      routes call (avatar, review photo, avatar of a group the account created)
//   3. confirm each object exists (stat) and, if the bucket is public, is publicly reachable
//   4. delete the account on audit → the trigger queues an account_deletion_jobs row
//   5. run the real worker (processAccountDeletionJobs) with the real audit DB and the real bucket
//   6. confirm each object is gone (stat → null, public GET → not 200) and the job is done
//
// Not exercised here: the upload ROUTES themselves (they need the deployment's Workload Identity
// token; their key layout is pinned by the route tests) and the Vercel cron wrapper (route tests).
//
// Run from the repo root (owner-provided bucket + a short-lived token from YOUR gcloud login):
//   GCS_PROOF_BUCKET=tappyai-media-audit GCS_PROOF_TOKEN="$(gcloud auth print-access-token)" \
//     npx tsx docs/uat/evidence/f096-2026-09-26/prove-media-deletion.mts
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createGcsProvider, gcsPublicUrl } from '../../../../src/lib/media/providers/gcs'
import { processAccountDeletionJobs } from '../../../../src/lib/account/deletionJobs'

const AUDIT_REF = 'zdaprdfgpbpnxyofagmc'
const PROD_BUCKET = 'tappyai-media-prod'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const bucket = process.env.GCS_PROOF_BUCKET ?? ''
const token = process.env.GCS_PROOF_TOKEN ?? ''
if (!String(env.NEXT_PUBLIC_SUPABASE_URL).includes(AUDIT_REF)) throw new Error('REFUSING: .env.local is not the audit project')
if (!bucket || bucket === PROD_BUCKET || /prod/i.test(bucket)) throw new Error('REFUSING: GCS_PROOF_BUCKET must be a non-production bucket')
if (!token) throw new Error('GCS_PROOF_TOKEN required (gcloud auth print-access-token)')

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const gcs = createGcsProvider({ bucket, getAccessToken: async () => token })
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const publicStatus = async (key: string) => (await fetch(gcsPublicUrl(bucket, key), { method: 'GET' })).status

const out: Record<string, unknown> = { at: new Date().toISOString(), bucket, auditRef: AUDIT_REF }

// 1. synthetic account + a group it creates
const email = `f096-media-${Date.now()}@example.test`
const created = await admin.auth.admin.createUser({ email, email_confirm: true })
if (created.error || !created.data.user) throw new Error('createUser failed: ' + created.error?.message)
const uid = created.data.user.id
const { data: grp, error: gErr } = await admin.from('groups').insert({ creator_id: uid, name: 'F-096 media probe' }).select('id').single()
if (gErr) throw new Error('group insert failed: ' + gErr.message)
out.account = { email, uid, groupId: grp.id }

// 2. uploads under the app's key layout, through provider.put()
const keys = [`avatars/${uid}-proof.png`, `reviews/${uid}/proof.png`, `avatars/group-${grp.id}-proof.png`]
for (const k of keys) await gcs.put(k, png, { contentType: 'image/png' })
out.beforeDeletion = await Promise.all(keys.map(async k => ({ key: k, stored: (await gcs.statObject!(k)) !== null, publicHttp: await publicStatus(k) })))

// 4. delete the account → the trigger queues the job
const del = await admin.auth.admin.deleteUser(uid)
if (del.error) throw new Error('deleteUser failed: ' + del.error.message)
const { data: jobRows } = await admin.from('account_deletion_jobs').select('id, group_ids').eq('user_id', uid)
out.jobQueued = { rows: jobRows?.length ?? 0, groupIdsMatch: jobRows?.[0]?.group_ids?.[0] === grp.id }

// 5. the real worker, real DB, real bucket (no Google token in this account → nothing to revoke)
out.worker = await processAccountDeletionJobs({
  db: admin,
  media: { listObjects: p => gcs.listObjects!(p), deleteObject: k => gcs.deleteObject!(k) },
  revoke: async () => true,
})

// 6. gone from the bucket
out.afterDeletion = await Promise.all(keys.map(async k => ({ key: k, stored: (await gcs.statObject!(k)) !== null, publicHttp: await publicStatus(k) })))
const { data: after } = await admin.from('account_deletion_jobs').select('done_at, media_deleted, last_error').eq('user_id', uid)
out.jobAfter = after?.[0] ?? null
out.PASS = (out.afterDeletion as Array<{ stored: boolean; publicHttp: number }>).every(o => !o.stored && o.publicHttp !== 200)
  && !!(out.jobAfter as { done_at?: string } | null)?.done_at

console.log(JSON.stringify(out, null, 1))
writeFileSync('docs/uat/evidence/f096-2026-09-26/media-deletion-proof.json', JSON.stringify(out, null, 1))
