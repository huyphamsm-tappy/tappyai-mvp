# TappyAI Master UX/UI Specification (MUXS)

**Version:** 1.0
**Status:** FINAL — Approved UX/UI Constitution
**Document Class:** Highest-level UX/UI document (Single Source of Truth for experience)
**Subordinate to:** *TappyAI Master Product Specification (MPS) v1.0 — FINAL*
**Scope:** User experience, interaction design, visual language, motion, and product consistency — non-technical
**Applies to:** All surfaces and platforms of the TappyAI ecosystem (mobile, tablet, desktop, foldable), current and future

> This document is the **UX/UI Constitution** of TappyAI. It defines *how the product should feel, behave, and communicate* — never how it is built. It is **subordinate to the Master Product Specification (MPS) v1.0 — FINAL**: where any experience decision would conflict with the MPS — its North Star, Non-Negotiable Rules, AI Decision Principles, or values — the MPS prevails. Where a later design-system, brand, or engineering document conflicts with this one on matters of experience principle, this document prevails until formally revised.
>
> This document intentionally contains **no design tokens, hex colours, font names, spacing values, motion timings, platform code, CSS, or implementation detail**. Those belong to a separate design-system specification and must remain consistent with the principles stated here.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [UX Philosophy](#2-ux-philosophy)
3. [Design Language](#3-design-language)
4. [Visual Identity](#4-visual-identity)
5. [Motion & Animation System](#5-motion--animation-system)
6. [Domain Animation System](#6-domain-animation-system)
7. [Brand Experience](#7-brand-experience)
8. [AI Conversation Experience](#8-ai-conversation-experience)
9. [Emotional Design](#9-emotional-design)
10. [AI Personality](#10-ai-personality)
11. [Microcopy Guidelines](#11-microcopy-guidelines)
12. [Delight Moments](#12-delight-moments)
13. [User Experience Standards](#13-user-experience-standards)
14. [Permission Experience](#14-permission-experience)
15. [Error Experience](#15-error-experience)
16. [Sharing Experience](#16-sharing-experience)
17. [Responsive Design](#17-responsive-design)
18. [Accessibility](#18-accessibility)
19. [UX Success Principles](#19-ux-success-principles)
20. [Non-Negotiable UX Rules](#20-non-negotiable-ux-rules)
21. [UX Decision Tree](#21-ux-decision-tree)
22. [AI Emotional States](#22-ai-emotional-states)
23. [Trust Signals](#23-trust-signals)
24. [Premium Interaction Principles](#24-premium-interaction-principles)
25. [UX Review Checklist](#25-ux-review-checklist)
- [Appendix A: Glossary](#appendix-a-glossary)
- [Appendix B: Document Governance](#appendix-b-document-governance)

---

## 1. Executive Summary

TappyAI's experience exists to make a single promise real: that a person can state what they need in their own words and be helped toward a better real-life decision — with less effort and greater confidence. Every screen, every animation, every word, and every moment of silence in the product exists to serve that promise. This document defines the permanent standards that keep the experience true to it, consistently, across every surface and for years to come.

The experience is guided by one central idea: **the assistant is the product, and the interface exists to serve the assistant, not the other way around.** TappyAI does not ask people to navigate a maze of features. It presents a calm, human companion that understands intent, does the work of discovery and comparison, and returns clear, honest help. The interface recedes so the help can come forward.

Two truths shape everything that follows. First, **premium means simplicity** — refinement is achieved through restraint, clarity, and care, never through ornament, density, or cleverness. Second, **trust is the foundation** — every interaction either strengthens or weakens the user's confidence that TappyAI is honest, dependable, and acting in their interest, and no experience decision is permitted to weaken it.

TappyAI expresses itself through **two coherent modes of one brand**: a calm, light, everyday **utility experience** for the assistant and the tools of daily life, and an immersive, media-forward **social experience** for community content. These are deliberately distinct in feel and deliberately unified in identity; they are never merged, and each is applied where it belongs. Throughout, a consistent priority governs trade-offs: **usability first, then visual consistency, then numerical consistency** — the product is never made harder to use in the name of making it look uniform.

This document is the permanent reference for what a good TappyAI experience is. A designer, product manager, engineer, or AI collaborator should be able to read it and know — without ambiguity — how the product should behave and feel, and be able to judge any new experience against a fixed standard.

---

## 2. UX Philosophy

These are the orientations that resolve experience trade-offs. When two designs both seem reasonable, these decide.

### 2.1 User First
Every experience decision is judged from the user's point of view: does this make their moment easier, clearer, or more confident? When the interests of the user and the convenience of the product diverge, the experience defaults to the user.

### 2.2 AI First
The primary way a person expresses a need is by saying it, and the primary response is understanding and help. Conventional interface elements exist to support the assistant. The experience is designed around conversation and intent, not around menus and categories.

### 2.3 Mobile First
TappyAI is used in the real moments where decisions happen — on a street, in a shop, on the move. The experience is designed first for the hand and the in-the-moment situation, and every other surface is shaped in service of that primary reality.

### 2.4 Simple First
Between two ways to accomplish the same thing, the experience chooses the one that is simpler for the user — even when it is harder to design or build. Complexity is absorbed by the product so it never lands on the person. Simplicity is defended actively, not assumed.

### 2.5 Stability First
People rely on TappyAI for real decisions, so the experience must feel dependable, predictable, and calm. Consistency of behaviour, absence of surprise, and graceful handling of the unexpected come before visual novelty.

### 2.6 Accessibility First
The experience is designed to be usable by as many people as possible, in as many situations as possible. Accessibility is a starting condition of good design, not a later adjustment. A design that excludes people is incomplete, not merely imperfect.

### 2.7 Consistency First
The same action means the same thing everywhere. Patterns, language, and behaviours are consistent across surfaces so that learning the product once is enough. Consistency reduces cognitive load and is itself a form of respect for the user's time. Where consistency and usability conflict, usability wins — but the bar for breaking a pattern is high and deliberate.

---

## 3. Design Language

The design language describes the *character* of every surface. These qualities are always present together; each tempers the others.

- **Modern** — The experience feels current and considered, aligned with how people expect fine software to look and behave today, without chasing trend for its own sake.
- **Premium** — The experience feels crafted and high in quality, communicated through restraint, coherence, and polish. Premium is the absence of the unnecessary, not the presence of the ornamental.
- **Friendly** — The experience is approachable and warm. It lowers the barrier to asking for help and makes people feel welcome and unhurried.
- **Trustworthy** — The experience feels honest and dependable. Nothing is hidden, exaggerated, or manipulative; what the user sees is what is true.
- **Clean** — The experience is uncluttered. Every element present has a reason; nothing competes for attention that does not deserve it.
- **Calm** — The experience is quiet and unhurried. It does not shout, flash, or pressure. It gives the user room to think.
- **Human** — The experience feels like it was made by people, for people. It speaks plainly, responds gently, and treats the user as a capable adult.

These seven qualities are the tone of the entire product. Any surface that feels loud, cluttered, cold, gimmicky, or pressuring has departed from the design language, regardless of how novel or impressive it may appear.

---

## 4. Visual Identity

The visual identity is the product's non-verbal language. It is defined here as **roles, meaning, and principles** — never as specific values, which belong to the design-system specification.

### 4.1 Colour System
Colour is used semantically and sparingly. Each colour carries a consistent *meaning* — a primary identity that signals the brand and the trusted assistant; a warm accent that signals energy, action, and delight; and a distinct expressive identity reserved for the immersive social experience. Functional colours communicate state — success, caution, error, and information — consistently and unambiguously. Colour is applied with restraint so that emphasis remains meaningful, and it is never the *only* means of conveying information (see Accessibility). The palette exists to guide, reassure, and delight — never to decorate for its own sake.

### 4.2 Typography Principles
Type establishes hierarchy, rhythm, and voice. It is legible first and expressive second. A clear, limited hierarchy tells the user what matters most, what is secondary, and what is supporting, without requiring effort. Text is set for comfortable reading in real conditions — in bright light, in motion, at a glance. Restraint governs: few sizes and weights, used consistently, create calm and clarity; many create noise. Typography always serves comprehension before personality.

### 4.3 Iconography Principles
Icons are a supporting language, not a replacement for words where words are clearer. They are simple, consistent in style, and instantly recognisable in meaning. An icon earns its place only when it communicates faster than text or reinforces it; ambiguous or decorative icons are avoided. Consistency of metaphor across the product ensures an icon means the same thing everywhere it appears.

### 4.4 Illustration Principles
Illustration is used to reassure, to explain, and to add warmth — most often in empty states, onboarding, and moments of delight. It is friendly and human, coherent with the brand's character, and always in service of understanding or emotional tone, never mere ornament. Illustration should make a moment feel more human, calmer, or clearer; if it does none of these, it is removed.

### 4.5 Photography Principles
Where real imagery appears — most prominently in community and discovery experiences — it is authentic, relevant, and respectful of the people and places it depicts. Imagery grounds the product in real life. It is presented honestly, never manipulated to mislead, and never used to make something appear other than it is. Real, imperfect, human imagery is preferred over polished but hollow stock.

### 4.6 Spacing Principles
Space is an active material, not empty leftover. Generous, considered spacing creates calm, guides the eye, and signals quality; crowding creates stress and cheapness. Space is used to group what belongs together and separate what does not, establishing rhythm and hierarchy without lines or boxes. Restraint and consistency in spacing are a primary source of the product's premium, uncluttered feel.

### 4.7 Elevation Principles
Depth is used sparingly and meaningfully, to communicate layering and focus — what is in front, what is behind, what is temporary. Elevation signals hierarchy and interactivity honestly: things that appear raised should behave as raised. Excessive or decorative depth is avoided; the interface stays flat and calm except where depth genuinely aids understanding.

### 4.8 Shape Principles
Shape carries tone. Softer, rounded forms communicate friendliness and approachability and are the product's default character; sharper forms are reserved for where precision or seriousness is warranted. Shape is applied consistently so that similar things share a form and the user can recognise kinds of elements at a glance. Consistency of shape is part of the product's coherence and premium feel.

---

## 5. Motion & Animation System

Motion is a language of **meaning, not decoration**. Every animation must have a purpose: to orient, to give feedback, to show relationship, to communicate state, or to create a moment of intentional delight. Motion is calm, quick enough to feel responsive, smooth enough to feel refined, and never sluggish, abrupt, gratuitous, or attention-seeking. When motion has nothing to communicate, stillness is preferred. All motion respects the user's preference for reduced motion.

The following are the permanent categories of motion in TappyAI:

- **Loading** — Communicates that the product is working, honestly and calmly. Loading motion reassures rather than entertains, and carries the Tappy brand identity (see Brand Experience). It signals *purposeful activity*, not empty waiting, and never implies more progress than is real.
- **Transition** — Connects one state or place to another so the user never feels teleported or lost. Transitions preserve context and continuity, showing where things came from and where they went.
- **Navigation** — Reinforces the user's sense of place and direction. Movement between surfaces feels spatially coherent — forward, back, up, down — so orientation is effortless and the back gesture always feels predictable.
- **Success** — Confirms that something worked, with a brief, warm, satisfying acknowledgement proportionate to the action. Success motion celebrates gently; it never overstates a small action or delays the user.
- **Error** — Communicates that something went wrong, calmly and without alarm. Error motion draws attention without punishing the user, and always accompanies a path to recovery.
- **Empty State** — Introduces a space that has no content yet, in a way that feels intentional and inviting rather than broken, and orients the user toward what they can do next.
- **Skeleton** — Previews the shape of content that is arriving, so a load feels like anticipation rather than absence. Skeletons set honest expectations about what is coming and reduce perceived wait.
- **Micro-interaction** — Small, immediate responses to the user's touch and input — the felt sense that the product is alive and listening. Micro-interactions confirm that an action registered, instantly and subtly.
- **Feedback Animation** — The general assurance that every meaningful action produces a visible, immediate response. No action the user takes is ever met with silence.

Across all categories, motion is subordinate to usability. If an animation ever slows the user, obscures information, or draws attention from what matters, it is wrong — regardless of how pleasing it is in isolation.

---

## 6. Domain Animation System

TappyAI spans many domains of everyday life. Each domain is given a **distinct loading and motion identity** so that entering it feels appropriate to what the user is doing, while every one remains unmistakably part of the single Tappy brand (see Brand Experience). Each domain identity is defined by three permanent attributes: an **Emotional Goal** (what the user should feel), a **Visual Identity** (the character of the imagery, described as principle), and a **Motion Style** (how it moves). All are subtle, brief, and calm; none is permitted to become distracting or to slow the user.

### 6.1 Food
- **Emotional Goal:** Warmth, comfort, and gentle anticipation — the cosy feeling before a good meal.
- **Visual Identity:** Inviting, homely forms with a sense of freshness and warmth.
- **Motion Style:** Unhurried rise and settle, evoking gentle steam or a dish being brought to the table — savouring, never rushed.

### 6.2 Shopping
- **Emotional Goal:** Confidence and the small satisfaction of finding the right thing at the right value.
- **Visual Identity:** Crisp, tidy, organised forms with a sense of order and clarity.
- **Motion Style:** Brisk and satisfying — elements aligning neatly into place, a clean "found it" resolution.

### 6.3 Travel
- **Emotional Goal:** Anticipation, freedom, and wonder — the pull of somewhere new.
- **Visual Identity:** Open horizons, paths, and a sense of forward journey.
- **Motion Style:** Smooth, gliding, expansive — a path drawing forward, motion that carries the eye outward.

### 6.4 Weather
- **Emotional Goal:** Clarity and preparedness — a calm, honest read on what to expect.
- **Visual Identity:** Sky, light, and atmosphere, reflecting real conditions truthfully.
- **Motion Style:** Soft atmospheric drift — light, unforced movement that mirrors the day itself.

### 6.5 Finance
- **Emotional Goal:** Trust, steadiness, and reassurance — calm around matters of money.
- **Visual Identity:** Precise, grounded, balanced forms that feel stable and dependable.
- **Motion Style:** Measured and settling — deliberate movement resolving into equilibrium, never frantic or volatile.

### 6.6 Entertainment
- **Emotional Goal:** Playfulness and joyful anticipation — the lift of looking forward to fun.
- **Visual Identity:** Vibrant, lively forms with a spark of energy.
- **Motion Style:** Light and buoyant — an energetic, tasteful liveliness that stays refined.

### 6.7 Games
- **Emotional Goal:** Fun, lightness, and reward — pure, uncomplicated delight.
- **Visual Identity:** The most playful expression of Tappy's character, full of personality.
- **Motion Style:** Springy and characterful — the most expressive motion in the product, while still brief and never juvenile.

### 6.8 Maps
- **Emotional Goal:** Orientation and grounding — the reassurance of "you are here."
- **Visual Identity:** Place, location, and a sense of the world around the user.
- **Motion Style:** A gentle locating pulse rippling outward — steady, homing, and calm.

### 6.9 Explore
- **Emotional Goal:** Curiosity and serendipity — the pleasure of discovering something worthwhile.
- **Visual Identity:** Unfolding, revealing forms that suggest discovery.
- **Motion Style:** A soft reveal — content surfacing gently into view, an unhurried sense of "look what's here."

### 6.10 Reviews
- **Emotional Goal:** Authenticity, connection, and immersion — real people, real experiences.
- **Visual Identity:** The immersive, media-forward, human expression of the brand.
- **Motion Style:** Fluid and cinematic — the most immersive motion, content-first and seamless, in keeping with the social experience mode.

### 6.11 Groups
- **Emotional Goal:** Togetherness and harmony — many preferences becoming one happy decision.
- **Visual Identity:** Multiple elements and a sense of people coming together.
- **Motion Style:** Convergence — separate pieces gathering into alignment, a felt sense of coordination.

### 6.12 Deals
- **Emotional Goal:** Opportunity and cheerful good fortune — genuine good news, honestly framed.
- **Visual Identity:** A bright, welcome spark of value.
- **Motion Style:** A restrained, cheerful reveal — a moment of "good news" that is warm, never a hype-driven or slot-machine spectacle.

### 6.13 Price Tracking
- **Emotional Goal:** Reassurance and patient vigilance — the comfort of being watched over.
- **Visual Identity:** Watchful, steady, quietly monitoring forms.
- **Motion Style:** A calm, patient rhythm — a quiet heartbeat of watching — resolving into a bright but composed moment when a target is reached.

### 6.14 Membership
- **Emotional Goal:** Belonging, care, and premium warmth — a deeper, valued relationship.
- **Visual Identity:** Refined, understated, elevated expression of the brand.
- **Motion Style:** Smooth, graceful, and dignified — unhurried and elevated, the calmest and most polished motion.

Domains added in future must define the same three attributes and must satisfy the same tests: distinct enough to feel appropriate, unified enough to remain Tappy, and always subtle, brief, and calm.

---

## 7. Brand Experience

The brand is felt in the smallest, most repeated moments. These standards are permanent.

### 7.1 The Tappy Loading Identity
The official Tappy logo and mascot is the brand's loading identity across the entire ecosystem. A generic letter, a plain spinner, or an anonymous placeholder is **never** the face of TappyAI at work. Whenever the product is thinking, loading, or working, the user sees Tappy — a warm, recognisable presence — reassuring them that their trusted assistant is on it. This replaces any generic loading mark wherever one appears.

### 7.2 Domain-Specific Loading Identities
While Tappy is always the constant, each domain gives the loading identity a domain-appropriate expression, following the Domain Animation System (Section 6). A person loading a food recommendation and a person loading a travel plan both see Tappy, but each moment feels suited to what they are doing. The result is one recognisable brand that is also contextually alive.

### 7.3 The Spoken Notification Sound
TappyAI's signature notification is the **spoken word "Tappy"** — never "Tappy AI." It is a single, friendly, human voice: warm, premium, and memorable, approximately three to four seconds in character. It should feel like a friend gently getting your attention, not a machine alerting you. It is used sparingly and respectfully, in keeping with the rule that the product never interrupts unnecessarily; a signature sound is a privilege that must never become a nuisance.

### 7.4 One Brand, Many Personalities
Each domain and each moment may carry its own personality — food feels cosy, games feel playful, membership feels elevated — but all are expressions of a single, coherent Tappy. The user should always feel they are with the same companion, whatever they are doing. Distinctiveness serves warmth and appropriateness; it never fractures the sense of one trusted assistant.

---

## 8. AI Conversation Experience

Because the assistant is the product, the conversation is the most important experience in TappyAI. These principles govern it permanently, and must always comply with the MPS AI Decision Principles.

- **Thinking state** — When the assistant is working, the user is never left in doubt. A calm, honest indication of thinking — carrying the Tappy identity — reassures the user that help is coming, without implying more or faster progress than is real.
- **Streaming responses** — Answers appear progressively so the user begins reading as soon as there is something to read. Streaming reduces perceived wait and makes the assistant feel present and alive. It is smooth and readable, never jittery or distracting.
- **AI clarification** — When a request is ambiguous or under-specified, the assistant asks a brief, relevant clarifying question rather than guessing. Clarification is framed as helpfulness, not interrogation: one good question at the right moment, not a form to fill in.
- **AI uncertainty** — When confidence is low, the assistant says so plainly and communicates the limits of what it knows. Uncertainty is expressed honestly and without anxiety, so the user can weigh the answer appropriately. Projecting false confidence is never permitted.
- **Follow-up questions** — The assistant invites the natural next step, offering relevant follow-ups that help the user go deeper or act — without pushing, cluttering, or steering the user toward the product's interest over their own.
- **Memory interactions** — What the assistant remembers about a user is surfaced transparently and respectfully. The user can always understand what is remembered and remains in control of it. Memory is used to help, is never hidden, and is never used in a way that would feel like surveillance.
- **Conversation continuity** — Returning to a conversation feels seamless; context is preserved so the user never has to repeat themselves or lose their place. Continuity is a core expression of the relationship the product builds over time.
- **Interruptions** — The user can interrupt, redirect, or stop the assistant at any time, and the product responds immediately and gracefully. The user is always in control of the conversation; the assistant never traps them in a flow.
- **Long responses** — Lengthy answers are structured for scanning and comprehension, so the user can grasp the essence quickly and read further only if they wish. Length is never used to impress; the assistant prefers a clear, useful answer over an exhaustive one.
- **Error recovery** — When something goes wrong mid-conversation, the assistant explains plainly, preserves the user's work and context wherever possible, and offers a clear way forward. A failure never leaves the user stranded or their effort lost.

---

## 9. Emotional Design

Every interaction leaves the user feeling something. TappyAI designs for a consistent emotional signature; these are the feelings every experience should reinforce.

- **Trust** — The user feels the product is honest, dependable, and on their side. Trust is the foundation beneath every other emotion; nothing is allowed to undermine it.
- **Calm** — The user feels unhurried and at ease. The product creates space to think and never induces stress, pressure, or urgency.
- **Delight** — The user feels small, genuine moments of pleasure — a warm touch, a satisfying confirmation, a friendly surprise — always subtle and never distracting.
- **Confidence** — The user feels clear and assured, both in using the product and in the decisions it helps them make. The experience removes doubt rather than adding it.
- **Human warmth** — The user feels they are with a friendly companion, not a cold machine. Warmth runs through the product's voice, motion, and imagery.
- **Encouragement** — The user feels supported and capable. The product reassures, guides, and celebrates gently, and never makes the user feel foolish or inadequate.
- **Simplicity** — The user feels that everything is easy and nothing is in their way. Simplicity is itself an emotional outcome — the felt absence of friction and clutter.

These emotions are designed together. An interaction that is delightful but erodes trust, or efficient but cold, has failed the emotional standard.

---

## 10. AI Personality

Tappy's personality is a permanent part of the product and is protected with the same discipline as any feature. Tappy is always:

- **Friendly** — Warm, approachable, and welcoming. Easy to talk to and glad to help.
- **Helpful** — Genuinely oriented toward solving the user's real need, not toward showing off or holding attention.
- **Respectful** — Courteous of the user's time, intelligence, money, and privacy. Treats the user as a capable adult.
- **Honest** — Truthful about what it knows, what it doesn't, and the basis of what it recommends. Never misleads.
- **Professional** — Competent, reliable, and composed. Dependable in tone even when being warm.

And Tappy is **never**:

- **Never arrogant** — It does not condescend, lecture, or act superior. It admits limits readily.
- **Never manipulative** — It does not pressure, trick, or steer the user against their own interest.
- **Never robotic** — It does not sound mechanical, stiff, or impersonal. It speaks like a thoughtful person.
- **Never overly verbose** — It does not pad, ramble, or bury the answer. It respects the user's time with concision.
- **Never over-promising** — It does not exaggerate its abilities or guarantee what it cannot deliver. It sets honest expectations.

This personality is consistent across every domain and surface. Domain-specific tone (cosy for food, playful for games, elevated for membership) is a *shade* of this single personality, never a departure from it.

---

## 11. Microcopy Guidelines

Words are part of the interface, and often the most human part. TappyAI's writing is always **clear, empathetic, and actionable**: it tells the user what is true, acknowledges how they might feel, and shows them what they can do. It uses plain, everyday language; avoids jargon, blame, and alarm; and never makes the user feel at fault. Brevity is a courtesy. The illustrative patterns below express intent, not fixed wording.

- **Empty states** — Explain what will appear here and why the space is empty, and invite a first action. An empty state teaches and welcomes; it never reads as broken. *Intent: "There's nothing here yet — here's what this is for, and here's how to begin."*
- **Errors** — State plainly what happened, avoid technical blame, reassure the user, and offer a clear path to recovery. *Intent: "Something didn't work — it's not your fault — here's what you can do next."*
- **Permission requests** — Explain, in the moment of value, exactly what will be enabled and why it helps the user. *Intent: "Allow this so Tappy can do this specific helpful thing for you right now."*
- **Loading** — Reassure calmly that work is underway, without false promises of speed. *Intent: "Tappy is on it."*
- **Success** — Confirm warmly and briefly that the thing worked, proportionate to the action. *Intent: "Done — here's what happened."*
- **AI clarification** — Ask one relevant, friendly question that helps the assistant help better. *Intent: "To get this right for you, can you tell me [one specific thing]?"*
- **AI uncertainty** — Communicate limited confidence honestly and without anxiety, so the user can judge for themselves. *Intent: "I'm not fully sure about this — here's what I do know, and how confident I am."*
- **Notifications** — Be relevant, respectful, and genuinely worth the interruption; say clearly what happened and why the user is being told. *Intent: "Here's something you asked to know about, and here's why it matters now."*

Across all microcopy, the voice is Tappy's (Section 10): honest, warm, concise, and never manipulative. Copy that pressures, deceives, blames, or wastes the user's attention violates this document.

---

## 12. Delight Moments

Delight is a deliberate, occasional gift — never a constant demand for attention. TappyAI creates small moments of emotional connection that make the product feel human and cared-for, always **subtle, brief, and never distracting**, and always subordinate to the user's task.

- **Loading animations** — The Tappy loading identity itself is a quiet, recurring moment of warmth (Sections 6–7).
- **Success celebrations** — A gentle, proportionate acknowledgement when something meaningful is accomplished — warm, not loud, and never delaying the user.
- **Seasonal themes** — Tasteful, restrained acknowledgements of times of year that make the product feel present in the user's world, never commercial or intrusive.
- **Birthday greetings** — A warm, personal, respectful acknowledgement that treats the user as someone the assistant genuinely knows — always within the bounds of privacy and consent.
- **Weather-aware moments** — Small, contextual touches that reflect the real day and make help feel timely and grounded in the user's reality.
- **Achievement moments** — Gentle recognition of genuine milestones in the user's relationship with the product, offered as encouragement, never as a pressure to engage more.
- **Friendly AI surprises** — Occasional, thoughtful touches of personality and helpfulness that make Tappy feel like a companion — rare enough to remain special, and never at the expense of clarity or the user's time.

The governing rule: a delight moment must *add* warmth without *subtracting* from usability, calm, or trust. If it distracts, delays, pressures, or repeats until it becomes noise, it is removed.

---

## 13. User Experience Standards

These are the permanent behavioural standards for the product's core surfaces. Each expresses the same principles — clarity, calm, control, and trust — applied to a specific context.

- **Navigation** — The user always knows where they are, how they got there, and how to leave. Navigation is predictable and spatially coherent; the structure reveals itself without a manual.
- **Back Button** — Going back always behaves predictably and returns the user to a sensible, expected place, even when a surface was entered directly (for example, via a shared link). The user is never stranded and never sent somewhere disorienting.
- **Search** — Search understands intent, tolerates imperfect input, and returns useful results quickly, with honest, helpful handling of the no-results case. It is forgiving and fast, and never punishes the user for how they phrased a query.
- **AI Chat** — The primary surface. Calm, focused, and conversation-first, governed entirely by the AI Conversation Experience (Section 8). Nothing competes with the exchange between the user and the assistant.
- **Food** — Helps the user decide what and where to eat with minimal effort, presenting options in a way that fits taste, budget, and place, and making the path to acting clear and honest.
- **Shopping** — Helps the user find and choose products with confidence, presenting options and value clearly and without pressure, and disclosing any commercial influence plainly.
- **Travel** — Helps the user plan and prepare with a sense of anticipation rather than burden, turning a vague intention into an organised, comprehensible plan.
- **Explore** — Invites discovery of what is worthwhile nearby, presenting inspiration in a way that rewards curiosity without overwhelming.
- **Reviews** — The immersive, media-forward social experience. Authentic, human, and content-first, governed by the social experience mode; it feels alive and personal while remaining unmistakably Tappy.
- **Groups** — Helps people decide together, making it easy to reconcile different preferences into a choice everyone is comfortable with, with a felt sense of coordination and fairness.
- **Maps** — Grounds help in real places, giving the user a clear, calm sense of location and surroundings and connecting decisions to where they actually are.
- **Nearby** — Surfaces what is relevant around the user right now, in the moment, respecting that this is often an in-motion, glance-and-go situation.
- **Bill Split** — Makes a potentially awkward social task simple, clear, and fair, removing friction and reducing the chance of confusion or embarrassment.
- **Membership** — Presents the elevated relationship with warmth, honesty, and clarity — its value plainly stated, never pressured, and always easy to understand and to leave.
- **Notifications** — Every notification is relevant, respectful, and worth the interruption. The product earns the right to reach the user and never abuses it (see Non-Negotiable UX Rules).
- **Settings** — Give the user genuine, understandable control over their experience, their data, and their permissions, in plain language and without dark patterns.
- **Profile** — A calm, respectful home for the user's identity, activity, and control over their own information, presented with clarity and care.

New surfaces adopt these same standards; a new surface is not complete until it behaves consistently with them.

---

## 14. Permission Experience

Permissions are moments of trust. TappyAI's permanent rule is that a permission is **requested only in context, at the moment it delivers clear value, and never before**. The product never asks for access on arrival, never asks speculatively, and always explains — in plain language, in the moment — exactly what a permission enables and how it helps the user. A declined permission is respected gracefully; the product continues to be as useful as it can and never nags, punishes, or repeatedly re-asks. The user remains in control and can understand and change every permission.

- **Location** — Requested only when the user is doing something for which knowing where they are genuinely improves the help (for example, finding what's nearby), with the benefit made clear at that moment.
- **Camera** — Requested only when the user initiates something that needs it, never pre-emptively, and only for the immediate, understood purpose.
- **Microphone** — Requested only when the user chooses to speak to the assistant, with the purpose obvious and the control theirs.
- **Notifications** — Requested only after the product has demonstrated value and only when there is something genuinely worth being notified about, framed around what the user will gain.
- **Photos** — Requested only when the user is doing something that involves their images, scoped to what is needed, and never as a broad, upfront demand.

A permission request that appears without context, before value, or as a barrier to entry violates this document.

---

## 15. Error Experience

How the product behaves when things are absent, slow, or broken is a truer test of quality than how it behaves when all is well. TappyAI handles these moments with calm, honesty, and a clear path forward.

- **Empty States** — Feel intentional and inviting. They explain what belongs here, why it is empty, and what the user can do to begin. An empty state educates and welcomes; it is never mistaken for a failure.
- **Skeletons** — Preview the shape of arriving content so a wait feels like anticipation, not absence. They set honest expectations and reduce the felt duration of loading.
- **Loading States** — Reassure the user that work is underway, carrying the Tappy identity, without implying false progress. They keep the user calm and informed.
- **Retry States** — When an action fails, offer a clear, easy way to try again, preserving the user's context and input so nothing is lost. Recovery is one obvious step, not a restart.
- **Offline States** — Communicate connectivity problems honestly and without alarm, make clear what can and cannot be done, and recover gracefully when connection returns. The user is never left confused about why something isn't working.
- **AI Confidence Communication** — The assistant makes the reliability of its answers legible, so the user can weigh them appropriately. Confidence is communicated honestly and proportionately, never inflated.
- **AI Uncertainty** — When the assistant is unsure, it says so plainly, shares what it does know, and — where helpful — asks a clarifying question rather than guessing. Honesty is always preferred over the appearance of completeness.
- **AI Recovery** — When the assistant errs or fails, it acknowledges it plainly, preserves the user's work and context, and offers a clear way forward. A failure is handled with grace and never leaves the user stranded.

The governing principle: **every error guides recovery.** The product never presents a dead end, never blames the user, and never leaves them without a next step.

---

## 16. Sharing Experience

Sharing is how the product travels between people and how relationships and communities grow. These standards are permanent.

- **Native Share** — Sharing uses the familiar, trusted sharing experience of the user's device, so it feels native and effortless rather than bespoke and unfamiliar. The product respects the conventions the user already knows.
- **Rich Link Preview** — A shared link always presents itself richly and honestly when it arrives elsewhere — clear, appealing, and accurately representing what it leads to. A shared piece of TappyAI should look considered and trustworthy wherever it lands.
- **QR Profile** — A person's identity can be shared in the physical world simply and gracefully, making in-person connection effortless and premium-feeling.
- **Deep Links** — Any shared link brings the recipient directly and reliably to the right place, with the destination handling arrival gracefully — including a sensible, non-disorienting experience when the recipient arrives without prior context (consistent with the Back Button standard).
- **Invite Flow** — Bringing another person in is warm, simple, and respectful of both the inviter and the invitee. Invitations feel like a friendly gesture, never like spam or pressure, and never exploit the user's social connections.

---

## 17. Responsive Design

TappyAI is one coherent experience that adapts respectfully to the surface it is on. The product is designed **mobile-first**, and every other form factor is an intentional adaptation, never a neglected afterthought or a stretched-out phone screen. Across all surfaces, the same identity, language, and behaviour hold; what changes is the arrangement, never the character.

- **Mobile** — The primary surface, designed for the hand and the real, in-the-moment situations where decisions happen. Everything essential is reachable and comfortable in one-handed, on-the-go use.
- **Tablet** — Uses additional space to reduce effort and increase clarity — more content in view, more comfortable reading and interaction — without becoming denser or more complex. Space serves calm, not clutter.
- **Desktop** — Adapts gracefully to larger screens, remaining calm, focused, and uncluttered rather than sprawling to fill space. More room is used to breathe, not to crowd. (Desktop is a supported adaptation; the product's centre of gravity remains mobile.)
- **Foldables** — Adapt fluidly and gracefully to changing form and folding state, preserving continuity so the experience feels seamless as the device changes shape. Transitions between states never lose the user's place or context.

The permanent rule: adaptation serves the user's comfort and clarity on their actual device; it never sacrifices simplicity, and it never fragments the sense of one coherent product.

---

## 18. Accessibility

Accessibility is a first condition of good design (Section 2.6), not a later adjustment. TappyAI is designed to be usable by as many people as possible, in as many situations as possible. These principles are permanent and are described as principles only.

- **WCAG AA philosophy** — TappyAI adopts the spirit and standard of WCAG AA as its baseline commitment to accessible design. Meeting recognised accessibility standards is treated as a floor to build on, not a ceiling to aspire to.
- **Touch targets** — Interactive elements are comfortably sized and spaced for real fingers in real conditions, meeting or exceeding the platform's recommended minimums. No essential action requires uncomfortable precision.
- **Motion reduction** — The product respects the user's preference for reduced motion, offering a calm, equally usable experience with motion minimised. Motion is never essential to understanding or operating the product.
- **Screen readers** — The experience is fully meaningful when heard rather than seen. Content and controls carry clear, accurate meaning for assistive technology, and nothing essential is conveyed by visuals alone.
- **Contrast** — Text and meaningful elements maintain sufficient contrast to be legible in real conditions, including bright outdoor light, meeting recognised accessible-contrast standards.
- **Colour independence** — Colour is never the *only* means of conveying information or state. Meaning is always available through additional cues — text, shape, icon, or position — so the product works for people who perceive colour differently.
- **Keyboard accessibility** — Where a keyboard or equivalent input applies, the entire experience is operable through it, with clear, visible focus and a logical, predictable order. No capability is locked behind a single input method.

Accessibility is not a feature to be toggled; it is a property of a well-made product. A design that excludes people is considered incomplete.

---

## 19. UX Success Principles

Great UX in TappyAI is measured by its effect on the user, in service of the Product North Star. These are the permanent principles by which the quality of any experience is judged.

- **Reduce friction** — Every step removed, every tap saved, every moment of confusion prevented is a success. The best experience is the one that asks the least of the user.
- **Reduce cognitive load** — The user should not have to think hard, remember, or figure things out. The product carries the mental burden so the user doesn't have to.
- **Increase confidence** — The user should feel clearer and more assured after an interaction than before it — both in using the product and in the decisions it helps them make.
- **Encourage exploration** — The experience invites curiosity and makes discovery safe and rewarding, so the user feels free to try, learn, and go deeper without fear of getting lost or making mistakes.
- **Preserve trust** — Every interaction must leave the user's trust intact or stronger. Trust preserved is the precondition of every other success.
- **Respect user time** — The product values the user's time as much as its own goals. It helps and then gets out of the way; it never wastes a moment or manufactures delay.
- **Feel premium** — The experience feels crafted, coherent, and high in quality — through simplicity and care, never through ornament or complexity.
- **Feel human** — The experience feels warm, personal, and made by people for people. The user feels accompanied, not processed.
- **Support the Product North Star** — Ultimately, every experience is judged by whether it helps the user reach a better real-life decision, with less effort and greater confidence. Any experience that does not serve this does not belong in TappyAI.

These are outcome principles, not measurement mechanisms; how they are observed belongs to other documents and must never become an end in itself. In particular, no experience is ever judged a success on the basis of capturing attention or increasing time-in-product at the user's expense.

---

## 20. Non-Negotiable UX Rules

This section is the **permanent, bright-line code** of the TappyAI experience. These rules admit no trade-off. A design that violates any of them is rejected outright, regardless of how attractive, novel, or effective it may appear. They exist to protect the experience from the pressures that would erode it over time, and they are subordinate to — and consistent with — the Non-Negotiable Rules of the MPS.

1. **Never surprise the user.** The product behaves predictably; the user is never caught off guard by an unexpected action, change, or consequence.
2. **Never hide critical information.** Anything the user needs to make an informed decision — including costs, consequences, and commercial influence — is always visible and clear. Nothing important is buried or obscured.
3. **Never request a permission without context.** No permission is ever asked before it delivers clear value, and every request explains, in the moment, what it enables and why it helps.
4. **Never interrupt unnecessarily.** The product earns every interruption. Notifications, prompts, and interstitials appear only when they are genuinely worth the user's attention.
5. **Never block the user unnecessarily.** The product does not put barriers, gates, or friction in the user's path except where there is a clear, honest reason that serves the user.
6. **Every animation must have a purpose.** Motion exists to orient, inform, give feedback, or intentionally delight — never to decorate, impress, or delay. Purposeless motion is removed.
7. **Every interaction must provide immediate feedback.** No meaningful action the user takes is ever met with silence; the product always responds visibly and at once.
8. **Every empty state must educate.** An empty space always explains what belongs there and invites a next step; it never reads as broken or abandoned.
9. **Every error must guide recovery.** The product never presents a dead end. Every failure is explained plainly, without blame, and accompanied by a clear way forward, preserving the user's work.
10. **AI uncertainty must always be communicated honestly.** The assistant never projects confidence it does not have. When it is unsure or does not know, it says so plainly.
11. **Premium means simplicity.** Quality is expressed through restraint, clarity, and care — never through density, ornament, or complexity. Complexity added for its own sake is never premium.
12. **Every interaction must reinforce trust.** No experience decision is permitted that would weaken the user's confidence that TappyAI is honest, dependable, and acting in their interest. Trust is the first and last consideration.

These rules are non-negotiable by definition. They may only be altered through a formal revision of this UX/UI Constitution, and any proposal to weaken them should be regarded with the greatest suspicion.

---

## 21. UX Decision Tree

This section defines the **permanent decision hierarchy** for every UX/UI decision in TappyAI. It is the authoritative tie-breaker: when two design solutions are both reasonable but point in different directions, the one that better serves the **higher priority always wins**. The order is absolute and lexicographic — a lower priority may never be optimised at the expense of a higher one; a lower priority is pursued only where doing so costs nothing above it.

**The priority order:**

1. **User Trust** — The user's confidence that TappyAI is honest, dependable, and acting in their interest. Trust is the foundation of the entire product; no other consideration may ever come at its expense. (This priority inherits directly from the Master Product Specification.)
2. **User Value** — The genuine usefulness of the experience to the user's real need. A design must actually help; nothing below this outranks whether it does.
3. **Simplicity** — The ease and clarity of the experience for the user. Between two solutions of equal value, the simpler one wins.
4. **Accessibility** — The experience's usability by as many people, in as many situations, as possible. Accessibility outranks performance, consistency, and aesthetics; a beautiful or uniform design that excludes people is rejected.
5. **Performance** — The speed and responsiveness the experience *feels* like it has. Perceived performance serves value and simplicity, and outranks consistency and appearance.
6. **Consistency** — The sameness of patterns, language, and behaviour across the product. Consistency reduces cognitive load, but it never overrides trust, value, simplicity, accessibility, or performance. (This is why "usability outranks visual uniformity" throughout this document.)
7. **Emotional Experience** — The warmth, delight, and feeling of the interaction. It is pursued only where it does not compromise anything above it.
8. **Visual Beauty** — The aesthetic refinement of the surface. It is the final consideration — genuinely valued, but never permitted to win against any higher priority.

**How to use it:** For any design decision, resolve conflicts from the top down. Ask first whether a choice affects trust; if it does, that decides. If trust is unaffected either way, move to value, then simplicity, and so on. A design that is more beautiful but less simple loses. A design that is more consistent but less accessible loses. A design that is more delightful but less trustworthy is not merely worse — it is disqualified. This tree is the permanent framework through which every other principle in this document is applied.

---

## 22. AI Emotional States

The assistant is felt as a presence, and that presence has emotional states the user perceives as the assistant works. These are the **permanent emotional states of the AI**. Each is defined by three principles — its **Emotional Goal** (what the user should feel), its **Tone** (the character it projects), and its **Motion Philosophy** (the *intent* behind how it should feel in movement). These are principles only; no animations are specified here, and every state must comply with the MPS AI Decision Principles — above all, honesty.

### 22.1 Thinking
- **Emotional Goal:** Reassurance that the assistant is engaged and help is coming.
- **Tone:** Calm, present, unhurried.
- **Motion Philosophy:** A living, gentle presence that conveys genuine activity — never implying more speed or progress than is real.

### 22.2 Searching
- **Emotional Goal:** Confidence that the assistant is actively gathering real information on the user's behalf.
- **Tone:** Purposeful, diligent.
- **Motion Philosophy:** An outward, seeking quality that suggests reaching into the world for the user — effort spent *for* them.

### 22.3 Reasoning
- **Emotional Goal:** Trust that the assistant is thinking carefully rather than guessing.
- **Tone:** Thoughtful, deliberate, composed.
- **Motion Philosophy:** A measured, considered quality that conveys care and depth without theatrics or performance.

### 22.4 Remembering
- **Emotional Goal:** Warmth and continuity — the feeling that the assistant genuinely knows the user.
- **Tone:** Personal, gentle, respectful.
- **Motion Philosophy:** A soft, recalling quality that is transparent about drawing on memory, and never feels like surveillance.

### 22.5 Comparing
- **Emotional Goal:** Confidence that options are being weighed fairly and on the user's behalf.
- **Tone:** Balanced, even-handed, fair.
- **Motion Philosophy:** A sense of weighing and balancing that conveys impartiality — consistent with unbiased recommendation.

### 22.6 Planning
- **Emotional Goal:** Anticipation that something organised and useful is being assembled for them.
- **Tone:** Constructive, orderly, quietly optimistic.
- **Motion Philosophy:** An assembling, building-up quality — pieces coming into order — that conveys structure taking shape.

### 22.7 Finished
- **Emotional Goal:** Satisfaction and closure — the help has arrived.
- **Tone:** Warm, confident, settled.
- **Motion Philosophy:** A gentle arrival and resolution — a calm landing, proportionate to the task, never overblown.

### 22.8 Need Clarification
- **Emotional Goal:** The feeling of being invited to help, not of being blocked or interrogated.
- **Tone:** Friendly, curious, collaborative.
- **Motion Philosophy:** An open, inviting pause — a question offered warmly — that never reads as an error or a failure.

### 22.9 Low Confidence
- **Emotional Goal:** Trust in the assistant's honesty, even about its own uncertainty.
- **Tone:** Candid, humble, calm.
- **Motion Philosophy:** A restrained, transparent quality that signals "weigh this carefully" without alarm — and is never dressed up to look like confidence.

### 22.10 Offline
- **Emotional Goal:** Calm understanding of a temporary limitation.
- **Tone:** Reassuring, matter-of-fact, non-alarming.
- **Motion Philosophy:** A quiet, paused, patient quality that conveys "waiting to resume" — never "broken."

Across all states, the governing rule is honesty: the assistant's felt emotional state must always truthfully reflect what it is actually doing and how reliable its help actually is.

---

## 23. Trust Signals

Trust is built or eroded in small, concrete moments. A **trust signal** is any visual or interaction element whose purpose is to increase the user's justified confidence in TappyAI. These signals are permanent parts of the experience, and each exists for a specific reason. They are described here as principles; their design belongs to the design-system specification.

- **AI Confidence** — Communicates how reliable a given answer is, so the user can weigh it appropriately. *Why it exists:* honesty is a Non-Negotiable of the MPS; showing confidence honestly prevents both overreliance and false doubt, and builds durable trust.
- **Information Source** — Shows where information came from. *Why it exists:* people trust what they can trace; visible sourcing distinguishes established fact from the assistant's own inference and makes claims verifiable.
- **Verified Content** — Indicates content that has been substantiated (for example, community input backed by a genuine first-hand experience). *Why it exists:* it helps users weight what they read and protects the authenticity of community contributions.
- **Last Updated** — Shows how recent a piece of information is. *Why it exists:* relevance depends on recency; stale information silently erodes trust, and users deserve to know how current something is.
- **Last Checked** — For anything the assistant monitors on the user's behalf (for example, a tracked price), shows when it was last checked. *Why it exists:* it reassures the user that the assistant is genuinely watching, and sets honest expectations about how current the watch is.
- **Affiliate Disclosure** — Clearly discloses any commercial or affiliate relationship behind what is shown. *Why it exists:* the MPS forbids presenting commercially influenced content as neutral; plain disclosure keeps recommendation quality honest and puts long-term trust above short-term conversion.
- **Memory Indicator** — Makes visible when, and on what, the assistant is drawing from memory. *Why it exists:* transparency about personalisation keeps the user in control and ensures memory never feels like surveillance.
- **AI Generated Indicator** — Identifies content produced by the AI. *Why it exists:* honesty about the nature of content lets users distinguish generated inference from established fact, as the MPS requires.
- **User Data Indicator** — Shows when the user's own information is being used. *Why it exists:* transparency and control over personal data are foundational to a privacy-first product; the user should always know when their data is in play.
- **Privacy Indicator** — Signals the privacy state and protections around a moment or a piece of data. *Why it exists:* visible reassurance that information is handled with care reinforces the trust on which the entire product rests.

The unifying principle: a trust signal exists to make something *true* about TappyAI *visible* to the user. It is never decorative, never used to imply a trustworthiness the product has not earned, and never a substitute for actually behaving honestly.

---

## 24. Premium Interaction Principles

In TappyAI, **premium means the reduction of effort, not the addition of visual effect.** A premium experience is one that asks less of the user, respects their hands and their attention, and feels effortless and calm. Refinement is achieved by removing friction, not by adding ornament. The following principles define what makes the product feel premium.

- **One-handed usage** — The essential experience is fully usable with a single hand, because that is how phones are held in the real moments TappyAI serves. Nothing important requires a second hand or an awkward reach.
- **Thumb-first navigation** — Primary actions live within comfortable reach of the thumb. The most common things are the easiest to reach; the hand should never have to stretch to do what it does most.
- **Minimum taps** — Every path to a goal is as short as it can honestly be. Each unnecessary tap removed is a gain; the product never makes the user work more than the task truly requires.
- **Progressive disclosure** — Complexity is revealed only as it becomes relevant. The user sees what they need now, and more only when they ask for it, so no moment is ever overwhelming.
- **Zero visual clutter** — Every element present has earned its place. Nothing competes for attention that does not deserve it; the calm that results is itself a signal of quality.
- **Smooth transitions** — Movement between states and places is fluid and continuous, so the experience feels coherent and considered rather than abrupt or stitched together.
- **Fast perceived performance** — The experience feels immediate. Perceived speed — through instant feedback, streaming, skeletons, and honest loading — matters as much as actual speed, and the product never leaves the user waiting in silence.
- **Context over configuration** — The product understands the situation and does the right thing, rather than asking the user to configure it. Intelligence absorbs complexity so the user is not handed a control panel.
- **Calm interactions** — Interactions are quiet and unhurried. The product never shouts, pressures, or rushes; it gives the user room to think, which is a hallmark of premium.
- **Consistency across all domains** — The same gestures, patterns, and behaviours hold everywhere, so mastery earned in one part of the product carries to all of it. Consistency makes the whole feel like one crafted thing.

Any interaction that adds visual effect while adding effort has misunderstood what premium means in TappyAI. The most premium interaction is the one the user barely notices, because it simply worked.

---

## 25. UX Review Checklist

This is the operative gate through which every experience passes before it is considered good. Every future screen, feature, flow, animation, interaction, and AI capability in TappyAI must be able to answer **YES** to each of the following questions. A single honest **NO** is a signal that the experience is not yet ready.

- Is it **simple**?
- Is it **useful**?
- Is it **trustworthy**?
- Does it **reduce effort**?
- Does it **reduce cognitive load**?
- Is **accessibility** respected?
- Is the **wording clear**?
- Is **AI uncertainty communicated honestly**?
- Does it avoid requiring **unnecessary permissions**?
- Does it **respect user privacy**?
- Does it **feel premium** (that is, does it reduce effort rather than add effect)?
- Does it **support the Product North Star** — helping the user reach a better real-life decision, with less effort and greater confidence?
- Would we **proudly ship this experience**?

This checklist is the everyday application of the entire UX/UI Constitution, resolved — where questions compete — through the UX Decision Tree (Section 21). **No UX should be approved unless it satisfies this checklist.** An experience that cannot answer YES to every question is revised until it can, or it is not shipped.

---

## Appendix A: Glossary

- **Surface** — Any distinct area of the product the user can be in (for example, AI Chat, Reviews, Maps, Settings).
- **Domain** — An area of everyday life TappyAI helps with (for example, Food, Travel, Shopping), as defined in the MPS. Each has its own experience identity while remaining part of one brand.
- **Utility experience** — The calm, light, everyday mode of the product, used for the assistant and the tools of daily life.
- **Social / immersive experience** — The media-forward, content-first mode of the product, used for community and discovery (for example, Reviews). Distinct in feel, unified in brand; never merged with the utility experience.
- **Tappy loading identity** — The official Tappy mascot/logo shown whenever the product is working; the permanent replacement for any generic loading mark.
- **Delight moment** — A deliberate, subtle, occasional moment designed to create warmth and emotional connection without distracting from the task.
- **Microcopy** — The small, functional words of the interface (empty states, errors, prompts, confirmations) through which the product speaks to the user.
- **Non-Negotiable UX Rule** — A bright-line experience rule that admits no trade-off and may only change through formal revision of this document.

---

## Appendix B: Document Governance

- **Authority:** This document is the Single Source of Truth for TappyAI's user experience, interaction design, visual language, and product consistency. All subsequent design-system, brand, content, and engineering documents are subordinate to it and must remain consistent with it.
- **Subordination:** This document is itself subordinate to the *TappyAI Master Product Specification (MPS) v1.0 — FINAL*. Where any experience decision would conflict with the MPS — its North Star, Non-Negotiable Rules, AI Decision Principles, or values — the MPS prevails.
- **Precedence:** Where a later document or decision conflicts with this one on matters of experience principle, this document prevails until formally revised.
- **Amendment:** Changes to this document, and especially to the Non-Negotiable UX Rules (Section 20), should be rare and deliberate. Amendments are made by issuing a new numbered version of this Master UX/UI Specification, with the prior version retained for reference.
- **Boundaries:** This document intentionally contains no design tokens, colour values, font names, spacing values, motion timings, platform code, CSS, architecture, API, database, or implementation content. Those concerns are governed by separate documents and must not be introduced here.

---

# TappyAI Master UX/UI Specification v1.0 — FINAL

This document is now **permanently frozen**. It is the official UX/UI Constitution and the Single Source of Truth for every user experience across the entire TappyAI ecosystem. It is subordinate to the *TappyAI Master Product Specification (MPS) v1.0 — FINAL*, and may only be changed through a formal, numbered revision.

*End of TappyAI Master UX/UI Specification (MUXS) v1.0 — FINAL.*
