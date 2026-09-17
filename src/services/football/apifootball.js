import { makeMatch } from './normalize.js';

const BASE = 'https://v3.football.api-sports.io';

/** API-Football (api-sports.io). Necesita key propia; el plan gratis da 100 requests/día. */
export function createApiFootball({ key }) {
  async function get(path) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'x-apisports-key': key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`API-Football respondió ${res.status}`);

    const data = await res.json();
    const errors = data?.errors;
    if (errors && (Array.isArray(errors) ? errors.length : Object.keys(errors).length)) {
      throw new Error(`API-Football: ${JSON.stringify(errors)}`);
    }
    return data?.response ?? [];
  }

  const toMatch = (f) =>
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

    async nextMatches(teamId) {
      const fixtures = await get(`/fixtures?team=${teamId}&next=5`);
      return fixtures.map(toMatch).filter((m) => m.date);
    },

    async lastMatches(teamId) {
      const fixtures = await get(`/fixtures?team=${teamId}&last=1`);
      return fixtures.map(toMatch).filter((m) => m.date);
    },

    async team(teamId) {
      const teams = await get(`/teams?id=${teamId}`);
      const t = teams[0]?.team;
      return t ? { id: String(t.id), name: t.name } : null;
    },
  };
}
