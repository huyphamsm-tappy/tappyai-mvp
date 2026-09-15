// Scam Shield · official anti-fraud knowledge — types.
//
// ============================================================================
// THE ONE RULE THIS MODULE EXISTS FOR
// ============================================================================
// A record has TWO halves and they must never be confused:
//
//   `official`  — text carried over from the official source as published: the scenario's title,
//                 its group, its one-line description. Source-derived, never rewritten by a model,
//                 never "improved". The UI presents it under "Thông tin từ nguồn chính thức".
//   `guidance`  — what TappyAI adds for the reader (warning signs, what the scammer asks for, what
//                 to do / not do). Written by people from the official material, labelled as
//                 TappyAI's, and NEVER presented as a quotation.
//
// A model may be asked, later and explicitly, to explain or summarise a record; it is never the
// author of one. Nothing in this module calls a model, reads a quota, or touches the network — a
// scenario is displayed from a static, versioned dataset.

import type { AttackGoal } from '../message/types'

/** Categories mirror the official grouping of the dataset's source, one for one. */
export const KNOWLEDGE_CATEGORIES = [
  'impersonation',
  'ai_deepfake',
  'investment_jobs',
  'online_trading',
  'data_theft',
] as const
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]

export interface KnowledgeSource {
  /** The issuing authority, as the reader should see it. */
  organization: string
  /** The published title of the document/page the record comes from, verbatim. */
  title: string
  /** The original page on the authority's own domain. */
  url: string
  /** The official media (infographic) the itemised list was read from, when the article body itself
   *  only summarises it. Also on the authority's own domain. */
  mediaUrl?: string
  /** ISO date as printed by the source. */
  publishedAt?: string
  updatedAt?: string
  /** ISO date TappyAI last opened the source and compared the record against it. */
  verifiedAt: string
}

export interface OfficialGroup {
  category: KnowledgeCategory
  /** Group number and label as printed in the source. */
  officialNumber: number
  label: string
  /** The source article's own paragraph describing this group, verbatim. */
  description: string
}

export interface ScamScenario {
  /** Stable id: `<source-slug>-<officialNumber>`. */
  id: string
  /** The scenario's number in the official list — kept so a reader can find it in the source. */
  officialNumber: number
  category: KnowledgeCategory
  /** TappyAI's mapping onto the message-analysis taxonomy, so the two features share one vocabulary. */
  attackerGoal: AttackGoal
  official: {
    title: string
    summary: string
  }
  guidance: {
    warningSigns: string[]
    commonRequests: string[]
    whatToDo: string[]
    whatNotToDo: string[]
  }
  source: KnowledgeSource
  /** Always `true` for a shipped record; the dataset test refuses anything else. */
  verified: true
  language: 'vi'
}

export interface KnowledgeDataset {
  /** Bump when records change; the UI can show it, and a future sync job can compare against it. */
  version: string
  source: KnowledgeSource
  groups: OfficialGroup[]
  scenarios: ScamScenario[]
  /** Verbatim from the source: what the scammers are after, and the prevention measures. */
  official: {
    attackerGoals: string[]
    preventionMeasures: string[]
    reportAdvice: string
    hotline: string
  }
}
