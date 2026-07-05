# TappyAI Master Product Specification (MPS)

**Version:** 1.0
**Status:** FINAL — Approved Product Constitution
**Document Class:** Highest-level product document (Single Source of Truth)
**Scope:** Product, Vision, Brand, and Principles — non-technical
**Applies to:** All future product, design, engineering, AI, mobile (Android/iOS), dashboard, and business decisions

> This document is the **Product Constitution** of TappyAI. It defines *what* TappyAI is and *what it is trying to become* — not how it is built. Where any future document, decision, or discussion conflicts with this one, this document takes precedence until it is formally superseded by a later approved version. Technical specifications, architecture, APIs, database design, and sprint execution are governed by separate documents and must remain consistent with the principles stated here.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Vision](#2-vision)
3. [Mission](#3-mission)
4. [Core Values](#4-core-values)
5. [Product Philosophy](#5-product-philosophy)
6. [Product Positioning](#6-product-positioning)
7. [Target Users](#7-target-users)
8. [Core Product Domains](#8-core-product-domains)
9. [Brand Identity](#9-brand-identity)
10. [Long-Term Product Vision](#10-long-term-product-vision)
11. [Product Principles](#11-product-principles)
12. [Out of Scope](#12-out-of-scope)
13. [Future Evolution](#13-future-evolution)
14. [Product North Star](#14-product-north-star)
15. [Success Metrics](#15-success-metrics)
16. [Non-Negotiable Rules](#16-non-negotiable-rules)
- [Appendix A: Glossary](#appendix-a-glossary)
- [Appendix B: Document Governance](#appendix-b-document-governance)

---

## 1. Executive Summary

TappyAI is an **AI personal assistant built for everyday life in Vietnam**. Its purpose is to help people move from a question to a decision to an action across the real-world services that fill a normal day — eating, shopping, travelling, planning, saving money, and staying informed — without forcing them to learn a new tool for each need.

Most digital services today are organised around the *provider's* structure: one application for food, another for travel, another for shopping, each with its own search box, its own account, and its own way of thinking. The user is expected to know in advance which tool to open and how to phrase their need in that tool's language. TappyAI inverts this. It is organised around the *user's intent*. A person states what they want in natural, everyday Vietnamese, and the assistant does the work of understanding, discovering options, comparing them, and helping the person decide and act.

TappyAI is **conversation-first and Vietnamese-first**. It is designed for the way people in Vietnam actually speak, spend, travel, and socialise, rather than being a translated version of a product designed for another market. This local depth is a deliberate and durable advantage, not a temporary localisation layer.

The product is best understood not as a single feature but as a **growing collection of everyday capabilities unified by one assistant and one memory of the user**. Each capability — discovering a place to eat, planning a weekend trip, tracking a product's price, splitting a bill, reading community reviews — is valuable on its own, but the compounding value is that they share the same assistant, the same understanding of the person, and the same simple way of interacting.

This document defines the vision, values, philosophy, positioning, audience, domains, brand, and permanent principles that govern that product. It exists so that any new engineer, product manager, designer, investor, or AI collaborator can understand — quickly and unambiguously — what TappyAI is trying to become, and can make decisions that are consistent with that intent for years to come.

---

## 2. Vision

**To become the trusted personal assistant that people in Vietnam rely on to discover, decide, plan, and act in their everyday lives.**

The long-term vision is a single, dependable companion that a person can turn to for the ordinary but frequent decisions of daily life — *where should we eat, is this a good price, how should we plan this trip, what's worth doing this weekend* — and receive help that feels personal, honest, and effortless.

In this vision, TappyAI is not an app a person occasionally opens for a single task. It is an assistant they build a relationship with over time: one that remembers their preferences, understands their context, respects their privacy, and consistently makes their day a little easier. As that relationship deepens, TappyAI becomes the natural starting point whenever a real-world decision needs to be made.

The vision is intentionally broad in *ambition* and disciplined in *character*. The ambition is to serve the full breadth of everyday life. The discipline is that TappyAI earns this role only by being genuinely useful, genuinely trustworthy, and genuinely simple — never by being loud, manipulative, or overwhelming.

---

## 3. Mission

**To help every user turn intention into action with the least possible effort and the greatest possible confidence.**

The mission expresses what TappyAI does for a person in practical terms:

- **Understand** what the user actually means, in their own words and their own language.
- **Discover** relevant, real, and current options on the user's behalf.
- **Decide** — help the user compare, judge, and choose with clarity rather than confusion.
- **Plan** — turn a decision into a concrete, organised plan when the situation calls for it.
- **Act** — bring the user to the point of doing the thing, smoothly and without friction.

The mission is measured not by how much time a person spends inside the product, but by how effectively the product helps them accomplish what they set out to do. A successful interaction is one where the user leaves with a good decision made and time saved — not one where the user was kept engaged for its own sake.

---

## 4. Core Values

These are the values that define the character of TappyAI as a product and as an organisation. They describe *how* TappyAI behaves, independent of any specific feature.

1. **Trustworthiness** — TappyAI tells the truth, including when it is uncertain or when the honest answer is inconvenient. It does not mislead users to serve its own interests. Trust is the product's most valuable and most fragile asset.

2. **Usefulness** — Every capability must make a real difference to a real need. Usefulness outranks novelty, cleverness, and completeness. A smaller product that genuinely helps is preferred to a larger one that merely impresses.

3. **Simplicity** — The product should feel obvious. Complexity is absorbed by the assistant so that it never lands on the user. Simplicity is treated as a feature that must be actively defended, not a default that can be assumed.

4. **Respect** — TappyAI respects the user's time, attention, intelligence, money, and privacy. It does not waste any of them. It treats users as capable adults making their own decisions.

5. **Locality** — TappyAI is deeply and authentically Vietnamese. It understands local context, language, culture, and everyday reality as a native would, and treats this understanding as a core strength rather than a checkbox.

6. **Stability** — Users depend on TappyAI for real decisions. It must be dependable, predictable, and calm. Reliability is a promise, not a nice-to-have.

7. **Longevity** — TappyAI is built to last and to compound in value over years. Decisions are weighed against their long-term effect on trust, simplicity, and durability, not only their short-term gain.

---

## 5. Product Philosophy

The product philosophy is the set of guiding orientations that shape how TappyAI is conceived and how trade-offs are resolved. When two good options compete, these principles decide.

### 5.1 AI First

TappyAI begins with the assistant, not with a catalogue of features. The primary way a user expresses a need is by *saying it*, and the primary way the product responds is by *understanding and helping*. Traditional interface elements exist to support the assistant, not the other way around. AI is not a feature bolted onto a conventional app; it is the organising principle of the entire experience.

### 5.2 User First

Every decision is judged from the user's point of view: *does this make the user's life better?* When the interests of the user and the interests of the business appear to diverge, the product defaults to the user, on the conviction that sustained user trust is the only durable foundation for a business. The product serves the person, and is never designed to exploit them.

### 5.3 Simple First

Given two ways to achieve the same outcome, TappyAI chooses the simpler one for the user — even when the simpler one is harder to build. Features earn their place by clearly justifying the complexity they add. The product resists the natural tendency of software to accumulate options, settings, and surface area over time. *Simplicity is the result of deliberate restraint.*

### 5.4 Stability First

TappyAI is something people rely on, so it must be reliable before it is impressive. Correctness, predictability, and dependability come before speed of expansion. A capability is not considered finished until it can be trusted. The product would rather do fewer things dependably than many things unreliably.

### 5.5 Mobile First

TappyAI lives in people's hands, in the moments when decisions are actually made — at a street corner deciding where to eat, in a shop comparing a price, on a bus planning a weekend. The product is designed first for the phone and for those real, in-the-moment situations. Every other surface is designed in service of that primary reality.

### 5.6 Privacy First

TappyAI learns about its users in order to help them, and it treats what it learns as a responsibility, not an asset to be exploited. The product collects only what genuinely improves the user's experience, is transparent about what it remembers, and gives users meaningful control over their own information. Personalisation and privacy are treated as partners, not opposites.

### 5.7 Long-Term Thinking

TappyAI optimises for the relationship it will have with users in years, not for the metric it could move this week. Choices that would gain a short-term advantage at the cost of long-term trust, simplicity, or durability are declined. The product is patient by design.

---

## 6. Product Positioning

### 6.1 What TappyAI is *not*

TappyAI is frequently mistaken for one of the familiar categories it touches. It is important to state clearly what it is **not**:

- It is **not merely an AI chat product.** Conversation is how the user interacts, but the purpose is to help the user act in the real world, not to hold a conversation for its own sake.
- It is **not a food app.** It helps with food, but food is one domain among many.
- It is **not a travel app.** It helps with travel, but travel is one domain among many.
- It is **not a shopping app.** It helps with shopping, but shopping is one domain among many.
- It is **not a directory, a search engine, or a marketplace** in the traditional sense. It does not ask the user to browse and filter on their own; it does the discovery *for* them.

Defining TappyAI by any single one of these categories understates it and, worse, invites the product to be built as a lesser version of an existing thing.

### 6.2 What TappyAI *is*

> **TappyAI is an AI personal assistant that helps people discover, decide, plan, and act across the many real-world services of everyday life.**

Its defining characteristic is that it is organised around **human intent** rather than around service categories. The user does not need to know which "section" of the product to enter. They express a need, and the assistant takes responsibility for meeting it — reaching into whichever domains are relevant, unifying the result, and presenting it in one coherent, simple experience.

Two attributes make this position distinctive and defensible:

1. **Breadth unified by one assistant.** Many services are accessible through a single companion that carries context between them, rather than through a collection of disconnected tools.

2. **Depth of local understanding.** The assistant understands Vietnamese language, culture, and everyday reality natively, allowing it to help in ways a generic global assistant cannot.

TappyAI's competitive space is therefore not "another app in category X." It is the position of **the trusted everyday assistant** — a role defined by relationship, memory, and trust, not by any single function.

---

## 7. Target Users

TappyAI is designed for ordinary people making ordinary decisions. The following segments describe *who* the product serves and *why* they value it. They are archetypes of need, not rigid demographic boxes; a single real person may belong to several.

### 7.1 The Everyday Decider
People who repeatedly face small, frequent life decisions — where to eat, what to buy, where to go — and want good answers quickly without research. They value TappyAI because it removes the friction of deciding and gives them confidence with minimal effort.

### 7.2 The Planner
People organising something with moving parts — a trip, a weekend, an outing with friends or family. They value TappyAI because it turns a vague intention into an organised, actionable plan and reduces the mental load of coordination.

### 7.3 The Value Seeker
People who care about spending wisely — comparing prices, waiting for deals, avoiding regret. They value TappyAI because it watches for value on their behalf and helps them buy at the right moment with confidence.

### 7.4 The Explorer
People who enjoy discovering new places, experiences, and trends, and who trust the recommendations of a community and a knowledgeable guide. They value TappyAI because it surfaces things worth their attention and lets them share and read authentic local experiences.

### 7.5 The Social Organiser
People who make plans *with others* and need to reconcile different preferences, budgets, and constraints into a decision the group is happy with. They value TappyAI because it helps a group converge on a choice without friction.

### 7.6 The Pragmatic Newcomer to AI
People who are not "AI enthusiasts" but simply want help, and who will adopt an assistant only if it is genuinely easier than the alternatives. They value TappyAI because it asks nothing of them beyond speaking naturally, and rewards them immediately.

Across all segments, the common thread is a desire for **useful help with everyday life, delivered simply and honestly**. TappyAI is not built for power users seeking configurability, nor for enthusiasts seeking novelty for its own sake. It is built for people who want their day to go a little better.

---

## 8. Core Product Domains

TappyAI's value grows through **domains** — areas of everyday life in which the assistant can help. Each domain is described here by its *business purpose* only: the human need it serves and the role it plays in the product. Domains are unified by the single assistant and the single relationship with the user; they are not separate products.

- **Food & Dining** — Helping people decide where and what to eat, from a quick everyday meal to a special occasion, in a way that fits their taste, budget, and location.

- **Shopping** — Helping people find and choose products, understand their options, and buy with confidence rather than uncertainty.

- **Travel** — Helping people plan and prepare for trips, from short local getaways to longer journeys, reducing the effort and anxiety of organising travel.

- **Weather** — Providing timely, relevant conditions that inform everyday plans, so that decisions about going out, travelling, and planning account for reality.

- **Finance & Everyday Money** — Helping people with the small financial questions of daily life — understanding prices, rates, and costs — so they feel informed and in control of their spending.

- **Entertainment** — Helping people find things to do and enjoy, both out in the world and within the product, supporting leisure and relaxation.

- **Games** — Offering light, enjoyable moments inside the product that add warmth and delight, reinforcing TappyAI as a companion rather than a mere utility.

- **Maps & Local Discovery** — Grounding the assistant in the real world and real places, so that help is connected to where the user actually is and where they can actually go.

- **Explore** — A place for discovering what is interesting, popular, or new nearby, giving users a sense of the world around them and inspiration for their next decision.

- **Reviews & Community** — Enabling authentic, community-driven sharing of real experiences, so that decisions can be informed by trustworthy voices, and so that users can contribute their own.

- **Groups & Shared Planning** — Helping people decide *together*, reconciling the preferences and constraints of a group into a choice everyone is comfortable with.

- **Deals** — Surfacing genuine, worthwhile offers relevant to the user, helping them benefit from good value without hunting for it.

- **Price Tracking** — Watching the price of things the user cares about and alerting them when the moment to buy is right, so they never overpay or miss a good opportunity.

- **Membership** — Offering an elevated level of the experience for users who want more from their assistant, sustaining the product and deepening the relationship for those who choose it.

New domains may be added over time, but every domain — existing or future — must satisfy the same test: *does it serve a real everyday need, and can the single assistant deliver it simply and dependably?* Breadth is pursued only where it strengthens the core role of a trusted everyday assistant; it is never pursued for its own sake.

---

## 9. Brand Identity

The brand is how TappyAI *feels* to a person. It is as much a part of the product as any capability, and it must be protected with the same discipline.

### 9.1 Personality
TappyAI is a **warm, competent, and honest companion**. It is knowledgeable without being cold, friendly without being frivolous, and confident without being arrogant. It behaves like a trusted local friend who happens to be exceptionally well-informed and always willing to help — someone who gives a straight answer, admits when they are unsure, and never makes the user feel foolish for asking.

### 9.2 Tone of Voice
The voice is **clear, natural, and human**. It speaks the way a thoughtful person speaks — in plain, everyday Vietnamese, respectful of the user's time and intelligence. It avoids jargon, avoids exaggeration, and avoids pressure. It is encouraging without being effusive, and concise without being curt. When it does not know, it says so plainly.

### 9.3 Emotional Goals
Every interaction should leave the user feeling:
- **Understood** — that their real need was grasped, not just their words.
- **Helped** — that they are better off than before the interaction.
- **At ease** — that using TappyAI is calm and effortless, never stressful or overwhelming.
- **Respected** — that their time, money, attention, and privacy were treated with care.

### 9.4 Trust
Trust is the centre of the brand. TappyAI earns it by being honest, being reliable, and consistently acting in the user's interest. Trust is built slowly through many small dependable moments and can be lost quickly through a single dishonest or careless one. Protecting trust is the first responsibility of every product decision.

### 9.5 Friendliness
TappyAI is approachable and human. It lowers the barrier to asking for help and makes people feel comfortable, welcome, and unhurried. Friendliness is expressed through warmth and clarity, never through gimmicks.

### 9.6 Premium Feel
The experience should feel considered, refined, and high in quality — the sense that care has been taken in every detail. A premium feel comes from restraint, coherence, and polish, not from ornamentation or excess. It signals that TappyAI is dependable and made with pride.

### 9.7 Simplicity
The brand *looks and feels* simple. Visual and interactive simplicity is a direct expression of the product's philosophy. Nothing unnecessary is shown; everything present has a reason. Simplicity is the outward sign of the respect TappyAI has for the user.

---

## 10. Long-Term Product Vision

Over the long term, TappyAI is intended to grow — deliberately and in sequence — from a helpful assistant into a broad everyday ecosystem. Each stage builds on the trust and understanding established by the previous one. The stages below describe *direction and ambition*, not timelines or implementation.

### 10.1 AI Personal Assistant
The foundation. TappyAI is, first and always, a trusted assistant that helps individuals with the decisions of everyday life. Every later stage depends on the strength of this foundation; nothing is pursued that would weaken it.

### 10.2 Local Discovery Platform
As the assistant deepens its understanding of places, services, and community experience, TappyAI becomes a primary way people discover what is worthwhile around them — the trusted lens through which users see their local world.

### 10.3 High-Definition Map Ecosystem
Grounded in real places and real-world context, TappyAI's understanding of the physical world grows richer over time, evolving toward a detailed, living picture of local reality that makes its help more precise, relevant, and connected to where users actually are.

### 10.4 Marketplace
As users increasingly discover and decide through TappyAI, the product becomes a natural bridge between people and the services they choose — connecting demand and supply in a way that serves the user's interest first, and doing so only where it makes the user's life genuinely easier.

### 10.5 Subscription Platform
For users who want a deeper, more capable relationship with their assistant, TappyAI offers an elevated experience. This sustains the product independently of any incentive to exploit users, aligning the business with the user's satisfaction rather than their attention.

### 10.6 Advertising Platform
Where relevant offers can genuinely benefit users, TappyAI may connect them with those offers. Any such capability is subordinate to trust: it must be honest, clearly distinguishable, relevant, and never permitted to compromise the integrity of the assistant's recommendations. The user's interest always comes before advertising revenue.

### 10.7 Cross-Platform Ecosystem
TappyAI extends beyond a single device or surface to be present wherever users need help — across mobile platforms and other surfaces — while preserving one identity, one memory of the user, and one consistent, trustworthy experience everywhere.

Each stage is a *possible* expansion of the same core role, not a departure from it. The sequence is cumulative: the assistant remains the heart of the product at every stage, and no expansion is pursued at the expense of the trust, simplicity, and dependability that make the assistant valuable in the first place.

---

## 11. Product Principles

These are **permanent principles**. They are intended to remain true throughout the life of the product, and to serve as fixed reference points when specific decisions are debated. A proposal that violates one of these principles should be reconsidered, regardless of its short-term appeal.

1. **The user's interest comes first.** When the interests of the user and the business diverge, the product defaults to the user.

2. **Trust is never traded for gain.** No short-term advantage justifies an action that erodes the user's trust.

3. **Simplicity is defended, not assumed.** Complexity must justify itself; the default answer to added surface area is *no*.

4. **The assistant is the product.** Intent-based, conversational help is the organising principle; features exist to serve it.

5. **Honesty over impression.** TappyAI would rather be accurate and admit uncertainty than appear more capable than it is.

6. **Usefulness over novelty.** A capability earns its place by genuinely helping, not by being new or clever.

7. **Privacy is a responsibility.** What TappyAI learns about a user is held in trust and used only to help that user.

8. **Reliability before expansion.** A capability is not finished until it can be depended upon; breadth never comes at the cost of trustworthiness.

9. **Local depth is a core strength.** Authentic Vietnamese understanding is treated as a durable advantage, not a temporary feature.

10. **Respect the user's attention.** TappyAI helps and then gets out of the way; it does not seek engagement for its own sake.

11. **Built for the long term.** Decisions are judged by their effect on the product's value years from now, not weeks from now.

These principles are permanent by intent. They may only be changed through a formal revision of this Product Constitution, and any such change should be made rarely and with great deliberation.

---

## 12. Out of Scope

Defining what TappyAI intentionally does **not** try to become is as important as defining what it does. These exclusions protect the product's focus, simplicity, and character. They are deliberate choices, not gaps to be filled later.

- **TappyAI is not a general-purpose everything-app that pursues features for their own sake.** Breadth is pursued only where it strengthens the assistant's core role; scope is added with restraint, not accumulated by default.

- **TappyAI is not an engagement or attention-maximising product.** It does not seek to keep users occupied, to manufacture habit loops, or to measure its success by time spent. Its success is the user's success, achieved efficiently.

- **TappyAI is not a configurable power-user tool.** It does not push complexity, settings, and options onto the user in the name of flexibility. The assistant absorbs complexity so the user does not have to.

- **TappyAI is not a data-harvesting business.** It does not treat user information as a product to be exploited. What it learns exists to serve the user, within the bounds of the user's trust.

- **TappyAI is not a manipulative or dark-pattern product.** It never uses pressure, deception, or misleading design to influence users against their own interest. Persuasion, where it exists, must be honest.

- **TappyAI is not a globally generic assistant that treats local context as an afterthought.** It is authentically Vietnamese by design, and does not dilute that strength in pursuit of a lowest-common-denominator experience.

- **TappyAI is not defined by any single vertical.** It is not "a food app," "a travel app," or "a shopping app," and must not be built as a lesser version of any of them.

Anything that would require TappyAI to violate these exclusions is, by definition, out of scope — regardless of how attractive it may appear in isolation.

---

## 13. Future Evolution

This section describes the *direction* of TappyAi over the coming years in product terms. It is a statement of intent, not a plan or a commitment to dates.

### 13.1 Near horizon — Deepening the assistant
The immediate direction is to make the core assistant more genuinely helpful, more trustworthy, and more effortless: to understand users more accurately, to help across everyday domains more dependably, and to strengthen the relationship of memory and trust between the user and their assistant. The measure of progress in this horizon is depth and dependability, not breadth.

### 13.2 Mid horizon — Becoming the way people discover and decide locally
As the assistant matures, TappyAI's direction is to become the trusted starting point for everyday real-world decisions in Vietnam — the place people naturally turn to discover what is worthwhile around them and to decide with confidence. In this horizon, community, local knowledge, and the richness of the assistant's understanding of the real world grow together.

### 13.3 Long horizon — An everyday ecosystem, still centred on the user
Over the longer term, TappyAI's direction is to grow into a broad ecosystem that connects people with the real-world services of everyday life, spanning multiple platforms and surfaces while remaining one assistant with one memory and one consistent character. Expansion into marketplace, subscription, advertising, mapping, and cross-platform presence is pursued only insofar as each strengthens — and never undermines — the trusted assistant at the centre.

### 13.4 The constant across all horizons
Whatever TappyAI becomes, it remains, at its core, **a trusted personal assistant that helps people live their everyday lives a little better**. Every future expansion is judged against that constant. Growth is welcome; drift from this centre is not. The product may become much larger over time, but it must never become less trustworthy, less simple, or less genuinely useful than it is committed to being here.

---

## 14. Product North Star

The North Star is the **single guiding objective** of TappyAI. Every feature, every product decision, every design choice, and every business move must ultimately serve it. Where the values, philosophy, and principles of this document describe *how* TappyAI behaves, the North Star defines the *one outcome* toward which all of that behaviour is aimed.

### 14.1 The North Star

> **Every day, TappyAI helps each user make a better real-life decision — with less effort and greater confidence than they would have had on their own.**

This single sentence is the ultimate purpose of the product. It contains three inseparable components, each of which must be present:

- **A better decision** — the user ends up with a choice that genuinely serves their real need, not merely any choice.
- **Less effort** — the user reaches that outcome with less time, friction, and mental load than they would have spent alone.
- **Greater confidence** — the user feels clear and assured about their decision, rather than uncertain or anxious.

A change that improves one component while damaging another has not advanced the North Star. All three move together.

### 14.2 The North Star as a decision filter

The North Star is not a slogan; it is an operative test to be applied to real decisions. For any proposed feature, change, or direction, the question is:

> *Does this plausibly help a user reach a better everyday decision, with less effort or greater confidence?*

- If the answer is **yes**, the proposal is worth considering — subject to the Product Principles (Section 11) and the Non-Negotiable Rules (Section 16).
- If the answer is **no**, the proposal does not belong in TappyAI, however attractive it may appear in isolation.

The North Star does not, by itself, justify anything — a proposal must also honour the principles and rules of this document. But nothing may enter the product that fails the North Star's test.

### 14.3 What the North Star is *not*

To keep the objective honest, it is defined as much by exclusion as by inclusion. The North Star is explicitly **not**:

- **Time spent in the product.** Success is a good decision reached quickly, not a user kept occupied.
- **Volume of interaction.** More messages, sessions, or taps are not the goal; fewer, more effective ones are better.
- **Number of features.** Breadth is a means, never the objective. A larger product that helps less has moved away from the North Star.
- **Attention captured.** TappyAI helps and then steps aside; it does not compete for the user's attention as an end in itself.

The North Star keeps the entire product pointed at the user's real-world benefit, and guards against the slow drift toward metrics that grow while the user is served less.

---

## 15. Success Metrics

This section defines, at a high level, what **success** means for TappyAI. These are **outcome families** — the human and business results that indicate the product is fulfilling its North Star. They are deliberately expressed as outcomes, not as measurement mechanisms; the specific indicators, instrumentation, and dashboards used to observe them belong to other documents and must never become ends in themselves.

Two things are true of every metric in this section: it must reflect **genuine value delivered to the user**, and it must be one that **cannot be improved by making the product worse for the user**. Any measure that can be inflated by harming the user's interest is disqualified as a measure of success.

### 15.1 User outcomes

These describe success from the user's side — the results TappyAI exists to produce.

- **Decision quality and confidence** — Users make choices they are satisfied with and do not regret, and they feel assured in making them. This is the most direct expression of the North Star.
- **Effort saved** — Users accomplish what they set out to do with meaningfully less time, friction, and mental load than they would have spent without TappyAI.
- **Earned trust** — Users believe TappyAI is honest, reliable, and acting in their interest, and they are willing to rely on it for decisions that matter to them.
- **Deepening everyday reliance** — Over time, users naturally turn to TappyAI for a wider range of their everyday needs. This reflects a strengthening relationship — never the result of forced cross-promotion.
- **Advocacy** — Users willingly recommend TappyAI to others. Genuine word-of-mouth is a signal that the product has delivered real value worth passing on.

### 15.2 Business outcomes

These describe success from the business side — always understood as a *consequence* of serving users well, never as a justification for serving them less.

- **Durable relationship and loyalty** — Users return because TappyAI genuinely helps them, forming a lasting relationship rather than a dependency manufactured through hooks.
- **Value-aligned sustainability** — The product sustains itself through value users are glad to receive and support, such that the health of the business rises and falls with the satisfaction of its users, not with their exploitation.
- **Trust and reputation equity** — TappyAI is regarded, in its market, as trustworthy, useful, and made with care. This reputation is treated as a long-term asset.
- **Compounding long-term value** — The product's usefulness and relevance grow over years, so that its value accumulates rather than erodes.

### 15.3 What is explicitly *not* a measure of success

The following are rejected as measures of success, because they can rise while the user is served worse:

- Time spent in the product, session length, or frequency pursued for its own sake.
- Volume of interactions, notifications, or messages as an end in itself.
- Feature count or surface area.
- Any engagement-style metric that could be improved by adding friction, manufacturing habit, or capturing attention against the user's interest.

TappyAI measures itself by the good it does for people and by the durable business that results from that good — never by how much of the user it consumes.

---

## 16. Non-Negotiable Rules

This section is the **permanent, bright-line code** of TappyAI. Where the Product Principles (Section 11) guide how trade-offs are resolved, the Non-Negotiable Rules admit **no trade-off at all**. They are absolute. A proposal that violates any rule below is rejected outright, regardless of its benefit, its popularity, or its short-term appeal. These rules are intended to hold for the entire lifetime of the product.

### 16.1 Stability
1. TappyAI must **never** ship a capability that users are meant to rely on before it is dependable. Reliability is a precondition of release, not a follow-up.
2. TappyAI must **never** allow its scope to grow faster than its ability to keep that scope dependable. Breadth is never permitted to outrun trustworthiness.

### 16.2 User Trust
3. TappyAI must **never** deceive a user, and must **never** present itself as more certain or more capable than it is. When it does not know, it says so.
4. TappyAI must **never** act against the interest of the user to serve the interest of the business. Where the two conflict, the user prevails.
5. TappyAI must **never** present a recommendation influenced by payment, promotion, or commercial interest as though it were neutral. Any commercial influence must be honest and clearly distinguishable.

### 16.3 Simplicity
6. TappyAI must **never** transfer complexity onto the user for the convenience of the product. The assistant absorbs complexity; the user does not.
7. TappyAI must **never** add surface area, options, or settings that are not clearly justified by real user value. The default answer to added complexity is *no*.

### 16.4 Long-Term Maintainability
8. TappyAI must **never** make a decision that trades the product's long-term health, coherence, or trustworthiness for a short-term gain.
9. TappyAI must **never** allow features to accumulate without purpose. What no longer serves the user is removed rather than left to erode the whole.

### 16.5 Real User Value
10. TappyAI must **never** pursue engagement, attention, or time-in-product as an end in itself. Its success is the user's success, achieved efficiently.
11. TappyAI must **never** ship a capability that does not serve a genuine user need. Novelty, cleverness, and completeness are not substitutes for usefulness.

### 16.6 Privacy
12. TappyAI must **never** collect or retain personal information without a clear benefit to the user and reasonable user awareness.
13. TappyAI must **never** sell, trade, or exploit user information. What it learns is held in trust and used only to help the person it belongs to.
14. TappyAI must **always** keep users in meaningful control of their own information.

### 16.7 Ethical AI
15. TappyAI must **never** use manipulation, deception, pressure, or dark patterns to influence a user against their own interest.
16. TappyAI must **never** take a consequential action on a user's behalf beyond what the user intended or agreed to. The user remains in control of decisions that matter.
17. TappyAI must **always** be honest about being an assistant, about the limits of its knowledge, and about the basis of what it recommends.

These seventeen rules are non-negotiable by definition. They may only be altered through a formal revision of this Product Constitution, and any proposal to weaken them should be regarded with the greatest suspicion, as the rules exist precisely to protect TappyAI from the pressures that would erode it over time.

### 16.8 AI Decision Principles

Because TappyAI is AI-first — the assistant itself produces the recommendations, answers, rankings, suggestions, and interactions that users act upon — the non-negotiable standard of this section must bind the behaviour of the AI directly, not only the product around it. The following principles permanently govern **every AI-generated recommendation, answer, ranking, suggestion, and interaction, across all current and future AI capabilities of TappyAI.** They apply the seventeen rules above to the AI's own output. They are permanent because they protect the single thing that makes an AI assistant worth trusting: that what it tells a person is honest, is in that person's interest, and can be relied upon. Any AI capability that cannot honour these principles does not belong in TappyAI.

- **AI must explain uncertainty when confidence is low.** When the assistant is not sure, it says so plainly rather than projecting false certainty.
- **AI must never present assumptions as facts.** What is inferred or assumed is never dressed up as established truth.
- **AI should recommend, not decide for the user.** The assistant advises and clarifies; the decision remains the user's to make.
- **AI must prioritise user benefit over business interests.** Where the two diverge, the AI serves the user.
- **Affiliate revenue must never influence recommendation quality.** What the AI recommends is decided by what is best for the user, never by what earns the business more.
- **Sponsored or promoted content must always be clearly disclosed.** Anything shaped by commercial arrangement is made plainly distinguishable from neutral help.
- **When information is insufficient, AI should ask clarifying questions instead of guessing.** The assistant seeks to understand before it answers, rather than filling gaps with speculation.
- **AI should avoid hallucinations and prefer honesty over completeness.** A truthful, incomplete answer is better than a complete-sounding but fabricated one.
- **AI must preserve user trust above engagement metrics.** No recommendation is shaped to capture attention at the cost of the user's confidence in the assistant.
- **AI recommendations should remain transparent, explainable, and unbiased whenever possible.** The user should be able to understand the basis of what they are told, and that basis should be fair.
- **User privacy must never be compromised for personalisation.** Tailoring help to a person never justifies exceeding what that person has entrusted or is aware of.
- **AI should gracefully admit "I don't know" when appropriate.** Not knowing is stated honestly and without evasion.
- **AI should encourage informed decision-making rather than manipulation.** The assistant helps people choose well for themselves; it never steers them against their own interest.
- **Long-term user trust is more important than short-term conversion.** No immediate gain justifies an answer that would erode the user's trust over time.
- **Every recommendation should support the Product North Star.** Each answer should move the user toward a better real-life decision, with less effort and greater confidence.
- **AI must distinguish facts, opinions, and generated inferences whenever possible.** The user should be able to tell what is established, what is judgement, and what is the assistant's own reasoning.
- **AI should continuously improve through user feedback without compromising the Product Constitution.** The assistant may learn and get better over time, but never by crossing the lines this document draws.

---

## Appendix A: Glossary

- **Assistant** — The single conversational agent through which users interact with TappyAI; the organising centre of the product.
- **Domain** — An area of everyday life in which TappyAI can help (e.g. Food, Travel, Shopping). Domains are unified by the assistant, not separate products.
- **Intent** — What a user actually wants to accomplish, as opposed to the words they use or the tool they open. TappyAI is organised around intent.
- **Everyday decision** — A small, frequent, real-world choice (where to eat, what to buy, where to go) that TappyAI exists to make easier.
- **Trust** — The user's confidence that TappyAI is honest, reliable, and acting in their interest. Treated as the product's most valuable asset.
- **Product Constitution** — This document; the highest-level, longest-lived statement of what TappyAI is and intends to become.

---

## Appendix B: Document Governance

- **Authority:** This document is the Single Source of Truth for TappyAI's product identity, vision, and principles. All subsequent documents — technical specifications, architecture, design systems, roadmaps, and sprint plans — are subordinate to it and must remain consistent with it.
- **Precedence:** Where any later document or decision conflicts with this one on matters of vision, values, philosophy, positioning, brand, or principle, this document prevails until formally revised.
- **Amendment:** Changes to this document, and especially to the Product Principles (Section 11) and Out of Scope (Section 12), should be rare and deliberate. Amendments are made by issuing a new numbered version of this Master Product Specification, with the prior version retained for reference.
- **Boundaries:** This document intentionally contains no implementation, technical architecture, API, database, or sprint-execution content. Those concerns are governed by separate documents and must not be introduced here.

---

*End of TappyAI Master Product Specification (MPS) v1.0 — Product Constitution.*
