# CROSSFADE — 2026 Qloo Agentic Hackathon submission

Status checked October 27, 2026. This is a draft for the owner to review and submit; it is not a claim that the current preview is a verified live Qloo demonstration.

## Deadline and required links

The [official rules](https://qloo.devpost.com/rules) set the deadline at **October 30, 2026, 11:45 p.m. EDT** (8:45 p.m. PDT). They require a working Qloo-integrated agentic application, a functional demo link, a public source repository containing the code/assets/run instructions and an open-source license visible in GitHub's About area, and a text description. A video is optional. Judging may be based on the submitted text and media even if judges do not exercise the site. The project must remain available for free judging through November 5.

- Demo: [crossfade-ai-preview.onrender.com](https://crossfade-ai-preview.onrender.com/). This is currently a **Synthetic-only** development preview; it does not claim real Qloo results.
- Source: [feature/crossfade-mvp](https://github.com/HivMindAI/crossfade-ai/tree/feature/crossfade-mvp). The default `main` currently shows only `LICENSE`, so a root repository link does not show the application source. A signed-out browser opened the public feature branch and showed the README, source folders, run instructions, and License in the repository About area on October 27.
- Current approved deployed SHA: `1b63afcbc82cf14cf071ef918303804e0e15fa7a`, reported by the owner from Render. The public page does not expose a verifiable build SHA.

## Description draft — truthful current version

**One-line pitch:** CROSSFADE turns two audiences' different tastes into a transparent three-act cultural program that can be repaired when someone says no.

**Intended audience:** CROSSFADE is designed for community event organizers, film clubs, and cultural programmers bringing together groups with different starting points. A generic suggestion can obscure whose preferences were served and why. CROSSFADE keeps each audience's evidence separate, then makes the overlap, trade-offs, and hard limits inspectable.

CROSSFADE's public preview uses invented Synthetic candidate relationships, not real Qloo evidence. It proposes a listening, screening, and reading sequence for two audiences, shows each audience's separate fixture evidence, and reevaluates the concept when a person rejects a choice or changes a hard rule. The implemented server-side Live path uses Qloo Search and Insights to resolve named interests and gather artist, movie, and book candidates separately; public Live mode is disabled. The planner compares shared entity IDs and ordinal ranks, excludes known violations of film and program constraints, and reports gaps instead of inventing agreement. Unknown film runtime or rating cannot certify a schedule; any retained option remains conceptual. The evidence view separates candidate provenance, algorithmic ordering, checked constraints, unknowns, and creative framing; ranks are not satisfaction or calibrated affinity.

The public preview labels its invented fixtures throughout. Public Live mode remains disabled pending verified account allowance and abuse controls. In an earlier authorized owner-run test, Qloo Search and Movie/Book Insights responded, while one fixed two-audience plan found no complete three-domain overlap in its bounded pages. No complete live three-domain recommendation or human acceptance has been verified. CROSSFADE does not establish screening rights, film availability, ticketing, or venue access.

The planner is deterministic tool-using software. It does not call an LLM. Qloo is the cultural data source for Live mode; the Synthetic preview is a transparent development demonstration, not a substitute for Qloo evidence.

Update this text only after newly observed authenticated and public behavior supports stronger claims. In particular, do not call filtered inclusion affinity, a mock result Qloo evidence, or a conceptual program a verified schedule.

## How it was built

The app uses Next.js 16, React 19, TypeScript, and Zod. A server-side Qloo client implements Search resolution and separate artist, movie, and book Insights for each audience. The orchestrator plans calls, executes them within a fixed budget, evaluates shared IDs, verifies known hard constraints, and replans after rejection. The negotiation code keeps ordinal source ranks separate from human satisfaction claims. Live requests require an explicit server switch and a shared Redis admission before Qloo is called; the public preview uses synthetic fixtures without credentials. Automated unit, integration, and browser tests cover the planner, its evidence labels, constraints, and repair flow. Cite only test results confirmed for the exact submitted commit.

## Proposed 90-second judge walkthrough of the current public preview

1. **0–15 s:** Open the demo and point out **SYNTHETIC DEVELOPMENT PREVIEW**. Use the initial two-audience preset.
2. **15–35 s:** Select **Find the shared ground**. Show the three-act proposal and the fairness and audience-favoring paths, if distinct paths are returned.
3. **35–55 s:** Open **Evidence**. Show invented fixture labels, same entity IDs, separate audience ranks, hard-rule checks, and unknowns. Explain that ranks are an ordering device, not confidence or calibrated satisfaction.
4. **55–70 s:** Open **Decision trace** to show tool selection, evaluation of shared IDs and ranks, and checks against known constraints.
5. **70–90 s:** Reject a film. Show the replacement or explicit no-solution outcome and the preserved exclusion. Point out that the rating selector keeps at least one rating selected.

This documentation repair did not independently repeat film rejection; confirm the final script against the public preview before recording.

The Render Free instance can sleep when idle. Open it and allow for wake-up before a timed presentation; check the site and one Synthetic request shortly before submission and again during the judging period without load testing.

## Release decisions still open

| Priority | Gate | Current evidence | Next safe action |
| --- | --- | --- | --- |
| High | Judges reach the actual source | The direct feature-branch URL works in a signed-out browser; default `main` shows only a license and the deployed footer still points there | Put the verified branch URL in Devpost; publish the local footer correction after release review, or separately authorize a merge/default-branch change |
| Critical | Demonstrable Qloo integration | Qloo client and earlier partial authenticated observations exist; public mode is Synthetic-only | Obtain real key-specific quota evidence, then separately authorize one bounded Live experiment and evaluate results without assuming success |
| High | Safe public Live operation, if enabled | Shared hourly Redis admission exists; monthly/cumulative allowance and per-source public control are not verified | Align all allowance windows, add/verify source abuse control, then authorize a separate deployment and public acceptance test |
| High | Submission is filed | Draft and public preview exist; Devpost submission status is unknown | Owner reviews text, attaches exact demo/source links, confirms eligibility and submits before deadline |
| Medium | Reliability through judging | Public browser loaded and completed one Synthetic plan on Oct 27; Free cold starts remain | Recheck availability before deadline and through Nov 5 |

The local one-request quota diagnostic and the Bridge study are separate unpublished research tools. The owner separately authorized one diagnostic request, but its execution remains unconfirmed. These documents authorize no repeat or additional authenticated requests and no Bridge run. The diagnostic cannot establish all account limits if the provider omits relevant headers, and an hourly Redis reservation does not track other clients' use of the Qloo key.

## Final submission checklist

- [x] MIT license exists and GitHub showed License in the About area on October 27.
- [x] Public Synthetic preview is reachable and produces a labeled result in a real browser.
- [x] Public feature branch contains application source and local run instructions.
- [x] The direct feature-branch source link visibly opens the source in a signed-out browser.
- [ ] Qloo allowance and applicable reset windows are verified for the issued key.
- [ ] Any Live claim in the submission has an authenticated, bounded observation behind it.
- [ ] If public Live mode is enabled, cumulative and per-source controls are verified on the actual host.
- [ ] Owner confirms the exact deployed SHA, final public behavior, and Devpost text.
- [ ] Owner submits before October 30, 2026, 11:45 p.m. EDT.
