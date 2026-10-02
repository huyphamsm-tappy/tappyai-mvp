# TappyAI V3 — Security

## Goal

Harden TappyAI V3 against AI-specific and application-level threats while preserving the existing security architecture.

## Core security boundary

User → AI → policy/guardrails → permission/scope validation → Controller → deterministic backend

The AI must not have arbitrary direct access to backend systems or databases.

## Prompt Injection

Audit protection against:
- Direct prompt injection
- Indirect prompt injection
- Malicious instructions embedded in external content
- Tool-output injection
- Document/content injection
- Attempts to reveal system instructions
- Instruction hierarchy confusion

External data must be treated as data, not trusted instructions.

## Tool security

For AI-initiated tools:
- Validate tool selection
- Check permissions
- Validate scope
- Validate arguments
- Apply policy/guardrails
- Route consequential actions through the Controller
- Deny unauthorized actions

## Data isolation

Audit:
- User data isolation
- Conversation/context isolation
- Memory isolation
- Tool data isolation
- Sensitive data isolation
- System instruction isolation

## AI security

Audit:
- System prompt protection
- Input validation
- Output validation where appropriate
- Privilege boundaries
- Abuse/rate limiting
- Logging/auditability
- Data exfiltration resistance
- Privilege escalation resistance

## Security validation

Where applicable, validate through:
- Adversarial testing
- Prompt-injection test cases
- Tool-abuse testing
- Data-exfiltration testing
- Privilege-escalation testing
- Red-team testing
- Continuous monitoring and incident response

## V3 update rule

Preserve the security architecture already designed. Update only where the audit identifies an implementation gap, weakness, or newly required hardening.
