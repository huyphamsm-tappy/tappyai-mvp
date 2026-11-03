// CONSULT_V3 (A/B eval 17/10): a numbered list a guard took an item out of keeps its old numbers — the closing options read "2. Chụp tai
// thoải mái / 3. Không quan trọng" after option 1 was emptied and dropped (sh-1, sh-3: "danh sách lựa chọn bắt đầu từ số 2"). A run of
// numbered lines (same indent; blank lines inside the run allowed) that is not 1, 2, 3 … is renumbered from 1, keeping each line's own
// marker style ("1." / "1)"). A run that starts above 3 is left alone: it continues a list the reply began earlier.

const ITEM = /^(\s*)(\d{1,2})([.)])(\s+\S.*)$/

export function renumberOrderedLists(text: string): { text: string; renumbered: number } {
  const lines = text.split('\n')
  let renumbered = 0
  let i = 0
  while (i < lines.length) {
    const m = lines[i].match(ITEM)
    if (!m) { i++; continue }
    const indent = m[1]
    const run: number[] = [i]
    let j = i + 1
    while (j < lines.length) {
      if (!lines[j].trim()) { j++; continue }
      const n = lines[j].match(ITEM)
      if (!n || n[1] !== indent) break
      run.push(j)
      j++
    }
    const nums = run.map(k => Number(lines[k].match(ITEM)![2]))
    const sequential = nums.every((n, k) => n === k + 1)
    if (!sequential && nums[0] <= 3) {
      run.forEach((k, idx) => { const x = lines[k].match(ITEM)!; lines[k] = `${x[1]}${idx + 1}${x[3]}${x[4]}` })
      renumbered++
    }
    i = run[run.length - 1] + 1
  }
  return { text: lines.join('\n'), renumbered }
}
