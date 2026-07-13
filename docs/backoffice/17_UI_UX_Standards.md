# TappyAI Back Office — UI/UX Standards

**Version:** 1.0  
**Status:** DRAFT — Awaiting Owner Approval  
**Date:** 2026-07-13

---

## 1. Objective

Define the design system, component standards, and UX patterns for the Back Office Platform to ensure a consistent, professional, and efficient experience for the admin team.

---

## 2. Design Principles

| Principle | Description |
|---|---|
| **Density over decoration** | Admin tools prioritize data density and efficiency over visual flourish |
| **Progressive disclosure** | Show summary first; details on demand |
| **Destructive actions are red and confirmed** | Suspend / ban / delete always require confirmation with clear impact messaging |
| **Context is always visible** | Current section, user being viewed, date range selected — always in view |
| **Keyboard-first** | Shortcuts for common actions; form navigation via Tab |

---

## 3. Technology Stack

| Layer | Library | Reason |
|---|---|---|
| Framework | Next.js App Router | Same as main app — shared components |
| Styling | Tailwind CSS | Same as main app |
| Components | Shadcn/ui | Already used in main app; accessible; customizable |
| Charts | Recharts | Lightweight; React-native |
| Data tables | TanStack Table v8 | Best for complex sortable/filterable admin tables |
| Date picker | shadcn DateRangePicker | Consistent with component library |
| Notifications | Sonner (toast) | Same as main app |

---

## 4. Layout

### 4.1 Admin Shell

```
┌──────────────────────────────────────────────────────────┐
│ TappyAI Back Office          [Admin Name] [Role] [Logout] │  ← Top bar (64px)
├─────────────┬────────────────────────────────────────────┤
│             │                                            │
│  Navigation │  Main Content Area                        │
│  Sidebar    │                                            │
│  (240px)    │  [Breadcrumb]                             │
│             │  [Page Title]    [Date Range] [Actions]   │
│  [Home]     │                                            │
│  [Analytics]│  Content                                  │
│  [Users]    │                                            │
│  [Moderation│                                            │
│  [Engage]   │                                            │
│  [CRM]      │                                            │
│  [Reports]  │                                            │
│  [Audit]    │                                            │
│  [Settings] │                                            │
│             │                                            │
│  [System]   │                                            │
└─────────────┴────────────────────────────────────────────┘
```

### 4.2 Sidebar Navigation

- Collapsible to icon-only mode (saves screen space for data-heavy pages)
- Active item highlighted
- Submenu items indent under parent
- Badge on Moderation showing pending queue count

### 4.3 Page Structure

Every page follows:
1. **Breadcrumb** (Home > Users > User 360)
2. **Page title** + optional subtitle
3. **Toolbar** (filters, date range, export button, action buttons)
4. **Content** (charts, tables, cards)
5. **Pagination** (for list views)

---

## 5. Component Patterns

### 5.1 KPI Cards

```
┌──────────────────────────┐
│  DAU                     │
│  12,450                  │
│  ▲ +8.2% vs yesterday   │
│  [Sparkline last 7 days] │
└──────────────────────────┘
```

- Number large and prominent
- Trend indicator (▲ green / ▼ red / — neutral)
- Comparison period always labeled
- Optional 7-day sparkline for context

### 5.2 Data Tables

- Column headers are sortable (click to sort)
- Resizable columns
- Sticky header on scroll
- Row hover highlight
- Click row to open detail panel
- Checkbox column for bulk actions
- Empty state with helpful message

### 5.3 Charts

- Line charts for time-series trends
- Bar charts for comparisons
- Stacked bars for distributions (platform split)
- Pie/donut charts for category breakdown (avoid for more than 5 categories)
- All charts have tooltips on hover with exact values
- All charts respect light/dark mode

### 5.4 Date Range Picker

Global date range selector in the top toolbar.

Presets:
- Today
- Yesterday
- Last 7 days
- Last 30 days
- Last 90 days
- This month
- Last month
- Custom range

Default: Last 30 days

### 5.5 Confirmation Dialogs

Required for all destructive or irreversible actions.

```
┌──────────────────────────────────────────┐
│ ⚠️  Suspend this user?                   │
│                                          │
│  You are about to suspend:               │
│  Nguyễn Văn A (user@email.com)          │
│                                          │
│  Duration: 24 hours                      │
│  Reason: Spam content                    │
│                                          │
│  The user will be logged out and cannot  │
│  access the app until July 14, 2026.     │
│                                          │
│  [Cancel]             [Suspend User]     │
│                        (red button)      │
└──────────────────────────────────────────┘
```

Rules:
- Always show who is affected (name, email)
- Always show the consequence
- Primary action button is red for destructive actions
- Cancel is always the left/first button

---

## 6. Color Coding

| Meaning | Color |
|---|---|
| Success / positive trend | Green (`#16a34a`) |
| Warning / at-risk | Amber (`#d97706`) |
| Error / negative trend | Red (`#dc2626`) |
| Neutral / informational | Blue (`#2563eb`) |
| Inactive / muted | Gray (`#6b7280`) |

Role badges:
- Super Admin: Red
- Admin: Orange
- Moderator: Amber
- Analyst: Green

Status badges:
- Active: Green
- Suspended: Amber
- Banned: Red
- Deleted: Gray

---

## 7. Dark Mode

The Back Office supports light and dark mode (same mechanism as main app).

Admin team members may work long hours — dark mode reduces eye strain.

Implementation: Same Tailwind dark mode classes as existing app.

---

## 8. Accessibility

| Requirement | Standard |
|---|---|
| Color contrast | WCAG AA (4.5:1 for text) |
| Keyboard navigation | All interactive elements reachable via Tab |
| Screen reader | ARIA labels on all icon buttons |
| Focus indicators | Visible focus ring on all interactive elements |
| Error messages | Not color-only — always include text |

---

## 9. Loading States

| State | Pattern |
|---|---|
| Page initial load | Skeleton screens (not spinners) for KPI cards and tables |
| Action in progress | Button shows loading spinner + disabled state |
| Chart loading | Skeleton placeholder same size as chart |
| Background task | Toast notification: "Report being generated..." |
| Task complete | Toast notification: "Report ready — Download" |

---

## 10. Empty States

Every list/table must have a meaningful empty state:

```
[Icon]
No users found matching your filters.
Try adjusting the search or date range.
[Clear Filters]
```

---

*End of UI/UX Standards*
