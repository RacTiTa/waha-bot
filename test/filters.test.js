import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ignoreReason } from '../src/filters.js';

const msg = (extra) => ({ from: '5491122334455@c.us', body: 'hola', fromMe: false, ...extra });

test('contesta un chat privado normal', () => {
  assert.equal(ignoreReason(msg()), null);
});

test('ignora los mensajes propios, los estados y los vacíos', () => {
  assert.equal(ignoreReason(msg({ fromMe: true })), 'mensaje propio');
  assert.equal(ignoreReason(msg({ from: 'status@broadcast' })), 'estado');
  assert.equal(ignoreReason(msg({ body: '' })), 'sin texto');
});

test('ignora los grupos salvo que se habiliten', () => {
  assert.equal(ignoreReason(msg({ from: '12345-678@g.us' })), 'grupo');
});
