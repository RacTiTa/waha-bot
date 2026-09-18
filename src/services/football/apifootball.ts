import { makeMatch } from './normalize.js';
import type { FootballProvider, Match, Team } from './types.js';

const BASE = 'https://v3.football.api-sports.io';

interface ApiFootballFixture {
  teams?: {
    home?: { name?: string };
    away?: { name?: string };
  };
  league?: { name?: string; round?: string | number };
  fixture?: {
    venue?: { name?: string; city?: string };
    date?: string;
    status?: { short?: string };
  };
  goals?: { home?: number | null; away?: number | null };
}

interface ApiFootballTeam {
  team?: { id?: number | string; name?: string };
}

interface CreateApiFootballOptions {
  key?: string;
}

interface ApiFootballResponse<T> {
  response?: T[];
  errors?: unknown[] | Record<string, unknown>;
}

/** API-Football (api-sports.io). Necesita key propia; el plan gratis da 100 requests/día. */
export function createApiFootball({ key }: CreateApiFootballOptions): FootballProvider {
  async function get<T>(path: string): Promise<T[]> {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'x-apisports-key': key ?? '' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`API-Football respondió ${res.status}`);

    const data = (await res.json()) as ApiFootballResponse<T>;
    const errors = data.errors;
    if (errors && (Array.isArray(errors) ? errors.length : Object.keys(errors).length)) {
      throw new Error(`API-Football: ${JSON.stringify(errors)}`);
    }
    return data.response ?? [];
  }

  const toMatch = (f: ApiFootballFixture): Match =>
    makeMatch({
      home: f.teams?.home?.name,
      away: f.teams?.away?.name,
      league: f.league?.name,
      round: f.league?.round,
      venue: [f.fixture?.venue?.name, f.fixture?.venue?.city].filter(Boolean).join(', '),
      date: f.fixture?.date ? new Date(f.fixture.date) : null,
      status: f.fixture?.status?.short,
      homeScore: f.goals?.home,
      awayScore: f.goals?.away,
    });

  return {
    name: 'api-football',
    teamIdKey: 'apiFootball',
    supportsFixtures: true,

    async nextMatches(teamId: string) {
      const fixtures = await get<ApiFootballFixture>(`/fixtures?team=${teamId}&next=5`);
      return fixtures.map(toMatch).filter((m) => m.date);
    },

    async lastMatches(teamId: string) {
      const fixtures = await get<ApiFootballFixture>(`/fixtures?team=${teamId}&last=1`);
      return fixtures.map(toMatch).filter((m) => m.date);
    },

    async team(teamId: string): Promise<Team | null> {
      const teams = await get<ApiFootballTeam>(`/teams?id=${teamId}`);
      const t = teams[0]?.team;
      return t?.id != null && t?.name ? { id: String(t.id), name: t.name } : null;
    },
  };
}
