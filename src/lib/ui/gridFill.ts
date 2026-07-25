// How many empty "filler" cells to append so a grid's LAST ROW is complete.
//
// The profile post grid draws TikTok-style hairline separators via `gap-px` + a
// lighter container background showing through the 1px gaps. That technique makes
// the empty trailing cell(s) of a partial last row render as a distinct lighter
// box (the reported "vùng xám"). Appending tile-coloured filler cells for the gap
// keeps the separators but removes the box. Returns 0 when the last row is already
// full (or there are no items).
export function trailingFillerCount(itemCount: number, cols: number): number {
  if (itemCount <= 0 || cols <= 0) return 0
  return (cols - (itemCount % cols)) % cols
}
