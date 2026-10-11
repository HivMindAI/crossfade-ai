"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleHelp,
  Film,
  Headphones,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  DOMAINS,
  type Blueprint,
  type Domain,
  type Interest,
  type PlanRequest,
  type PlanResult,
} from "@/lib/model";
import { syntheticCatalog } from "@/lib/synthetic";

const defaults: PlanRequest = {
  mode: "synthetic",
  audiences: [
    {
      name: "The improvisers",
      interests: [
        { name: "Miles Davis", type: "artist" },
        { name: "Spirited Away", type: "movie" },
      ],
    },
    {
      name: "The shapeshifters",
      interests: [
        { name: "Beyoncé", type: "artist" },
        { name: "Everything Everywhere All at Once", type: "movie" },
      ],
    },
  ],
  constraints: {
    maxMovieMinutes: 120,
    maxProgramMinutes: 180,
    allowedRatings: ["G", "PG", "PG-13"],
    excludedIds: [],
  },
};

const presets = [
  {
    label: "Jazz × new worlds",
    a: ["Miles Davis", "Spirited Away"],
    b: ["Beyoncé", "Everything Everywhere All at Once"],
  },
  {
    label: "Soul × sci-fi",
    a: ["Nina Simone", "The Matrix"],
    b: ["Beyoncé", "Spirited Away"],
  },
  {
    label: "Cinema × sound",
    a: ["Spirited Away", "The Matrix"],
    b: ["Miles Davis", "Nina Simone"],
  },
];
const icons = { artist: Headphones, movie: Film, book: BookOpen };
const actNames = {
  artist: "01 / LISTEN",
  movie: "02 / WATCH",
  book: "03 / DISCUSS",
};

function copied<T>(value: T): T {
  return structuredClone(value);
}
function labelDomain(domain: Domain) {
  return domain === "artist" ? "Music" : domain === "movie" ? "Film" : "Books";
}

function handleTabKeys(event: React.KeyboardEvent<HTMLDivElement>) {
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']"),
  );
  const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
  if (current < 0) return;
  const next =
    event.key === "ArrowRight"
      ? (current + 1) % tabs.length
      : event.key === "ArrowLeft"
        ? (current - 1 + tabs.length) % tabs.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : -1;
  if (next < 0) return;
  event.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}

