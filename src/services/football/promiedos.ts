import { makeMatch } from './normalize.js';
import type { FootballProvider, HeadToHead, Lineups, Match, MatchDetails, MissingTeam, PlayerLine, Team } from './types.js';

const BASE = 'https://www.promiedos.com.ar';
const UA = 'waha-bot/0.1 (bot personal de WhatsApp)';

// Argentina no usa horario de verano desde 2009, así que el offset es fijo.
const AR_OFFSET = '-03:00';

// La página trae próximos y últimos partidos juntos: la reusamos un rato
// para no bajar 240 KB tres veces seguidas.
const PAGE_TTL_MS = 60_000;

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/** `status.enum` de Promiedos traducido a los códigos que entiende normalize.js. */
const STATUS: Record<number, string> = { 1: 'NS', 2: 'LIVE', 3: 'FT' };

/** Formas mínimas del JSON que Promiedos deja embebido en el HTML: es scraping, así
 * que sólo se tipan los campos que efectivamente se leen. */
interface PromiedosTeamRef {
  id?: string;
  name?: string;
}

interface PromiedosGameInfo {
  name?: string;
  value?: string | null;
}

interface PromiedosPlayer {
  jersey_num?: number;
  player_short_name?: string;
  name?: string;
  is_captain?: boolean;
  formation_position?: string;
  missing_details?: { reason?: string | null };
}

interface PromiedosLineupTeam {
  team_num?: number;
  status?: string | null;
  formation?: string | null;
  staff?: PromiedosPlayer[];
  starting?: PromiedosPlayer[];
}

interface PromiedosH2HGame {
  teams?: PromiedosTeamRef[];
  scores?: number[];
  league?: { name?: string };
  start_time?: string;
}

interface PromiedosGame {
  id?: string;
  teams?: PromiedosTeamRef[];
  scores?: number[];
  status?: { enum?: number; name?: string };
  start_time?: string;
  stage_round_name?: string;
  league?: { name?: string };
  game_info?: PromiedosGameInfo[];
  players?: {
    lineups?: { teams?: PromiedosLineupTeam[] };
    missing_players?: PromiedosPlayer[][];
  };
  head_to_head?: {
    home_wins?: number;
    away_wins?: number;
    draws?: number;
    games?: PromiedosH2HGame[];
  };
}

interface PromiedosTeamPageData {
  competitor?: PromiedosTeamRef;
  main_league?: { name?: string };
  stadium?: { name?: string };
  games?: {
    next?: { rows?: Array<{ game?: PromiedosGame }> };
    last?: { rows?: Array<{ game?: PromiedosGame }> };
  };
}

function statusOf(game: PromiedosGame): string {
  const name = game.status?.name ?? '';
  if (/susp|posterg|aplaz|cancel/i.test(name)) return 'PST';
  return STATUS[game.status?.enum ?? -1] ?? 'NS';
}

