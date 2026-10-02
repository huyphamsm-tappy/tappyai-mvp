# TappyAI V3 — Cost Optimization

## Goal

Control AI operating cost without degrading the consultative experience.

## Areas to audit and optimize

### Model usage
- Model selection/routing
- Use smaller/cheaper models for simple tasks
- Reserve stronger models for complex reasoning
- Avoid using the strongest model by default

### Context and tokens
- Minimize unnecessary context
- Send only relevant context
- Summarize long conversations where appropriate
- Remove redundant context
- Control prompt and output size

### Caching
- Cache suitable stable results
- Evaluate response/semantic caching where appropriate
- Never cache sensitive data outside its permitted scope

### Deterministic processing
Do not use an LLM where deterministic logic is sufficient, including:
- Arithmetic/calculation
- Validation
- Formatting
- Routing
- Other deterministic rules

### AI call reduction
- Avoid unnecessary LLM calls
- Avoid repeated inference for unchanged information
- Use precomputed/structured data where appropriate
- Use background/one-time processing where appropriate

### Cost observability
Track where practical:
- Token usage
- Cost per request
- Cost per user
- Cost per feature
- Model distribution
- Cache hit rate
- Retry-related cost
- Abnormal usage

## Audit rule

Compare the current implementation against the cost-optimization design already selected for V3. Do not introduce unrelated optimization architecture unless needed.

## V3 update rule

Prioritize measurable reduction of unnecessary inference, context, tokens, and expensive model usage while preserving AI Consultative quality.
