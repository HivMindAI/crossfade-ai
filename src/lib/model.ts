import { z } from "zod";

export const DOMAINS = ["artist", "movie", "book"] as const;
export type Domain = (typeof DOMAINS)[number];
export const entityType = (domain: Domain) => `urn:entity:${domain}` as const;

export const interestSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(DOMAINS),
  id: z.string().trim().min(2).max(100).optional(),
});
export const audienceSchema = z.object({
  name: z.string().trim().min(2).max(45),
  interests: z.array(interestSchema).min(1).max(3),
});
export const requestSchema = z.object({
  mode: z.enum(["synthetic", "live"]),
  audiences: z.tuple([audienceSchema, audienceSchema]),
  constraints: z.object({
    maxMovieMinutes: z.number().int().min(45).max(300),
    maxProgramMinutes: z.number().int().min(90).max(420).optional(),
    allowedRatings: z
      .array(z.enum(["G", "PG", "PG-13", "R", "NC-17"]))
      .min(1)
      .max(5),
    excludedIds: z.array(z.string().trim().min(2).max(100)).max(30),
  }),
});

export type PlanRequest = z.infer<typeof requestSchema>;
export type Interest = z.infer<typeof interestSchema>;
export type Entity = {
  id: string;
  name: string;
  domain: Domain;
  duration?: number;
  contentRating?: string;
  explainability?: "available" | "unavailable";
  influence?: InfluenceSignal[];
  evidenceWarning?: string;
};
export type InfluenceSignal = { signalId: string; normalizedInfluence: number };
export type SearchMatch = Pick<Entity, "id" | "name" | "domain">;
export type InsightOptions = { take: number; page: number };
export type EvidenceSet = {
  entities: Entity[];
  signalIds: string[];
  source: "synthetic" | "qloo";
  page?: number;
  take?: number;
};
export type CulturalSource = {
  search(name: string, domain: Domain): Promise<SearchMatch[]>;
  insights(
    domain: Domain,
    signalIds: string[],
    excludedIds: string[],
    options?: InsightOptions,
  ): Promise<EvidenceSet>;
  metrics?(): { httpAttempts: number };
};
export type Action = {
  step: "PLAN" | "SELECT TOOLS" | "EXECUTE" | "EVALUATE" | "VERIFY" | "REPLAN";
  detail: string;
};
export type Candidate = {
  entity: Entity;
  ranks: [number, number];
  signals: [string[], string[]];
  source: "synthetic" | "qloo";
  influences: [InfluenceSignal[], InfluenceSignal[]];
  explanation: string;
};
export type Blueprint = {
  id: string;
  title: string;
  candidates: Candidate[];
  balance: [number, number];
  path: "fairness" | "audience-a" | "audience-b";
  programMinutes: number | null;
  scheduleStatus: "duration-verified" | "conceptual";
  unverified: ("runtime" | "content rating")[];
  rationale: string;
};
export type PlanResult = {
  status: "ready" | "conceptual" | "no-solution";
  mode: "synthetic" | "live";
  options: Blueprint[];
  resolved: [SearchMatch[], SearchMatch[]];
  audit: Action[];
  gaps: string[];
  alternativesNote: string;
  metrics: {
    sourceCalls: number;
    recoveryCalls: number;
    elapsedMs: number;
    sharedEligible: Record<Domain, number>;
    httpAttempts?: number;
  };
  warning?: string;
};
