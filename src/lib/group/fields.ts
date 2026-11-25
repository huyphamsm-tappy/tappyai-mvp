// What a person types into a group (name, area, budget, tastes) is clipped to a sane length and stripped of control characters before it is stored or shown to the others
// (the UAT of 18/11 stored a 4th member whose name and area were pages long and whose budget was "abc -5 999999999999"). Pure.
export function clipField(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}
