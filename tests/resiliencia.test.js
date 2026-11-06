import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearConversaciones } from '../src/conversaciones.js';
import { crearStore } from '../src/store.js';
import { crearMarca } from '../src/marca.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

// Si alguien borra una carpeta de data/ con el servidor en marcha, las escrituras la recrean y nada se cae.

test('conversaciones recrea su carpeta si la borran', () => {
  const dir = mkdtempSync(join(tmpdir(), 'res-conv-'));
  const sub = join(dir, 'conversaciones');
  const c = crearConversaciones(sub);
  rmSync(sub, { recursive: true, force: true });
  c.agregar('orquestador', { rol: 'usuario', texto: 'hola' });
  assert.equal(c.leer('orquestador').length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('las respuestas largas de los agentes no se recortan a 2000 caracteres; lo que escribe la persona sí', () => {
  const dir = mkdtempSync(join(tmpdir(), 'res-largo-'));
  const c = crearConversaciones(join(dir, 'conversaciones'));
  const largo = 'x'.repeat(5000);
  c.agregar('ventas', { rol: 'usuario', texto: largo });
  c.agregar('ventas', { rol: 'agente', texto: largo });
  c.agregar('ventas', { rol: 'usuario', texto: largo, origen: 'agente' });
  const [persona, agente, entreAgentes] = c.leer('ventas');
  assert.equal(persona.texto.length, 2000);
  assert.equal(agente.texto.length, 5000);
  assert.equal(entreAgentes.texto.length, 5000);
  assert.equal(entreAgentes.origen, 'agente'); // la pantalla lo muestra como mensaje de otro agente
  rmSync(dir, { recursive: true, force: true });
});

test('el store y la marca recrean sus carpetas si las borran', () => {
  const dir = mkdtempSync(join(tmpdir(), 'res-store-'));
  const dd = join(dir, 'diagnosticos');
  const dm = join(dir, 'marca');
  const store = crearStore(dd);
  const marca = crearMarca(dm);
  rmSync(dd, { recursive: true, force: true });
  rmSync(dm, { recursive: true, force: true });
  assert.deepEqual(store.listar(), []);
  assert.equal(marca.leer().tieneLogo, false);
  const r = store.guardar({ datos: {}, resultado: {} });
  assert.ok(existsSync(join(dd, `${r.id}.json`)));
  marca.guardarNombre('X');
  assert.equal(marca.leer().nombre, 'X');
  rmSync(dir, { recursive: true, force: true });
});

test('un error dentro de una ruta responde 500 y el servidor sigue atendiendo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'res-srv-'));
  // store.ultimo se usa al ordenar con IA: se fuerza a fallar para simular un error inesperado.
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA: async () => { throw new TypeError('fallo inesperado'); } }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const res = await fetch(`${base}/api/agentes/ventas/mensajes`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: 'hola' }),
    });
    assert.ok([500, 502].includes(res.status));
    const vivo = await fetch(`${base}/api/estado`);
    assert.equal(vivo.status, 200);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