export function Workspace() {
  const [input, setInput] = useState<PlanRequest>(defaults);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<"blueprint" | "evidence" | "trace">(
    "blueprint",
  );
  const [replacements, setReplacements] = useState<string[]>([]);
  const [disambiguation, setDisambiguation] = useState<{
    side: number;
    interest: Interest;
    matches: { id: string; name: string; domain: Domain }[];
  } | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const inputVersion = useRef(0);
  const requestController = useRef<AbortController | null>(null);

  function markDirty() {
    inputVersion.current++;
    requestController.current?.abort();
    requestController.current = null;
    setBusy(false);
    setResult(null);
    setError(null);
    setDisambiguation(null);
    setNotice(null);
    setReplacements([]);
  }

  async function generate(next: PlanRequest, previous?: Blueprint) {
    const version = inputVersion.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setBusy(true);
    setResult(null);
    setReplacements([]);
    setError(null);
    setNotice(null);
    setDisambiguation(null);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        signal: controller.signal,
      });
      const body = await response.json();
      if (controller.signal.aborted || version !== inputVersion.current) return;
      if (!response.ok) {
        if (body.error === "AMBIGUOUS_ENTITY" && body.details?.matches?.length)
          setDisambiguation(body.details);
        setError(body.message || "Planning failed. Please try again.");
        return;
      }
      setResult(body as PlanResult);
      setSelected(0);
      setView("blueprint");
      if (body.status === "no-solution") {
        setReplacements([]);
        setNotice(
          "The plan is incomplete. Review the evidence gaps and decision trace.",
        );
      } else if (previous && body.options?.[0]) {
        const changes = previous.candidates.flatMap((candidate, index) =>
          candidate.entity.id !== body.options[0].candidates[index].entity.id
            ? [
                `${labelDomain(candidate.entity.domain)}: ${candidate.entity.name} → ${body.options[0].candidates[index].entity.name}`,
              ]
            : [],
        );
        setReplacements(changes);
        setNotice(
          changes.length
            ? `The rejected component was excluded and both audiences were reevaluated. ${changes.length} component${changes.length === 1 ? "" : "s"} changed; compare the replacements below.`
            : "The same components remain after reevaluation; review the decision trace.",
        );
      } else {
        setReplacements([]);
        setNotice(
          body.status === "conceptual"
            ? "Shared evidence found. Film scheduling checks are still pending."
            : "Evidence gathered and alternatives evaluated.",
        );
      }
      setTimeout(() => {
        if (version === inputVersion.current)
          resultsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      }, 100);
    } catch {
      if (controller.signal.aborted || version !== inputVersion.current) return;
      setError(
        "Could not reach the planner. Check your connection and try again.",
      );
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
        setBusy(false);
      }
    }
  }

  function updateAudience(
    side: number,
    field: "name" | "interests",
    value: string | Interest[],
  ) {
    markDirty();
    setInput((current) => {
      const next = copied(current);
      if (field === "name") next.audiences[side].name = value as string;
      else next.audiences[side].interests = value as Interest[];
      return next;
    });
  }
  function updateInterest(
    side: number,
    index: number,
    patch: Partial<Interest>,
  ) {
    markDirty();
    const next = copied(input);
    next.audiences[side].interests[index] = {
      ...next.audiences[side].interests[index],
      ...patch,
    };
    setInput(next);
  }
  function selectPreset(index: number) {
    markDirty();
    const preset = presets[index];
    const next = copied(input);
    next.audiences[0].interests = preset.a.map((name) => ({
      name,
      type: syntheticCatalog.find((item) => item.name === name)!.domain,
    }));
    next.audiences[1].interests = preset.b.map((name) => ({
      name,
      type: syntheticCatalog.find((item) => item.name === name)!.domain,
    }));
    next.constraints.excludedIds = [];
    setInput(next);
  }
  function reject(id: string) {
    const previous = result?.options[selected];
    markDirty();
    const next = copied(input);
    next.constraints.excludedIds = [
      ...new Set([...next.constraints.excludedIds, id]),
    ];
    setInput(next);
    void generate(next, previous);
  }
  function changeMode(mode: PlanRequest["mode"]) {
    markDirty();
    const next = copied(input);
    next.mode = mode;
    next.constraints.excludedIds = [];
    next.audiences.forEach((audience) =>
      audience.interests.forEach((interest) => delete interest.id),
    );
    setInput(next);
  }
  function chooseMatch(match: { id: string; name: string; domain: Domain }) {
    if (!disambiguation) return;
    const next = copied(input);
    const index = next.audiences[disambiguation.side].interests.findIndex(
      (item) =>
        item.name === disambiguation.interest.name &&
        item.type === disambiguation.interest.type,
    );
    if (index < 0) return;
    next.audiences[disambiguation.side].interests[index] = {
      name: match.name,
      type: match.domain,
      id: match.id,
    };
    markDirty();
    setInput(next);
    setDisambiguation(null);
    setError(null);
  }
  const active = result?.options[selected];

  useEffect(() => {
    document.documentElement.dataset.mode = input.mode;
  }, [input.mode]);

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CROSSFADE home">
          <span className="brand-mark">
            <span />
          </span>
          <span>
            CROSSFADE<span className="brand-dot">.</span>
          </span>
        </a>
        <nav aria-label="Primary">
          <a href="#how-it-works">How it works</a>
          <a href="#studio">The studio</a>
          <a href="#evidence">Evidence</a>
        </nav>
        <a className="top-cta" href="#studio">
          Enter the studio <ArrowUpRight size={16} />
        </a>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-line" /> AGENTIC CULTURAL NEGOTIATION
              INTELLIGENCE
            </div>
            <h1 id="hero-title">
              Different tastes.
              <br />
              <em>Better together.</em>
            </h1>
            <p>
              Bring two worlds into the same room. CROSSFADE finds cultural
              common ground, builds an experience around it, and shows exactly
              why each choice belongs.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#studio">
                Build a shared experience <ArrowUpRight size={19} />
              </a>
              <a className="text-link" href="#how-it-works">
                Explore the method <ArrowDownRight size={18} />
              </a>
            </div>
            <div className="hero-note">
              <span className="pulse-dot" /> Development preview · Synthetic
              evidence is clearly labeled
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="record record-a">
              <span>
                GROUP A<br />
                THE IMPROVISERS
              </span>
            </div>
            <div className="record record-b">
              <span>
                GROUP B<br />
                THE SHAPESHIFTERS
              </span>
            </div>
            <div className="hero-intersection">
              <Sparkles size={27} strokeWidth={1.5} />
              <span>
                SHARED
                <br />
                GROUND
              </span>
            </div>
            <div className="art-caption">TWO AUDIENCES / ONE EXPERIENCE</div>
          </div>
        </section>

        <section
          className="method"
          id="how-it-works"
          aria-labelledby="method-title"
        >
          <div className="section-label">01 / THE METHOD</div>
          <div className="method-head">
            <h2 id="method-title">
              A bridge you can <em>inspect.</em>
            </h2>
            <p>
              Every suggestion has a trail. See where each audience connects,
              how constraints shape the outcome, and what changes when you say
              no.
            </p>
          </div>
          <div className="method-grid">
            <div>
              <span className="method-number">01</span>
              <h3>Listen to both sides</h3>
              <p>
                Define separate cultural interests for each audience. No
                averages that erase the differences.
              </p>
            </div>
            <div>
              <span className="method-number">02</span>
              <h3>Find the overlap</h3>
              <p>
                Compare results by shared entity IDs and within-query order,
                across music, film, and books.
              </p>
            </div>
            <div>
              <span className="method-number">03</span>
              <h3>Negotiate, then repair</h3>
              <p>
                Explore alternatives, reject a component, or tighten a rule. The
                planner reevaluates the whole sequence.
              </p>
            </div>
          </div>
        </section>

        <section className="studio" id="studio" aria-labelledby="studio-title">
          <div className="studio-heading">
            <div>
              <div className="section-label">02 / THE STUDIO</div>
              <h2 id="studio-title">
                Make room for <em>everyone.</em>
              </h2>
            </div>
            <span className="studio-index">CROSSFADE / WORKSPACE 001</span>
          </div>
          <div className="preview-banner" role="note">
            <span className="preview-icon">
              {input.mode === "synthetic" ? "S" : "Q"}
            </span>
            <div>
              <strong>
                {input.mode === "synthetic"
                  ? "SYNTHETIC DEVELOPMENT PREVIEW"
                  : "LIVE QLOO MODE"}
              </strong>
              <p>
                {input.mode === "synthetic"
                  ? "Demo associations and candidate entities are invented fixtures. They are not Qloo results. Live mode requires a Qloo API key."
                  : "Live requests require a server-side key and a separate launch switch after validation. If unavailable, no fixture results will be shown."}
              </p>
            </div>
          </div>
          <div className="mode-row">
            <span className="field-caption">DATA SOURCE</span>
            <div className="segmented" role="group" aria-label="Data source">
              <button
                className={input.mode === "synthetic" ? "active" : ""}
                onClick={() => changeMode("synthetic")}
              >
                Synthetic demo
              </button>
              <button
                className={input.mode === "live" ? "active" : ""}
                onClick={() => changeMode("live")}
              >
                Live Qloo
              </button>
            </div>
            <span className="mode-help">
              {input.mode === "live"
                ? "Server-side key and launch approval required. Results are never mocked."
                : "Explore the complete flow without a key."}
            </span>
          </div>
          {input.mode === "synthetic" && (
            <div className="preset-row">
              <span className="field-caption">STARTING POINTS</span>
              {presets.map((preset, index) => (
                <button
                  key={preset.label}
                  className="preset"
                  onClick={() => selectPreset(index)}
                >
                  {preset.label} <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          )}
          <div className="audience-grid">
            {input.audiences.map((audience, side) => (
              <div className={`audience-card audience-${side}`} key={side}>
                <div className="audience-top">
                  <div>
                    <span className="audience-code">AUDIENCE 0{side + 1}</span>
                    <div className="audience-number">
                      0{side + 1}
                      <span>.</span>
                    </div>
                  </div>
                  <span className="audience-symbol">
                    {side === 0 ? "◒" : "◓"}
                  </span>
                </div>
                <label className="field-label" htmlFor={`audience-${side}`}>
                  Give this group a name
                </label>
                <input
                  id={`audience-${side}`}
                  className="name-input"
                  value={audience.name}
                  maxLength={45}
                  onChange={(event) =>
                    updateAudience(side, "name", event.target.value)
                  }
                />
                <div className="interest-heading">
                  <span className="field-label">Cultural touchpoints</span>
                  <span>{audience.interests.length}/3</span>
                </div>
                <div className="interests">
                  {audience.interests.map((interest, index) => (
                    <div className="interest-row" key={index}>
                      {input.mode === "synthetic" ? (
                        <select
                          aria-label={`${audience.name} interest ${index + 1}`}
                          value={interest.name}
                          onChange={(event) => {
                            const item = syntheticCatalog.find(
                              (entry) => entry.name === event.target.value,
                            )!;
                            updateInterest(side, index, {
                              name: item.name,
                              type: item.domain,
                              id: undefined,
                            });
                          }}
                        >
                          {syntheticCatalog.map((item) => (
                            <option key={item.id}>{item.name}</option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <input
                            aria-label={`${audience.name} interest ${index + 1}`}
                            value={interest.name}
                            maxLength={80}
                            onChange={(event) =>
                              updateInterest(side, index, {
                                name: event.target.value,
                                id: undefined,
                              })
                            }
                          />
                          <select
                            aria-label={`${audience.name} interest ${index + 1} type`}
                            value={interest.type}
                            onChange={(event) =>
                              updateInterest(side, index, {
                                type: event.target.value as Domain,
                                id: undefined,
                              })
                            }
                          >
                            {DOMAINS.map((domain) => (
                              <option key={domain} value={domain}>
                                {labelDomain(domain)}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      <button
                        className="icon-button"
                        aria-label={`Remove ${interest.name}`}
                        disabled={audience.interests.length === 1}
                        onClick={() =>
                          updateAudience(
                            side,
                            "interests",
                            audience.interests.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="add-interest"
                  disabled={audience.interests.length >= 3}
                  onClick={() =>
                    updateAudience(side, "interests", [
                      ...audience.interests,
                      input.mode === "synthetic"
                        ? {
                            name: syntheticCatalog[0].name,
                            type: syntheticCatalog[0].domain,
                          }
                        : { name: "", type: "artist" },
                    ])
                  }
                >
                  + Add a touchpoint
                </button>
              </div>
            ))}
          </div>
          <div className="constraints-card">
            <div className="constraint-title">
              <span className="constraint-icon">✳</span>
              <div>
                <span className="field-caption">NON-NEGOTIABLES</span>
                <h3>Set the boundaries.</h3>
              </div>
            </div>
            <div className="constraint-controls">
              <label>
                Maximum film length{" "}
                <span>{input.constraints.maxMovieMinutes} min</span>
                <input
                  type="range"
                  min="60"
                  max="180"
                  step="5"
                  value={input.constraints.maxMovieMinutes}
                  onChange={(event) => {
                    markDirty();
                    setInput((current) => ({
                      ...current,
                      constraints: {
                        ...current.constraints,
                        maxMovieMinutes: Number(event.target.value),
                      },
                    }));
                  }}
                />
              </label>
              <label>
                Maximum total program{" "}
                <span>{input.constraints.maxProgramMinutes ?? 180} min</span>
                <input
                  type="range"
                  min="120"
                  max="300"
                  step="5"
                  value={input.constraints.maxProgramMinutes ?? 180}
                  onChange={(event) => {
                    markDirty();
                    setInput((current) => ({
                      ...current,
                      constraints: {
                        ...current.constraints,
                        maxProgramMinutes: Number(event.target.value),
                      },
                    }));
                  }}
                />
              </label>
              <fieldset>
                <legend>Allowed film ratings</legend>
                <div className="rating-list">
                  {(["G", "PG", "PG-13", "R", "NC-17"] as const).map(
                    (rating) => (
                      <label key={rating}>
                        <input
                          type="checkbox"
                          checked={input.constraints.allowedRatings.includes(
                            rating,
                          )}
                          onChange={(event) => {
                            markDirty();
                            const next = copied(input);
                            next.constraints.allowedRatings = event.target
                              .checked
                              ? [...next.constraints.allowedRatings, rating]
                              : next.constraints.allowedRatings.filter(
                                  (item) => item !== rating,
                                );
                            setInput(next);
                          }}
                        />
                        <span>{rating}</span>
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
            </div>
            {input.constraints.excludedIds.length > 0 && (
              <button
                className="reset-exclusions"
                onClick={() => {
                  markDirty();
                  setInput((current) => ({
                    ...current,
                    constraints: { ...current.constraints, excludedIds: [] },
                  }));
                }}
              >
                <RotateCcw size={14} /> Clear{" "}
                {input.constraints.excludedIds.length} rejection(s)
              </button>
            )}
          </div>
          <div className="run-row">
            <div className="run-note">
              <Sparkles size={20} />
              <span>Search → compare → evaluate → verify → repair</span>
            </div>
            <button
              className="button button-dark"
              disabled={busy}
              onClick={() => void generate(input)}
            >
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={18} /> Negotiating...
                </>
              ) : (
                <>
                  {result ? "Run again" : "Find the shared ground"}
                  <ArrowUpRight size={19} />
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="error-box" role="alert">
              <CircleHelp size={19} />
              <span>{error}</span>
            </div>
          )}
          {disambiguation && (
            <div className="match-box">
              <strong>Choose the intended entity</strong>
              <div>
                {disambiguation.matches.map((match) => (
                  <button key={match.id} onClick={() => chooseMatch(match)}>
                    {match.name} <small>{match.id}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section
          className="results"
          id="evidence"
          ref={resultsRef}
          aria-labelledby="results-title"
          aria-busy={busy}
        >
          <div className="results-head">
            <div>
              <div className="section-label">03 / THE BLUEPRINT</div>
              <h2 id="results-title">
                The art of the <em>in-between.</em>
              </h2>
            </div>
            <span className="results-meta">
              {result?.status === "no-solution"
                ? "NO COMPLETE PATH"
                : result
                  ? `${result.options.length} ${result.status === "conceptual" ? "CONCEPTUAL" : "DURATION-CHECKED"} PATH${result.options.length === 1 ? "" : "S"}`
                  : "AWAITING YOUR AUDIENCES"}
            </span>
          </div>
          {busy ? (
            <div className="empty-state" role="status" aria-live="polite">
              <LoaderCircle className="spin" size={34} />
              <h3>Comparing both audiences.</h3>
              <p>
                Resolving interests, gathering separate evidence, and checking
                the rules. The result will appear here.
              </p>
            </div>
          ) : !result ? (
            <div className="empty-state">
              <div className="empty-orbit">
                <span>✳</span>
              </div>
              <h3>Your shared experience begins here.</h3>
              <p>
                Choose two audiences above and run the negotiation to see an
                evidence-backed blueprint.
              </p>
              <a href="#studio" className="text-link">
                Configure audiences <ArrowUpRight size={17} />
              </a>
            </div>
          ) : (
            <>
              {notice && (
                <div className="notice" role="status">
                  <Check size={17} />
                  {notice}
                </div>
              )}
              {result.warning && (
                <div className="source-warning">
                  SYNTHETIC / NOT REAL QLOO DATA{" "}
                  <span>
                    All relationships in this preview are invented for
                    development.
                  </span>
                </div>
              )}
              {replacements.length > 0 && (
                <div className="change-log">
                  <strong>WHAT CHANGED</strong>
                  {replacements.map((change) => (
                    <span key={change}>{change}</span>
                  ))}
                </div>
              )}
              {result.status === "no-solution" ? (
                <div className="no-solution">
                  <h3>No honest bridge under these rules.</h3>
                  <p>
                    A required component lacks shared, verifiable evidence.
                    Review the specific gaps before revising an input. Hard
                    constraints were not relaxed.
                  </p>
                  <ul>
                    {result.gaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                  <details>
                    <summary>Decision and recovery record</summary>
                    <ol>
                      {result.audit.map((action, index) => (
                        <li key={index}>
                          <strong>{action.step}:</strong> {action.detail}
                        </li>
                      ))}
                    </ol>
                  </details>
                  <a href="#studio" className="button button-primary">
                    Adjust the inputs <ArrowUpRight size={18} />
                  </a>
                </div>
              ) : (
                <>
                  {result.status === "conceptual" && (
                    <div className="schedule-warning" role="note">
                      <strong>
                        CONCEPTUAL EXPERIENCE — NOT A VERIFIED SCHEDULE
                      </strong>
                      <p>
                        {result.gaps.join(" ")} Film length, rating and
                        total-program limits remain binding. Confirm missing
                        metadata independently before booking; screening rights
                        and availability are also unverified.
                      </p>
                    </div>
                  )}
                  <p className="alternatives-note">{result.alternativesNote}</p>
                  <div
                    className="option-picker"
                    role="tablist"
                    aria-label="Experience alternatives"
                    onKeyDown={handleTabKeys}
                  >
                    {result.options.map((option, index) => (
                      <button
                        key={option.id}
                        role="tab"
                        aria-selected={selected === index}
                        tabIndex={selected === index ? 0 : -1}
                        className={selected === index ? "selected" : ""}
                        onClick={() => {
                          setSelected(index);
                          setView("blueprint");
                        }}
                      >
                        PATH 0{index + 1}
                        <span>
                          {option.path === "fairness"
                            ? "Fairness first"
                            : option.path === "audience-a"
                              ? `Favors ${input.audiences[0].name}`
                              : `Favors ${input.audiences[1].name}`}
                        </span>
                        <ArrowRight size={17} />
                      </button>
                    ))}
                  </div>
                  <div className="result-layout">
                    <div className="plan-panel">
                      <div className="plan-head">
                        <div>
                          <span className="field-caption">
                            SHARED EXPERIENCE / OPTION 0{selected + 1}
                          </span>
                          <h3>{active?.title}</h3>
                          <p>{active?.rationale}</p>
                          {active?.scheduleStatus === "duration-verified" ? (
                            <p className="program-note">
                              Conceptual program: 20 min listening +{" "}
                              {active.candidates[1].entity.duration} min film +
                              10 min transition + 15 min discussion ={" "}
                              {active.programMinutes} min. Duration and rating
                              metadata passed the selected limits; screening
                              rights, availability, ticketing, and venue remain
                              unverified.
                            </p>
                          ) : (
                            <p className="program-note">
                              Proposed sequence: 20 min listening, a film of
                              unverified duration, 10 min transition, and 15 min
                              discussion. No total duration or screening
                              schedule is claimed.
                            </p>
                          )}
                        </div>
                        <span className="plan-badge">3 ACTS</span>
                      </div>
                      <div
                        className="plan-tabs"
                        role="tablist"
                        aria-label="Plan detail"
                        onKeyDown={handleTabKeys}
                      >
                        <button
                          role="tab"
                          aria-selected={view === "blueprint"}
                          tabIndex={view === "blueprint" ? 0 : -1}
                          className={view === "blueprint" ? "active" : ""}
                          onClick={() => setView("blueprint")}
                        >
                          Blueprint
                        </button>
                        <button
                          role="tab"
                          aria-selected={view === "evidence"}
                          tabIndex={view === "evidence" ? 0 : -1}
                          className={view === "evidence" ? "active" : ""}
                          onClick={() => setView("evidence")}
                        >
                          Evidence
                        </button>
                        <button
                          role="tab"
                          aria-selected={view === "trace"}
                          tabIndex={view === "trace" ? 0 : -1}
                          className={view === "trace" ? "active" : ""}
                          onClick={() => setView("trace")}
                        >
                          Decision trace
                        </button>
                      </div>
                      {view === "blueprint" && (
                        <div className="acts">
                          {active?.candidates.map((candidate) => {
                            const Icon = icons[candidate.entity.domain];
                            return (
                              <div className="act" key={candidate.entity.id}>
                                <div className="act-icon">
                                  <Icon size={20} />
                                </div>
                                <div className="act-body">
                                  <span className="act-label">
                                    {actNames[candidate.entity.domain]}
                                  </span>
                                  <h4>{candidate.entity.name}</h4>
                                  <p>
                                    {candidate.entity.domain === "artist"
                                      ? "Open with a listening moment that gives both groups a familiar entry point."
                                      : candidate.entity.domain === "movie"
                                        ? "Watch together, then compare what each audience noticed."
                                        : "Use a short reading prompt to turn shared taste into conversation."}
                                  </p>
                                  <div className="act-meta">
                                    <span>
                                      {candidate.entity.domain === "movie" &&
                                      candidate.entity.duration
                                        ? `${candidate.entity.duration} MIN · ${candidate.entity.contentRating ?? "RATING UNVERIFIED"}`
                                        : candidate.entity.domain === "movie"
                                          ? `RUNTIME UNVERIFIED · ${candidate.entity.contentRating ?? "RATING UNVERIFIED"}`
                                          : labelDomain(
                                              candidate.entity.domain,
                                            )}
                                    </span>
                                    <span>Appears for both audiences</span>
                                  </div>
                                </div>
                                <button
                                  className="reject-button"
                                  disabled={busy}
                                  onClick={() => reject(candidate.entity.id)}
                                  title={`Reject ${candidate.entity.name}`}
                                >
                                  <X size={14} /> Reject
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {view === "evidence" && (
                        <div className="evidence-list">
                          {active?.candidates.map((candidate) => (
                            <div
                              className="evidence-item"
                              key={candidate.entity.id}
                            >
                              <div className="evidence-top">
                                <strong>{candidate.entity.name}</strong>
                                <span
                                  className={
                                    result.mode === "synthetic"
                                      ? "tag-synthetic"
                                      : "tag-live"
                                  }
                                >
                                  {result.mode === "synthetic"
                                    ? "SYNTHETIC FIXTURE"
                                    : "QLOO RESULT"}
                                </span>
                              </div>
                              <p>{candidate.explanation}</p>
                              <strong className="evidence-label">
                                {result.mode === "synthetic"
                                  ? "Synthetic fixture evidence"
                                  : "Qloo-returned evidence"}
                              </strong>
                              <p>
                                {result.mode === "synthetic"
                                  ? "Invented development fixture. No Qloo evidence is claimed."
                                  : "This entity appeared in both audience-specific Qloo result sets by the same ID."}
                              </p>
                              <div className="rank-pair">
                                <span>
                                  {input.audiences[0].name}:{" "}
                                  <b>#{candidate.ranks[0]}</b>
                                </span>
                                <span>
                                  {input.audiences[1].name}:{" "}
                                  <b>#{candidate.ranks[1]}</b>
                                </span>
                              </div>
                              <strong className="evidence-label">
                                Algorithmic score
                              </strong>
                              <p>
                                Ordinal rank positions only. The planner adds
                                them across three acts to compare trade-offs;
                                they are not satisfaction probabilities.
                              </p>
                              {result.mode === "live" && (
                                <>
                                  <strong className="evidence-label">
                                    Reported influence signals
                                  </strong>
                                  {[0, 1].map((side) => (
                                    <p key={side}>
                                      {input.audiences[side].name}:{" "}
                                      {candidate.influences[side].length
                                        ? candidate.influences[side]
                                            .map((signal) => {
                                              const name =
                                                result.resolved[side].find(
                                                  (match) =>
                                                    match.id ===
                                                    signal.signalId,
                                                )?.name ?? "input entity";
                                              return `${name} ${signal.normalizedInfluence.toFixed(2)}`;
                                            })
                                            .join(", ")
                                        : "No recognized per-result signal/value pairs."}
                                    </p>
                                  ))}
                                  <small>
                                    Values are normalized within a Qloo request.
                                    They are not probabilities, causal proof, or
                                    comparable across unrelated requests.
                                  </small>
                                </>
                              )}
                              <strong className="evidence-label">
                                Hard constraints and missing evidence
                              </strong>
                              <p>
                                {candidate.entity.domain === "movie"
                                  ? active?.scheduleStatus ===
                                    "duration-verified"
                                    ? `Film metadata passed the ${input.constraints.maxMovieMinutes}-minute film limit, ${input.constraints.maxProgramMinutes ?? 180}-minute total program limit, and allowed rating set.`
                                    : `Conceptual only. Unverified: ${active?.unverified.join(" and ")}. Known metadata do not violate the selected limits, but missing values have not passed the hard gates.`
                                  : "This component passed explicit rejection checks."}{" "}
                                Rights and availability remain unverified.
                              </p>
                              <strong className="evidence-label">
                                Creative interpretation
                              </strong>
                              <p>
                                The three-act framing is a proposed experience,
                                not a Qloo claim.
                              </p>
                              <small>
                                {result.mode === "synthetic"
                                  ? "These invented fixtures contain no Qloo explainability metadata."
                                  : (candidate.entity.evidenceWarning ??
                                    (candidate.entity.explainability ===
                                    "available"
                                      ? "Qloo returned an explainability object. Only recognized input ID/value pairs are shown above."
                                      : "Per-result explainability unavailable."))}
                              </small>
                            </div>
                          ))}
                        </div>
                      )}
                      {view === "trace" && (
                        <div className="trace-list">
                          {result.audit.map((action, index) => (
                            <div className="trace-item" key={index}>
                              <span className="trace-index">0{index + 1}</span>
                              <div>
                                <strong>{action.step}</strong>
                                <p>{action.detail}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <aside className="insight-panel">
                      <div className="insight-kicker">WHY THIS WORKS</div>
                      <h3>Neither side disappears.</h3>
                      <p>
                        Each component appears in separate result sets for both
                        audiences. The planner protects the worse-served side
                        first, then reduces imbalance.
                      </p>
                      <div className="balance-graphic">
                        <div>
                          <span>{input.audiences[0].name}</span>
                          <strong>Σ {active?.balance[0]}</strong>
                        </div>
                        <div>
                          <span>{input.audiences[1].name}</span>
                          <strong>Σ {active?.balance[1]}</strong>
                        </div>
                      </div>
                      <small>
                        Lower sums mean earlier positions within each audience’s
                        own result set. These ranks are an algorithmic ordering
                        tool, not calibrated confidence or comparable affinity
                        scores.
                      </small>
                      <div className="constraint-recap">
                        <strong>
                          {active?.scheduleStatus === "conceptual"
                            ? "RULES PENDING VERIFICATION"
                            : "CHECKED RULES"}
                        </strong>
                        <span>
                          {active?.scheduleStatus === "duration-verified" && (
                            <Check size={15} />
                          )}{" "}
                          Film ≤ {input.constraints.maxMovieMinutes} minutes
                        </span>
                        <span>
                          {active?.scheduleStatus === "duration-verified" && (
                            <Check size={15} />
                          )}{" "}
                          Allowed ratings only
                        </span>
                        <span>
                          {active?.scheduleStatus === "duration-verified" && (
                            <Check size={15} />
                          )}{" "}
                          Proposed program ≤{" "}
                          {input.constraints.maxProgramMinutes ?? 180} minutes
                        </span>
                        <span>
                          <Check size={15} /> Rejected components excluded
                        </span>
                      </div>
                      <small>
                        Timing uses a proposed 45-minute non-film agenda.
                        Screening permission, availability, ticketing, and venue
                        are not verified.
                      </small>
                      <button onClick={() => setView("evidence")}>
                        Inspect the evidence <ArrowUpRight size={17} />
                      </button>
                    </aside>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </main>
      <footer>
        <div className="footer-brand">
          CROSSFADE<span>.</span>
        </div>
        <p>Turn cultural differences into experiences worth sharing.</p>
        <div>
          <span>
            {input.mode === "synthetic"
              ? "SYNTHETIC PREVIEW"
              : "LIVE QLOO MODE"}
          </span>
          <a
            href="https://github.com/HivMindAI/crossfade-ai"
            target="_blank"
            rel="noreferrer"
          >
            SOURCE CODE <ArrowUpRight size={14} />
          </a>
        </div>
      </footer>
    </div>
  );
}
