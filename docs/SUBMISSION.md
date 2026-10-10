# Submission materials — draft, pending live validation

## Devpost description draft

CROSSFADE helps organizers design a shared cultural experience for two audiences with different tastes. Participants enter separate film and music interests and set hard limits for a screening. A bounded agent resolves interests, asks Qloo for cross-domain artist, movie, and book insights for each group, and intersects candidates by entity ID. It ranks complete three-act plans using each audience's own result order, shows alternatives and source provenance, and repairs the plan when someone rejects a component or changes a rule. The interface distinguishes Qloo results from algorithmic choices and creative program framing.

**Current caveat:** The local demo uses clearly labeled synthetic data because the hackathon API key has not arrived. This text must be updated only after live Qloo integration and a public demo have been verified. No LLM model is used; decision-making is a transparent tool-using algorithm.

## Honest 90-second demo script

1. **0–15 s:** Open CROSSFADE. Point out the source banner: synthetic development preview. Select two contrasting audience profiles.
2. **15–35 s:** Run negotiation. Show the three alternatives and the selected listening, film, and reading sequence.
3. **35–55 s:** Open Evidence. Explain that each candidate appears in both audience-specific result sets and the ranks are within each query, not probabilities.
4. **55–75 s:** Reject the film. Watch the plan rerun and show “What changed.”
5. **75–90 s:** Open Decision trace and point out PLAN, tool selection, execution, evaluation, verification, and replanning. State that the live Qloo gate is pending until the key is available.

After a verified public deployment, replace the synthetic-mode demonstration with live Qloo results and update every claim here to match what was tested.

## Submission checklist

- [x] MIT license preserved
- [ ] Application code pushed to the public repository
- [x] Local synthetic primary journey
- [x] Server-only Qloo client and live smoke script
- [x] Automated test and CI configuration
- [ ] Authenticated Qloo search and insights verified
- [ ] Public app deployed and tested end to end
- [ ] Devpost project submitted by the account owner
