import { makeMatch } from './normalize.js';

const BASE = 'https://www.promiedos.com.ar';
const UA = 'waha-bot/0.1 (bot personal de WhatsApp)';

// Argentina no usa horario de verano desde 2009, así que el offset es fijo.
const AR_OFFSET = '-03:00';

// La página trae próximos y últimos partidos juntos: la reusamos un rato
// para no bajar 240 KB tres veces seguidas.
const PAGE_TTL_MS = 60_000;

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/** `status.enum` de Promiedos traducido a los códigos que entiende normalize.js. */
const STATUS = { 1: 'NS', 2: 'LIVE', 3: 'FT' };

function statusOf(game) {
  const name = game?.status?.name ?? '';
  if (/susp|posterg|aplaz|cancel/i.test(name)) return 'PST';
  return STATUS[game?.status?.enum] ?? 'NS';
}

/** "20-09-2026 14:45" (hora de Buenos Aires) -> Date */
function toDate(startTime) {
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
function leagueAndRound(game, mainLeague) {
  const stage = game?.stage_round_name ?? '';
  const fecha = /fecha\s*(\d+)/i.exec(stage);

  if (fecha) return { league: mainLeague ?? null, round: fecha[1] };
  return { league: stage || null, round: null };
}

/** Extrae el JSON que Next.js deja embebido en el HTML (`__NEXT_DATA__`). */
export function parseTeamPage(html) {
  const match = NEXT_DATA.exec(html ?? '');
  if (!match) throw new Error('Promiedos: no encontré __NEXT_DATA__ en el HTML');

  const data = JSON.parse(match[1])?.props?.pageProps?.data;
  if (!data?.competitor) throw new Error('Promiedos: el HTML no tiene datos del equipo');
  return data;
}

/** Cada fila de "próximos"/"últimos" trae el partido completo en `row.game`. */
function rowsToMatches(section, data) {
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
        home: home?.name,
        away: away?.name,
        league,
        round,
        // El estadio sólo lo sabemos cuando juega de local.
        venue: home?.id === teamId ? data.stadium?.name : null,
        date: toDate(game.start_time),
        status: statusOf(game),
        homeScore,
        awayScore,
      });
    })
    .filter((m) => m && m.date);
}

/**
 * Promiedos (promiedos.com.ar). No tiene API pública: su API interna responde
 * vacía sin credenciales, así que leemos el JSON que el sitio ya renderiza en
 * la página del equipo. Gratis y con fixtures futuros, pero es scraping: si
 * cambian la página, se rompe.
 */
export function createPromiedos({ fetchImpl = fetch } = {}) {
  let memo = null; // { teamId, at, promise }

  async function download(teamId) {
    // El slug del equipo no se valida, sólo el id: /team/x/igg funciona.
    const res = await fetchImpl(`${BASE}/team/x/${encodeURIComponent(teamId)}`, {
      headers: { 'user-agent': UA, accept: 'text/html' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Promiedos respondió ${res.status}`);

    return parseTeamPage(await res.text());
  }

  function teamPage(teamId) {
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

    async nextMatches(teamId) {
      const data = await teamPage(teamId);
      return rowsToMatches(data.games?.next, data);
    },

    async lastMatches(teamId) {
      const data = await teamPage(teamId);
      return rowsToMatches(data.games?.last, data);
    },

    async team(teamId) {
      const { competitor } = await teamPage(teamId);
      return competitor ? { id: competitor.id, name: competitor.name } : null;
    },
  };
}
