// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import SafeImage from './SafeImage'

// next/image itself is not under test; a plain <img> stand-in is enough to see what reaches it.
vi.mock('next/image', () => ({
  default: (p: { src: string; alt: string; onError?: (e: unknown) => void; className?: string }) => (
    <img src={p.src} alt={p.alt} className={p.className} onError={p.onError} />
  ),
}))

describe('SafeImage (F-057): one bad image never takes the page down', () => {
  it('an allowed host reaches next/image', () => {
    const { container } = render(<SafeImage src="https://storage.googleapis.com/b/r/1.jpg" alt="Ảnh review" width={100} height={100} />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://storage.googleapis.com/b/r/1.jpg')
    expect(container.querySelector('[data-image-fallback]')).toBeNull()
  })

  it('an unlisted host (the F-057 repro) renders a placeholder in the same box — nothing is fetched', () => {
    const { container } = render(<SafeImage src="https://images.unsplash.com/photo-1" alt="Ảnh review" width={120} height={80} className="rounded-xl" />)
    expect(container.querySelector('img')).toBeNull()
    const ph = container.querySelector('[data-image-fallback]') as HTMLElement
    expect(ph).not.toBeNull()
    expect(ph.getAttribute('role')).toBe('img')
    expect(ph.getAttribute('aria-label')).toBe('Ảnh review')
    expect(ph.className).toBe('rounded-xl')
    expect(ph.style.width).toBe('120px')
    expect(ph.style.height).toBe('80px')
  })

  it('a `fill` image keeps filling its container', () => {
    const { container } = render(<SafeImage src="https://images.unsplash.com/photo-1" alt="" fill />)
    const ph = container.querySelector('[data-image-fallback]') as HTMLElement
    expect(ph.style.position).toBe('absolute')
    expect(ph.getAttribute('aria-hidden')).toBe('true')
  })

  it('an image that fails to load is replaced by the placeholder, and the caller still hears onError', () => {
    const onError = vi.fn()
    const { container } = render(<SafeImage src="https://storage.googleapis.com/b/missing.jpg" alt="x" width={10} height={10} onError={onError} />)
    fireEvent.error(container.querySelector('img')!)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-image-fallback]')).not.toBeNull()
  })

  it('an empty src renders the placeholder instead of throwing', () => {
    const { container } = render(<SafeImage src="" alt="" width={10} height={10} />)
    expect(container.querySelector('[data-image-fallback]')).not.toBeNull()
  })
})
