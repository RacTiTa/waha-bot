import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatMatch } from '../src/router.js';
import { makeMatch } from '../src/services/football/normalize.js';

const enHoras = (h) => new Date(Date.now() + h * 3_600_000);

test('formatea un partido futuro en hora argentina', () => {
  const match = makeMatch({
    home: 'Boca Juniors',
    away: 'River Plate',
    league: 'Argentinian Primera Division',
    round: '12',
    venue: 'La Bombonera',
    date: new Date('2026-09-20T23:30:00Z'), // 20:30 en Buenos Aires
    status: 'NS',
  });

  const texto = formatMatch(match, 'Boca Juniors');

  assert.match(texto, /Próximo partido de Boca Juniors/);
  assert.match(texto, /\*Boca Juniors vs River Plate\*/);
  assert.match(texto, /fecha 12/);
  assert.match(texto, /20:30 hs/);
  assert.match(texto, /La Bombonera/);
});

test('avisa cuando el partido está en juego', () => {
  const match = makeMatch({
    home: 'Boca Juniors',
    away: 'Racing',
    league: 'Copa Argentina',
    date: enHoras(-1),
    status: '2H',
    homeScore: 2,
    awayScore: 0,
  });

  assert.equal(match.live, true);
  assert.match(formatMatch(match, 'Boca Juniors'), /está jugando ahora/);
  assert.match(formatMatch(match, 'Boca Juniors'), /Va 2-0/);
});

test('un partido viejo sin estado se considera terminado', () => {
  const match = makeMatch({ home: 'A', away: 'B', date: enHoras(-5), status: '' });
  assert.equal(match.finished, true);
  assert.equal(match.live, false);
});

test('muestra la cuenta regresiva en días y horas', () => {
  const match = makeMatch({ home: 'A', away: 'B', league: 'L', date: enHoras(50), status: 'NS' });
  assert.match(formatMatch(match, 'Boca'), /Faltan 2 días y 2 h/);
});