/** "20-09-2026 14:45" (hora de Buenos Aires) -> Date */
function toDate(startTime?: string | null): Date | null {
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})$/.exec(startTime ?? '');
  if (!m) return null;

  const [, day, month, year, hour, minute] = m;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00${AR_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Promiedos no expone la liga de cada partido, sólo la principal del equipo.
 * Si la ronda es "Fecha N" asumimos esa liga; si no (copas), usamos el nombre
 * de la instancia y dejamos la fecha vacía.
 */
function leagueAndRound(game: PromiedosGame, mainLeague?: string): { league: string | null; round: string | null } {
  const stage = game.stage_round_name ?? '';
  const fecha = /fecha\s*(\d+)/i.exec(stage);

  if (fecha) return { league: mainLeague ?? null, round: fecha[1] ?? null };
  return { league: stage || null, round: null };
}

/** Extrae el JSON que Next.js deja embebido en el HTML (`__NEXT_DATA__`). */
export function parseTeamPage(html?: string | null): PromiedosTeamPageData {
  const match = NEXT_DATA.exec(html ?? '');
  if (!match) throw new Error('Promiedos: no encontré __NEXT_DATA__ en el HTML');

  const data = JSON.parse(match[1] ?? '{}')?.props?.pageProps?.data;
  if (!data?.competitor) throw new Error('Promiedos: el HTML no tiene datos del equipo');
  return data;
}

/** Cada fila de "próximos"/"últimos" trae el partido completo en `row.game`. */
function rowsToMatches(section: { rows?: Array<{ game?: PromiedosGame }> } | undefined, data: PromiedosTeamPageData): Match[] {
  const teamId = data.competitor?.id;
  const mainLeague = data.main_league?.name;

  return (section?.rows ?? [])
    .map((row) => {
      const game = row?.game;
      if (!game) return null;

      const [home, away] = game.teams ?? [];
      const { league, round } = leagueAndRound(game, mainLeague);
      const [homeScore, awayScore] = game.scores ?? [];

      return makeMatch({
        id: game.id,
        home: home?.name,
        away: away?.name,
        league,
        round,
        // El estadio sólo lo sabemos cuando juega de local.
        venue: home?.id === teamId ? data.stadium?.name ?? null : null,
        date: toDate(game.start_time),
        status: statusOf(game),
        homeScore,
        awayScore,
      });
    })
    .filter((m): m is Match => m !== null && m.date !== null);
}

/** Extrae el JSON de la ficha de un partido (/game/...). */
export function parseGamePage(html?: string | null): PromiedosGame {
  const match = NEXT_DATA.exec(html ?? '');
  if (!match) throw new Error('Promiedos: no encontré __NEXT_DATA__ en el HTML');

  const game = JSON.parse(match[1] ?? '{}')?.props?.pageProps?.initialData?.game;
  if (!game) throw new Error('Promiedos: el HTML no tiene datos del partido');
  return game;
}

const infoValue = (game: PromiedosGame, name: string): string | null =>
  game.game_info?.find((i) => i.name === name)?.value ?? null;

const playerLine = (p: PromiedosPlayer): PlayerLine => ({
  number: p.jersey_num && p.jersey_num > 0 ? p.jersey_num : null,
  name: p.player_short_name || p.name || '',
  captain: Boolean(p.is_captain),
});

/**
 * Las formaciones aparecen recién un rato antes del partido (primero como
 * "Probable", después "Confirmado"). Si todavía no están, devolvemos null.
 */
function toLineups(game: PromiedosGame): Lineups | null {
  const teams = game.players?.lineups?.teams;
  if (!teams?.length) return null;

  return {
    // El estado lo publican por equipo, pero en la práctica es el mismo.
    status: teams[0]?.status ?? null,
    teams: teams.map((t) => ({
      // team_num 1 = local, 2 = visitante.
      name: game.teams?.[(t.team_num ?? 1) - 1]?.name ?? null,
      formation: t.formation ?? null,
      coach: t.staff?.find((s) => s.formation_position === 'Entrenador')?.name ?? null,
      starting: (t.starting ?? []).map(playerLine),
    })),
  };
}

/**
 * Últimos enfrentamientos directos entre los dos equipos. `home_wins`/`away_wins`
 * ya vienen calculados en relación a los equipos de *este* partido (no al que
 * jugó de local en cada cruce histórico).
 */
function toHeadToHead(game: PromiedosGame): HeadToHead | null {
  const h2h = game.head_to_head;
  if (!h2h) return null;

  const games = (h2h.games ?? [])
    .map((g) => {
      const [home, away] = g.teams ?? [];
      const [homeScore, awayScore] = g.scores ?? [];
      return {
        home: home?.name,
        away: away?.name,
        homeScore,
        awayScore,
        league: g.league?.name ?? null,
        date: toDate(g.start_time),
      };
    })
    .filter((g) => g.date !== null);
  if (!games.length) return null;

  return { homeWins: h2h.home_wins ?? 0, awayWins: h2h.away_wins ?? 0, draws: h2h.draws ?? 0, games };
}

/** Lesionados y suspendidos: vienen en un array por equipo, en el mismo orden. */
function toMissing(game: PromiedosGame): MissingTeam[] {
  return (game.players?.missing_players ?? [])
    .map((players, i) => ({
      name: game.teams?.[i]?.name ?? null,
      players: (players ?? []).map((p) => ({
        name: p.player_short_name || p.name || '',
        reason: p.missing_details?.reason ?? null,
      })),
    }))
    .filter((t) => t.players.length > 0);
}

interface CreatePromiedosOptions {
  fetchImpl?: typeof fetch;
}

interface PageMemo {
  teamId: string;
  at: number;
  promise: Promise<PromiedosTeamPageData>;
}

/**
 * Promiedos (promiedos.com.ar). No tiene API pública: su API interna responde
 * vacía sin credenciales, así que leemos el JSON que el sitio ya renderiza en
 * la página del equipo. Gratis y con fixtures futuros, pero es scraping: si
 * cambian la página, se rompe.
 */
export function createPromiedos({ fetchImpl = fetch }: CreatePromiedosOptions = {}): FootballProvider {
  let memo: PageMemo | null = null;

  async function download(teamId: string): Promise<PromiedosTeamPageData> {
    // El slug del equipo no se valida, sólo el id: /team/x/igg funciona.
    const res = await fetchImpl(`${BASE}/team/x/${encodeURIComponent(teamId)}`, {
      headers: { 'user-agent': UA, accept: 'text/html' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Promiedos respondió ${res.status}`);

    return parseTeamPage(await res.text());
  }

  function teamPage(teamId: string): Promise<PromiedosTeamPageData> {
    if (memo && memo.teamId === teamId && Date.now() - memo.at < PAGE_TTL_MS) return memo.promise;

    const promise = download(teamId).catch((err) => {
      memo = null; // no cachees el error
      throw err;
    });
    memo = { teamId, at: Date.now(), promise };
    return promise;
  }

  return {
    name: 'promiedos',
    teamIdKey: 'promiedos',
    supportsFixtures: true,

    async nextMatches(teamId: string) {
      const data = await teamPage(teamId);
      return rowsToMatches(data.games?.next, data);
    },

    async lastMatches(teamId: string) {
      const data = await teamPage(teamId);
      return rowsToMatches(data.games?.last, data);
    },

    async team(teamId: string): Promise<Team | null> {
      const { competitor } = await teamPage(teamId);
      return competitor?.id && competitor?.name ? { id: competitor.id, name: competitor.name } : null;
    },

    /** Ficha del partido: formaciones, bajas, árbitro y TV. */
    async details(matchId: string): Promise<MatchDetails> {
      // Igual que con los equipos, el slug del partido no se valida.
      const res = await fetchImpl(`${BASE}/game/x/${encodeURIComponent(matchId)}`, {
        headers: { 'user-agent': UA, accept: 'text/html' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Promiedos respondió ${res.status}`);

      const game = parseGamePage(await res.text());
      return {
        // A diferencia de la página del equipo, acá sí viene la liga del partido.
        league: game.league?.name ?? null,
        venue: infoValue(game, 'Estadio'),
        referee: infoValue(game, 'Árbitro'),
        tv: infoValue(game, 'Arg TV'),
        lineups: toLineups(game),
        missing: toMissing(game),
        headToHead: toHeadToHead(game),
      };
    },
  };
}
