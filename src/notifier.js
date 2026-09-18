import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { formatHeadToHead, formatLineups, formatMatchDay } from './router.js';
import { getMatchDetails, getNextMatch, getTeam } from './services/football/index.js';
import { waha } from './waha.js';

// Si el partido ya empezó y todavía no salió la formación, seguimos mirando
// un rato: a veces la publican sobre la hora.
const LINEUP_GRACE_MS = 15 * 60 * 1000;

/** Día local ("2026-09-20") para comparar fechas sin pelearse con la zona horaria. */
const dayKey = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

/** Minutos desde la medianoche local. */
function minutesOfDay(date, timeZone) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Qué avisos corresponden ahora mismo. Es una función pura: el reloj, lo ya
 * enviado y la configuración entran por parámetro, así se puede testear.
 *
 * @param {{match, now:Date, sent:{matchDay?:boolean,lineup?:boolean}, settings}} args
 * @returns {Array<'matchDay'|'lineup'>}
 */
export function dueNotifications({ match, now, sent = {}, settings }) {
  if (!match?.date) return [];

  const timeZone = settings.timezone;
  const kickoff = match.date.getTime();
  const t = now.getTime();
  const due = [];

  const esHoy = dayKey(now, timeZone) === dayKey(match.date, timeZone);
  if (!sent.matchDay && esHoy && t < kickoff && minutesOfDay(now, timeZone) >= settings.matchDayMinutes) {
    due.push('matchDay');
  }

  const desde = kickoff - settings.lineupMinutes * 60 * 1000;
  if (!sent.lineup && t >= desde && t <= kickoff + LINEUP_GRACE_MS) {
    due.push('lineup');
  }

  return due;
}

/** Estado en disco, para no repetir un aviso después de reiniciar el bot. */
function createStore(file) {
  let state = { matchId: null, matchDay: false, lineup: false };

  try {
    state = { ...state, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    // No existe todavía (o quedó ilegible): arrancamos de cero.
  }

  return {
    /** Lo enviado para este partido; si cambió el partido, se resetea. */
    for(matchId) {
      if (state.matchId !== matchId) state = { matchId, matchDay: false, lineup: false };
      return state;
    },
    mark(key) {
      state[key] = true;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(state));
      } catch (err) {
        // Sin disco igual no repetimos el aviso mientras el proceso viva.
        console.warn('[notifier] no pude guardar el estado:', err.message);
      }
    },
  };
}

async function broadcast(send, recipients, text) {
  for (const chatId of recipients) {
    await send(chatId, text);
    console.log(`[notify] ${chatId}: ${text.split('\n')[0]}`);
  }
}

async function tick({ send, store, settings, recipients }) {
  const match = await getNextMatch();
  if (!match) return;

  const sent = store.for(match.id);
  const due = dueNotifications({ match, now: new Date(), sent, settings });
  if (!due.length) return;

  const details = await getMatchDetails(match).catch((err) => {
    console.warn('[notifier] no pude traer la ficha del partido:', err.message);
    return null;
  });

  if (due.includes('matchDay')) {
    const team = await getTeam().catch(() => null);
    await broadcast(send, recipients, formatMatchDay(match, team?.name ?? 'el equipo', details));

    const historial = formatHeadToHead(match, details);
    if (historial) await broadcast(send, recipients, historial);

    store.mark('matchDay');
  }

  if (due.includes('lineup')) {
    const texto = formatLineups(match, details);
    // Si todavía no la publicaron, no marcamos nada: se reintenta al próximo tick.
    if (texto) {
      await broadcast(send, recipients, texto);
      store.mark('lineup');
    }
  }
}

/**
 * Arranca los avisos automáticos. Devuelve una función para frenarlos, o null
 * si no hay destinatarios configurados (NOTIFY_TO).
 */
export function startNotifier({
  send = waha.sendText,
  settings = { ...config.notify, timezone: config.timezone },
  recipients = config.notify.to,
  stateFile = config.notify.stateFile,
} = {}) {
  if (!recipients.length) return null;

  const store = createStore(stateFile);
  const run = () =>
    tick({ send, store, settings, recipients }).catch((err) => console.error('[notifier]', err));

  const timer = setInterval(run, settings.pollMs);
  timer.unref?.(); // que el timer no mantenga vivo al proceso por sí solo
  run();

  return () => clearInterval(timer);
}
