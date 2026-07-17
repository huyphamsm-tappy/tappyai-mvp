'use client'

import type { ComponentProps } from 'react'
import { Toaster as Sonner } from 'sonner'

// Toast provider for back office action feedback (UI/UX Standards §9). Mounted in
// the admin layout. `toast()` from 'sonner' is called directly by client components.
type ToasterProps = ComponentProps<typeof Sonner>

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}
