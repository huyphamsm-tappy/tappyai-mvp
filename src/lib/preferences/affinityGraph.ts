import { AFFINITY_PROPAGATION, NEGATIVE_WEIGHTS, NegativeSignal } from './config'
import { WeightedSignals } from './learningEngine'
import { TAXONOMY_TREE } from './taxonomy'

// Build a map of tag → [parent, grandparent, ...root] at module load.
// Each lookup is O(1) at runtime; no repeated tree traversal.
const ANCESTOR_MAP: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>()
  const visited = new Set<string>()

  function traverse(node: string, ancestorPath: string[]): void {
    if (visited.has(node)) return // cycle guard
    visited.add(node)
    map.set(node, ancestorPath)
    for (const child of TAXONOMY_TREE[node] || []) {
      traverse(child, [node, ...ancestorPath])
    }
  }

  // Start from every root node (a node that is never anyone's child)
  const allChildren = new Set(Object.values(TAXONOMY_TREE).flat())
  for (const key of Object.keys(TAXONOMY_TREE)) {
    if (!allChildren.has(key)) {
      traverse(key, [])
    }
  }

  return map
})()

// Apply a score (positive or negative) from a tag upward through the taxonomy.
// ancestors[0] = parent → PARENT weight
// ancestors[1] = grandparent → GRANDPARENT weight
// ancestors[2+] = root level → ROOT weight
function applyPropagation(
  tag: string,
  points: number,
  targetMap: Map<string, number>
): void {
  // DIRECT: the tag itself at full weight
  targetMap.set(tag, (targetMap.get(tag) ?? 0) + points * AFFINITY_PROPAGATION.DIRECT)

  const ancestors = ANCESTOR_MAP.get(tag)
  if (!ancestors || ancestors.length === 0) return

  for (let i = 0; i < ancestors.length; i++) {
    const w =
      i === 0 ? AFFINITY_PROPAGATION.PARENT
      : i === 1 ? AFFINITY_PROPAGATION.GRANDPARENT
      : AFFINITY_PROPAGATION.ROOT
    targetMap.set(ancestors[i], (targetMap.get(ancestors[i]) ?? 0) + points * w)
  }
}

// Enrich weighted signals by propagating scores up the taxonomy tree and
// applying negative signals. Returns a new WeightedSignals with the same
// interface so profileBuilder requires no changes.
export function enrichWithAffinity(
  weighted: WeightedSignals,
  negativeSignals: NegativeSignal[] = []
): WeightedSignals {
  const enrichedFood = new Map<string, number>()
  const enrichedCategory = new Map<string, number>()

  for (const [tag, score] of weighted.foodScores) {
    applyPropagation(tag, score, enrichedFood)
  }

  for (const [tag, score] of weighted.categoryScores) {
    applyPropagation(tag, score, enrichedCategory)
  }

  // Negative learning: reduce scores via the same propagation path, clamp at 0
  for (const neg of negativeSignals) {
    const deduction = NEGATIVE_WEIGHTS[neg.type]
    for (const tag of neg.tags) {
      applyPropagation(tag, -deduction, enrichedFood)
      applyPropagation(tag, -deduction, enrichedCategory)
    }
  }

  // Clamp: no score may fall below zero
  for (const map of [enrichedFood, enrichedCategory]) {
    for (const [k, v] of map) {
      if (v < 0) map.set(k, 0)
    }
  }

  return {
    ...weighted,
    foodScores: enrichedFood,
    categoryScores: enrichedCategory,
  }
}
