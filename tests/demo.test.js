// Negocio de ejemplo: una empresa aparte con datos inventados, que se abre y se quita sin tocar las reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sembrarDemo, NOMBRE_DEMO, MARCA_DEMO } from '../src/demo.js';
import { crearServidor, crearServidorMultiempresa } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const escuchar = (servidor) => new Promise((r) => servidor.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${servidor.address().port}`)));
const cerrar = (servidor) => new Promise((r) => servidor.close(r));

test('el negocio de ejemplo trae diagnóstico, avance, flujo de caja y una junta con compromisos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-demo-'));
  const resumen = sembrarDemo(dir);
  assert.equal(resumen.diagnosticos, 2);
  const servidor = crearServidor(opcionesTemporales(dir));
  const base = await escuchar(servidor);
  const leer = async (ruta) => (await fetch(base + ruta)).json();
  try {
    assert.equal((await leer('/api/marca')).nombre, MARCA_DEMO);
    assert.equal((await leer('/api/diagnosticos')).diagnosticos.length, 2);
    const avance = await leer('/api/progreso');
    assert.ok(avance.comparacion.madurez.delta > 0, 'el segundo diagnóstico mejora al primero');
    assert.ok((await leer('/api/flujo')).flujo.totales.porCobrarVencido > 0, 'hay cobranza vencida que atender');
    assert.ok((await leer('/api/datos-reales')).analisis.hallazgos.length >= 2);

    // La semana pasada se cumplieron dos de tres; el pendiente abre la junta de esta semana.
    const { junta } = await leer('/api/junta');
    assert.deepEqual([junta.anterior.hechos, junta.anterior.total], [2, 3]);
    assert.equal(junta.compromisos.length, 3);
    assert.match(junta.compromisos[0].texto, /Constructora Horizonte/);
    assert.ok(junta.compromisos.every((c) => c.responsable), 'cada compromiso tiene responsable');
    assert.ok(junta.decisiones.length >= 2);
  } finally {
    await cerrar(servidor);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el ejemplo no usa datos de nadie: los RFC son ficticios y no hay correos ni teléfonos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-demo-'));
  try {
    sembrarDemo(dir);
    const archivos = (carpeta) => readdirSync(carpeta).flatMap((n) => (statSync(join(carpeta, n)).isDirectory() ? archivos(join(carpeta, n)) : [join(carpeta, n)]));
    const todo = archivos(dir).map((a) => readFileSync(a, 'utf8')).join('\n');
    const rfcs = todo.match(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g) || [];
    assert.ok(rfcs.length > 0);
    assert.ok(rfcs.every((r) => r.startsWith('DEMO') || r === 'XAXX010101000'), `RFC que no es de ejemplo: ${rfcs.find((r) => !r.startsWith('DEMO') && r !== 'XAXX010101000')}`);
    assert.doesNotMatch(todo, /@|\b\d{10}\b|sk-ant-/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el ejemplo se abre aparte, no se duplica y al quitarlo se vuelve a la empresa de antes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-demo-'));
  const servidor = crearServidorMultiempresa({ ...opcionesTemporales(dir), dirRaizDatos: dir });
  const base = await escuchar(servidor);
  const pedir = (ruta, metodo = 'GET', cuerpo) => fetch(base + ruta, { method: metodo, headers: { 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const leer = async (ruta) => (await pedir(ruta)).json();
  try {
    // Un despacho con una empresa real abierta.
    const real = (await (await pedir('/api/empresas', 'POST', { nombre: 'Cliente del despacho' })).json()).empresa;
    await pedir('/api/empresas/activa', 'PUT', { id: real.id });
    assert.equal((await leer('/api/diagnosticos')).diagnosticos.length, 0);

    const abierta = await (await pedir('/api/empresas/demo', 'POST', {})).json();
    assert.equal(abierta.ok, true);
    assert.equal(abierta.empresa.demo, true);
    assert.equal(abierta.empresa.nombre, NOMBRE_DEMO);
    assert.equal(abierta.activa, abierta.empresa.id);
    assert.equal(abierta.anterior, real.id, 'recuerda de dónde se vino');
    assert.equal((await leer('/api/diagnosticos')).diagnosticos.length, 2);
    assert.equal((await leer('/api/marca')).nombre, MARCA_DEMO);
    const carpeta = join(dir, 'empresas', abierta.empresa.id);
    assert.ok(existsSync(carpeta));

    // Pedirlo otra vez abre el mismo, sin crear otro.
    const otraVez = await (await pedir('/api/empresas/demo', 'POST', {})).json();
    assert.equal(otraVez.empresa.id, abierta.empresa.id);
    assert.equal(otraVez.lista.filter((e) => e.demo).length, 1);

    // Las empresas reales no se pueden quitar por esta vía.
    assert.equal((await pedir(`/api/empresas/${real.id}`, 'DELETE')).status, 422);
    assert.equal((await pedir('/api/empresas/principal', 'DELETE')).status, 422);

    // Quitar el ejemplo borra su carpeta y regresa a la empresa real, que sigue intacta.
    const quitada = await (await pedir(`/api/empresas/${abierta.empresa.id}`, 'DELETE')).json();
    assert.equal(quitada.activa, real.id);
    assert.equal(quitada.lista.some((e) => e.demo), false);
    assert.equal(existsSync(carpeta), false);
    assert.ok(existsSync(join(dir, 'empresas', real.id)));
    assert.equal((await leer('/api/diagnosticos')).diagnosticos.length, 0);
  } finally {
    await cerrar(servidor);
    rmSync(dir, { recursive: true, force: true });
  }
});
