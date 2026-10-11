# Submission materials — draft, pending live validation

## Devpost description draft

CROSSFADE helps organizers sketch a shared cultural experience for two audiences with different tastes. Participants enter separate film and music interests and set hard film and total-program limits. A bounded deterministic planner resolves interests, requests separate cross-domain artist, movie, and book Insights for each group, and intersects candidates by entity ID. When a full result page leaves a gap, it conditionally requests another page. It compares non-dominated ordinal trade-offs, shows only evidence-supported alternatives, and repairs the concept when someone rejects a component or changes a rule. The interface distinguishes source results from algorithmic choices, missing evidence, and creative framing.

**Current caveat:** The local demo uses clearly labeled synthetic data because no authenticated Qloo run has occurred. The public Qloo reference does not guarantee film runtime in minutes; a live recommendation without it is a conceptual experience, not a duration-verified schedule. The concept does not establish screening rights, film availability, ticketing, or a venue. This text must be updated only after live Qloo integration and a public demo have been verified. No LLM model is used; decision-making is a transparent tool-using algorithm.

## Honest 90-second demo script

1. **0–15 s:** Open CROSSFADE. Point out the source banner: synthetic development preview. Select two contrasting audience profiles.
2. **15–35 s:** Run negotiation. Show the available fairness and audience-favoring paths, when distinct trade-offs exist, and the proposed listening, film, and reading sequence.
3. **35–55 s:** Open Evidence. Explain that each candidate appears in both audience-specific result sets and that ranks are within each request, not probabilities. Identify synthetic provenance and missing real Qloo validation.
4. **55–75 s:** Reject the film. Watch the plan rerun and show the replacement list. If no valid alternative remains, show the specific no-solution gap instead of pretending a repair succeeded.
5. **75–90 s:** Open Decision trace and point out PLAN, tool selection, execution, evaluation, verification, and replanning. State that the live Qloo gate is pending until the key is available.

After a verified public deployment, replace the synthetic-mode demonstration with live Qloo results and update every claim here to match what was tested.

## Submission checklist

- [x] MIT license preserved
- [x] Application code pushed to the [public feature branch](https://github.com/HivMindAI/crossfade-ai/tree/feature/crossfade-mvp) for [PR #1](https://github.com/HivMindAI/crossfade-ai/pull/1); `main` remains unmerged
- [x] Local synthetic primary journey
- [x] Server-only Qloo client and live smoke script
- [x] Automated test and CI configuration; [initial PR CI passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38065856447)
- [x] [Milestone 2 PR CI reviewed and passed](https://github.com/HivMindAI/crossfade-ai/actions/runs/38070292125) for hardening commit `4872b7e`
- [x] Milestone 3 local offline gates passed: 62/62 unit/integration tests, 9/9 browser tests, formatting, types, lint, build, and current zero-advisory audits
- [ ] Milestone 3 PR CI reviewed after publication
- [ ] Authenticated Qloo search and insights verified
- [ ] Qloo API host verified against the issued key instructions
- [ ] Conceptual live results and their unverified scheduling gates checked against an authenticated response
- [ ] Film runtime units and complete program timing verified against live metadata
- [ ] Public-demo abuse controls upgraded beyond the per-process rate window; Qloo account limits reviewed
- [ ] Public screening rights, availability, ticketing, and venue arrangements verified
- [ ] Public app deployed and tested end to end
- [ ] Devpost project submitted by the account owner
