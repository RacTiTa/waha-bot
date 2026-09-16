import { makeMatch } from './normalize.js';

const V1 = 'https://www.thesportsdb.com/api/v1/json';
const V2 = 'https://www.thesportsdb.com/api/v2/json';
const FREE_KEYS = new Set(['3', '123', '']);

/**
 * TheSportsDB. Con las keys públicas ("3") sólo está disponible la v1, que ya
 * no devuelve partidos futuros; con una key premium se usa la v2, que sí.
 */
export function createTheSportsDb({ key }) {
  const premium = !FREE_KEYS.has(String(key));

  async function get(v1Path, v2Path) {
    const url = premium ? `${V2}/${v2Path}` : `${V1}/${key || '3'}/${v1Path}`;
    const res = await fetch(url, {
      headers: premium ? { 'X-API-KEY': key } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`TheSportsDB respondió ${res.status}`);

    const data = await res.json();
    if (data?.Message) throw new Error(`TheSportsDB: ${data.Message}`);
    return data;
  }

  /** Cada endpoint nombra el array distinto (events / results / schedule). */
  const firstArray = (data) => Object.values(data ?? {}).find(Array.isArray) ?? [];

  /** El timestamp viene en UTC pero sin sufijo de zona. */
  function toDate(e) {
    const raw = e.strTimestamp ?? `${e.dateEvent}T${e.strTime ?? '00:00:00'}`;
    const date = new Date(`${raw.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const toMatch = (e) =>
    makeMatch({
      home: e.strHomeTeam,
      away: e.strAwayTeam,
      league: e.strLeague,
      round: e.intRound,
      venue: e.strVenue,
      date: toDate(e),
      status: e.strStatus,
      homeScore: e.intHomeScore,
      awayScore: e.intAwayScore,
    });

  return {
    name: premium ? 'thesportsdb (premium)' : 'thesportsdb (free)',
    supportsFixtures: premium,

    async nextMatches(teamId) {
      const data = await get(`eventsnext.php?id=${teamId}`, `schedule/next/team/${teamId}`);
      return firstArray(data).map(toMatch).filter((m) => m.date);
    },

    async lastMatches(teamId) {
      const data = await get(`eventslast.php?id=${teamId}`, `schedule/previous/team/${teamId}`);
      return firstArray(data).map(toMatch).filter((m) => m.date);
    },

    async team(teamId) {
      const data = await get(`lookupteam.php?id=${teamId}`, `lookup/team/${teamId}`);
      const t = firstArray(data)[0];
      return t ? { id: t.idTeam, name: t.strTeam } : null;
    },
  };
}
