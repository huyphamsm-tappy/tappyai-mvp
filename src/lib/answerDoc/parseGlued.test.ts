import { describe, it, expect } from 'vitest'
import { parseDoc } from './parse'

// UAT 18/11, case 48: four dishes written as one bullet were one item of the document, so they got one picture and one block of text.
describe('parseDoc reads items written without a line break as items', () => {
  it('one bullet line holding four "- **dish** ..." items is four items', () => {
    const doc = parseDoc('- **Phở** — soupe. - **Bánh mì** — baguette. - **Bún chả** — porc grillé. - **Cao lầu** — nouilles.')
    const list = doc.find(b => b.t === 'list')
    expect(list && list.t === 'list' && list.items.length).toBe(4)
  })
  it('an ordinary list is unchanged', () => {
    const doc = parseDoc('- **Phở** — soupe.\n- **Bánh mì** — baguette.')
    const list = doc.find(b => b.t === 'list')
    expect(list && list.t === 'list' && list.items.length).toBe(2)
  })
})
