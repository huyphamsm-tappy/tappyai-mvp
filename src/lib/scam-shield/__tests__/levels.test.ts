import { describe, it, expect } from 'vitest'
import { scoreToLevel } from '../engine/levels'

describe('scoreToLevel', () => {
  it('maps 0 to SAFE', () => {
    expect(scoreToLevel(0)).toBe('SAFE')
  })

  it('maps 10 to SAFE (boundary)', () => {
    expect(scoreToLevel(10)).toBe('SAFE')
  })

  it('maps 11 to LOW', () => {
    expect(scoreToLevel(11)).toBe('LOW')
  })

  it('maps 30 to LOW (boundary)', () => {
    expect(scoreToLevel(30)).toBe('LOW')
  })

  it('maps 31 to MEDIUM', () => {
    expect(scoreToLevel(31)).toBe('MEDIUM')
  })

  it('maps 55 to MEDIUM (boundary)', () => {
    expect(scoreToLevel(55)).toBe('MEDIUM')
  })

  it('maps 56 to HIGH', () => {
    expect(scoreToLevel(56)).toBe('HIGH')
  })

  it('maps 80 to HIGH (boundary)', () => {
    expect(scoreToLevel(80)).toBe('HIGH')
  })

  it('maps 81 to CRITICAL', () => {
    expect(scoreToLevel(81)).toBe('CRITICAL')
  })

  it('maps 100 to CRITICAL', () => {
    expect(scoreToLevel(100)).toBe('CRITICAL')
  })

  it('maps values above 100 to CRITICAL', () => {
    expect(scoreToLevel(150)).toBe('CRITICAL')
  })
})
