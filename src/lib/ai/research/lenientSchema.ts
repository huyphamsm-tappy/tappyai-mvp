// Schemas that read what a model actually returns (11/11, the M1 baseline run: the plan call failed on three of nine Advanced attempts, twice because Sonnet returned `parts`, `steps` and `specialist_steps`
// as something that is not an array, once because it left out `image_query`). What the model is TOLD does not change: the JSON schema sent with the call still says "array".

import { z } from 'zod'

/**
 * A list that may arrive as a JSON string (the model wrote the array as text): the string is parsed; an absent or null list is empty unless `required`, in which case it stays absent and is refused so the
 * caller's retry runs. A string that is not JSON, JSON that is not an array, and elements of the wrong kind are still refused.
 */
export function lenientArray<T extends z.ZodTypeAny>(item: T, o: { required?: boolean } = {}) {
  return z.preprocess((v: unknown) => {
    if (typeof v === 'string') { try { return JSON.parse(v) } catch { return v } }
    if (v === undefined || v === null) return o.required ? v : []
    return v
  }, z.array(item))
}
