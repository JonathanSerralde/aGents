import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizarEquipo, crearEquipo, AREAS_EQUIPO } from '../src/equipo.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

test('sanitizarEquipo devuelve todas las áreas con textos vacíos cuando no hay datos', () => {
  const e = sanitizarEquipo(null);
  assert.deepEqual(Object.keys(e.areas), AREAS_EQUIPO);
  assert.deepEqual(e.areas.finanzas, { responsable: '', puesto: '', agente: '' });
});

test('sanitizarEquipo descarta áreas desconocidas y recorta textos largos', () => {
  const e = sanitizarEquipo({ areas: { finanzas: { responsable: '  Ana López ', agente: 'x'.repeat(200), extra: 1 }, inventada: { responsable: 'y' } } });
  assert.equal(e.areas.finanzas.responsable, 'Ana López');
  assert.equal(e.areas.finanzas.agente.length, 80);
  assert.equal('inventada' in e.areas, false);
  assert.equal('extra' in e.areas.finanzas, false);
});

test('el equipo se guarda y se recupera, y se adjunta a cada diagnóstico', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'equipo-test-'));
  const servidor = crearServidor(opcionesTemporales(dir));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const guardar = await fetch(`${base}/api/equipo`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ areas: { ventas: { responsable: 'Luis', puesto: 'Vendedor', agente: 'Vega' } } }),
    });
    assert.equal(guardar.status, 200);
    const leido = await (await fetch(`${base}/api/equipo`)).json();
    assert.equal(leido.areas.ventas.agente, 'Vega');
    assert.equal(leido.areas.finanzas.responsable, '');

    const diag = await (await fetch(`${base}/api/diagnosticos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contacto_nombre: 'P', confianza: 'alto', giro: 'comercio', empleados: '1-5', ventas_anuales: 'menos_1m', antiguedad_anios: 1 }),
    })).json();
    const registro = await (await fetch(`${base}/api/diagnosticos/${diag.id}`)).json();
    assert.equal(registro.equipo.areas.ventas.responsable, 'Luis');

    const archivoLocal = crearEquipo(join(dir, 'equipo.json')).leer();
    assert.equal(archivoLocal.areas.ventas.puesto, 'Vendedor');
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
