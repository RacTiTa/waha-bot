import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueNotifications } from '../src/notifier.js';
import { makeMatch } from '../src/services/football/normalize.js';

const settings = {
  timezone: 'America/Argentina/Buenos_Aires',
  matchDayMinutes: 9 * 60, // 09:00
  lineupMinutes: 75,
};

// Domingo 20/09/2026 a las 14:45 de Buenos Aires.
const partido = () =>
  makeMatch({ id: 'egddcjh', home: 'San Lorenzo', away: 'Boca Juniors', date: new Date('2026-09-20T17:45:00Z'), status: 'NS' });

const due = (iso, sent = {}) =>
  dueNotifications({ match: partido(), now: new Date(iso), sent, settings });

test('no avisa el día anterior', () => {
  assert.deepEqual(due('2026-09-19T23:00:00Z'), []);
});

test('no avisa antes de la hora configurada', () => {
  assert.deepEqual(due('2026-09-20T11:00:00Z'), []); // 08:00 en Buenos Aires
});

test('avisa el día del partido pasadas las 9', () => {
  assert.deepEqual(due('2026-09-20T12:30:00Z'), ['matchDay']); // 09:30
});

test('no repite el aviso ya enviado', () => {
  assert.deepEqual(due('2026-09-20T12:30:00Z', { matchDay: true }), []);
});

test('pide la formación dentro de la ventana previa', () => {
  const sent = { matchDay: true };
  assert.deepEqual(due('2026-09-20T16:20:00Z', sent), []); // 85 min antes: todavía no
  assert.deepEqual(due('2026-09-20T16:40:00Z', sent), ['lineup']); // 65 min antes
});

test('sigue buscando la formación un rato después del inicio', () => {
  const sent = { matchDay: true };
  assert.deepEqual(due('2026-09-20T17:55:00Z', sent), ['lineup']); // 10 min tarde
  assert.deepEqual(due('2026-09-20T18:10:00Z', sent), []); // 25 min: ya fue
});

test('no manda el aviso del día si el partido ya empezó', () => {
  assert.deepEqual(due('2026-09-20T18:00:00Z'), ['lineup']);
});

test('usa el día argentino, no el UTC', () => {
  // Partido a las 21:30 del domingo en Buenos Aires = lunes 00:30 UTC.
  const nocturno = makeMatch({ id: 'x', home: 'Boca', away: 'Vasco', date: new Date('2026-09-21T00:30:00Z'), status: 'NS' });
  const enDomingo = dueNotifications({ match: nocturno, now: new Date('2026-09-20T12:30:00Z'), sent: {}, settings });

  assert.deepEqual(enDomingo, ['matchDay']);
});

test('sin partido no hay avisos', () => {
  assert.deepEqual(dueNotifications({ match: null, now: new Date(), sent: {}, settings }), []);
});
