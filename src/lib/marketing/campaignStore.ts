import type { SupabaseClient } from '@supabase/supabase-js'
import type { CampaignStatus } from './campaignLifecycle'

// ─── V2.2-2 MARKETING — CAMPAIGN PERSISTENCE ─────────────────────────────────
//
// Contract: M-14 · M-16 · M-5 · M-28 (no promotion or coupon concept).
//
// 🚨 NOTHING HERE DECIDES WHETHER A CAMPAIGN MAY BE ACTIVATED. This file
// reads and writes rows; the lifecycle rule lives in `campaignLifecycle.ts` and
// authorization lives in the route. Keeping persistence free of both is what
// stops "save the campaign" from quietly becoming "and also send it".

export interface CampaignRow {
  id: string
  title: string
  body: string
  link: string | null
  status: CampaignStatus
  created_by: string
  activated_by: string | null
  created_at: string
  updated_at: string
  activated_at: string | null
  completed_at: string | null
}

/**
 * The columns every read selects.
 *
 * 🔑 `category` IS DELIBERATELY ABSENT from this list and from every write
 * below. The column exists and is CHECKed to `'marketing'` at the storage
 * layer (M-5); never selecting it and never writing it means no route can
 * accept one from an author, and no response can suggest the value is a choice.
 * A campaign that could describe itself as transactional would be exempt from
 * every cap, quiet-hours rule and consent check in the contract.
 */
const CAMPAIGN_COLUMNS =
  'id, title, body, link, status, created_by, activated_by, created_at, updated_at, activated_at, completed_at'

export interface CampaignInput {
  title: string
  body: string
  link?: string | null
}

/**
 * Create a campaign. Always in `draft` — there is no way to create one already
 * active, because activation is a separate, separately-authorized act with its
 * own dry-run gate (M-18). A `status` parameter here would be a way around it.
 */
export async function createCampaign(
  admin: SupabaseClient,
  actorId: string,
  input: CampaignInput,
): Promise<CampaignRow> {
  const { data, error } = await admin
    .from('marketing_campaigns')
    .insert({
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      created_by: actorId,
      status: 'draft',
    })
    .select(CAMPAIGN_COLUMNS)
    .single()

  if (error) throw new Error(`marketing campaign: create failed: ${error.message}`)
  return data as CampaignRow
}

/** One campaign, or null when it does not exist. */
export async function getCampaign(
  admin: SupabaseClient,
  id: string,
): Promise<CampaignRow | null> {
  const { data, error } = await admin
    .from('marketing_campaigns')
    .select(CAMPAIGN_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`marketing campaign: read failed: ${error.message}`)
  return (data as CampaignRow | null) ?? null
}

/** Newest first — an operator is nearly always looking for what they just made. */
export async function listCampaigns(
  admin: SupabaseClient,
  limit = 50,
): Promise<CampaignRow[]> {
  const { data, error } = await admin
    .from('marketing_campaigns')
    .select(CAMPAIGN_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`marketing campaign: list failed: ${error.message}`)
  return (data ?? []) as CampaignRow[]
}

/**
 * Update a draft's content.
 *
 * 🚨 THE `.eq('status', 'draft')` IS NOT REDUNDANT WITH THE ROUTE'S CHECK, and
 * removing it would be a real regression. The route reads the campaign, decides
 * it is editable, then writes — and between those two steps another request can
 * activate it. Repeating the condition in the WHERE clause makes the write
 * itself conditional, so the losing request updates zero rows instead of
 * editing the text of a campaign that is already sending.
 *
 * Returns null when nothing matched, which the route reports as a conflict
 * rather than as success.
 */
export async function updateDraft(
  admin: SupabaseClient,
  id: string,
  input: CampaignInput,
  now: Date = new Date(),
): Promise<CampaignRow | null> {
  const { data, error } = await admin
    .from('marketing_campaigns')
    .update({
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      updated_at: now.toISOString(),
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select(CAMPAIGN_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(`marketing campaign: update failed: ${error.message}`)
  return (data as CampaignRow | null) ?? null
}

/**
 * Move a campaign to `active`.
 *
 * Conditional on it still being `draft`, for the same reason as above and with
 * a sharper consequence: two concurrent activations would otherwise both
 * proceed and the audience would be messaged twice. The loser updates zero rows
 * and is refused.
 */
export async function markActive(
  admin: SupabaseClient,
  id: string,
  actorId: string,
  now: Date = new Date(),
): Promise<CampaignRow | null> {
  const { data, error } = await admin
    .from('marketing_campaigns')
    .update({
      status: 'active',
      activated_by: actorId,
      activated_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', id)
    .eq('status', 'draft')
    .select(CAMPAIGN_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(`marketing campaign: activate failed: ${error.message}`)
  return (data as CampaignRow | null) ?? null
}

/**
 * Move a campaign to `completed` — terminal.
 *
 * Conditional on `active`, so a completed campaign cannot be completed twice
 * and a draft cannot skip activation to claim a send that never happened.
 */
export async function markCompleted(
  admin: SupabaseClient,
  id: string,
  now: Date = new Date(),
): Promise<CampaignRow | null> {
  const { data, error } = await admin
    .from('marketing_campaigns')
    .update({
      status: 'completed',
      completed_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', id)
    .eq('status', 'active')
    .select(CAMPAIGN_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(`marketing campaign: complete failed: ${error.message}`)
  return (data as CampaignRow | null) ?? null
}
