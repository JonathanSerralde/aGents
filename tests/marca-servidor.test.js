import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

let servidor;
let base;
let dirTemporal;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

before(async () => {
  dirTemporal = mkdtempSync(join(tmpdir(), 'marca-srv-'));
  servidor = crearServidor(opcionesTemporales(dirTemporal));
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((resolver) => servidor.close(resolver));
  rmSync(dirTemporal, { recursive: true, force: true });
});

test('sin logotipo ni nombre la marca queda vacía', async () => {
  const j = await (await fetch(`${base}/api/marca`)).json();
  assert.equal(j.nombre, '');
  assert.equal(j.tieneLogo, false);
});

test('el nombre comercial se guarda y se recupera', async () => {
  const res = await fetch(`${base}/api/marca`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nombre: 'Ferretería Ejemplo' }),
  });
  assert.equal(res.status, 200);
  const j = await (await fetch(`${base}/api/marca`)).json();
  assert.equal(j.nombre, 'Ferretería Ejemplo');
});

test('un PNG válido se acepta y se sirve de vuelta', async () => {
  const res = await fetch(`${base}/api/marca/logo`, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: PNG,
  });
  assert.equal(res.status, 201);

  const logo = await fetch(`${base}/api/marca/logo`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/png');
  assert.equal((await logo.arrayBuffer()).byteLength, PNG.length);
});

test('un archivo HTML disfrazado de PNG se rechaza', async () => {
  const res = await fetch(`${base}/api/marca/logo`, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: '<script>alert(1)</script>',
  });
  assert.equal(res.status, 422);
  const j = await res.json();
  assert.equal(j.ok, false);
});

test('un tipo no permitido como SVG se rechaza', async () => {
  const res = await fetch(`${base}/api/marca/logo`, {
    method: 'POST',
    headers: { 'content-type': 'image/svg+xml' },
    body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  });
  assert.equal(res.status, 422);
});
