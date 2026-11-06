import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizarBorrador, crearBorrador } from '../src/borrador.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

let dir;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'borrador-test-'));
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('sanitizarBorrador descarta campos que no existen en el formulario', () => {
  const r = sanitizarBorrador({ respuestas: { giro: 'comercio', campo_inventado: 'x', __proto__: 'y' }, paso: 3 });
  assert.deepEqual(r.respuestas, { giro: 'comercio' });
  assert.equal(r.paso, 3);
});

test('sanitizarBorrador recorta textos largos y acepta números finitos', () => {
  const r = sanitizarBorrador({ respuestas: { preocupacion: 'x'.repeat(900), meses_caja: 4 }, paso: 0 });
  assert.equal(r.respuestas.preocupacion.length, 500);
  assert.equal(r.respuestas.meses_caja, 4);
});

test('sanitizarBorrador ignora entradas inválidas y pasos fuera de rango', () => {
  assert.deepEqual(sanitizarBorrador(null), { respuestas: {}, paso: 0 });
  assert.deepEqual(sanitizarBorrador({ respuestas: 'no', paso: 9999 }), { respuestas: {}, paso: 0 });
  assert.equal(sanitizarBorrador({ paso: -1 }).paso, 0);
});

test('el borrador se guarda, se lee y se borra', () => {
  const archivo = join(dir, 'b1', 'borrador.json');
  const b = crearBorrador(archivo);
  assert.deepEqual(b.leer(), { respuestas: {}, paso: 0 });
  b.guardar({ respuestas: { giro: 'servicios' }, paso: 2 });
  assert.deepEqual(b.leer(), { respuestas: { giro: 'servicios' }, paso: 2 });
  b.borrar();
  assert.equal(existsSync(archivo), false);
});

test('el servidor restaura el borrador tras una recarga (PUT, GET, DELETE)', async () => {
  const servidor = crearServidor(opcionesTemporales(dir));
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const guardar = await fetch(`${base}/api/borrador`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ respuestas: { giro: 'manufactura', paros_mes: 2 }, paso: 4 }),
    });
    assert.equal(guardar.status, 200);

    const leer = await (await fetch(`${base}/api/borrador`)).json();
    assert.equal(leer.respuestas.giro, 'manufactura');
    assert.equal(leer.paso, 4);

    const borrar = await fetch(`${base}/api/borrador`, { method: 'DELETE' });
    assert.equal(borrar.status, 200);
    const vacio = await (await fetch(`${base}/api/borrador`)).json();
    assert.deepEqual(vacio.respuestas, {});
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
  }
});
