import { config } from './config.js';
import {
  getLastMatch,
  getMatchDetails,
  getNextMatch,
  getTeam,
  provider,
} from './services/football/index.js';
import type { HeadToHeadGame, LineupTeam, Match, MatchDetails, MissingTeam, PlayerLine } from './services/football/types.js';

const HELP = [
  '👋 Hola! Soy un bot. Por ahora sé esto:',
  '',
  '• *próximo partido de Boca* — te digo cuándo juega',
  '• *formación* — el once, si ya lo publicaron',
  '• *historial* — los últimos enfrentamientos entre los equipos',
  '',
  'Escribí *ayuda* para ver esto de nuevo.',
].join('\n');

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // en es-AR el default es 12h ("08:30 p. m.")
    timeZone: config.timezone,
  }).format(date);
}

function formatDate(date: Date): string {
  const fecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: config.timezone,
  }).format(date);

  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} a las ${formatTime(date)} hs`;
}

function countdown(date: Date): string | null {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return null;

  const horasTotales = Math.floor(ms / 3_600_000);
  const dias = Math.floor(horasTotales / 24);
  const horas = horasTotales % 24;
  const minutos = Math.floor((ms % 3_600_000) / 60_000);

  if (dias > 0) return `Faltan ${dias} ${dias === 1 ? 'día' : 'días'} y ${horas} h`;
  if (horasTotales > 0) return `Faltan ${horasTotales} h ${minutos} min`;
  return `Faltan ${minutos} min`;
}

export function formatMatch(match: Match, teamName: string): string {
  const date = match.date as Date; // siempre viene seteado: los proveedores filtran los partidos sin fecha.

  if (match.live) {
    return [
      `🔴 *${teamName} está jugando ahora*`,
      '',
      `*${match.home} vs ${match.away}*`,
      match.score ? `⚽ Va ${match.score}` : null,
      match.league ? `🏆 ${match.league}` : null,
    ]
      .filter((l) => l !== null)
      .join('\n');
  }

  return [
    `⚽ *Próximo partido de ${teamName}*`,
    '',
    `*${match.home} vs ${match.away}*`,
    match.league ? `🏆 ${match.league}${match.round ? ` — fecha ${match.round}` : ''}` : null,
    `📅 ${formatDate(date)}`,
    match.venue ? `🏟 ${match.venue}` : null,
    countdown(date) ? `⏳ ${countdown(date)}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

const MAX_BAJAS = 5;

