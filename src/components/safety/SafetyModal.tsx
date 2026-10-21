'use client'

// WEB-ONLY Phase 8 / WP-06 — one small accessible modal for the safety dialogs (report, block). Radix gives the focus trap, Escape, scroll
// lock and aria wiring. It deliberately does NOT use `@/components/ui/dialog`: that wrapper is the ADMIN design system ("admin-theme"), and
// these dialogs open on user-facing pages.

import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

export function SafetyModal({
  open, onOpenChange, title, testId, children,
}: { open: boolean; onOpenChange: (open: boolean) => void; title: string; testId?: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid={testId}
          className="fixed left-1/2 top-1/2 z-[91] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
