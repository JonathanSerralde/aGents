import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearConversaciones, esAreaValida } from '../src/conversaciones.js';
import { sistemaPara } from '../src/prompts.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const BASE_DIAG = {
  contacto_nombre: 'P', confianza: 'alto', giro: 'comercio', empleados: '1-5', ventas_anuales: 'menos_1m', antiguedad_anios: 1,
  meses_caja: 0.5, meta_crecimiento: 'vertical',
};

function levantar(dir, extra = {}) {
  return crearServidor(opcionesTemporales(dir, { ...extra }));
}

async function conServidor(extra, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'conv-test-'));
  const servidor = levantar(dir, extra);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await fn(base, dir);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
}

const post = (base, area, texto) => fetch(`${base}/api/agentes/${area}/mensajes`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto }),
});

test('solo se aceptan áreas conocidas y el orquestador', () => {
  assert.equal(esAreaValida('finanzas'), true);
  assert.equal(esAreaValida('orquestador'), true);
  assert.equal(esAreaValida('../etc'), false);
  assert.equal(esAreaValida('inventada'), false);
});

test('la conversación se guarda por área, recorta textos y limita el historial', () => {
  const dir = mkdtempSync(join(tmpdir(), 'conv-store-'));
  try {
    const c = crearConversaciones(dir);
    assert.deepEqual(c.leer('ventas'), []);
    c.agregar('ventas', { rol: 'usuario', texto: '  Revisa la cartera  ' });
    c.agregar('ventas', { rol: 'agente', texto: 'x'.repeat(5000) });
    const lista = c.leer('ventas');
    assert.equal(lista.length, 2);
    assert.equal(lista[0].texto, 'Revisa la cartera');
    assert.equal(lista[1].texto.length, 5000); // las respuestas de los agentes no se recortan a 2000
    c.agregar('ventas', { rol: 'usuario', texto: 'y'.repeat(5000) });
    assert.equal(c.leer('ventas')[2].texto.length, 2000); // lo que escribe la persona sí
    assert.equal(c.leer('finanzas').length, 0);
    assert.throws(() => c.agregar('inventada', { rol: 'usuario', texto: 'hola' }), /desconocida/);
    assert.throws(() => c.agregar('ventas', { rol: 'usuario', texto: '   ' }), /vacío/);
    for (let i = 0; i < 70; i++) c.agregar('rh', { rol: 'usuario', texto: `m${i}` });
    assert.equal(c.leer('rh').length, 60);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el prompt del área solo lleva su contexto y el del orquestador lleva todas', () => {
  const diagnostico = {
    creado: '2026-11-05T00:00:00.000Z',
    datos: { giro: 'comercio' },
    resultado: {
      distritos: { finanzas: { nombre: 'Finanzas', color: 'rojo', hallazgos: ['Menos de un mes de caja.'] }, ventas: { nombre: 'Ventas', color: 'verde', hallazgos: [] } },
      plan: [{ distrito: 'finanzas', accion: 'Proyectar la caja', plazo: '30 días' }],
      crecimiento: { meta: 'vertical', preparado: false, bloqueos: ['Finanzas'], vertical: { nivel: 1, max: 4 }, horizontal: { nivel: 0, max: 4 } },
    },
  };
  const equipo = { areas: { finanzas: { responsable: 'Ana', agente: 'Fina' } } };
  const sFin = sistemaPara('finanzas', diagnostico, equipo, { nombre: 'Tienda X' });
  assert.match(sFin, /Eres Fina/);
  assert.match(sFin, /junto a Ana/);
  assert.match(sFin, /Menos de un mes de caja/);
  assert.doesNotMatch(sFin, /Ventas\. Estado/);
  const sOrq = sistemaPara('orquestador', diagnostico, equipo, { nombre: 'Tienda X' });
  assert.match(sOrq, /Coordinador/);
  assert.match(sOrq, /Finanzas\. Estado: Atención/);
  assert.match(sOrq, /Ventas\. Estado: Bien/);
  assert.match(sOrq, /bloquean: Finanzas/);
});

test('sin IA la orden queda pendiente para la persona responsable', async () => {
  await conServidor({}, async (base, dir) => {
    const res = await post(base, 'finanzas', 'Prepara el flujo de caja');
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.equal(j.pendiente, true);
    assert.equal(j.respuesta, null);
    assert.equal(j.mensajes.length, 1);
    assert.equal(j.mensajes[0].pendiente, true);
    assert.ok(existsSync(join(dir, 'conversaciones', 'finanzas.json')));
    const leido = await (await fetch(`${base}/api/agentes/finanzas/mensajes`)).json();
    assert.equal(leido.mensajes[0].texto, 'Prepara el flujo de caja');
  });
});

test('con IA el agente responde con el contexto de su área y el orquestador con el de todas', async () => {
  const recibido = [];
  const llamarIA = async ({ sistema, mensajes }) => {
    recibido.push({ sistema, mensajes });
    return `Entendido: ${mensajes.at(-1).texto}`;
  };
  await conServidor({ llamarIA }, async (base) => {
    await fetch(`${base}/api/diagnosticos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(BASE_DIAG) });
    await fetch(`${base}/api/equipo`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ areas: { finanzas: { responsable: 'Ana', agente: 'Fina' } } }) });
    // Crear el diagnóstico ya llamó al proveedor para el resumen; solo interesan las órdenes.
    recibido.length = 0;

    const r1 = await (await post(base, 'finanzas', 'Dame tres pasos para la caja')).json();
    assert.equal(r1.pendiente, false);
    assert.equal(r1.respuesta, 'Entendido: Dame tres pasos para la caja');
    assert.equal(r1.mensajes.length, 2);
    assert.match(recibido[0].sistema, /Eres Fina/);
    assert.match(recibido[0].sistema, /Menos de un mes de caja/);
    assert.doesNotMatch(recibido[0].sistema, /Crecimiento: meta/);

    const r2 = await (await post(base, 'orquestador', 'Qué atiendo primero')).json();
    assert.equal(r2.pendiente, false);
    assert.match(recibido[1].sistema, /Coordinador/);
    assert.match(recibido[1].sistema, /Crecimiento: meta vertical/);

    // La segunda orden al mismo agente lleva el historial previo
    await post(base, 'finanzas', 'Y después');
    assert.equal(recibido[2].mensajes.length, 3);
  });
});

test('una orden vacía o a un agente desconocido se rechaza', async () => {
  await conServidor({}, async (base) => {
    assert.equal((await post(base, 'finanzas', '   ')).status, 422);
    assert.equal((await post(base, 'inventada', 'hola')).status, 404);
    assert.equal((await fetch(`${base}/api/agentes/..%2F..%2Fx/mensajes`)).status, 404);
  });
});

test('si el proveedor falla, la orden queda guardada y se informa el error', async () => {
  await conServidor({ llamarIA: async () => { throw new Error('sin red'); } }, async (base) => {
    const res = await post(base, 'ventas', 'Revisa la cartera');
    assert.equal(res.status, 502);
    const j = await res.json();
    assert.match(j.errores[0], /sin red/);
    assert.equal(j.mensajes.length, 1);
  });
});
