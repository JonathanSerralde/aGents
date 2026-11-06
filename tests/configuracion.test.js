import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizarConfiguracion, enmascarar, crearConfiguracion, configuracionEfectiva } from '../src/configuracion.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

function opciones(dir, extra = {}) {
  return opcionesTemporales(dir, extra);
}

async function conServidor(extra, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-test-'));
  const servidor = crearServidor(opciones(dir, extra));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await fn(base, dir);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
}

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('sanitizar acepta solo proveedores conocidos y recorta textos', () => {
  const c = sanitizarConfiguracion({ proveedor: 'gemini', anthropicKey: ' sk-abc ', openaiModelo: 'x'.repeat(200) });
  assert.equal(c.proveedor, 'ninguno');
  assert.equal(c.anthropicKey, 'sk-abc');
  assert.equal(c.openaiModelo.length, 80);
});

test('enmascarar nunca expone la clave completa', () => {
  const m = enmascarar({ proveedor: 'anthropic', anthropicKey: 'sk-ant-1234567890', anthropicModelo: 'm', openaiKey: '', openaiModelo: '' });
  assert.equal(m.anthropicKey, '••••7890');
  assert.equal(m.tieneClaveAnthropic, true);
  assert.equal(m.tieneClaveOpenAI, false);
  assert.ok(!JSON.stringify(m).includes('1234567890'));
});

test('guardar conserva la clave anterior si llega enmascarada o vacía', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cfg-store-'));
  try {
    const c = crearConfiguracion(join(dir, 'config.json'));
    c.guardar({ proveedor: 'anthropic', anthropicKey: 'sk-real-0001' });
    c.guardar({ proveedor: 'anthropic', anthropicKey: '••••0001', anthropicModelo: 'claude-x' });
    assert.equal(c.leer().anthropicKey, 'sk-real-0001');
    assert.equal(c.leer().anthropicModelo, 'claude-x');
    c.guardar({ proveedor: 'anthropic', anthropicKey: '' });
    assert.equal(c.leer().anthropicKey, 'sk-real-0001');
    c.borrarClaves();
    assert.equal(c.leer().anthropicKey, '');
    assert.equal(c.leer().proveedor, 'ninguno');
    assert.ok(readFileSync(join(dir, 'config.json'), 'utf8').includes('"proveedor"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('la configuración de pantalla manda sobre .env, y .env sigue valiendo si la pantalla está vacía', () => {
  const base = { proveedor: 'openai', openaiKey: 'env-key', openaiModelo: 'gpt-x', anthropicKey: '', anthropicModelo: 'claude-base' };
  const vacia = sanitizarConfiguracion(null);
  assert.equal(configuracionEfectiva(base, vacia).proveedor, 'openai');
  assert.equal(configuracionEfectiva(base, vacia).openaiKey, 'env-key');
  const pantalla = sanitizarConfiguracion({ proveedor: 'anthropic', anthropicKey: 'ui-key' });
  const ef = configuracionEfectiva(base, pantalla);
  assert.equal(ef.proveedor, 'anthropic');
  assert.equal(ef.anthropicKey, 'ui-key');
  assert.equal(ef.anthropicModelo, 'claude-base');
});

test('el servidor guarda, devuelve enmascarado y activa la IA sin reiniciar', async () => {
  const llamadas = [];
  const llamarIA = async ({ mensajes }) => { llamadas.push(mensajes.at(-1).texto); return 'OK'; };
  // llamarIA solo se usa cuando hay proveedor activo; al inicio no lo hay porque proveedor es 'ninguno'.
  await conServidor({ llamarIA: undefined }, async (base) => {
    let estado = await (await fetch(`${base}/api/estado`)).json();
    assert.equal(estado.proveedorIA, 'ninguno');

    const inicial = await (await fetch(`${base}/api/configuracion`)).json();
    assert.equal(inicial.fuente, 'ninguna');

    const guardado = await (await fetch(`${base}/api/configuracion`, json('PUT', { proveedor: 'openai', openaiKey: 'sk-test-9876', openaiModelo: 'gpt-prueba' }))).json();
    assert.equal(guardado.openaiKey, '••••9876');
    assert.equal(guardado.proveedorActivo, 'openai');

    estado = await (await fetch(`${base}/api/estado`)).json();
    assert.equal(estado.proveedorIA, 'openai');
    const leido = await (await fetch(`${base}/api/configuracion`)).json();
    assert.equal(leido.fuente, 'pantalla');
    assert.ok(!JSON.stringify(leido).includes('sk-test-9876'));

    const borrado = await (await fetch(`${base}/api/configuracion/claves`, { method: 'DELETE' })).json();
    assert.equal(borrado.proveedorActivo, 'ninguno');
    assert.equal(llamadas.length, 0);
  });
});

test('probar conexión responde con el proveedor cuando la llamada funciona y 422 si no hay clave', async () => {
  await conServidor({ llamarIA: async () => 'OK' }, async (base) => {
    const ok = await fetch(`${base}/api/configuracion/probar`, json('POST', { proveedor: 'anthropic', anthropicKey: 'sk-x' }));
    assert.equal(ok.status, 200);
    const j = await ok.json();
    assert.equal(j.ok, true);
    assert.equal(j.respuesta, 'OK');
  });
  await conServidor({}, async (base) => {
    const sin = await fetch(`${base}/api/configuracion/probar`, json('POST', { proveedor: 'anthropic', anthropicKey: '' }));
    assert.equal(sin.status, 422);
  });
});
