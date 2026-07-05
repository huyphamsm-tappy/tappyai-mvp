# TappyAI Master Feature Specification (MFS)

**Version:** 1.0
**Status:** Approved — Feature Constitution
**Document Class:** Highest-level feature document (Single Source of Truth for capabilities)
**Subordinate to:** *TappyAI Master Product Specification (MPS) v1.0 — FINAL* and *TappyAI Master UX/UI Specification (MUXS) v1.0 — FINAL*
**Scope:** Product capabilities and permanent feature behaviour — non-technical
**Applies to:** Every current and future capability of the TappyAI ecosystem, on every platform

> This document is the **Feature Constitution** of TappyAI. It defines *what every capability of the product does and how it behaves* — never how it is built. It is **subordinate to both** the Master Product Specification (which governs vision, values, and principles) and the Master UX/UI Specification (which governs experience). Where any feature behaviour would conflict with either constitution — the MPS North Star, Non-Negotiable Rules, or AI Decision Principles, or the MUXS Decision Tree or Non-Negotiable UX Rules — those constitutions prevail. Where a later capability, roadmap, or engineering document conflicts with this one on matters of feature behaviour, this document prevails until formally revised.
>
> This document describes **permanent intended behaviour only.** It contains no code, APIs, database, architecture, implementation detail, platform specifics, timelines, or delivery status, and does not state whether any capability is presently built. Each feature is treated as an **independent capability**, described in its own chapter, without merging.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [AI Ecosystem](#2-ai-ecosystem)
   - [2.1 AI Chat](#21-ai-chat) · [2.2 AI Memory](#22-ai-memory) · [2.3 AI Context](#23-ai-context) · [2.4 AI Planning](#24-ai-planning) · [2.5 AI Recommendation](#25-ai-recommendation) · [2.6 AI Personalization](#26-ai-personalization) · [2.7 AI Follow-up](#27-ai-follow-up) · [2.8 AI Reasoning](#28-ai-reasoning) · [2.9 AI Transparency](#29-ai-transparency) · [2.10 AI Clarification](#210-ai-clarification) · [2.11 AI Safety](#211-ai-safety)
3. [Discovery Ecosystem](#3-discovery-ecosystem)
   - [3.1 Restaurant](#31-restaurant) · [3.2 Cafe](#32-cafe) · [3.3 Food](#33-food) · [3.4 Hotel](#34-hotel) · [3.5 Attraction](#35-attraction) · [3.6 Travel](#36-travel) · [3.7 Nearby](#37-nearby) · [3.8 Maps](#38-maps) · [3.9 Shopping](#39-shopping) · [3.10 Deals](#310-deals) · [3.11 Price Tracking](#311-price-tracking) · [3.12 Weather](#312-weather) · [3.13 Finance](#313-finance)
4. [Social Ecosystem](#4-social-ecosystem)
   - [4.1 Explore](#41-explore) · [4.2 Reviews](#42-reviews) · [4.3 Groups](#43-groups) · [4.4 Sharing](#44-sharing) · [4.5 Native Share](#45-native-share) · [4.6 Rich Link Preview](#46-rich-link-preview) · [4.7 QR Profile](#47-qr-profile) · [4.8 Invite](#48-invite) · [4.9 Bookmarks](#49-bookmarks) · [4.10 Favorites](#410-favorites) · [4.11 Saved](#411-saved)
5. [Entertainment Ecosystem](#5-entertainment-ecosystem)
   - [5.1 Games](#51-games) · [5.2 Music](#52-music) · [5.3 Movies](#53-movies) · [5.4 Events](#54-events)
6. [User Ecosystem](#6-user-ecosystem)
   - [6.1 Identity](#61-identity) · [6.2 Profile](#62-profile) · [6.3 Membership](#63-membership) · [6.4 Preferences](#64-preferences) · [6.5 History](#65-history) · [6.6 Trust](#66-trust) · [6.7 Reputation](#67-reputation) · [6.8 Notifications](#68-notifications) · [6.9 Push Notifications](#69-push-notifications) · [6.10 Accessibility](#610-accessibility) · [6.11 Multi-language](#611-multi-language)
7. [Commerce Ecosystem](#7-commerce-ecosystem)
   - [7.1 Affiliate](#71-affiliate) · [7.2 Coupon](#72-coupon) · [7.3 Rewards](#73-rewards) · [7.4 Commerce Cross-References](#74-commerce-cross-references)
8. [Feature Relationships](#8-feature-relationships)
9. [Feature Decision Tree](#9-feature-decision-tree)
10. [Feature Evolution Model](#10-feature-evolution-model)
11. [Non-Negotiable Feature Rules](#11-non-negotiable-feature-rules)
12. [Feature Review Checklist](#12-feature-review-checklist)
13. [AI Feature Checklist](#13-ai-feature-checklist)
- [Appendix A: Glossary](#appendix-a-glossary)
- [Appendix B: Document Governance](#appendix-b-document-governance)

---

## 1. Executive Summary

TappyAI is an AI personal assistant for everyday life, and its capabilities exist for a single purpose: to help a person move from an intention to a good real-life decision — with less effort and greater confidence. This document defines every one of those capabilities as a permanent feature, describing what each does and how it behaves, so that the whole product can be understood, judged, and extended against one fixed reference.

The capabilities of TappyAI are organised into seven ecosystems — **AI, Discovery, Social, Entertainment, User, Commerce**, and the relationships that bind them. They are ecosystems rather than modules because they are not separate applications a person switches between; they are facets of one assistant that shares one understanding of the user and one consistent way of behaving. A person does not "open the food feature" and then "open the maps feature." They express a need, and the relevant capabilities cooperate, invisibly, to meet it.

Every feature in this document is defined by the same eleven-part frame — its Purpose, Feature Vision, User Value, Core Capabilities, User Journey, AI Responsibilities, Privacy Considerations, Relationship with AI, Relationship with other Features, Feature Principles, and Future Evolution. This uniformity is deliberate: it ensures every capability is held to the same standard and can be reasoned about consistently. Each feature is treated as independent and given its own chapter, even where features are closely related, so that no capability is defined only as a footnote to another.

Two constitutions govern everything here. The **Master Product Specification** sets the purpose, values, and non-negotiable rules that every feature must serve — above all, that features exist to deliver genuine user value and to preserve trust, never to capture attention or exploit the user. The **Master UX/UI Specification** sets how every feature must feel and behave in the user's hands — simple, calm, honest, accessible, and premium. This document adds a third layer: *what the capabilities are*. Together, the three form a complete, self-consistent constitution for the product. Where this document is silent or ambiguous, the two constitutions above it decide.

---

## 2. AI Ecosystem

The AI Ecosystem is the heart of TappyAI. Every other capability is reached through, and made more useful by, the assistant. The features in this chapter define the assistant's own capabilities — how it converses, remembers, understands, reasons, plans, recommends, personalises, clarifies, stays transparent, and stays safe. All of them are bound absolutely by the MPS AI Decision Principles.

### 2.1 AI Chat
1. **Purpose** — To let a person express any need in natural, everyday language and receive genuine help, making conversation the primary way the user interacts with the entire product.
2. **Feature Vision** — A calm, trusted companion the user can turn to for anything, that understands intent rather than requiring commands, and that becomes the natural starting point for everyday decisions.
3. **User Value** — The user gets help without having to learn the product, choose a category, or phrase their need in a machine's language; they simply say what they want.
4. **Core Capabilities** — Understands natural-language requests; responds conversationally and progressively; draws on the user's context and memory; reaches into any relevant capability to meet the need; supports interruption, redirection, and continuation at any time.
5. **User Journey** — The user states a need in their own words; the assistant understands, works (drawing on whatever capabilities are relevant), and returns clear, honest help; the user refines, follows up, or acts.
6. **AI Responsibilities** — To understand accurately, help honestly, express uncertainty plainly, never fabricate, and keep the user in control of the conversation at all times.
7. **Privacy Considerations** — Conversations are personal; they are used to help the user and are held with care, never exploited, and always within the user's awareness and control.
8. **Relationship with AI** — This *is* the assistant's primary surface; every AI capability in this chapter expresses itself through it.
9. **Relationship with other Features** — The gateway to the entire ecosystem: Discovery, Social, Entertainment, User, and Commerce capabilities are all reachable and composable through chat.
10. **Feature Principles** — Conversation-first; intent over commands; the user is always in control; honesty over impression; help then get out of the way.
11. **Future Evolution** — Deepens in understanding, contextual awareness, and range of needs it can meet, while remaining calm, simple, and trustworthy.

### 2.2 AI Memory
1. **Purpose** — To let the assistant remember what matters about a person over time, so help becomes more personal and effortful repetition disappears.
2. **Feature Vision** — An assistant that genuinely knows the user — their preferences, context, and history — and uses that knowledge only to serve them better.
3. **User Value** — The user is understood without having to re-explain themselves; the product feels like a relationship that improves with time rather than a tool that forgets.
4. **Core Capabilities** — Retains durable, relevant facts about the user (preferences, context, patterns); applies them to improve help; surfaces what it remembers transparently; lets the user review, correct, and erase memory.
5. **User Journey** — As the user interacts, the assistant quietly learns; on future occasions it applies that understanding; the user can always see and control what is remembered.
6. **AI Responsibilities** — To remember only what genuinely helps, to use memory transparently and never as surveillance, and to keep the user in control of their own record.
7. **Privacy Considerations** — Memory is among the most sensitive capabilities; it is governed by strict privacy-first behaviour — clear, consented, reviewable, and erasable — and is never used against the user's interest.
8. **Relationship with AI** — Gives every other AI capability its personal dimension; context, personalization, and recommendation all draw on it.
9. **Relationship with other Features** — Informs Preferences, Personalization, Recommendation, Planning, and Follow-up; underpins the deepening relationship that Membership rewards.
10. **Feature Principles** — Remember to help, never to exploit; transparency always; the user owns their memory; privacy over personalization where they conflict.
11. **Future Evolution** — Grows richer and more useful over time while raising, never lowering, its standard of transparency and user control.

### 2.3 AI Context
1. **Purpose** — To let the assistant understand the user's present situation — where they are, when it is, what they are doing — so help is timely and relevant.
2. **Feature Vision** — An assistant that responds to the moment, not just the words, giving help that fits the real situation the user is in.
3. **User Value** — Answers are grounded in reality; the user gets help suited to their actual place, time, and task, without having to spell out their circumstances.
4. **Core Capabilities** — Incorporates immediate situational signals (such as location, time of day, and current activity) into its understanding; adapts help to the moment; requests situational access only in context and only when it adds value.
5. **User Journey** — The user makes a request; the assistant interprets it in light of the current situation; the help returned is appropriately grounded and timely.
6. **AI Responsibilities** — To use context to serve the user, to be transparent about what situational information it is using, and never to gather context beyond what genuinely helps.
7. **Privacy Considerations** — Situational signals are sensitive; they are used only with appropriate, contextual permission, only to improve the immediate help, and never retained or repurposed beyond the user's awareness.
8. **Relationship with AI** — Sharpens Chat, Recommendation, Planning, and Personalization by grounding them in the present moment.
9. **Relationship with other Features** — Draws on Nearby, Maps, and Weather for situational grounding; feeds more relevant Discovery and Recommendation.
10. **Feature Principles** — Relevance through situation; context serves the user; permission in context; never gather more than helps.
11. **Future Evolution** — Becomes more finely attuned to the user's moment while holding to strict, permission-based, privacy-respecting behaviour.

### 2.4 AI Planning
1. **Purpose** — To turn an intention with moving parts into an organised, actionable plan, reducing the mental load of coordinating a decision.
2. **Feature Vision** — An assistant that not only suggests but organises — assembling the pieces of a trip, an outing, or a day into something coherent the user can act on.
3. **User Value** — The user is relieved of the effort of planning; a vague intention becomes a clear, comprehensible plan without spreadsheets or research.
4. **Core Capabilities** — Breaks a goal into steps; assembles relevant options into a structured plan; accounts for the user's constraints and context; presents the plan clearly and allows the user to adjust it.
5. **User Journey** — The user expresses a goal with several parts; the assistant proposes an organised plan; the user reviews, refines, and proceeds.
6. **AI Responsibilities** — To plan honestly within real constraints, to be transparent about assumptions, to recommend rather than decide, and to keep the plan the user's to change.
7. **Privacy Considerations** — Plans may involve personal details and context; these are used to build the plan and handled with the same care as all personal information.
8. **Relationship with AI** — Composes Recommendation, Context, and Reasoning into a structured outcome; draws on Memory for personal fit.
9. **Relationship with other Features** — Combines Travel, Food, Attraction, Maps, Weather, and Groups into coherent plans; shareable through the Sharing family.
10. **Feature Principles** — Reduce coordination load; the plan is the user's; honest within real constraints; clarity over completeness.
11. **Future Evolution** — Handles richer, more complex plans across more domains, while keeping plans simple to read and easy to change.

### 2.5 AI Recommendation
1. **Purpose** — To help the user choose well by suggesting relevant options suited to their need, taste, budget, and situation.
2. **Feature Vision** — A trusted advisor whose suggestions the user can rely on, because they are made in the user's interest and are honest about their basis.
3. **User Value** — The user is spared the effort of open-ended searching and comparison; they receive considered options they can trust.
4. **Core Capabilities** — Surfaces relevant options for a need; tailors them to the user's preferences, budget, and context; explains the basis of a suggestion; presents choices fairly, without hidden bias.
5. **User Journey** — The user expresses a need; the assistant offers suitable options with honest framing; the user compares and chooses.
6. **AI Responsibilities** — To recommend in the user's interest, never let commercial influence shape quality, disclose any such influence plainly, and remain transparent and unbiased.
7. **Privacy Considerations** — Personal signals used to tailor recommendations are handled privately and only to serve the user; personalization never overrides privacy.
8. **Relationship with AI** — Draws on Memory, Context, Personalization, and Reasoning; feeds Planning and Follow-up.
9. **Relationship with other Features** — Powers choices across Discovery (Restaurant, Cafe, Food, Hotel, Attraction, Travel, Shopping) and surfaces value through Deals and Coupon with clear disclosure.
10. **Feature Principles** — User benefit before business interest; affiliate revenue never influences quality; transparency and fairness; recommend, do not decide.
11. **Future Evolution** — Grows more accurate and personal while strengthening, never weakening, its guarantees of honesty and impartiality.

### 2.6 AI Personalization
1. **Purpose** — To adapt the whole experience to the individual, so help feels made for them rather than generic.
2. **Feature Vision** — A product that fits each person — their tastes, habits, and context — while never crossing into intrusion or manipulation.
3. **User Value** — Every interaction is more relevant and effortless because it reflects who the user actually is.
4. **Core Capabilities** — Tailors help, options, and tone to the individual; draws on preferences, memory, and context; remains transparent about personalization; lets the user shape and reset it.
5. **User Journey** — The user interacts; the experience quietly adapts to fit them; the user can understand and adjust how they are being personalised.
6. **AI Responsibilities** — To personalise for the user's benefit, be transparent about it, never use it to manipulate, and never compromise privacy to achieve it.
7. **Privacy Considerations** — Personalization is bounded by a firm rule: user privacy is never compromised for personalization; what tailors the experience stays within the user's awareness and control.
8. **Relationship with AI** — Applies Memory, Preferences, and Context across Recommendation, Planning, and Chat.
9. **Relationship with other Features** — Shapes Discovery, Explore, Notifications, and Deals to fit the individual; deepened by the Membership relationship.
10. **Feature Principles** — Fit the person; privacy over personalization; transparency; never manipulate.
11. **Future Evolution** — Becomes more nuanced and helpful while holding personalization strictly subordinate to privacy and honesty.

### 2.7 AI Follow-up
1. **Purpose** — To carry a conversation forward helpfully, offering the natural next step so the user can go deeper or act without effort.
2. **Feature Vision** — An assistant that anticipates what would genuinely help next, and offers it as a gentle invitation rather than a push.
3. **User Value** — The user moves smoothly from answer to action or to the next question, without having to work out what to do next.
4. **Core Capabilities** — Suggests relevant next steps and questions; helps the user act on or refine a result; offers continuity without clutter or pressure.
5. **User Journey** — After a response, the assistant offers a relevant, optional next step; the user takes it, ignores it, or redirects freely.
6. **AI Responsibilities** — To offer follow-ups in the user's interest, never to steer toward the product's benefit over the user's, and never to pressure engagement.
7. **Privacy Considerations** — Follow-ups draw on conversation and context handled with the same privacy care as all personal signals.
8. **Relationship with AI** — Builds on Chat, Recommendation, and Planning to sustain a helpful thread.
9. **Relationship with other Features** — Bridges toward action across Discovery, Sharing, Groups, and Saved.
10. **Feature Principles** — Helpful next step, never a push; the user's interest first; respect attention; optional always.
11. **Future Evolution** — Grows more anticipatory and useful while staying gentle, optional, and free of pressure.

### 2.8 AI Reasoning
1. **Purpose** — To think carefully across multiple factors before answering, so the user receives considered help rather than a guess.
2. **Feature Vision** — An assistant that weighs the relevant considerations honestly and arrives at sound, explainable conclusions.
3. **User Value** — The user can trust that answers reflect genuine consideration, not shallow pattern-matching, and can understand how a conclusion was reached.
4. **Core Capabilities** — Weighs multiple factors and constraints; distinguishes what is known, assumed, and inferred; arrives at conclusions it can explain; avoids overconfidence.
5. **User Journey** — The user poses something that requires judgement; the assistant reasons and returns a considered, explainable answer.
6. **AI Responsibilities** — To reason honestly, distinguish fact from opinion and inference, avoid fabrication, and communicate the limits of its reasoning.
7. **Privacy Considerations** — Reasoning that draws on personal context does so privately and only to serve the user.
8. **Relationship with AI** — Underpins Recommendation, Planning, and Clarification with sound judgement.
9. **Relationship with other Features** — Improves the quality of every capability that requires a judged answer, across all ecosystems.
10. **Feature Principles** — Consider before answering; distinguish fact, opinion, and inference; explainability; honesty about limits.
11. **Future Evolution** — Deepens in rigour and explainability while never trading honesty for the appearance of certainty.

### 2.9 AI Transparency
1. **Purpose** — To make the basis of the assistant's answers and behaviour visible, so the user can trust and understand what they are told.
2. **Feature Vision** — An assistant nothing about which is hidden — its sources, its confidence, its use of memory and data are all legible to the user.
3. **User Value** — The user can judge answers for themselves and trust the product, because they can see what is behind what it says and does.
4. **Core Capabilities** — Makes sources, confidence, memory use, data use, and commercial influence visible where relevant; distinguishes AI-generated content; explains the basis of recommendations.
5. **User Journey** — As the user receives help, the relevant trust signals are present; the user can always understand why they are being told something.
6. **AI Responsibilities** — To disclose honestly, never imply an unearned trustworthiness, and never hide anything the user needs to make an informed decision.
7. **Privacy Considerations** — Transparency itself serves privacy by making data and memory use visible and controllable.
8. **Relationship with AI** — A property of every AI capability; each must be transparent in how it works.
9. **Relationship with other Features** — Expressed through the MUXS Trust Signals across every feature; central to Trust and Reputation.
10. **Feature Principles** — Make what is true visible; never imply unearned trust; disclose commercial influence; honesty over impression.
11. **Future Evolution** — Transparency standards only strengthen over time; they are never relaxed for convenience or conversion.

### 2.10 AI Clarification
1. **Purpose** — To ask a good question when a request is ambiguous or under-specified, rather than guessing.
2. **Feature Vision** — An assistant that would rather understand than assume, treating a clarifying question as an act of care.
3. **User Value** — The user gets the right help the first time, without being misunderstood or handed a confident but wrong answer.
4. **Core Capabilities** — Detects ambiguity or missing information; asks a brief, relevant question; frames it as helpfulness, not interrogation; proceeds once it understands.
5. **User Journey** — The user makes an unclear request; the assistant asks one good question; the user answers; the assistant helps accurately.
6. **AI Responsibilities** — To ask instead of guess when information is insufficient, to keep clarification minimal and warm, and never to turn it into a burdensome form.
7. **Privacy Considerations** — Clarifying questions request only what is needed to help, never more.
8. **Relationship with AI** — Protects the quality of Chat, Recommendation, Planning, and Reasoning by preventing confident errors.
9. **Relationship with other Features** — Improves accuracy across every capability that acts on a user request.
10. **Feature Principles** — Ask rather than guess; one good question, not a form; clarification is care; understand before answering.
11. **Future Evolution** — Grows more precise about when and how to ask, while staying brief, warm, and rare enough to never feel like friction.

### 2.11 AI Safety
1. **Purpose** — To protect the user from harm, manipulation, and error in everything the assistant does.
2. **Feature Vision** — An assistant that is fundamentally safe to rely on — honest, non-manipulative, and careful with consequential actions.
3. **User Value** — The user can trust the assistant with real decisions, confident it will not deceive them, manipulate them, or act beyond what they intended.
4. **Core Capabilities** — Avoids manipulation, deception, and dark patterns; keeps the user in control of consequential actions; communicates uncertainty honestly; declines to act beyond the user's intent or consent.
5. **User Journey** — Throughout every interaction, the assistant behaves within safe, honest bounds, and the user retains control over anything that matters.
6. **AI Responsibilities** — To uphold the MPS AI Decision Principles absolutely: honesty, non-manipulation, user control of consequential actions, and privacy.
7. **Privacy Considerations** — Safety includes protecting the user's data and never compromising privacy for any purpose.
8. **Relationship with AI** — A constraint on every AI capability; no capability may operate outside these bounds.
9. **Relationship with other Features** — Governs how every feature in every ecosystem behaves toward the user.
10. **Feature Principles** — Never manipulate; keep the user in control; honesty always; protect privacy; the user's interest is paramount.
11. **Future Evolution** — Safety standards only rise; they are never weakened for growth, engagement, or revenue.

---

## 3. Discovery Ecosystem

The Discovery Ecosystem helps people find and choose the real-world places, services, and information that fill everyday life. Each capability is independent, yet all are reached through the assistant and share one understanding of the user. None asks the user to browse and filter alone; the assistant does the discovery on their behalf and helps them decide.

### 3.1 Restaurant
1. **Purpose** — To help a person decide where to eat when they want a full meal out, suited to their taste, budget, occasion, and location.
2. **Feature Vision** — The trusted answer to "where should we eat," removing the effort and uncertainty of choosing a place to dine.
3. **User Value** — A confident dining decision reached quickly, fitting the user's real preferences and situation.
4. **Core Capabilities** — Surfaces relevant dining options; tailors them to taste, budget, and place; presents useful, honest information about each; helps the user reach the point of acting on a choice.
5. **User Journey** — The user expresses a desire to eat out; the assistant offers suitable options with honest framing; the user compares, decides, and proceeds toward acting.
6. **AI Responsibilities** — To recommend in the user's interest, disclose any commercial influence, present options fairly, and never inflate or misrepresent a place.
7. **Privacy Considerations** — Taste, budget, and location signals are used only to help and handled with privacy-first care.
8. **Relationship with AI** — Powered by Recommendation, Context, Personalization, and Memory.
9. **Relationship with other Features** — Works with Maps, Nearby, Reviews, Deals, Groups, and Planning; distinct from Cafe and Food as its own dining capability.
10. **Feature Principles** — Decide with confidence; fit the person; honesty over promotion; user benefit first.
11. **Future Evolution** — Grows richer in local depth and personal fit while remaining simple and trustworthy.

### 3.2 Cafe
1. **Purpose** — To help a person find the right café for their moment — work, a catch-up, a quiet break — suited to atmosphere, budget, and place.
2. **Feature Vision** — The dependable guide to where to sit with a coffee, attuned to the *feel* a person wants, not only the location.
3. **User Value** — A café that fits the occasion, found without effort or guesswork.
4. **Core Capabilities** — Surfaces relevant cafés; considers atmosphere, purpose, budget, and place; presents honest information; helps the user act on a choice.
5. **User Journey** — The user expresses a café need; the assistant offers fitting options; the user chooses and proceeds.
6. **AI Responsibilities** — To recommend honestly and in the user's interest, disclose commercial influence, and represent places truthfully.
7. **Privacy Considerations** — Preference and location signals are used only to help, with privacy-first care.
8. **Relationship with AI** — Powered by Recommendation, Context, and Personalization.
9. **Relationship with other Features** — Works with Maps, Nearby, Reviews, Deals, and Groups; independent of Restaurant and Food.
10. **Feature Principles** — Fit the moment; honesty over promotion; effortless choice; user benefit first.
11. **Future Evolution** — Deepens its sense of atmosphere and local nuance while staying calm and simple.

### 3.3 Food
1. **Purpose** — To help a person decide *what* to eat — the dish, cuisine, or craving — independent of a specific venue.
2. **Feature Vision** — The answer to "what should I eat," helping people resolve the everyday question of the meal itself.
3. **User Value** — A satisfying decision about food that fits taste, mood, budget, and dietary needs, reached with ease.
4. **Core Capabilities** — Helps resolve what to eat; considers taste, mood, dietary needs, and budget; connects a food decision to where it can be satisfied.
5. **User Journey** — The user is unsure what to eat; the assistant helps them decide; the decision leads naturally toward a place or a way to get it.
6. **AI Responsibilities** — To suggest in the user's interest, respect dietary needs honestly, and disclose any commercial influence.
7. **Privacy Considerations** — Dietary and taste information is sensitive and handled with privacy-first care.
8. **Relationship with AI** — Powered by Recommendation, Personalization, and Memory.
9. **Relationship with other Features** — Bridges to Restaurant, Cafe, Nearby, and Deals; distinct as the "what to eat" capability.
10. **Feature Principles** — Resolve the craving; respect dietary needs; fit the person; honesty first.
11. **Future Evolution** — Becomes more attuned to individual taste and dietary nuance while remaining simple.

### 3.4 Hotel
1. **Purpose** — To help a person find suitable accommodation for a stay, fitting their needs, budget, and destination.
2. **Feature Vision** — The trusted guide to where to stay, removing the effort and anxiety of choosing accommodation.
3. **User Value** — A confident accommodation decision that fits the trip, reached without exhaustive searching.
4. **Core Capabilities** — Surfaces relevant places to stay; considers needs, budget, and location; presents honest information; helps the user reach the point of acting.
5. **User Journey** — The user needs somewhere to stay; the assistant offers fitting options with honest framing; the user compares, decides, and proceeds toward acting.
6. **AI Responsibilities** — To recommend in the user's interest, disclose commercial influence, and represent accommodation truthfully.
7. **Privacy Considerations** — Trip and budget details are used only to help and handled with privacy-first care.
8. **Relationship with AI** — Powered by Recommendation, Context, and Planning.
9. **Relationship with other Features** — Central to Travel; works with Maps, Attraction, Weather, Deals, and Planning.
10. **Feature Principles** — Decide with confidence; honesty over promotion; fit the trip; user benefit first.
11. **Future Evolution** — Grows in local depth and personal fit while remaining simple and honest.

### 3.5 Attraction
1. **Purpose** — To help a person discover worthwhile things to see and do at a place — sights, experiences, activities.
2. **Feature Vision** — The inspiring, trustworthy guide to what is worth a person's time in a place, whether at home or travelling.
3. **User Value** — Worthwhile experiences discovered without research, suited to the user's interests and situation.
4. **Core Capabilities** — Surfaces relevant things to see and do; tailors to interests, context, and place; presents honest, useful information; helps the user act.
5. **User Journey** — The user wonders what to do; the assistant suggests worthwhile options; the user chooses and proceeds.
6. **AI Responsibilities** — To suggest in the user's interest, represent experiences honestly, and disclose commercial influence.
7. **Privacy Considerations** — Interest and location signals are used only to help, with privacy-first care.
8. **Relationship with AI** — Powered by Recommendation, Context, and Personalization.
9. **Relationship with other Features** — Central to Travel and Explore; works with Maps, Nearby, Weather, Groups, and Planning.
10. **Feature Principles** — Inspire worthwhile choices; honesty first; fit the person; respect time.
11. **Future Evolution** — Deepens in local and experiential richness while staying calm and simple.

### 3.6 Travel
1. **Purpose** — To help a person plan and prepare for a journey, from a short local trip to a longer one, reducing the effort and anxiety of organising travel.
2. **Feature Vision** — The companion that turns the intention to travel into an organised, comprehensible, confidence-inspiring plan.
3. **User Value** — Travel planned with anticipation rather than burden; the moving parts organised on the user's behalf.
4. **Core Capabilities** — Helps organise the elements of a trip; brings together relevant places, stays, activities, and conditions; produces a coherent, adjustable plan; helps the user act on it.
5. **User Journey** — The user expresses a travel intention; the assistant helps assemble and organise it; the user refines and proceeds.
6. **AI Responsibilities** — To plan honestly within real constraints, recommend rather than decide, disclose commercial influence, and keep the plan the user's.
7. **Privacy Considerations** — Trip details and preferences are used only to help and handled with privacy-first care.
8. **Relationship with AI** — Composes Planning, Recommendation, Context, and Reasoning.
9. **Relationship with other Features** — Unites Hotel, Attraction, Maps, Weather, Deals, and Groups; shareable through the Sharing family.
10. **Feature Principles** — Reduce the burden of planning; anticipation over anxiety; the plan is the user's; honesty first.
11. **Future Evolution** — Handles richer journeys across more of their parts while keeping the experience simple and calm.

### 3.7 Nearby
1. **Purpose** — To surface what is relevant and worthwhile around the user right now, in the moment they are in.
2. **Feature Vision** — The instant sense of "what's good around me," attuned to the user's immediate situation.
3. **User Value** — Immediate, relevant options in the user's vicinity, without searching, suited to a glance-and-go moment.
4. **Core Capabilities** — Surfaces relevant nearby places and options; grounds them in the user's current location and moment; presents them quickly and simply.
5. **User Journey** — The user wants something close by; the assistant surfaces fitting nearby options; the user chooses on the spot.
6. **AI Responsibilities** — To use location only in context and with permission, recommend in the user's interest, and disclose commercial influence.
7. **Privacy Considerations** — Location is sensitive; used only with contextual permission, only for the immediate help, never retained beyond the user's awareness.
8. **Relationship with AI** — Powered by Context, Recommendation, and Maps.
9. **Relationship with other Features** — Works with Maps, Restaurant, Cafe, Attraction, and Deals; distinct as the "right now, right here" capability.
10. **Feature Principles** — Relevance in the moment; permission-based location; speed and simplicity; user benefit first.
11. **Future Evolution** — Becomes more finely attuned to the immediate moment while holding strictly to permission-based, privacy-respecting behaviour.

### 3.8 Maps
1. **Purpose** — To ground help in real places, giving the user a clear sense of location, surroundings, and how a decision connects to the physical world.
2. **Feature Vision** — The product's connection to real-world place — a calm, trustworthy sense of where things are and where the user is.
3. **User Value** — Decisions grounded in real geography; the reassurance of orientation and the clarity of place.
4. **Core Capabilities** — Represents places and the user's location clearly; connects recommendations and plans to real geography; supports orientation and a sense of surroundings.
5. **User Journey** — The user needs to understand where something is or where they are; the assistant grounds the answer in real place.
6. **AI Responsibilities** — To use location with contextual permission, represent places truthfully, and keep the user oriented and in control.
7. **Privacy Considerations** — Location is among the most sensitive signals; used only with permission, only to help, never exploited.
8. **Relationship with AI** — Grounds Context, Nearby, Recommendation, and Planning in real place.
9. **Relationship with other Features** — Underpins Restaurant, Cafe, Hotel, Attraction, Nearby, and Travel.
10. **Feature Principles** — Ground help in reality; permission-based location; orientation and calm; truthfulness of place.
11. **Future Evolution** — Its understanding of the real world grows richer over time, making help more precise and grounded, always within privacy bounds.

### 3.9 Shopping
1. **Purpose** — To help a person find and choose products, understand their options, and buy with confidence rather than uncertainty.
2. **Feature Vision** — The trusted guide to buying well — what to get, from where, and at what value — without the effort of open-ended searching.
3. **User Value** — Confident purchasing decisions that fit the user's need and budget, with clear, honest information and disclosed commercial influence.
4. **Core Capabilities** — Surfaces relevant products; helps compare options and value; presents honest information; discloses commercial influence; helps the user reach the point of buying.
5. **User Journey** — The user wants to buy something; the assistant helps them find and compare options; the user decides and proceeds toward purchase.
6. **AI Responsibilities** — To recommend in the user's interest, never let affiliate revenue shape quality, disclose commercial relationships plainly, and represent products truthfully.
7. **Privacy Considerations** — Purchase intent and preferences are used only to help and handled with privacy-first care.
8. **Relationship with AI** — Powered by Recommendation, Personalization, and Reasoning.
9. **Relationship with other Features** — Closely tied to Price Tracking, Deals, Coupon, Rewards, and Affiliate; central to the Commerce Ecosystem (cross-referenced there).
10. **Feature Principles** — Buy with confidence; user benefit before revenue; disclose influence; truthfulness of information.
11. **Future Evolution** — Grows more helpful in comparison and personal fit while strengthening its honesty guarantees.

### 3.10 Deals
1. **Purpose** — To surface genuine, worthwhile offers relevant to the user, so they benefit from good value without hunting for it.
2. **Feature Vision** — A cheerful, trustworthy bearer of real good news — value the user actually wants, honestly framed.
3. **User Value** — Relevant savings and opportunities delivered to the user, saving them effort and money, without hype or manipulation.
4. **Core Capabilities** — Surfaces relevant, genuine offers; tailors them to the user; frames value honestly; discloses commercial nature clearly.
5. **User Journey** — A relevant offer reaches the user in a fitting moment; the user understands it clearly and acts if it suits them.
6. **AI Responsibilities** — To surface only genuine value, never manufacture urgency or manipulate, and disclose commercial relationships plainly.
7. **Privacy Considerations** — Personal signals used to tailor offers are handled privately and only to serve the user.
8. **Relationship with AI** — Powered by Recommendation and Personalization.
9. **Relationship with other Features** — Works with Shopping, Restaurant, Travel, Coupon, and Notifications; distinct from Coupon and Rewards.
10. **Feature Principles** — Genuine value only; no hype or manipulation; disclose commercial nature; user benefit first.
11. **Future Evolution** — Grows more relevant and personal while never drifting toward pressure or false scarcity.

### 3.11 Price Tracking
1. **Purpose** — To watch the price of things the user cares about and tell them when the moment to buy is right.
2. **Feature Vision** — A patient, vigilant companion watching over the user's interests so they never overpay or miss a good opportunity.
3. **User Value** — The reassurance of being watched over; the confidence of buying at the right time without constant checking.
4. **Core Capabilities** — Lets the user set what to watch and a target; monitors over time; tells the user when the target is met; shows when it last checked.
5. **User Journey** — The user asks to be told when a price is right; the assistant watches quietly and alerts the user at the right moment.
6. **AI Responsibilities** — To watch reliably, report honestly, communicate recency (last checked), and never manufacture urgency.
7. **Privacy Considerations** — What the user tracks is personal and handled with privacy-first care.
8. **Relationship with AI** — Powered by the assistant's monitoring and Notification capabilities.
9. **Relationship with other Features** — Closely tied to Shopping, Deals, and Notifications; central to the Commerce Ecosystem (cross-referenced there).
10. **Feature Principles** — Vigilance on the user's behalf; honest reporting; patience over pressure; reassurance.
11. **Future Evolution** — Watches more kinds of things more reliably while remaining calm and honest.

### 3.12 Weather
1. **Purpose** — To give the user timely, relevant conditions that inform everyday plans and decisions.
2. **Feature Vision** — A clear, honest read on what to expect, grounding decisions and plans in the reality of the day.
3. **User Value** — Confident everyday planning that accounts for real conditions, without the user having to seek the information out.
4. **Core Capabilities** — Provides relevant current and expected conditions; grounds them in the user's place and moment; surfaces them where they inform a decision.
5. **User Journey** — The user is planning something weather-dependent; the assistant grounds the help in real conditions.
6. **AI Responsibilities** — To present conditions honestly and clearly, and to use them to make help more timely and relevant.
7. **Privacy Considerations** — Location used for conditions is handled with contextual permission and privacy-first care.
8. **Relationship with AI** — Feeds Context, Planning, and Recommendation with real-world conditions.
9. **Relationship with other Features** — Works with Travel, Attraction, Nearby, and Planning; enables weather-aware delight moments.
10. **Feature Principles** — Inform, don't alarm; honesty and clarity; relevance to the moment; grounded in reality.
11. **Future Evolution** — Becomes more precise and contextually useful while staying calm and clear.

### 3.13 Finance
1. **Purpose** — To help the user with the small, everyday money questions of daily life, so they feel informed and in control of their spending.
2. **Feature Vision** — A trustworthy, steadying guide to the everyday costs, prices, and rates people encounter, reducing the anxiety around money.
3. **User Value** — Clarity and confidence in everyday financial questions, delivered simply and honestly.
4. **Core Capabilities** — Helps the user understand everyday costs, prices, and rates; presents information clearly and honestly; supports informed spending decisions.
5. **User Journey** — The user has an everyday money question; the assistant helps them understand it and decide with confidence.
6. **AI Responsibilities** — To present financial information honestly and clearly, avoid overpromising, and support informed decisions rather than steering them.
7. **Privacy Considerations** — Financial context is highly sensitive and handled with the strictest privacy-first care.
8. **Relationship with AI** — Powered by Reasoning, Transparency, and Recommendation.
9. **Relationship with other Features** — Works with Shopping, Price Tracking, and Deals to support value-conscious decisions.
10. **Feature Principles** — Inform and steady; honesty and clarity; strict privacy; support, never steer.
11. **Future Evolution** — Grows more helpful with everyday money questions while holding to the highest standard of honesty and privacy, and never straying into personalised financial advice beyond its remit.

---

## 4. Social Ecosystem

The Social Ecosystem is where TappyAI connects people — to authentic community experience, to one another, and to the things they want to keep and share. Its capabilities carry the immersive, human character of the product's social experience, while remaining bound by the same honesty, privacy, and respect as everything else. Each capability is independent.

### 4.1 Explore
1. **Purpose** — To help people discover what is interesting, popular, or new around them, offering inspiration for their next decision.
2. **Feature Vision** — The trusted lens through which people see the worthwhile world around them, inviting curiosity and serendipity.
3. **User Value** — Effortless discovery of things worth the user's attention, suited to their interests and place.
4. **Core Capabilities** — Surfaces worthwhile and relevant content and places; invites curiosity and browsing; personalises to interests without overwhelming.
5. **User Journey** — The user opens themselves to inspiration; the assistant surfaces relevant, worthwhile discoveries; the user explores and acts on what draws them.
6. **AI Responsibilities** — To surface genuine value fairly, disclose commercial influence, and personalise without manipulation.
7. **Privacy Considerations** — Interest signals used to personalise are handled privately and only to serve the user.
8. **Relationship with AI** — Powered by Recommendation, Personalization, and Context.
9. **Relationship with other Features** — Closely tied to Reviews, Attraction, Nearby, and Deals; feeds discovery across Discovery domains.
10. **Feature Principles** — Reward curiosity; genuine value; fair and unbiased; never overwhelm.
11. **Future Evolution** — Becomes a richer window on the local world while staying calm and honest.

### 4.2 Reviews
1. **Purpose** — To enable authentic, community-driven sharing of real experiences, so decisions can be informed by trustworthy voices and users can contribute their own.
2. **Feature Vision** — The immersive, human heart of the community — real people, real experiences — that people trust and want to be part of.
3. **User Value** — Trustworthy, first-hand insight to inform decisions, and a place to share one's own experiences authentically.
4. **Core Capabilities** — Lets people share genuine experiences; presents community content in an immersive, human way; indicates authenticity and verification; supports engagement with content and its creators.
5. **User Journey** — The user reads authentic experiences to inform a choice, or shares their own; the community's voice informs decisions across the product.
6. **AI Responsibilities** — To surface authentic content honestly, signal verification and generated content clearly, and never manipulate what the community sees.
7. **Privacy Considerations** — What a person shares is theirs; contribution is consensual, and personal data is protected.
8. **Relationship with AI** — Informs Recommendation and Explore with community insight; the assistant may help surface and summarise it honestly.
9. **Relationship with other Features** — Feeds Explore and Discovery; connects to Profile, Reputation, Trust, and the Sharing family.
10. **Feature Principles** — Authenticity above all; trustworthy voices; consensual contribution; honesty of signals.
11. **Future Evolution** — Grows as a trusted community while raising its standards of authenticity and integrity.

### 4.3 Groups
1. **Purpose** — To help people decide together, reconciling different preferences, budgets, and constraints into a choice the group is happy with.
2. **Feature Vision** — The effortless way for friends, family, or colleagues to reach a shared decision without friction or awkwardness.
3. **User Value** — A group decision reached fairly and easily, sparing everyone the usual back-and-forth.
4. **Core Capabilities** — Lets a group express individual preferences and constraints; helps reconcile them into a fitting shared choice; keeps the process fair and simple; supports coordinating around the outcome.
5. **User Journey** — People join a shared decision and contribute their preferences; the assistant helps the group converge on a choice everyone is comfortable with.
6. **AI Responsibilities** — To reconcile preferences fairly, represent everyone honestly, and recommend rather than impose.
7. **Privacy Considerations** — Individuals' preferences within a group are handled respectfully and only for the shared purpose.
8. **Relationship with AI** — Powered by Recommendation, Reasoning, and Planning.
9. **Relationship with other Features** — Works with Food, Restaurant, Travel, Attraction, and Planning; connects to shared cost coordination and the Sharing family.
10. **Feature Principles** — Decide together fairly; reduce friction; represent everyone; recommend, don't impose.
11. **Future Evolution** — Handles richer group coordination while keeping the experience simple and fair.

### 4.4 Sharing
1. **Purpose** — To let people pass along what they find, plan, and experience in TappyAI, so value travels between people.
2. **Feature Vision** — Sharing that feels effortless, honest, and premium — a natural extension of finding something worth passing on.
3. **User Value** — The user can easily share something useful or delightful with others, strengthening their connections.
4. **Core Capabilities** — Lets the user share content, places, plans, and profiles; ensures shared items represent themselves honestly wherever they land; respects the user's control over what is shared.
5. **User Journey** — The user finds something worth sharing; they share it simply; the recipient receives it in a clear, appealing, trustworthy form.
6. **AI Responsibilities** — To ensure shared content is represented honestly and to never exploit sharing for growth at the user's expense.
7. **Privacy Considerations** — Sharing is always the user's choice; nothing is shared without intent, and the user's connections are never exploited.
8. **Relationship with AI** — The assistant may help the user share the right thing at the right moment, gently.
9. **Relationship with other Features** — The umbrella over Native Share, Rich Link Preview, QR Profile, and Invite; connects to Reviews, Travel, Planning, and Profile.
10. **Feature Principles** — Effortless and honest; the user's choice always; never exploit connections; premium simplicity.
11. **Future Evolution** — Sharing becomes richer and more seamless while remaining honest and user-controlled.

### 4.5 Native Share
1. **Purpose** — To let people share through the familiar, trusted sharing experience of their own device.
2. **Feature Vision** — Sharing that feels native and effortless because it uses the conventions the user already knows.
3. **User Value** — The user shares without learning anything new, using the trusted mechanism of their device.
4. **Core Capabilities** — Hands sharing to the device's own trusted sharing experience; presents shared items cleanly; respects platform conventions.
5. **User Journey** — The user chooses to share; the familiar device sharing experience appears; they complete it as they always do.
6. **AI Responsibilities** — Minimal and indirect; ensures what is handed off is honest and well-formed.
7. **Privacy Considerations** — Sharing occurs through the user's own trusted device flow, under their control.
8. **Relationship with AI** — Not AI-driven; supports the assistant's help in sharing the right thing.
9. **Relationship with other Features** — A mechanism within Sharing; works with Rich Link Preview.
10. **Feature Principles** — Native and familiar; effortless; user-controlled; respect conventions.
11. **Future Evolution** — Stays aligned with evolving platform sharing conventions, always feeling native.

### 4.6 Rich Link Preview
1. **Purpose** — To ensure that anything shared from TappyAI presents itself richly and honestly wherever it arrives.
2. **Feature Vision** — Every shared piece of TappyAI looks considered, appealing, and trustworthy in the world beyond the product.
3. **User Value** — What the user shares looks good and represents accurately, reflecting well on them and drawing genuine interest.
4. **Core Capabilities** — Presents shared links richly and accurately; represents the destination honestly; looks premium wherever it lands.
5. **User Journey** — The user shares a link; it appears elsewhere as a clear, appealing, accurate preview; recipients understand what it leads to.
6. **AI Responsibilities** — To ensure previews represent content truthfully and never mislead.
7. **Privacy Considerations** — Previews reveal only what the user intends to share.
8. **Relationship with AI** — Indirect; ensures honest representation of AI-surfaced content.
9. **Relationship with other Features** — A mechanism within Sharing; works with Native Share and Deep Links.
10. **Feature Principles** — Honest representation; premium and appealing; accuracy; never mislead.
11. **Future Evolution** — Grows richer and more accurate while always representing content truthfully.

### 4.7 QR Profile
1. **Purpose** — To let a person share their identity in the physical world simply and gracefully, making in-person connection effortless.
2. **Feature Vision** — A premium, frictionless way to connect with someone face to face, bridging the physical and the digital.
3. **User Value** — The user can share who they are in person instantly, without typing or searching.
4. **Core Capabilities** — Represents the user's identity for effortless in-person sharing; connects two people quickly and gracefully; respects the user's control over their identity.
5. **User Journey** — Two people meet; one presents their profile identity; the other receives it instantly and a connection is made.
6. **AI Responsibilities** — Minimal; ensures identity is represented honestly and shared only with intent.
7. **Privacy Considerations** — Identity is shared only when the user chooses; the user controls what their profile reveals.
8. **Relationship with AI** — Not AI-driven; part of the user's identity and sharing experience.
9. **Relationship with other Features** — A mechanism within Sharing; connects to Profile, Identity, and Invite.
10. **Feature Principles** — Effortless in-person connection; user-controlled identity; premium simplicity; privacy respected.
11. **Future Evolution** — Becomes an even smoother bridge to real-world connection while keeping identity in the user's control.

### 4.8 Invite
1. **Purpose** — To let a person bring others into TappyAI or into a shared activity, warmly and respectfully.
2. **Feature Vision** — Inviting someone feels like a friendly gesture, never like spam or pressure.
3. **User Value** — The user can easily bring friends into the product or into a shared decision, strengthening their experience together.
4. **Core Capabilities** — Lets the user invite others simply; makes invitations warm and respectful of both parties; supports joining a shared activity gracefully.
5. **User Journey** — The user invites someone; the invitee receives a warm, clear invitation; they join easily if they choose.
6. **AI Responsibilities** — Minimal and indirect; ensures invitations are honest and never manipulative.
7. **Privacy Considerations** — The user's social connections are never exploited; invitations are always the user's deliberate choice.
8. **Relationship with AI** — Not AI-driven; supports shared experiences the assistant helps coordinate.
9. **Relationship with other Features** — A mechanism within Sharing; connects to Groups and QR Profile.
10. **Feature Principles** — A friendly gesture, never spam; user's choice always; never exploit connections; respect the invitee.
11. **Future Evolution** — Invitation becomes smoother while remaining warm, respectful, and free of pressure.

### 4.9 Bookmarks
1. **Purpose** — To let the user mark content and items they want to return to, so nothing worth revisiting is lost.
2. **Feature Vision** — A dependable way to set something aside and find it again later, effortlessly.
3. **User Value** — The user never loses track of something they wanted to come back to.
4. **Core Capabilities** — Lets the user mark items to revisit; keeps them easy to find; distinguishes a reference mark from a preference signal.
5. **User Journey** — The user finds something worth returning to and bookmarks it; later, they find it again easily.
6. **AI Responsibilities** — Minimal; the assistant may help retrieve or organise bookmarked items honestly.
7. **Privacy Considerations** — What the user bookmarks is private and used only to serve them.
8. **Relationship with AI** — Lightly supported; retrieval may be assisted.
9. **Relationship with other Features** — Distinct from Favorites and Saved; contributes to the Saved collection; works with Reviews, Explore, and Discovery.
10. **Feature Principles** — Never lose what matters; effortless retrieval; a reference, not a preference; private.
11. **Future Evolution** — Becomes easier to organise and retrieve while staying simple.

### 4.10 Favorites
1. **Purpose** — To let the user mark the places and things they love, expressing preference and making them easy to return to.
2. **Feature Vision** — A personal set of the user's genuine likes, that both serves them directly and helps the assistant understand them.
3. **User Value** — The user keeps their loved places and things close, and is understood better because of them.
4. **Core Capabilities** — Lets the user mark things they love; keeps favourites easy to reach; treats a favourite as a genuine preference signal, with the user's awareness.
5. **User Journey** — The user favourites something they love; it stays easy to return to, and quietly informs how the assistant helps them.
6. **AI Responsibilities** — To treat favourites as a preference signal transparently and only to serve the user, never to manipulate.
7. **Privacy Considerations** — Favourites reveal preference and are handled with privacy-first care; their use in personalization is transparent.
8. **Relationship with AI** — Feeds Personalization, Recommendation, and Memory, transparently.
9. **Relationship with other Features** — Distinct from Bookmarks and Saved; contributes to the Saved collection; informs Personalization and Discovery.
10. **Feature Principles** — Keep what you love close; a preference signal used transparently; private; never manipulate.
11. **Future Evolution** — Becomes a richer expression of genuine preference while holding to transparency and privacy.

### 4.11 Saved
1. **Purpose** — To give the user one personal home for everything they have kept — their library across all kinds of saved things.
2. **Feature Vision** — A single, calm place where the user's kept content, favourites, and references live together and are easy to find.
3. **User Value** — The user has one dependable place to find everything they have set aside, of any kind.
4. **Core Capabilities** — Brings together the user's saved items across types; keeps them organised and easy to find; provides one coherent personal collection.
5. **User Journey** — The user wants something they kept; they go to their saved collection and find it, whatever kind it is.
6. **AI Responsibilities** — The assistant may help organise and retrieve saved items honestly and only to serve the user.
7. **Privacy Considerations** — The saved collection is deeply personal and handled with privacy-first care.
8. **Relationship with AI** — Lightly supported; retrieval and organisation may be assisted.
9. **Relationship with other Features** — The home that unifies Bookmarks and Favorites; connects to Profile and Discovery.
10. **Feature Principles** — One calm home for what's kept; effortless retrieval; the user's own library; private.
11. **Future Evolution** — Becomes a more capable personal library while staying simple and private.

---

## 5. Entertainment Ecosystem

The Entertainment Ecosystem helps people find things to enjoy — in the world and within the product — adding warmth and lightness to the relationship with the assistant. Each capability is independent and bound by the same honesty and respect as the rest of the product.

### 5.1 Games
1. **Purpose** — To offer light, enjoyable moments inside the product that add warmth and delight, reinforcing Tappy as a companion rather than a mere utility.
2. **Feature Vision** — Simple, tasteful moments of play that make the product feel human and joyful, never demanding or manipulative.
3. **User Value** — A little delight and relaxation, offered freely and without pressure to keep playing.
4. **Core Capabilities** — Offers enjoyable, self-contained play within the product; keeps it light and optional; presents it with the brand's playful character.
5. **User Journey** — The user chooses a moment of play; they enjoy it; they leave freely whenever they wish.
6. **AI Responsibilities** — Minimal; the assistant never pressures play or uses it to manufacture engagement.
7. **Privacy Considerations** — Play requires little personal data; what is involved is handled with care.
8. **Relationship with AI** — Largely independent of the assistant; part of the brand's warmth.
9. **Relationship with other Features** — Connects to the brand experience and delight moments; independent of the utility domains.
10. **Feature Principles** — Delight, never addiction; optional and light; never manufacture engagement; tasteful.
11. **Future Evolution** — Stays a small, joyful, high-quality offering; never grows into an attention trap.

### 5.2 Music
1. **Purpose** — To help people discover and enjoy music, and to let music enrich their moments and the content they share.
2. **Feature Vision** — Music woven warmly into the experience — as something to enjoy and as a way to give feeling to shared moments.
3. **User Value** — The pleasure of music, and the ability to make shared content feel more human and expressive.
4. **Core Capabilities** — Helps people discover and enjoy music; lets music accompany and enrich shared moments and content; presents it simply.
5. **User Journey** — The user discovers or chooses music to enjoy or to accompany something they share; the experience is richer for it.
6. **AI Responsibilities** — To help surface fitting music honestly, respecting rights and the user's intent.
7. **Privacy Considerations** — Musical taste is a preference signal handled with privacy-first care.
8. **Relationship with AI** — Lightly supported by Recommendation and Personalization.
9. **Relationship with other Features** — Enriches Reviews and Sharing; connects to Explore.
10. **Feature Principles** — Enrich the moment; respect rights; simplicity; honesty.
11. **Future Evolution** — Becomes a richer part of expression and enjoyment while staying simple and respectful.

### 5.3 Movies
1. **Purpose** — To help people decide what to watch and discover films worth their time.
2. **Feature Vision** — A trustworthy guide to what is worth watching, suited to the user's taste and mood.
3. **User Value** — A satisfying viewing decision reached without endless browsing.
4. **Core Capabilities** — Surfaces relevant films and viewing options; tailors to taste and mood; presents honest information; helps the user decide.
5. **User Journey** — The user wonders what to watch; the assistant suggests fitting options; the user chooses.
6. **AI Responsibilities** — To recommend in the user's interest, honestly, and disclose any commercial influence.
7. **Privacy Considerations** — Viewing taste is a preference signal handled with privacy-first care.
8. **Relationship with AI** — Powered by Recommendation and Personalization.
9. **Relationship with other Features** — Connects to Explore, Entertainment, and Events.
10. **Feature Principles** — Decide with confidence; fit the person; honesty first; respect time.
11. **Future Evolution** — Grows more attuned to taste while staying simple and honest.

### 5.4 Events
1. **Purpose** — To help people discover things happening around them worth attending.
2. **Feature Vision** — A window on what is happening nearby, inviting people into worthwhile experiences.
3. **User Value** — Timely discovery of events that fit the user's interests and situation.
4. **Core Capabilities** — Surfaces relevant events; grounds them in place and time; tailors to interests; helps the user act.
5. **User Journey** — The user wants something to do; the assistant surfaces fitting events; the user chooses and proceeds.
6. **AI Responsibilities** — To surface events honestly and fairly, and disclose any commercial influence.
7. **Privacy Considerations** — Interest and location signals are used only to help, with privacy-first care.
8. **Relationship with AI** — Powered by Recommendation, Context, and Personalization.
9. **Relationship with other Features** — Connects to Explore, Attraction, Nearby, Weather, and Groups.
10. **Feature Principles** — Timely and relevant; honesty first; fit the person; respect time.
11. **Future Evolution** — Becomes a richer, more local window on what's happening while staying calm and honest.

---

## 6. User Ecosystem

The User Ecosystem defines the capabilities that concern the person themselves — who they are, how they are represented, what they have chosen and done, how they are trusted and regarded, how they are reached, and how the product includes and speaks to them. These capabilities carry the strictest obligations of privacy, control, and respect. Several are cross-cutting; where a section of the standard frame does not naturally apply, its intent is preserved and noted.

### 6.1 Identity
1. **Purpose** — To give each person one secure, coherent identity across the entire ecosystem.
2. **Feature Vision** — A single, trustworthy sense of "who I am to TappyAI" that carries across every surface and platform.
3. **User Value** — The user is known consistently and securely, with one identity and one relationship, wherever they are.
4. **Core Capabilities** — Establishes and secures the user's identity; carries it consistently across surfaces; keeps the user in control of it.
5. **User Journey** — The user establishes their identity once and is known securely and consistently thereafter.
6. **AI Responsibilities** — To treat identity securely and never act beyond the user's authenticated intent.
7. **Privacy Considerations** — Identity is foundational and protected with the highest care; the user controls it and it is never exploited.
8. **Relationship with AI** — Grounds Memory, Personalization, and every personal capability in a secure sense of who the user is.
9. **Relationship with other Features** — Underpins Profile, Membership, Preferences, History, and the whole personal experience.
10. **Feature Principles** — One coherent identity; secure by default; user-controlled; never exploited.
11. **Future Evolution** — Extends seamlessly across more surfaces while raising, never lowering, its security and control.

### 6.2 Profile
1. **Purpose** — To give the user a calm, respectful home for their presented self, their activity, and control over their information.
2. **Feature Vision** — A dignified personal space that represents the user and puts them in control of how they appear and what they share.
3. **User Value** — The user has a clear home for who they are and genuine control over their presence and data.
4. **Core Capabilities** — Presents the user's identity and activity; gives access to their information and controls; lets them shape how they are represented.
5. **User Journey** — The user visits their profile to see and manage who they are, what they've done, and what they share.
6. **AI Responsibilities** — To present the user's information honestly and keep them in control of it.
7. **Privacy Considerations** — The profile is a primary place of user control over personal data; privacy and control are paramount.
8. **Relationship with AI** — Lightly supported; reflects the personal understanding the assistant holds, transparently.
9. **Relationship with other Features** — Connects to Identity, Reputation, Reviews, Saved, Preferences, and Settings.
10. **Feature Principles** — Dignified representation; user control; transparency; privacy first.
11. **Future Evolution** — Becomes a richer home for identity and control while staying calm and respectful.

### 6.3 Membership
1. **Purpose** — To offer an elevated level of the experience for users who want a deeper, more capable relationship with their assistant.
2. **Feature Vision** — A premium relationship that sustains the product through value users are glad to give, aligning the business with user satisfaction.
3. **User Value** — More from the assistant for those who choose it, offered with warmth, honesty, and clarity, and easy to leave.
4. **Core Capabilities** — Provides an elevated experience and capability for members; presents its value plainly; never pressures; is easy to understand, join, and leave.
5. **User Journey** — The user chooses a deeper relationship; they receive elevated value; they remain in full, easy control of it.
6. **AI Responsibilities** — To deliver genuine added value honestly, never manipulate toward upgrade, and never degrade the non-member experience to coerce it.
7. **Privacy Considerations** — Membership and payment context are sensitive and handled with the strictest care.
8. **Relationship with AI** — May unlock deeper AI capability; the assistant never manipulates to sell it.
9. **Relationship with other Features** — Deepens the Memory and Personalization relationship; connects to Rewards and the value-aligned business model.
10. **Feature Principles** — Value users are glad to give; never pressure; never coerce; easy to leave.
11. **Future Evolution** — Its value deepens while the relationship stays honest, warm, and entirely the user's choice.

### 6.4 Preferences
1. **Purpose** — To let the user explicitly tell the assistant their tastes, needs, and constraints, so help fits them by their own direction.
2. **Feature Vision** — A clear, direct way for the user to shape how they are understood and served.
3. **User Value** — The user can directly control how the product fits them, complementing what the assistant learns.
4. **Core Capabilities** — Lets the user state tastes, needs, and constraints; applies them across the experience; keeps them easy to review and change.
5. **User Journey** — The user sets their preferences; the experience adapts to them; they adjust whenever they wish.
6. **AI Responsibilities** — To honour stated preferences faithfully and use them transparently to serve the user.
7. **Privacy Considerations** — Preferences are personal and handled with privacy-first care; their use is transparent.
8. **Relationship with AI** — Directly informs Personalization, Recommendation, and Memory.
9. **Relationship with other Features** — Complements Favorites and Memory; shapes Discovery, Explore, and Notifications.
10. **Feature Principles** — The user directs the fit; honour what's stated; transparency; easy to change.
11. **Future Evolution** — Becomes a richer, clearer way to shape the experience while staying simple.

### 6.5 History
1. **Purpose** — To keep a record of the user's past activity and conversations, so they can return to what they've done.
2. **Feature Vision** — A dependable, private record that lets the user revisit and continue their past interactions effortlessly.
3. **User Value** — The user never loses their past work; they can return to and build on earlier conversations and activity.
4. **Core Capabilities** — Preserves past activity and conversations; makes them easy to find and continue; keeps them under the user's control.
5. **User Journey** — The user returns to something they did before; they find it and continue seamlessly.
6. **AI Responsibilities** — To preserve history accurately and support continuity, only ever to serve the user.
7. **Privacy Considerations** — History is deeply personal; it is private, controllable, and erasable by the user.
8. **Relationship with AI** — Supports Conversation Continuity and Memory.
9. **Relationship with other Features** — Connects to Chat, Profile, and Saved.
10. **Feature Principles** — Never lose the user's past; continuity; private and controllable; the user's record.
11. **Future Evolution** — Becomes easier to navigate and continue while remaining private and under the user's control.

### 6.6 Trust
1. **Purpose** — To build and protect the user's justified confidence that TappyAI is honest, dependable, and on their side.
2. **Feature Vision** — Trust as a designed, visible property of the product — earned continually and never assumed.
3. **User Value** — The user can rely on the product for real decisions because its trustworthiness is made evident and continually upheld.
4. **Core Capabilities** — Makes truth visible through honest signals (confidence, sources, disclosure, data and memory use); upholds honest behaviour everywhere; gives the user control and clarity.
5. **User Journey** — Throughout every interaction, the user is given the means to see and verify that the product is acting honestly in their interest.
6. **AI Responsibilities** — To uphold the MPS Non-Negotiables and AI Decision Principles that make trust real, and never to imply an unearned trustworthiness.
7. **Privacy Considerations** — Trust and privacy are inseparable; protecting data and being transparent about it is central to trust.
8. **Relationship with AI** — A property required of every AI capability; expressed through Transparency and Safety.
9. **Relationship with other Features** — Underpins every feature; made visible through the MUXS Trust Signals; connects to Reputation and Reviews.
10. **Feature Principles** — Earned, never assumed; make truth visible; honesty always; trust before all.
11. **Future Evolution** — Standards of trust only rise; they are never relaxed for growth or convenience.

### 6.7 Reputation
1. **Purpose** — To reflect a person's standing in the community fairly, based on their genuine contributions.
2. **Feature Vision** — A fair, honest reflection of a person's authentic contribution to the community, resistant to gaming and manipulation.
3. **User Value** — Genuine contributors are recognised fairly, and the community can weigh voices honestly.
4. **Core Capabilities** — Reflects a person's authentic community contribution; presents standing honestly; resists manipulation and false signals.
5. **User Journey** — As the user contributes authentically, their standing reflects it fairly; others can weigh their voice accordingly.
6. **AI Responsibilities** — To reflect reputation honestly and resist manipulation, never inflating or distorting standing.
7. **Privacy Considerations** — Reputation is presented respectfully and only from what the user has chosen to contribute.
8. **Relationship with AI** — Lightly supported; the assistant helps surface authentic contribution honestly.
9. **Relationship with other Features** — Connects to Reviews, Profile, and Trust.
10. **Feature Principles** — Fair and authentic; resistant to gaming; honest reflection; respectful.
11. **Future Evolution** — Becomes a fairer, more meaningful reflection of genuine contribution while resisting manipulation.

### 6.8 Notifications
1. **Purpose** — To tell the user something genuinely worth their attention, in a way that respects them.
2. **Feature Vision** — Notifications the user welcomes, because each one is relevant, respectful, and worth the interruption.
3. **User Value** — The user learns what matters to them without being pestered; every notification earns its place.
4. **Core Capabilities** — Delivers relevant, timely, respectful messages; each is worth the interruption; the user controls what they receive.
5. **User Journey** — The user is told something they care about at a fitting moment, and understands why they are being told.
6. **AI Responsibilities** — To notify only when genuinely worth it, never to manufacture engagement or interrupt unnecessarily.
7. **Privacy Considerations** — Notification content respects the user's privacy and is under their control.
8. **Relationship with AI** — Powered by the assistant's judgement of relevance and timing.
9. **Relationship with other Features** — Delivers value from Price Tracking, Deals, Groups, and Reviews; expressed also through Push Notifications.
10. **Feature Principles** — Earn every interruption; relevance and respect; user control; never manufacture engagement.
11. **Future Evolution** — Becomes more relevant and respectful while never becoming more frequent for its own sake.

### 6.9 Push Notifications
1. **Purpose** — To reach the user with something worth their attention even when they are not in the product.
2. **Feature Vision** — A respectful, welcome tap on the shoulder — carrying the friendly Tappy identity — only when it is genuinely warranted.
3. **User Value** — The user is kept informed of what matters to them at the right moment, without being in the product, and without being pestered.
4. **Core Capabilities** — Delivers genuinely worthwhile messages to the user's device; carries the brand identity; is fully under the user's permission and control.
5. **User Journey** — Something worth knowing occurs; the user receives a respectful, clear notification; they act on it if they wish.
6. **AI Responsibilities** — To reach out only when genuinely warranted, and never to intrude or manufacture urgency.
7. **Privacy Considerations** — Delivery to the device is permission-based and privacy-respecting; content is handled with care.
8. **Relationship with AI** — Powered by the assistant's judgement of what genuinely warrants reaching out.
9. **Relationship with other Features** — The out-of-product expression of Notifications; carries the brand's spoken sound identity.
10. **Feature Principles** — Only when warranted; permission-based; respectful and clear; never intrude.
11. **Future Evolution** — Becomes more precisely warranted while holding strictly to permission and restraint.

### 6.10 Accessibility
1. **Purpose** — To ensure the product is usable by as many people as possible, in as many situations as possible.
2. **Feature Vision** — A product that includes people by default, treating accessibility as a first condition of good design rather than an addition.
3. **User Value** — Every person can use TappyAI comfortably, regardless of ability or situation.
4. **Core Capabilities** — Upholds inclusive design across the product — perceivable, operable, and understandable for all — consistent with the MUXS Accessibility principles. *(This is a cross-cutting capability; its behaviour is a property of every feature rather than a standalone flow.)*
5. **User Journey** — *(Cross-cutting.)* Whatever the user's abilities or situation, every journey in the product remains usable and comprehensible to them.
6. **AI Responsibilities** — To communicate in ways that are perceivable and understandable to all, and never to make ability a barrier to help.
7. **Privacy Considerations** — Accessibility needs are treated with dignity and never exposed or used against the user.
8. **Relationship with AI** — A requirement on how every AI capability presents itself.
9. **Relationship with other Features** — A property of every feature in every ecosystem.
10. **Feature Principles** — Inclusion by default; a first condition, not an addition; dignity; usable by all.
11. **Future Evolution** — Accessibility standards only strengthen; inclusion widens over time.

### 6.11 Multi-language
1. **Purpose** — To let people use TappyAI in the language they are most comfortable with, while honouring the product's authentic local depth.
2. **Feature Vision** — A product that meets each person in their own language, without diluting its deep, native Vietnamese understanding.
3. **User Value** — Every person can be understood and helped in the language that suits them best.
4. **Core Capabilities** — Supports interaction in more than one language; preserves authentic local understanding; lets the user choose their language. *(Cross-cutting capability, present across the product.)*
5. **User Journey** — *(Cross-cutting.)* The user interacts in their preferred language and is understood and helped naturally throughout.
6. **AI Responsibilities** — To understand and respond naturally in the user's language, and never to lose local nuance or honesty in translation.
7. **Privacy Considerations** — Language preference is a benign setting under the user's control.
8. **Relationship with AI** — A property of how the assistant understands and communicates.
9. **Relationship with other Features** — A property of every feature; connects to Preferences.
10. **Feature Principles** — Meet the user in their language; preserve local depth; the user chooses; never lose nuance.
11. **Future Evolution** — Supports more languages naturally while keeping authentic local understanding at its core.

---

## 7. Commerce Ecosystem

The Commerce Ecosystem is where TappyAI connects people with the services and value they choose. It is governed by one overriding rule from the MPS: commerce serves the user, never the reverse. Any commercial capability must be honest, clearly disclosed, and strictly forbidden from influencing the quality or impartiality of the assistant's help. Each capability is independent.

### 7.1 Affiliate
1. **Purpose** — To let TappyAI connect users with services they choose in a way that can sustain the product, without ever compromising the integrity of its help.
2. **Feature Vision** — A commercial relationship that is entirely honest and transparent — present only where it genuinely helps the user, and never at the expense of trust.
3. **User Value** — The user benefits from being connected to the services they want, with full honesty about any commercial relationship behind that connection.
4. **Core Capabilities** — Connects users to chosen services; clearly discloses any commercial relationship; keeps commercial influence entirely separate from recommendation quality and ranking.
5. **User Journey** — The user decides to act on something; where a commercial relationship exists, it is disclosed plainly, and the user proceeds with full awareness.
6. **AI Responsibilities** — To never let affiliate revenue influence what is recommended or how it is ranked, to disclose commercial relationships plainly, and to keep the user's interest paramount.
7. **Privacy Considerations** — Commercial connections never involve exploiting or selling the user's data.
8. **Relationship with AI** — Strictly walled off from Recommendation quality; the assistant recommends only in the user's interest.
9. **Relationship with other Features** — Present behind Shopping, Deals, Restaurant, Hotel, and Travel; always disclosed via Trust Signals.
10. **Feature Principles** — Revenue never influences quality; always disclosed; user interest paramount; honesty over conversion.
11. **Future Evolution** — May grow as a sustaining model only insofar as it never compromises trust, disclosure, or impartiality.

### 7.2 Coupon
1. **Purpose** — To give users genuine, usable savings on things they want, honestly presented.
2. **Feature Vision** — Real, worthwhile savings offered as a genuine benefit, never as bait or manipulation.
3. **User Value** — The user saves money on things they actually want, with clear, honest terms.
4. **Core Capabilities** — Surfaces genuine, applicable savings; presents terms clearly and honestly; discloses commercial nature.
5. **User Journey** — A relevant saving reaches the user; they understand its real terms; they use it if it suits them.
6. **AI Responsibilities** — To surface only genuine savings, present terms honestly, and never manufacture urgency or mislead.
7. **Privacy Considerations** — Personal signals used to tailor savings are handled privately and only to serve the user.
8. **Relationship with AI** — Powered by Recommendation and Personalization.
9. **Relationship with other Features** — Works with Shopping, Deals, and Rewards; distinct from each.
10. **Feature Principles** — Genuine savings only; honest terms; no manipulation; user benefit first.
11. **Future Evolution** — Becomes more relevant and personal while never drifting toward pressure or deception.

### 7.3 Rewards
1. **Purpose** — To recognise and give back to users for their genuine, ongoing relationship with TappyAI.
2. **Feature Vision** — A warm, honest expression of appreciation that strengthens the relationship without manufacturing compulsive behaviour.
3. **User Value** — The user is genuinely appreciated and benefits from their relationship with the product, without being manipulated into engagement.
4. **Core Capabilities** — Recognises genuine ongoing use and contribution; offers real, honest benefit; avoids compulsive or manipulative mechanics.
5. **User Journey** — Through their genuine relationship with the product, the user receives real, welcome recognition and benefit.
6. **AI Responsibilities** — To reward genuine value honestly and never to weaponise rewards to manufacture engagement or dependency.
7. **Privacy Considerations** — Reward-related data is handled with privacy-first care.
8. **Relationship with AI** — Lightly supported; recognises the relationship the assistant builds.
9. **Relationship with other Features** — Connects to Membership and the value-aligned business model; distinct from Coupon and Deals.
10. **Feature Principles** — Genuine appreciation; never manufacture compulsion; honesty; strengthen the relationship.
11. **Future Evolution** — Deepens as genuine recognition while never becoming an engagement-manipulation mechanic.

### 7.4 Commerce Cross-References
Two capabilities central to commerce are defined authoritatively in the Discovery Ecosystem, because their primary purpose is discovery and decision, and are referenced here to complete the commerce picture without duplication:

- **Shopping** (see [3.9](#39-shopping)) — the discovery, comparison, and purchase-decision capability at the core of commerce. Its commercial dimensions (Affiliate, Coupon, Rewards) attach to it here, always under full disclosure and never influencing recommendation quality.
- **Price Tracking** (see [3.11](#311-price-tracking)) — the capability that watches prices and tells the user when to buy. It serves commerce by protecting the user's value and timing, always on the user's side.

Each remains a single, independent feature with one authoritative chapter; this section situates them within commerce without redefining them.

---

## 8. Feature Relationships

TappyAI is an ecosystem, not a collection of modules, because its capabilities cooperate. A single expressed intent may quietly draw on many features, unified by one assistant, one memory of the user, and one consistent standard of behaviour. The relationships below are permanent; they describe how the whole works together.

- **AI Chat ↔ everything** — Chat is the gateway through which every capability is reached and composed. The user never chooses a module; they express intent, and the relevant features cooperate behind the assistant.
- **AI Memory ↔ AI Chat** — Memory makes every conversation personal and continuous, so the user is understood without repeating themselves.
- **AI Context ↔ Nearby / Maps / Weather** — Situational awareness is grounded in real place, surroundings, and conditions, making help timely.
- **Food ↔ Maps** — A decision about what and where to eat is grounded in real place, so a choice connects to the physical world.
- **Restaurant / Cafe / Hotel / Attraction ↔ Nearby ↔ Maps** — Discovery of places is grounded in the user's location and surroundings.
- **Shopping ↔ Price Tracking** — The user chooses what to buy, then is told when the price is right to buy it.
- **Shopping ↔ Deals ↔ Coupon ↔ Affiliate** — Value and honest, disclosed commerce gather around a purchase decision, never influencing its quality.
- **Groups ↔ shared cost coordination (bill splitting)** — A group decides together, then shares the resulting costs fairly and simply.
- **Groups ↔ Food / Travel / Planning** — Shared decisions reach across domains into a single outcome everyone is comfortable with.
- **Explore ↔ Reviews** — Discovery is enriched by authentic community experience; what people genuinely share informs what others discover.
- **Reviews ↔ Reputation ↔ Trust** — Authentic voices are fairly regarded and honestly signalled, so community input can be weighed with confidence.
- **Travel ↔ Weather ↔ Hotel ↔ Attraction ↔ Planning** — A journey is assembled from many capabilities into one coherent, adjustable plan.
- **Membership ↔ Premium AI** — A deeper relationship with the assistant is offered to those who choose it, rewarding and extending Memory and Personalization honestly.
- **Notifications / Push Notifications ↔ Price Tracking / Deals / Groups / Reviews** — The product reaches out only to deliver genuine value the user cares about, and only when it is worth the interruption.
- **Favorites / Bookmarks ↔ Saved** — Everything the user keeps is unified in one personal library, while Favorites additionally, and transparently, informs Personalization.
- **Preferences ↔ Personalization ↔ Recommendation** — The user directs how they are understood, and that direction shapes the help they receive.

The unifying truth is that no feature stands alone. Each is independent in definition but cooperative in practice, and the compounding value of TappyAI is that all of them share the same assistant, the same understanding of the person, and the same unbreakable commitment to the user's interest.

---

## 9. Feature Decision Tree

This is the permanent decision hierarchy for every feature choice in TappyAI. When two feature directions conflict, the one that better serves the **higher priority always wins**; a lower priority may never override a higher one.

1. **User Value** — Whether the feature genuinely helps the user with a real need. Nothing that fails here is worth building, whatever else it offers.
2. **Product Vision** — Whether it belongs to what TappyAI is trying to become, as defined by the Master Product Specification. A valuable idea that does not fit the vision is not built.
3. **User Trust** — Whether it preserves the user's confidence that TappyAI is honest and on their side. Trust is never traded for value or vision.
4. **Simplicity** — Whether it keeps the product simple for the user. Between two trustworthy, on-vision, valuable options, the simpler wins.
5. **Long-term Maintainability** — Whether it keeps the product coherent, dependable, and healthy over years, rather than adding lasting burden or fragility.
6. **Revenue** — Whether it sustains the business. Revenue is a genuine consideration, but it is the *last* one, and it never overrides any priority above it.

**Reconciliation with the constitutions:** This tree operates entirely beneath the MPS Non-Negotiable Rules and AI Decision Principles, which are absolute floors, not priorities to be weighed. Trust and honesty may never be violated at all — so "User Value first" means choosing the most valuable option *among those that already honour the non-negotiables*. A feature that would breach trust, honesty, privacy, or user control is not low-priority; it is disqualified before the tree is even applied. Within those absolute bounds, this order governs how competing, legitimate feature directions are resolved.

---

## 10. Feature Evolution Model

Every capability in TappyAI moves through a permanent lifecycle. The model exists so that ideas are validated before they are trusted, and so that a capability earns its permanence rather than assuming it. Each stage has a distinct purpose.

- **Idea** — A possibility is proposed. Its purpose is to capture intent and a hypothesis about a real user need worth exploring.
- **Discovery** — The need behind the idea is investigated and understood. Its purpose is to learn whether a genuine, worthwhile problem exists before any effort is committed to solving it.
- **Validation** — The idea is tested against reality and against the constitutions. Its purpose is to confirm that the need is real, that a solution would genuinely help, and that it belongs in TappyAI.
- **Prototype** — A minimal expression of the idea is shaped to learn from. Its purpose is to make the concept tangible enough to evaluate, without commitment to permanence.
- **MVP** — The smallest version that delivers real value is brought to users. Its purpose is to learn from genuine use whether the capability truly helps, at the least cost and risk. *(Named here as a lifecycle stage only.)*
- **Iteration** — The capability is refined through what real use teaches. Its purpose is to improve value, simplicity, and trustworthiness until the capability is genuinely good.
- **Core Feature** — The capability has proven its value and is established as a dependable part of the product. Its purpose is to serve reliably as something users can count on.
- **Platform Feature** — The capability becomes something other capabilities build upon and cooperate with. Its purpose is to strengthen the whole ecosystem, not only its own surface.
- **Permanent Capability** — The capability is established as an enduring part of what TappyAI is. Its purpose is to be maintained and honoured for the long term, changeable only with the same deliberation as the constitutions themselves.

A capability advances only by earning the next stage. Nothing is presumed permanent; permanence is the reward for proven, lasting value.

---

## 11. Non-Negotiable Feature Rules

These are the permanent rules that **every** feature — current or future — must satisfy. They admit no exception. A feature that violates any of them is not built, or is removed. They are consistent with, and subordinate to, the Non-Negotiable Rules of the MPS and the MUXS.

1. **Every feature must deliver genuine user value.** A feature exists to help a real person with a real need. Novelty, cleverness, or completeness is never a substitute.
2. **Every feature must comply with both constitutions.** No feature may violate the Master Product Specification or the Master UX/UI Specification.
3. **Every feature must preserve user trust.** No feature may weaken the user's confidence that TappyAI is honest, dependable, and on their side.
4. **Every feature must be honest.** No feature may deceive, mislead, or present commercial influence as neutral.
5. **Every feature must respect the user's privacy.** No feature may collect or use personal information without clear benefit, awareness, and control, and none may sell or exploit it.
6. **Every feature must be simple for the user.** No feature may transfer its complexity onto the person or add surface area unjustified by real value.
7. **Every feature must keep the user in control.** No feature may take consequential action beyond the user's intent, or trap the user in a flow.
8. **No feature may pursue engagement for its own sake.** No feature may manufacture habit, capture attention, or maximise time at the user's expense.
9. **Every feature must be accessible.** No feature may exclude people who could otherwise use it.
10. **Every feature must support the Product North Star.** Every feature must help the user reach a better real-life decision, with less effort and greater confidence.

---

## 12. Feature Review Checklist

Every proposed feature must be able to answer **YES** to each of the following before it is approved. A single honest **NO** means the feature is not ready.

- Does it deliver **genuine user value**?
- Does it solve a **real need**?
- Does it fit the **Product Vision**?
- Does it **preserve user trust**?
- Is it **honest**, including about any commercial influence?
- Does it **respect user privacy** and keep the user in control of their data?
- Is it **simple** for the user?
- Does it **reduce effort and cognitive load** rather than add them?
- Does it keep the user **in control** of consequential actions?
- Does it **avoid pursuing engagement** for its own sake?
- Is it **accessible** to as many people as possible?
- Does it comply with the **Master Product Specification**?
- Does it comply with the **Master UX/UI Specification**?
- Is it **maintainable** and coherent for the long term?
- Does it **support the Product North Star**?
- Would we be **proud to ship it**?

**No feature is approved unless it satisfies this checklist.** A feature that cannot answer YES to every question is revised until it can, or it is not built.

---

## 13. AI Feature Checklist

Because the assistant produces the recommendations, answers, and decisions users act upon, every AI capability faces an additional, stricter gate. Each must be able to answer **YES** to every question below, in addition to the Feature Review Checklist.

- Does the AI genuinely **create value** here?
- Is AI **necessary** for this, or would a simpler non-AI approach serve the user better?
- Is the AI **transparent** about what it is doing and on what basis?
- Is the AI **explainable** — can the user understand how it reached its result?
- Does the AI **protect user privacy** and use personal data only to serve the user?
- Does the AI **avoid manipulation**, pressure, and dark patterns?
- Does the AI **communicate uncertainty honestly**, and admit when it does not know?
- Does the AI **distinguish fact, opinion, and inference** where possible?
- Does the AI keep the user **in control** of consequential actions?
- Does the AI comply with the **Product Constitution** (MPS), including its AI Decision Principles?
- Does the AI comply with the **UX/UI Constitution** (MUXS)?

**No AI capability is approved unless it satisfies this checklist.** Where AI would not genuinely serve the user better than a simpler approach, the simpler approach is chosen; AI is never added for its own sake.

---

## Appendix A: Glossary

- **Feature** — An independent, permanent product capability, defined in its own chapter by the eleven-part frame.
- **Ecosystem** — A grouping of related capabilities (AI, Discovery, Social, Entertainment, User, Commerce) that cooperate under one assistant, rather than a set of separate applications.
- **Cross-cutting capability** — A feature whose behaviour is a property of the whole product (for example, Accessibility, Multi-language) rather than a standalone flow.
- **Trust Signal** — A visible element that makes something true about TappyAI legible to the user, as defined in the MUXS.
- **Permanent Capability** — The final stage of the Feature Evolution Model; an enduring part of what TappyAI is, changed only with constitution-level deliberation.
- **The two constitutions** — The *Master Product Specification (MPS)* and the *Master UX/UI Specification (MUXS)*, both v1.0 FINAL, to which this document is subordinate.

---

## Appendix B: Document Governance

- **Authority:** This document is the Single Source of Truth for TappyAI's product capabilities and permanent feature behaviour. All subsequent capability, roadmap, and engineering documents are subordinate to it and must remain consistent with it.
- **Subordination:** This document is subordinate to both the *Master Product Specification (MPS) v1.0 — FINAL* and the *Master UX/UI Specification (MUXS) v1.0 — FINAL*. Where any feature behaviour would conflict with either, those constitutions prevail.
- **Precedence:** Where a later document or decision conflicts with this one on matters of feature behaviour, this document prevails until formally revised.
- **Independence of features:** Every feature is defined as an independent capability with its own chapter. Features are never merged; closely related capabilities are cross-referenced, never collapsed.
- **Amendment:** Changes to this document, and especially to the Non-Negotiable Feature Rules (Section 11), should be rare and deliberate. Amendments are made by issuing a new numbered version, with the prior version retained for reference.
- **Boundaries:** This document intentionally contains no code, APIs, database, architecture, implementation, platform specifics, timelines, delivery status, or detailed UI layout. Those concerns are governed by separate documents and must not be introduced here.

---

# TappyAI Master Feature Specification (MFS) v1.0

This document is the permanent **Feature Constitution** of TappyAI and the **Single Source of Truth for every current and future product capability**. It is subordinate to the *Master Product Specification (MPS) v1.0 — FINAL* and the *Master UX/UI Specification (MUXS) v1.0 — FINAL*, and together with them forms the complete constitution of the product. It may only be changed through a formal, numbered revision.

*End of TappyAI Master Feature Specification (MFS) v1.0.*
