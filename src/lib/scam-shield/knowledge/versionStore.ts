import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKnowledgeMeta, type KnowledgeMeta } from './index'
import type { KnowledgeVersionRow, KnowledgeVersionStore } from './versions'

// Scam Shield · official knowledge versions — the Supabase-backed store (service role; the table has RLS on and no policy for anyone else).
// Server-only: kept out of knowledge/index.ts so the browser bundle never reaches the service-role client.

const TABLE = 'scam_knowledge_versions'
const COLUMNS = 'version, source_url, host, title, published_at, fetched_at, verified_at, content_hash, status, body, structured, created_at'

export function supabaseVersionStore(): KnowledgeVersionStore {
  return {
    async listApproved(limit) {
      const { data, error } = await createAdminClient().from(TABLE).select(COLUMNS).eq('status', 'approved').order('published_at', { ascending: false, nullsFirst: false }).limit(limit)
      if (error) throw new Error(`scam_knowledge_versions read failed: ${error.code ?? 'error'}`)
      return (data ?? []) as KnowledgeVersionRow[]
    },
    async hasHash(contentHash) {
      const { data, error } = await createAdminClient().from(TABLE).select('version').eq('content_hash', contentHash).limit(1)
      if (error) throw new Error(`scam_knowledge_versions read failed: ${error.code ?? 'error'}`)
      return (data ?? []).length > 0
    },
    async insert(row) {
      // content_hash is UNIQUE: a duplicate (a concurrent run) is ignored, not an error.
      const { data, error } = await createAdminClient().from(TABLE).upsert(row, { onConflict: 'content_hash', ignoreDuplicates: true }).select('version')
      if (error) throw new Error(`scam_knowledge_versions write failed: ${error.code ?? 'error'}`)
      return (data ?? []).length > 0
    },
    async touchVerified(contentHash, at) {
      const { error } = await createAdminClient().from(TABLE).update({ verified_at: at }).eq('content_hash', contentHash).eq('status', 'approved')
      if (error) throw new Error(`scam_knowledge_versions write failed: ${error.code ?? 'error'}`)
    },
  }
}

let defaultStore: KnowledgeVersionStore | null = null

/** For server pages and routes: the knowledge's freshness from the database, falling back to the static file. Never throws. */
export async function loadKnowledgeMeta(): Promise<KnowledgeMeta> {
  try {
    defaultStore ??= supabaseVersionStore() // one instance, so the reader's cache (keyed by store) is shared by every request
    return await getKnowledgeMeta({ store: defaultStore })
  } catch {
    return getKnowledgeMeta({ store: null })
  }
}
