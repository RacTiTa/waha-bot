import crypto from 'node:crypto';
import { config } from './config.js';

/** Verifica la firma HMAC que envía WAHA (sólo si WEBHOOK_HMAC_KEY está configurada). */
export function signatureIsValid(req) {
  if (!config.webhookHmacKey) return true;

  const received = req.get('x-webhook-hmac');
  if (!received || !req.rawBody) return false;

  const algorithm = (req.get('x-webhook-hmac-algorithm') ?? 'sha512').toLowerCase();
  const expected = crypto.createHmac(algorithm, config.webhookHmacKey).update(req.rawBody).digest('hex');

  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Motivo por el que NO hay que contestar este mensaje, o null si se contesta. */
export function ignoreReason(msg) {
  const chatId = msg.from ?? '';

  if (msg.fromMe) return 'mensaje propio';
  if (chatId === 'status@broadcast') return 'estado';
  if (!msg.body) return 'sin texto';
  if (chatId.endsWith('@g.us') && !config.replyInGroups) return 'grupo';

  if (config.allowedNumbers.length) {
    const number = chatId.split('@')[0];
    if (!config.allowedNumbers.includes(number)) return 'número no habilitado';
  }
  return null;
}
