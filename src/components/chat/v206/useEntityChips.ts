'use client'
// Workspace v206 entity chips for ONE answer: finds the bold names that might be entities (entityChips.detectEntityCandidates), asks the server ONCE for their Wikipedia profiles,
// and gives the answer a `decorate` function that draws each RESOLVED name as a chip. Nothing is asked while the answer is still arriving, and nothing is drawn for a name the
// server could not resolve. `open(name)` puts that name's real profile in the right-hand drawer.
import { useCallback, useEffect, useMemo, useState } from 'react'
import '../v206.css'
import { decorateEntityChips, detectEntityCandidates, entityKey, MAX_ENTITY_CHIPS } from '@/lib/chat/entityChips'
import { chipsOf, confirmProfileSense, fetchEntityProfiles, type WikiEntity } from '@/lib/chat/entityProfiles'
import { v206Store } from '@/lib/chat/v206Store'

export interface EntityChips {
  /** applied to every formatted paragraph of the answer; undefined while there is nothing to draw */
  decorate: ((html: string) => string) | undefined
  /** opens the drawer of a chip's name; false when that name has no resolved profile */
  open: (name: string) => boolean
}

const NONE: ReadonlyMap<string, WikiEntity> = new Map()

export function useEntityChips(text: string, enabled: boolean, exclude: readonly string[] = []): EntityChips {
  const excludeKey = exclude.join('\u0001')
  const names = useMemo(
    () => (enabled ? detectEntityCandidates(text, { exclude: excludeKey ? excludeKey.split('\u0001') : [], max: MAX_ENTITY_CHIPS }) : []),
    [enabled, text, excludeKey],
  )
  const namesKey = names.join('\u0001')
  const [profiles, setProfiles] = useState<ReadonlyMap<string, WikiEntity>>(NONE)

  useEffect(() => {
    if (!namesKey) { setProfiles(NONE); return }
    let live = true
    // 18/11: a name Wikipedia found is a chip only when the profile is about what the answer talks about (confirmProfileSense)
    fetchEntityProfiles(namesKey.split('\u0001')).then(m => confirmProfileSense(text, m)).then(m => { if (live) setProfiles(m) }, () => { /* plain bold */ })
    return () => { live = false }
    // `text` is read once per set of names (the answer is complete when names appear), not on every change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey])

  const decorate = useMemo(() => {
    if (!profiles.size) return undefined
    const chips = chipsOf(profiles)
    return (html: string) => decorateEntityChips(html, chips)
  }, [profiles])

  const open = useCallback((name: string) => {
    const p = profiles.get(entityKey(name))
    if (!p) return false
    v206Store.openWiki(p)
    return true
  }, [profiles])

  return { decorate, open }
}
