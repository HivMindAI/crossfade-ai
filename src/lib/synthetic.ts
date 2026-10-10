import type {
  CulturalSource,
  Domain,
  Entity,
  EvidenceSet,
  SearchMatch,
} from "./model";

// SYNTHETIC / NOT REAL QLOO DATA. Names, IDs, ranking and metadata below are invented.
const seedCatalog: SearchMatch[] = [
  { id: "syn-seed-miles", name: "Miles Davis", domain: "artist" },
  { id: "syn-seed-spirited", name: "Spirited Away", domain: "movie" },
  { id: "syn-seed-beyonce", name: "Beyoncé", domain: "artist" },
  {
    id: "syn-seed-everything",
    name: "Everything Everywhere All at Once",
    domain: "movie",
  },
  { id: "syn-seed-nina", name: "Nina Simone", domain: "artist" },
  { id: "syn-seed-matrix", name: "The Matrix", domain: "movie" },
];

const candidates: Record<Domain, Entity[]> = {
  artist: [
    { id: "syn-artist-1", name: "The Blue Hour Collective", domain: "artist" },
    { id: "syn-artist-2", name: "Mosaic Radio", domain: "artist" },
    { id: "syn-artist-3", name: "Lantern Orchestra", domain: "artist" },
    { id: "syn-artist-4", name: "Electric Atlas", domain: "artist" },
    { id: "syn-artist-5", name: "Quiet City Quartet", domain: "artist" },
  ],
  movie: [
    {
      id: "syn-movie-1",
      name: "The City Between Songs",
      domain: "movie",
      duration: 94,
      contentRating: "PG",
    },
    {
      id: "syn-movie-2",
      name: "Paper Constellations",
      domain: "movie",
      duration: 112,
      contentRating: "PG-13",
    },
    {
      id: "syn-movie-3",
      name: "After the Last Train",
      domain: "movie",
      duration: 86,
      contentRating: "G",
    },
    {
      id: "syn-movie-4",
      name: "Midnight Atlas",
      domain: "movie",
      duration: 131,
      contentRating: "R",
    },
    {
      id: "syn-movie-5",
      name: "A Map of Rain",
      domain: "movie",
      duration: 105,
      contentRating: "PG",
    },
  ],
  book: [
    { id: "syn-book-1", name: "Letters from the Night Market", domain: "book" },
    { id: "syn-book-2", name: "A Different Kind of Chorus", domain: "book" },
    { id: "syn-book-3", name: "The Small Hours Almanac", domain: "book" },
    { id: "syn-book-4", name: "Every Street a Story", domain: "book" },
    { id: "syn-book-5", name: "The Listening Room", domain: "book" },
  ],
};

const seedRanks: Record<string, Record<Domain, number[]>> = {
  "syn-seed-miles": {
    artist: [0, 4, 1, 2, 3],
    movie: [0, 2, 1, 4, 3],
    book: [4, 0, 2, 1, 3],
  },
  "syn-seed-spirited": {
    artist: [2, 0, 4, 1, 3],
    movie: [2, 0, 4, 1, 3],
    book: [0, 2, 1, 4, 3],
  },
  "syn-seed-beyonce": {
    artist: [1, 3, 0, 2, 4],
    movie: [1, 0, 3, 4, 2],
    book: [1, 3, 0, 4, 2],
  },
  "syn-seed-everything": {
    artist: [3, 1, 0, 4, 2],
    movie: [0, 1, 4, 3, 2],
    book: [3, 0, 1, 2, 4],
  },
  "syn-seed-nina": {
    artist: [4, 0, 2, 1, 3],
    movie: [4, 2, 0, 1, 3],
    book: [4, 2, 0, 1, 3],
  },
  "syn-seed-matrix": {
    artist: [3, 2, 1, 0, 4],
    movie: [3, 1, 4, 0, 2],
    book: [3, 1, 2, 4, 0],
  },
};

export const syntheticCatalog = seedCatalog;

export const syntheticSource: CulturalSource = {
  async search(name, domain) {
    return seedCatalog.filter(
      (seed) =>
        seed.domain === domain &&
        seed.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
  },
  async insights(
    domain,
    signalIds,
    excludedIds,
    options = { take: 20, page: 1 },
  ): Promise<EvidenceSet> {
    const ranks = signalIds.map((id) => seedRanks[id]?.[domain]);
    if (ranks.some((rank) => !rank))
      return { entities: [], signalIds, source: "synthetic", ...options };
    const entities = candidates[domain]
      .map((entity, index) => ({
        entity,
        order: ranks.reduce(
          (sum, rank) => sum + (rank?.indexOf(index) ?? -1) + 1,
          0,
        ),
      }))
      .filter(({ entity }) => !excludedIds.includes(entity.id))
      .sort(
        (a, b) => a.order - b.order || a.entity.id.localeCompare(b.entity.id),
      )
      .map(({ entity }) => entity)
      .slice((options.page - 1) * options.take, options.page * options.take);
    return { entities, signalIds, source: "synthetic", ...options };
  },
};
