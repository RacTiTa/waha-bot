import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatHeadToHead, formatLineups, formatMatch, formatMatchDay } from '../src/router.js';
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

const detalle = {
  league: 'Liga Profesional Argentina',
  venue: 'Estadio Alberto José Armando',
  referee: 'Leandro Rey Hilfer',
  tv: 'ESPN Premium',
  lineups: {
    status: 'Confirmado',
    teams: [
      {
        name: 'Boca Juniors',
        formation: '4-1-2-1-2',
        coach: 'Claudio Úbeda',
        starting: [
          { number: 1, name: 'Marchesín', captain: false },
          { number: 5, name: 'Paredes', captain: true },
        ],
      },
      {
        name: 'Instituto',
        formation: '3-4-3',
        coach: 'Diego Flores',
        starting: [{ number: 28, name: 'Roffo', captain: false }],
      },
    ],
  },
  missing: [
    {
      name: 'Boca Juniors',
      players: ['Ascacibar', 'Belmonte', 'Zeballos', 'Giménez', 'Cavani', 'Palacios'].map((name) => ({
        name,
        reason: 'Lesionado',
      })),
    },
  ],
};

const partido = makeMatch({
  home: 'Boca Juniors',
  away: 'Instituto',
  league: 'Liga Profesional Argentina',
  round: '9',
  date: new Date('2026-03-22T23:00:00Z'), // 20:00 en Buenos Aires
  status: 'NS',
});

test('el aviso del día del partido suma cancha, TV y árbitro', () => {
  const texto = formatMatchDay(partido, 'Boca Juniors', detalle);

  assert.match(texto, /Hoy juega Boca Juniors/);
  assert.match(texto, /🕒 20:00 hs/);
  assert.match(texto, /ESPN Premium/);
  assert.match(texto, /Leandro Rey Hilfer/);
  assert.doesNotMatch(texto, /Faltan/); // la cuenta regresiva es del otro mensaje
});

test('la formación lista titulares, DT y bajas', () => {
  const texto = formatLineups(partido, detalle);

  assert.match(texto, /\*Formación confirmada\*/);
  assert.match(texto, /\*Boca Juniors\* — 4-1-2-1-2/);
  assert.match(texto, /1 Marchesín, 5 Paredes \(C\)/);
  assert.match(texto, /DT: Claudio Úbeda/);
  assert.match(texto, /Bajas Boca Juniors: .*Cavani y 1 más/);
});

test('sin formaciones publicadas no arma mensaje', () => {
  assert.equal(formatLineups(partido, { lineups: null }), null);
  assert.equal(formatLineups(partido, null), null);
});

const headToHead = {
  homeWins: 1,
  awayWins: 2,
  draws: 1,
  games: [
    { home: 'Boca Juniors', away: 'Instituto', homeScore: 1, awayScore: 1, league: 'Liga Profesional Argentina', date: new Date('2026-03-11T22:45:00Z') },
    { home: 'Instituto', away: 'Boca Juniors', homeScore: 0, awayScore: 3, league: 'Copa de la Liga Profesional', date: new Date('2024-04-12T20:30:00Z') },
  ],
};

test('el historial suma el resumen de victorias y el detalle de cada cruce', () => {
  const texto = formatHeadToHead(partido, { headToHead });

  assert.match(texto, /Historial Boca Juniors vs Instituto/);
  assert.match(texto, /Boca Juniors ganó 1/);
  assert.match(texto, /Instituto ganó 2/);
  assert.match(texto, /empataron 1/);
  assert.match(texto, /11\/03: Boca Juniors 1-1 Instituto \(Liga Profesional Argentina\)/);
});

test('sin historial no arma mensaje', () => {
  assert.equal(formatHeadToHead(partido, { headToHead: null }), null);
  assert.equal(formatHeadToHead(partido, null), null);
});
