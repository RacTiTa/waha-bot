import { makeMatch } from './normalize.js';
import type { FootballProvider, Match, Team } from './types.js';

const V1 = 'https://www.thesportsdb.com/api/v1/json';
const V2 = 'https://www.thesportsdb.com/api/v2/json';
const FREE_KEYS = new Set(['3', '123', '']);

interface TheSportsDbEvent {
  strTimestamp?: string;
  dateEvent?: string;
  strTime?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strLeague?: string;
  intRound?: string | number;
  strVenue?: string;
  strStatus?: string;
  intHomeScore?: number | string | null;
  intAwayScore?: number | string | null;
}

interface TheSportsDbTeam {
  idTeam?: string;
  strTeam?: string;
}

interface CreateTheSportsDbOptions {
  key?: string;
}

/**
 * TheSportsDB. Con las keys públicas ("3") sólo está disponible la v1, que ya
 * no devuelve partidos futuros; con una key premium se usa la v2, que sí.
 */
export function createTheSportsDb({ key }: CreateTheSportsDbOptions): FootballProvider {
  const premium = !FREE_KEYS.has(String(key));

  async function get(v1Path: string, v2Path: string): Promise<Record<string, unknown>> {
    const url = premium ? `${V2}/${v2Path}` : `${V1}/${key || '3'}/${v1Path}`;
    const res = await fetch(url, {
      headers: premium ? { 'X-API-KEY': key ?? '' } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`TheSportsDB respondió ${res.status}`);

    const data = (await res.json()) as Record<string, unknown> & { Message?: string };
    if (data.Message) throw new Error(`TheSportsDB: ${data.Message}`);
    return data;
  }

  /** Cada endpoint nombra el array distinto (events / results / schedule). */
  const firstArray = <T>(data: Record<string, unknown> | undefined): T[] =>
    (Object.values(data ?? {}).find(Array.isArray) as T[] | undefined) ?? [];

  /** El timestamp viene en UTC pero sin sufijo de zona. */
  function toDate(e: TheSportsDbEvent): Date | null {
    const raw = e.strTimestamp ?? `${e.dateEvent}T${e.strTime ?? '00:00:00'}`;
    const date = new Date(`${raw.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const toMatch = (e: TheSportsDbEvent): Match =>
    makeMatch({
      home: e.strHomeTeam,
      away: e.strAwayTeam,
      league: e.strLeague,
      round: e.intRound,
      venue: e.strVenue,
      date: toDate(e),
      status: e.strStatus,
      homeScore: e.intHomeScore != null ? Number(e.intHomeScore) : null,
      awayScore: e.intAwayScore != null ? Number(e.intAwayScore) : null,
    });

  return {
    name: premium ? 'thesportsdb (premium)' : 'thesportsdb (free)',
    teamIdKey: 'sportsDb',
    supportsFixtures: premium,

    async nextMatches(teamId: string) {
      const data = await get(`eventsnext.php?id=${teamId}`, `schedule/next/team/${teamId}`);
      return firstArray<TheSportsDbEvent>(data).map(toMatch).filter((m) => m.date);
    },

    async lastMatches(teamId: string) {
      const data = await get(`eventslast.php?id=${teamId}`, `schedule/previous/team/${teamId}`);
      return firstArray<TheSportsDbEvent>(data).map(toMatch).filter((m) => m.date);
    },

    async team(teamId: string): Promise<Team | null> {
      const data = await get(`lookupteam.php?id=${teamId}`, `lookup/team/${teamId}`);
      const t = firstArray<TheSportsDbTeam>(data)[0];
      return t?.idTeam && t?.strTeam ? { id: t.idTeam, name: t.strTeam } : null;
    },
  };
}
