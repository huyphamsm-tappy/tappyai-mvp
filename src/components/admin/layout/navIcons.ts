// Controller V2 — navigation icon adapter (presentation layer).
//
// The Controller Core / Module Manifest stores a SERIALIZABLE icon NAME (string)
// — never a React component. This adapter maps that name to a concrete icon
// component at the UI boundary, keeping the kernel UI-agnostic.

import type { ComponentType } from 'react'
import {
  LayoutDashboard, BarChart3, UserCheck, Zap, ScrollText, KeyRound,
  Tag, Settings, HelpCircle, Users, TrendingUp, ShieldAlert, Building2,
} from 'lucide-react'

type IconComponent = ComponentType<{ className?: string }>

const REGISTRY: Record<string, IconComponent> = {
  LayoutDashboard,
  BarChart3,
  UserCheck,
  Zap,
  ScrollText,
  KeyRound,
  Tag,
  SettingsIcon: Settings,
  Users,
  TrendingUp,
  ShieldAlert,
  // Department Memberships (D6). A manifest icon that is not in this map falls
  // back to HelpCircle — a question mark in the sidebar rather than an error —
  // which is why `hubGrouping.test.tsx` asserts every declared name resolves.
  Building2,
}

/** Resolve a manifest icon name to a component; unknown names fall back safely. */
export function navIcon(name: string | undefined): IconComponent {
  return (name && REGISTRY[name]) || HelpCircle
}
