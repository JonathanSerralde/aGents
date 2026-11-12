import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { madurez, compararDiagnosticos, serieDeMadurez, elegirAnterior } from '../src/progreso.js';
import { informeOficina } from '../src/informe.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const distrito = (nombre, color) => ({ nombre, color, hallazgos: [] });
const diag = (id, creado, colores, plan = [], extra = {}) => ({
  id, creado, datos: { giro: 'comercio' },
  resultado: {
    distritos: Object.fromEntries(Object.entries(colores).map(([k, c]) => [k, distrito(k[0].toUpperCase() + k.slice(1), c)])),
    plan, prioridad: [], crecimiento: { vertical: { nivel: 1, max: 4 }, horizontal: { nivel: 0, max: 4 } }, ...extra,
  },
});
const accion = (distrito_, texto) => ({ distrito: distrito_, nombre: distrito_, accion: texto, plazo: '30 días', color: 'rojo' });

test('la madurez promedia solo las áreas evaluadas, igual que el dashboard', () => {
  assert.equal(madurez({ a: { color: 'verde' }, b: { color: 'rojo' }, c: { color: 'sin_datos' } }), 3.3); // (5 + 1.5) / 2 = 3.25 → 3.3
  assert.equal(madurez({ a: { color: 'sin_datos' } }), 0);
  assert.equal(madurez({}), 0);
});

test('comparar dice qué áreas mejoraron o empeoraron y qué acciones ya no hacen falta', () => {
  const antes = diag('a', '2026-10-01T10:00:00.000Z', { finanzas: 'rojo', ventas: 'amarillo', rh: 'verde', fiscal: 'sin_datos' },
    [accion('finanzas', 'Fijar un plan de caja'), accion('ventas', 'Medir la recurrencia')]);
  const ahora = diag('b', '2026-11-05T10:00:00.000Z', { finanzas: 'amarillo', ventas: 'amarillo', rh: 'amarillo', fiscal: 'rojo' },
    [accion('ventas', 'medir  la Recurrencia'), accion('fiscal', 'Regularizar el RFC')]);
  const c = compararDiagnosticos(antes, ahora);

  assert.equal(c.dias, 35);
  assert.deepEqual(c.madurez, { antes: 3.2, despues: 2.6, delta: -0.6 });
  const cambio = Object.fromEntries(c.areas.map((x) => [x.id, x.cambio]));
  assert.deepEqual(cambio, { finanzas: 'mejoro', ventas: 'igual', rh: 'empeoro', fiscal: 'nuevo' });
  assert.deepEqual(c.conteo, { mejoraron: 1, empeoraron: 1, iguales: 1 });
  // La acción de ventas es la misma aunque cambien mayúsculas y espacios.
  assert.deepEqual(c.acciones.resueltas.map((x) => x.accion), ['Fijar un plan de caja']);
  assert.equal(c.acciones.persistentes.length, 1);
  assert.deepEqual(c.acciones.nuevas.map((x) => x.distrito), ['fiscal']);
  assert.match(c.resumen, /pasó de 3\.2 a 2\.6/);
  assert.match(c.resumen, /Mejoraron: Finanzas/);
  assert.match(c.resumen, /Empeoraron: Rh/);
});

test('sin alguno de los dos diagnósticos no hay comparación', () => {
  assert.equal(compararDiagnosticos(null, diag('b', '2026-11-05T10:00:00.000Z', { a: 'rojo' })), null);
  assert.equal(compararDiagnosticos({ id: 'x' }, { id: 'y' }), null);
});

test('la serie va del más antiguo al más reciente y cuenta los colores', () => {
  const s = serieDeMadurez([
    diag('b', '2026-11-05T10:00:00.000Z', { a: 'verde', b: 'verde' }),
    diag('a', '2026-10-01T10:00:00.000Z', { a: 'rojo', b: 'amarillo' }),
  ]);
  assert.deepEqual(s.map((x) => x.id), ['a', 'b']);
  assert.deepEqual(s.map((x) => x.madurez), [2.3, 5]);
  assert.equal(s[0].rojo, 1);
  assert.equal(s[1].verde, 2);
});

