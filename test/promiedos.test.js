import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPromiedos, parseTeamPage } from '../src/services/football/promiedos.js';

/** Arma un HTML como el que sirve promiedos.com.ar (Next.js con __NEXT_DATA__). */
function page(data) {
  const json = JSON.stringify({ props: { pageProps: { data } } });
  return `<html><body><div>hola</div><script id="__NEXT_DATA__" type="application/json">${json}</script></body></html>`;
}

const boca = { name: 'Boca Juniors', id: 'igg' };
const sanLorenzo = { name: 'San Lorenzo', id: 'igf' };
const vasco = { name: 'Vasco Da Gama', id: 'ccdd' };
const instituto = { name: 'Instituto', id: 'hchc' };

const DATA = {
  competitor: boca,
  main_league: { name: 'Liga Profesional Argentina', id: 'hc' },
  stadium: { name: 'Estadio Alberto José Armando' },
  games: {
    next: {
      rows: [
        {
          game: {
            id: 'egddcjh',
            stage_round_name: 'Fecha 10',
            teams: [sanLorenzo, boca],
            status: { enum: 1, name: 'Prog.' },
            start_time: '20-09-2026 14:45',
          },
        },
        {
          game: {
            id: 'egddcji',
            teams: [boca, vasco],
            status: { enum: 1, name: 'Prog.' },
            start_time: '14-10-2026 21:30',
          },
        },
      ],
    },
    last: {
      rows: [
        {
          game: {
            id: 'egdbgfc',
            stage_round_name: 'Fecha 9',
            teams: [boca, instituto],
            scores: [2, 0],
            status: { enum: 3, name: 'Finalizado' },
            start_time: '22-03-2026 20:00',
          },
        },
      ],
    },
  },
};

/** Proveedor con un fetch falso, para no salir a la red en los tests. */
function fakeProvider(html = page(DATA)) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, text: async () => html };
  };
  return { provider: createPromiedos({ fetchImpl }), calls };
}

test('parsea el próximo partido con hora de Buenos Aires', async () => {
  const { provider } = fakeProvider();
  const [next] = await provider.nextMatches('igg');

  assert.equal(next.home, 'San Lorenzo');
  assert.equal(next.away, 'Boca Juniors');
  assert.equal(next.league, 'Liga Profesional Argentina');
  assert.equal(next.round, '10');
  assert.equal(next.date.toISOString(), '2026-09-20T17:45:00.000Z'); // 14:45 -03:00
  assert.equal(next.finished, false);
});

test('el estadio sólo aparece cuando juega de local', async () => {
  const { provider } = fakeProvider();
  const [visitante, local] = await provider.nextMatches('igg');

  assert.equal(visitante.venue, null);
  assert.equal(local.venue, 'Estadio Alberto José Armando');
});

test('un partido de copa queda sin liga en vez de heredar la del equipo', async () => {
  const { provider } = fakeProvider();
  const [, copa] = await provider.nextMatches('igg');

  assert.equal(copa.league, null);
  assert.equal(copa.round, null);
});

test('el último partido trae el resultado y queda terminado', async () => {
  const { provider } = fakeProvider();
  const [last] = await provider.lastMatches('igg');

  assert.equal(last.score, '2-0');
  assert.equal(last.finished, true);
  assert.equal(last.live, false);
});

test('baja la página una sola vez para las tres consultas', async () => {
  const { provider, calls } = fakeProvider();

  await provider.nextMatches('igg');
  await provider.lastMatches('igg');
  assert.deepEqual(await provider.team('igg'), { id: 'igg', name: 'Boca Juniors' });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/team\/x\/igg$/);
});

test('avisa si la página no tiene el JSON esperado', () => {
  assert.throws(() => parseTeamPage('<html>nada</html>'), /__NEXT_DATA__/);
  assert.throws(() => parseTeamPage(page({ otra: 'cosa' })), /datos del equipo/);
});
