import express, { type Request, type Response } from 'express';
import { config } from './config.js';
import { ignoreReason, signatureIsValid, type IncomingMessage } from './filters.js';
import { startNotifier } from './notifier.js';
import { routeMessage } from './router.js';
import { waha, withTyping } from './waha.js';

const app = express();
app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      req.rawBody = buf;
    },
  }),
);

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true, session: config.waha.session }));

app.post('/webhook', async (req: Request, res: Response) => {
  if (!signatureIsValid(req)) {
    console.warn('[webhook] firma inválida, descartado');
    return res.sendStatus(401);
  }

  // Se responde enseguida: WAHA reintenta si el webhook tarda o falla.
  res.sendStatus(200);

  const { event, payload } = (req.body ?? {}) as { event?: string; payload?: IncomingMessage };
  if (event !== 'message' || !payload) return;

  const reason = ignoreReason(payload);
  if (reason) return console.log(`[webhook] ignorado (${reason})`);

  const chatId = payload.from;
  if (!chatId) return;
  console.log(`[msg] ${chatId}: ${payload.body}`);

  try {
    const reply = await withTyping(chatId, payload.id ?? '', () => routeMessage(payload.body));
    if (reply) {
      await waha.sendText(chatId, reply);
      console.log(`[reply] ${chatId}: ${reply.split('\n')[0]}`);
    }
  } catch (err) {
    console.error('[webhook] error procesando el mensaje:', err);
  }
});

app.listen(config.port, () => {
  console.log(`Bot escuchando en http://localhost:${config.port}`);
  console.log(`Webhook:  POST http://localhost:${config.port}/webhook`);
  console.log(`WAHA:     ${config.waha.url} (sesión "${config.waha.session}")`);

  const avisos = startNotifier();
  console.log(
    avisos
      ? `Avisos:   ${config.notify.to.join(', ')} (día del partido y formación)`
      : 'Avisos:   apagados (NOTIFY_TO vacío)',
  );
  if (!config.waha.apiKey) console.warn('⚠️  WAHA_API_KEY vacío: WAHA va a rechazar los envíos si tiene API key configurada.');
});
