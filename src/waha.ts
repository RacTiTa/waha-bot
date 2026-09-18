import { config } from './config.js';

async function call(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${config.waha.url}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.waha.apiKey ? { 'X-Api-Key': config.waha.apiKey } : {}),
    },
    body: JSON.stringify({ session: config.waha.session, ...body }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`WAHA ${path} respondió ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export const waha = {
  sendText: (chatId: string, text: string) => call('/api/sendText', { chatId, text }),
  sendSeen: (chatId: string, messageId: string) => call('/api/sendSeen', { chatId, messageId }),
  startTyping: (chatId: string) => call('/api/startTyping', { chatId }),
  stopTyping: (chatId: string) => call('/api/stopTyping', { chatId }),
};

/** Marca leído + "escribiendo…" mientras se resuelve la respuesta. Nunca rompe el flujo. */
export async function withTyping<T>(chatId: string, messageId: string, fn: () => Promise<T>): Promise<T> {
  const quiet = (p: Promise<unknown>) => p.catch((err) => console.warn('[waha]', err.message));

  await quiet(waha.sendSeen(chatId, messageId));
  await quiet(waha.startTyping(chatId));
  try {
    return await fn();
  } finally {
    await quiet(waha.stopTyping(chatId));
  }
}
