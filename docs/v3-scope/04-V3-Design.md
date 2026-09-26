# TappyAI V3 — Design

## Goal

Implement the V3 UX/UI direction that was already decided, without unnecessarily rewriting the existing backend.

## Core principle

V3 is primarily a UX/UI evolution on top of the existing TappyAI foundation.

Do not rewrite backend architecture merely to reproduce the new interface.

## Web

Audit/implement the V3 web experience, including where applicable:
- Navigation
- Home/entry experience
- AI-first entry point
- Consultative conversation UI
- Response components
- Recommendation presentation
- Option comparison
- Action confirmation
- Loading states
- Error states
- Empty states
- Responsive behavior
- Accessibility

## App

Implement the V3 mobile experience without simply copying the web layout 1:1:
- Mobile-first navigation
- AI-first experience
- Consultative conversation
- Context presentation
- Recommendation UI
- Action UI
- Confirmation states
- Notifications
- Loading/error/empty states

## AI experience

The UI should make Consultative AI clear and usable:
- Show recommendations clearly
- Make options/comparisons understandable
- Distinguish advice from actions
- Provide appropriate confirmation before consequential actions
- Keep technology invisible to the user

## Backend principle

Reuse the existing AI/Controller foundation. Make only the backend/API changes necessary to support the V3 experience.

## Audit rule

Compare current implementation against the V3 design decisions and identify:
- DONE
- PARTIAL
- MISSING
- NEEDS UPDATE

Do not expand scope into Tappy Business or Marketplace.
