import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { slug, sanitizarAgente, crearPersonalizados, MAX_AGENTES } from '../src/personalizados.js';
import { sistemaPara } from '../src/prompts.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

async function conServidor(extra, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'propios-test-'));
  const servidor = crearServidor(opcionesTemporales(dir, { ...extra }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
}

test('slug genera ids seguros con prefijo y sin acentos', () => {
  assert.equal(slug('Gerente de Sucursal Norte'), 'x-gerente-de-sucursal-norte');
  assert.equal(slug('  Ñandú & Cía.  '), 'x-nandu-cia');
  assert.equal(slug('../../etc'), 'x-etc');
  assert.equal(slug('!!!'), 'x-agente');
});

test('sanitizarAgente exige nombre, recorta listas y valida áreas y avatar', () => {
  assert.throws(() => sanitizarAgente({ nombre: 'A' }), /nombre/);
  const a = sanitizarAgente({
    nombre: 'Sucursal Norte', rol: 'Gerente', especialidad: 'x'.repeat(500),
    pregunta_primero: 'uno\ndos\n\ntres', marcos: Array(20).fill('m'), areas: ['ventas', 'inventada', 'rh'],
    avatar: 'assets/avatares/avatar-03.png',
  });
  assert.equal(a.especialidad.length, 200);
  assert.deepEqual(a.pregunta_primero, ['uno', 'dos', 'tres']);
  assert.equal(a.marcos.length, 8);
  assert.deepEqual(a.areas, ['ventas', 'rh']);
  assert.equal(a.avatar, 'assets/avatares/avatar-03.png');
  assert.deepEqual(sanitizarAgente({ nombre: 'Todo', areas: ['todas', 'ventas'] }).areas, ['todas']);
  assert.deepEqual(sanitizarAgente({ nombre: 'Nada', areas: [] }).areas, ['todas']);
  assert.equal(sanitizarAgente({ nombre: 'Foto', avatar: '../x.png' }).avatar, '');
});

test('el store crea, evita ids repetidos, actualiza, borra y respeta el máximo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'propios-store-'));
  try {
    const p = crearPersonalizados(join(dir, 'agentes.json'));
    const a1 = p.guardar({ nombre: 'Auditor' });
    const a2 = p.guardar({ nombre: 'Auditor' });
    assert.equal(a1.id, 'x-auditor');
    assert.equal(a2.id, 'x-auditor-2');
    p.guardar({ nombre: 'Auditor interno', rol: 'Revisa' }, 'x-auditor');
    assert.equal(p.obtener('x-auditor').rol, 'Revisa');
    assert.throws(() => p.guardar({ nombre: 'Xavier' }, 'x-no-existe'), /no existe/);
    assert.equal(p.borrar('x-auditor-2'), true);
    assert.equal(p.borrar('x-auditor-2'), false);
    for (let i = 0; i < MAX_AGENTES - 1; i++) p.guardar({ nombre: `Agente ${i}` });
    assert.throws(() => p.guardar({ nombre: 'Uno más' }), /Máximo/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el prompt de un agente propio usa su habilidad y solo las áreas que ve', () => {
  const propio = sanitizarAgente({ nombre: 'Cobranza', rol: 'Gestor de cobranza', especialidad: 'Reducir días de cobro', areas: ['finanzas', 'ventas'] });
  const s = sistemaPara('x-cobranza', null, null, { nombre: 'Tienda' }, propio);
  assert.match(s, /Eres Cobranza, un agente creado por la empresa/);
  assert.match(s, /Gestor de cobranza/);
  assert.match(s, /Finanzas: sin diagnóstico/);
  assert.match(s, /Ventas: sin diagnóstico/);
  assert.doesNotMatch(s, /Riesgos: sin diagnóstico/);
  const todo = sistemaPara('x-todo', null, { areas: { 'x-todo': { agente: 'Tomás' } } }, null, sanitizarAgente({ nombre: 'Todo' }));
  assert.match(todo, /Eres Tomás/);
  assert.match(todo, /Riesgos: sin diagnóstico/);
});

test('un agente propio se crea por API, recibe órdenes, entra al equipo y se borra', async () => {
  const recibido = [];
  await conServidor({ llamarIA: async ({ sistema }) => { recibido.push(sistema); return 'Hecho'; } }, async (base) => {
    const creado = await (await fetch(`${base}/api/agentes-personalizados`, json('POST', { nombre: 'Sucursal Norte', rol: 'Gerente', areas: ['ventas'] }))).json();
    assert.equal(creado.id, 'x-sucursal-norte');

    const lista = await (await fetch(`${base}/api/agentes-personalizados`)).json();
    assert.ok(lista.agentes['x-sucursal-norte']);
    assert.equal(lista.avatares.length, 14);

    const equipo = await (await fetch(`${base}/api/equipo`, json('PUT', { areas: { 'x-sucursal-norte': { responsable: 'Rosa', agente: 'Norte' } } }))).json();
    assert.equal(equipo.areas['x-sucursal-norte'].responsable, 'Rosa');

    const orden = await (await fetch(`${base}/api/agentes/x-sucursal-norte/mensajes`, json('POST', { texto: 'Plan de la semana' }))).json();
    assert.equal(orden.respuesta, 'Hecho');
    assert.match(recibido.at(-1), /Eres Norte, un agente creado por la empresa/);
    assert.match(recibido.at(-1), /junto a Rosa/);
    assert.doesNotMatch(recibido.at(-1), /Finanzas: sin diagnóstico/);

    assert.equal((await fetch(`${base}/api/agentes/x-inexistente/mensajes`)).status, 404);
    assert.equal((await fetch(`${base}/api/agentes-personalizados`, json('POST', { nombre: 'A' }))).status, 422);

    assert.equal((await fetch(`${base}/api/agentes-personalizados/x-sucursal-norte`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/api/agentes/x-sucursal-norte/mensajes`)).status, 404);
  });
});
