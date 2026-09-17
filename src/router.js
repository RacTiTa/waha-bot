import { config } from './config.js';
import { getNextMatch, getLastMatch, getTeam, provider } from './services/football/index.js';

const HELP = [
  '👋 Hola! Soy un bot. Por ahora sé una sola cosa:',
  '',
  '• *próximo partido de Boca* — te digo cuándo juega',
  '',
  'Escribí *ayuda* para ver esto de nuevo.',
].join('\n');

function formatDate(date) {
  const fecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: config.timezone,
  }).format(date);

  const hora = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // en es-AR el default es 12h ("08:30 p. m.")
    timeZone: config.timezone,
  }).format(date);

  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} a las ${hora} hs`;
}

function countdown(date) {
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

export function formatMatch(match, teamName) {
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
    `📅 ${formatDate(match.date)}`,
    match.venue ? `🏟 ${match.venue}` : null,
    countdown(match.date) ? `⏳ ${countdown(match.date)}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

async function nextMatchReply() {
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

const INTENTS = [
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
    name: 'ayuda',
    test: (t) => /^(ayuda|help|hola|menu|men[uú]|\/start|buenas)\b/.test(t),
    run: async () => HELP,
  },
];

/** Normaliza el texto: minúsculas y sin acentos, para que los regex sean simples. */
function normalizeText(text) {
  return text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export async function routeMessage(rawText) {
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
