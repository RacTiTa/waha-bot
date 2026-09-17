const bool = (v, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'si', 'sí'].includes(String(v).toLowerCase());

const list = (v) =>
  (v ?? '')
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(Boolean);

/** Destinatarios: "5491122334455" o "1234567890@g.us" (grupo). */
const chatIds = (v) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.includes('@') ? s : `${s.replace(/\D/g, '')}@c.us`));

/** "09:00" -> minutos desde la medianoche. */
const hhmm = (v, def) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return def;
  return Number(m[1]) * 60 + Number(m[2]);
};

export const config = {
  port: Number(process.env.PORT ?? 3001),

  waha: {
    url: (process.env.WAHA_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    session: process.env.WAHA_SESSION ?? 'default',
    apiKey: process.env.WAHA_API_KEY ?? '',
  },

  // Si está definida, se valida la firma HMAC que manda WAHA en cada webhook.
  webhookHmacKey: process.env.WEBHOOK_HMAC_KEY ?? '',

  allowedNumbers: list(process.env.ALLOWED_NUMBERS),
  replyInGroups: bool(process.env.REPLY_IN_GROUPS, false),
  timezone: process.env.TIMEZONE ?? 'America/Argentina/Buenos_Aires',

  football: {
    // 'auto' usa api-football si hay key, si no Promiedos.
    // Valores: auto | api-football | promiedos | thesportsdb
    provider: process.env.FOOTBALL_PROVIDER ?? 'auto',
    apiFootballKey: process.env.APIFOOTBALL_KEY ?? '',
    sportsDbKey: process.env.SPORTSDB_KEY ?? '3',
    teamId: {
      sportsDb: process.env.SPORTSDB_TEAM_ID ?? '135156', // Boca Juniors
      apiFootball: process.env.APIFOOTBALL_TEAM_ID ?? '451', // Boca Juniors
      promiedos: process.env.PROMIEDOS_TEAM_ID ?? 'igg', // Boca Juniors
    },
    cacheTtlMs: Number(process.env.FOOTBALL_CACHE_MINUTES ?? 10) * 60 * 1000,
  },

  // Avisos que el bot manda solo. Sin NOTIFY_TO no se enciende nada.
  notify: {
    to: chatIds(process.env.NOTIFY_TO),
    // Minuto del día (hora local) en que avisa que hoy se juega.
    matchDayMinutes: hhmm(process.env.NOTIFY_MATCH_DAY_AT, 9 * 60),
    // Cuánto antes del partido empieza a buscar la formación.
    lineupMinutes: Number(process.env.NOTIFY_LINEUP_MINUTES ?? 60),
    pollMs: Number(process.env.NOTIFY_POLL_MINUTES ?? 5) * 60 * 1000,
    stateFile: process.env.NOTIFY_STATE_FILE ?? '.state/notifications.json',
  },
};