test('por defecto se compara contra el anterior del mismo giro', () => {
  const lista = [
    { id: 'c', creado: '2026-11-05', giro: 'comercio' },
    { id: 'b', creado: '2026-11-01', giro: 'servicios' },
    { id: 'a', creado: '2026-10-01', giro: 'comercio' },
  ];
  assert.equal(elegirAnterior(lista, lista[0]).id, 'a');
  assert.equal(elegirAnterior(lista, lista[1]).id, 'a'); // no hay otro de servicios: el anterior inmediato
  assert.equal(elegirAnterior(lista, lista[2]), null);
});

test('el informe del Orquestador incluye el avance cuando hay con qué comparar', () => {
  const antes = diag('a', '2026-10-01T10:00:00.000Z', { finanzas: 'rojo' });
  const ahora = diag('b', '2026-11-05T10:00:00.000Z', { finanzas: 'verde' });
  const progreso = compararDiagnosticos(antes, ahora);
  const { bloques, resumen } = informeOficina({ diagnostico: ahora, marca: { nombre: 'Prueba' }, progreso });
  assert.match(resumen.avance, /pasó de 1\.5 a 5/);
  assert.ok(bloques.some((b) => b.tipo === 'subtitulo' && b.texto === 'Avance desde el diagnóstico anterior'));
  const sin = informeOficina({ diagnostico: ahora, marca: { nombre: 'Prueba' } });
  assert.equal(sin.resumen.avance, '');
});

// ---------- Servidor ----------

let servidor;
let base;
let dir;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'oficina-progreso-'));
  servidor = crearServidor(opcionesTemporales(dir));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((r) => servidor.close(r));
  rmSync(dir, { recursive: true, force: true });
});

const diagnosticar = async (extra) => (await fetch(`${base}/api/diagnosticos`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ contacto_nombre: 'Prueba automática', confianza: 'medio', giro: 'comercio', empleados: '6-10', ventas_anuales: '1m-5m', antiguedad_anios: 4, ...extra }),
})).json();

test('el servidor compara los dos últimos diagnósticos y permite borrar uno', async () => {
  const vacio = await (await fetch(`${base}/api/progreso`)).json();
  assert.equal(vacio.comparacion, null);
  assert.deepEqual(vacio.serie, []);

  const primero = await diagnosticar({ meses_caja: 0.5, margen_pct: 5 });
  await new Promise((r) => setTimeout(r, 15)); // fechas de creación distintas
  const segundo = await diagnosticar({ meses_caja: 6, margen_pct: 30 });

  const solo = await (await fetch(`${base}/api/progreso?id=${primero.id}`)).json();
  assert.equal(solo.comparacion, null, 'el primer diagnóstico no tiene anterior');

  const p = await (await fetch(`${base}/api/progreso`)).json();
  assert.equal(p.serie.length, 2);
  assert.equal(p.comparacion.actual.id, segundo.id);
  assert.equal(p.comparacion.anterior.id, primero.id);
  assert.equal(p.candidatos.length, 1);
  const finanzas = p.comparacion.areas.find((x) => x.id === 'finanzas');
  assert.equal(finanzas.cambio, 'mejoro');
  assert.ok(p.comparacion.madurez.delta > 0);

  // Elegir a mano contra cuál comparar; un id inexistente no rompe nada.
  const elegido = await (await fetch(`${base}/api/progreso?id=${segundo.id}&contra=${primero.id}`)).json();
  assert.equal(elegido.comparacion.anterior.id, primero.id);
  const malo = await fetch(`${base}/api/progreso?id=no-existe`);
  assert.equal(malo.status, 404);

  const informe = await (await fetch(`${base}/api/informe`)).json();
  assert.match(informe.resumen.avance, /La madurez pasó de/);

  const borrar = await fetch(`${base}/api/diagnosticos/${primero.id}`, { method: 'DELETE' });
  assert.equal(borrar.status, 200);
  assert.equal((await fetch(`${base}/api/diagnosticos/${primero.id}`)).status, 404);
  assert.equal((await fetch(`${base}/api/diagnosticos/${primero.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await fetch(`${base}/api/diagnosticos/..%2Fconfig`, { method: 'DELETE' })).status, 404);
  const tras = await (await fetch(`${base}/api/progreso`)).json();
  assert.equal(tras.comparacion, null);
  assert.equal(tras.serie.length, 1);
});
