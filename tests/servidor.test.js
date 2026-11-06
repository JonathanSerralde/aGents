import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

// Usa un directorio temporal para no escribir en data/ del usuario.
let servidor;
let base;
let dirTemporal;

before(async () => {
  dirTemporal = mkdtempSync(join(tmpdir(), 'oficina-test-'));
  servidor = crearServidor(opcionesTemporales(dirTemporal));
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const { port } = servidor.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolver) => servidor.close(resolver));
  rmSync(dirTemporal, { recursive: true, force: true });
});

const enviar = (cuerpo) => fetch(`${base}/api/diagnosticos`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(cuerpo),
});

test('estado reporta modo local sin proveedor', async () => {
  const res = await fetch(`${base}/api/estado`);
  const j = await res.json();
  assert.equal(j.local, true);
  assert.equal(j.proveedorIA, 'ninguno');
});

test('el formulario se entrega completo', async () => {
  const j = await (await fetch(`${base}/api/formulario`)).json();
  assert.ok(j.secciones.length >= 10);
  assert.ok(j.campos.length >= 40);
});

test('un diagnóstico válido se guarda y devuelve semáforo', async () => {
  const res = await enviar({
    contacto_nombre: 'Prueba',
    confianza: 'medio',
    giro: 'comercio',
    empleados: '6-10',
    ventas_anuales: '1m-5m',
    antiguedad_anios: 4,
    meses_caja: 0.5,
    margen_pct: 8,
    imss_infonavit: 'adeudo',
    cfdi: 'no',
  });
  assert.equal(res.status, 201);
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.equal(j.resultado.distritos.finanzas.color, 'rojo');
  assert.equal(j.resultado.prioridad[0], 'finanzas');

  const guardado = await (await fetch(`${base}/api/diagnosticos/${j.id}`)).json();
  assert.equal(guardado.id, j.id);
  assert.equal(guardado.contacto_nombre, 'Prueba');
});

test('un diagnóstico inválido responde 422 con errores', async () => {
  const res = await enviar({ giro: 'comercio' });
  assert.equal(res.status, 422);
  const j = await res.json();
  assert.ok(j.errores.length > 0);
});

test('un JSON malformado responde 400', async () => {
  const res = await fetch(`${base}/api/diagnosticos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{no es json',
  });
  assert.equal(res.status, 400);
});

test('un id con formato inválido no accede a archivos', async () => {
  const res = await fetch(`${base}/api/diagnosticos/..%2F..%2Fpackage`);
  assert.equal(res.status, 404);
});

test('rutas estáticas no permiten salir de public/', async () => {
  const res = await fetch(`${base}/..%2Fpackage.json`);
  assert.notEqual(res.status, 200);
});

test('la página principal se sirve como HTML', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});
