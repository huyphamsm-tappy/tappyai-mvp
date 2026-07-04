import { describe, it, expect } from 'vitest'
import { normalizeSearch } from './normalizeSearch'

describe('normalizeSearch', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeSearch('  hello world  ')).toBe('hello world')
  })

  it('collapses repeated internal whitespace to a single space', () => {
    expect(normalizeSearch('hello    world')).toBe('hello world')
  })

  it('collapses mixed whitespace characters (tabs, newlines)', () => {
    expect(normalizeSearch('a\tb\nc')).toBe('a b c')
  })

  it('lowercases the query', () => {
    expect(normalizeSearch('ABC')).toBe('abc')
  })

  it('returns an empty string for an empty input', () => {
    expect(normalizeSearch('')).toBe('')
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeSearch('   ')).toBe('')
  })

  it('leaves an already-normalized query unchanged', () => {
    expect(normalizeSearch('hello')).toBe('hello')
  })
})
