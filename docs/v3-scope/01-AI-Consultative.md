# TappyAI V3 — AI Consultative

## Goal

Upgrade Tappy's AI experience from simple question-answering toward consultative decision support.

## V3 requirements

### Understanding
- Intent understanding
- Context understanding
- User goal identification
- Constraint understanding
- Distinguish questions, requests, and actions

### Consultation
- Analyze the user's problem
- Ask clarification only when necessary
- Present relevant options
- Compare options
- Explain trade-offs
- Recommend an option when appropriate
- Explain the reasoning behind recommendations
- Identify uncertainty or missing information

### Decision support

The AI should help the user make a better decision, rather than merely produce an answer.

Consultative does not mean unnecessarily long conversations. The system should use available context and ask only information that is genuinely needed.

### Action boundary

AI recommendation and system execution must remain distinct:

User → AI understanding/consultation → recommendation → user decision → Controller/action

The AI must not become the authority for consequential backend actions.

## Implementation audit

Audit the existing implementation for:
- Intent understanding
- Context handling
- Goal/constraint handling
- Clarification behavior
- Options and comparison
- Trade-off explanation
- Recommendations
- Reasoning/explanation
- Uncertainty handling
- User confirmation
- AI-to-Controller boundary

## V3 update rule

Do not redesign the Controller. Only add or modify the minimum capability required to support the V3 Consultative AI experience.
