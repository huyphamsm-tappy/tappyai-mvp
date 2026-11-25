// Vitest setup (app project): the suites run with the automatic moderation gate OFF unless they turn it on.
//
// AUTO_MODERATION_ENABLED is ON in a real runtime (it is off only when set to exactly "false"), and it calls a model for every piece of text a person publishes. The route suites written before the
// gate existed assert what a route stores and returns, not what the safety filter says; pinning "false" here keeps each of them on the path it was written for, the same way the consultative
// flags are pinned. The gate's own suites (src/lib/safety/autoModeration) and the route wiring suites switch it on themselves and inject a fake classifier.
if (process.env.AUTO_MODERATION_ENABLED === undefined) process.env.AUTO_MODERATION_ENABLED = 'false'