/** Aviso de la mañana del partido: hora, cancha, TV y árbitro si los sabemos. */
export function formatMatchDay(match: Match, teamName: string, details: MatchDetails | null = null): string {
  const league = details?.league ?? match.league;

  return [
    `📣 *Hoy juega ${teamName}*`,
    '',
    `*${match.home} vs ${match.away}*`,
    league ? `🏆 ${league}${match.round ? ` — fecha ${match.round}` : ''}` : null,
    `🕒 ${formatTime(match.date as Date)} hs`,
    details?.venue || match.venue ? `🏟 ${details?.venue ?? match.venue}` : null,
    details?.tv ? `📺 ${details.tv}` : null,
    details?.referee ? `👨‍⚖️ ${details.referee}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** Promiedos dice "Confirmado"/"Probable"; en femenino para "la formación". */
function lineupStatus(status: string | null): string {
  if (/confirm/i.test(status ?? '')) return ' confirmada';
  if (/probable/i.test(status ?? '')) return ' probable';
  return '';
}

const playerName = (p: PlayerLine): string => `${p.number ? `${p.number} ` : ''}${p.name}${p.captain ? ' (C)' : ''}`;

function bajasLine(team: MissingTeam): string {
  const nombres = team.players.slice(0, MAX_BAJAS).map((p) => p.name);
  const resto = team.players.length - nombres.length;
  return `🤕 Bajas ${team.name}: ${nombres.join(', ')}${resto > 0 ? ` y ${resto} más` : ''}`;
}

/** Formaciones (probables o confirmadas) de los dos equipos. */
export function formatLineups(match: Match, details: MatchDetails | null): string | null {
  const { lineups, missing = [] } = details ?? {};
  if (!lineups?.teams?.length) return null;

  const equipos = lineups.teams.flatMap((team: LineupTeam) => [
    `*${team.name}*${team.formation ? ` — ${team.formation}` : ''}`,
    team.starting.map(playerName).join(', '),
    team.coach ? `DT: ${team.coach}` : null,
    '',
  ]);

  return [
    `📋 *Formación${lineupStatus(lineups.status)}*`,
    `${match.home} vs ${match.away} — ${formatTime(match.date as Date)} hs`,
    '',
    ...equipos,
    ...missing.filter((t) => t.players.length).map(bajasLine),
  ]
    .filter((l) => l !== null)
    .join('\n')
    .trimEnd();
}

function formatDateShort(date: Date): string {
  const [month, day] = new Intl.DateTimeFormat('en-CA', { day: '2-digit', month: '2-digit', timeZone: config.timezone })
    .format(date)
    .split('-');
  return `${day}/${month}`;
}

function headToHeadLine(game: HeadToHeadGame): string {
  return `${formatDateShort(game.date as Date)}: ${game.home} ${game.homeScore}-${game.awayScore} ${game.away}${game.league ? ` (${game.league})` : ''}`;
}

/** Resultados de los últimos enfrentamientos directos entre los dos equipos. */
export function formatHeadToHead(match: Match, details: MatchDetails | null): string | null {
  const h2h = details?.headToHead;
  if (!h2h?.games?.length) return null;

  const resumen = [
    h2h.homeWins ? `${match.home} ganó ${h2h.homeWins}` : null,
    h2h.awayWins ? `${match.away} ganó ${h2h.awayWins}` : null,
    h2h.draws ? `empataron ${h2h.draws}` : null,
  ]
    .filter((l) => l !== null)
    .join(', ');

  return [
    `📊 *Historial ${match.home} vs ${match.away}*`,
    resumen || null,
    '',
    ...h2h.games.map(headToHeadLine),
  ]
    .filter((l) => l !== null)
    .join('\n')
    .trimEnd();
}

async function lineupsReply(): Promise<string> {
  const match = await getNextMatch();
  if (!match) return '🤔 No tengo el próximo partido, así que menos la formación.';

  const details = await getMatchDetails(match).catch(() => null);
  const texto = formatLineups(match, details);
  if (texto) return texto;

  const falta = countdown(match.date as Date);
  return [
    `⏳ Todavía no publicaron la formación de *${match.home} vs ${match.away}*.`,
    'Suele salir un rato antes del partido.',
    falta ? `(${falta})` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

async function headToHeadReply(): Promise<string> {
  const match = await getNextMatch();
  if (!match) return '🤔 No tengo el próximo partido, así que menos el historial.';

  const details = await getMatchDetails(match).catch(() => null);
  const texto = formatHeadToHead(match, details);
  if (texto) return texto;

  return `🤔 No tengo el historial de enfrentamientos entre ${match.home} y ${match.away}.`;
}

async function nextMatchReply(): Promise<string> {
  const [team, match] = await Promise.all([getTeam().catch(() => null), getNextMatch()]);
  const teamName = team?.name ?? 'Boca Juniors';

  if (match) return formatMatch(match, teamName);

  const last = await getLastMatch().catch(() => null);
  const ultimo = last
    ? `\n\nÚltimo partido: *${last.home} ${last.score ?? 'vs'} ${last.away}*${last.league ? ` (${last.league})` : ''}.`
    : '';

  // La API gratuita de TheSportsDB no publica fixtures futuros: conviene decirlo.
  const aviso = provider.supportsFixtures
    ? ''
    : `\n\n_(El proveedor "${provider.name}" no publica partidos futuros. Configurá APIFOOTBALL_KEY o una key premium de TheSportsDB.)_`;

  return `🤔 Todavía no hay fecha confirmada para el próximo partido de ${teamName}.${ultimo}${aviso}`;
}

interface Intent {
  name: string;
  test: (text: string) => boolean;
  run: (text: string) => Promise<string>;
}

const INTENTS: Intent[] = [
  {
    name: 'formacion',
    // "formacion", "alineacion", "el once", "como forma boca"
    test: (t) =>
      /\b(formaci[oó]n|formacion|alineaci[oó]n|alineacion|el once|onceno)\b/.test(t) ||
      /\bc[oó]mo forma\b/.test(t),
    run: lineupsReply,
  },
  {
    name: 'proximo-partido',
    // "cuando juega boca", "proximo partido", "boca?", "a que hora juega"
    test: (t) =>
      /\bboca\b/.test(t) ||
      /(pr[oó]ximo|proxima|siguiente).*(partido|encuentro)/.test(t) ||
      /(cu[aá]ndo|cuando|a qu[eé] hora|que d[ií]a).*(juega|jueguen|partido)/.test(t),
    run: nextMatchReply,
  },
  {
    name: 'historial',
    // "historial", "enfrentamientos", "antecedentes", "ultimos partidos entre"
    test: (t) =>
      /\b(historial|enfrentamientos|antecedentes)\b/.test(t) ||
      /ultimos.*(partidos|cruces|duelos).*(entre|contra)/.test(t),
    run: headToHeadReply,
  },
  {
    name: 'ayuda',
    test: (t) => /^(ayuda|help|hola|menu|men[uú]|\/start|buenas)\b/.test(t),
    run: async () => HELP,
  },
];

/** Normaliza el texto: minúsculas y sin acentos, para que los regex sean simples. */
function normalizeText(text: string): string {
  return text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export async function routeMessage(rawText: string | undefined | null): Promise<string | null> {
  const text = normalizeText(rawText ?? '');
  if (!text) return null;

  const intent = INTENTS.find((i) => i.test(text));
  if (!intent) return HELP;

  try {
    return await intent.run(text);
  } catch (err) {
    console.error(`[intent:${intent.name}]`, err);
    return '😕 No pude consultar la información ahora mismo. Probá de nuevo en un rato.';
  }
}
