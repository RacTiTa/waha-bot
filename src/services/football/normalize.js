const FINISHED = new Set(['FT', 'AET', 'PEN', 'AP', 'PST', 'CANC', 'ABD', 'AWD', 'WO', 'Match Finished']);
const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT']);
const MATCH_DURATION_MS = 2.5 * 60 * 60 * 1000;

/**
 * Forma común que consumen el router y los tests, sin importar el proveedor.
 * `id` es el identificador del partido en el proveedor: sirve para pedirle
 * después más datos (formaciones, árbitro) del mismo partido.
 * @returns {{id,home,away,league,round,venue,date:Date,live,finished,score}}
 */
export function makeMatch({ id, home, away, league, round, venue, date, status, homeScore, awayScore }) {
  const started = date ? Date.now() >= date.getTime() : false;
  const stale = date ? Date.now() > date.getTime() + MATCH_DURATION_MS : false;

  return {
    id: id ?? null,
    home,
    away,
    league,
    round: round && round !== '0' ? String(round) : null,
    venue: venue || null,
    date,
    finished: FINISHED.has(status) || (stale && !LIVE.has(status)),
    live: LIVE.has(status) || (started && !stale && !FINISHED.has(status)),
    score: homeScore != null && awayScore != null ? `${homeScore}-${awayScore}` : null,
  };
}
