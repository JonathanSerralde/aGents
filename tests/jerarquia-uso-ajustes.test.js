import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { superiorDe, puedeDelegar, subordinadosDe, organigrama, arbol, describirPosicion } from '../src/jerarquia.js';
import { crearUso, limiteAlcanzado, mesActual } from '../src/uso.js';
import { crearAjustes, parsearPropuestas, describirAjustes } from '../src/ajustes.js';
import { sistemaPara } from '../src/prompts.js';
import { HABILIDADES } from '../src/habilidades.js';
import { AREAS_CONVERSACION } from '../src/conversaciones.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (m, c) => ({ method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });

function opciones(dir, extra = {}) {
  return opcionesTemporales(dir, extra);
}

async function conServidor(extra, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'jua-'));
  const servidor = crearServidor(opciones(dir, extra));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { await fn(base); } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
}

test('la jerarquía define superiores, subordinados y quién puede delegar', () => {
  assert.equal(superiorDe('finanzas'), 'direccion');
  assert.equal(superiorDe('trafico'), 'marketing');
  assert.equal(superiorDe('mercado'), 'marketing');
  assert.equal(superiorDe('direccion'), 'orquestador');
  assert.equal(superiorDe('orquestador'), null);
  const propios = { 'x-norte': { nombre: 'Norte', areas: ['ventas'] }, 'x-todo': { nombre: 'Todo', areas: ['todas'] } };
  assert.equal(superiorDe('x-norte', propios), 'ventas');
  assert.equal(superiorDe('x-todo', propios), 'orquestador');
  assert.ok(subordinadosDe('direccion').includes('finanzas'));
  assert.deepEqual(subordinadosDe('marketing', propios).sort(), ['imagen', 'mercado', 'trafico']);
  assert.deepEqual(subordinadosDe('marketing', propios, ['imagen']).sort(), ['mercado', 'trafico']);
  assert.equal(puedeDelegar('orquestador', 'rh'), true);
  assert.equal(puedeDelegar('direccion', 'finanzas'), true);
  assert.equal(puedeDelegar('finanzas', 'ventas'), false);
  assert.equal(puedeDelegar('ventas', 'x-norte', propios), true);
  assert.match(organigrama(propios), /- Orquestador\n  - Dirección\n/);
  assert.match(organigrama(propios), /      - Norte/);
  assert.equal(arbol().nombre, 'Orquestador');
  assert.match(describirPosicion('marketing'), /Reportas a Dirección/);
  assert.match(describirPosicion('marketing'), /solo a: .*Investigación de mercado/);
  assert.match(describirPosicion('marketing'), /Imagen y exhibición/);
  assert.match(describirPosicion('finanzas'), /solo a: Análisis de inversiones, Contabilidad, Crédito y cobranza/);
  assert.match(describirPosicion('riesgos'), /No puedes delegar/);
  assert.match(sistemaPara('orquestador', null, null, null), /Organigrama/);
});

test('Dirección puede delegar a sus áreas; un área no puede delegar a otra', async () => {
  const llamarIA = async ({ sistema }) => (/otro agente del sistema/.test(sistema) ? 'Listo.' : 'Plan.\nDELEGAR: [Finanzas] — proyecta la caja\nDELEGAR: [Orquestador] — no deberías');
  await conServidor({ llamarIA }, async (base) => {
    const dir = await (await fetch(`${base}/api/agentes/direccion/mensajes`, json('POST', { texto: 'Organiza' }))).json();
    assert.equal(dir.intercambios.filter((i) => i.respuesta).length, 1);
    assert.equal(dir.intercambios[0].destino, 'finanzas');
    assert.match(dir.intercambios[1].error, /línea de mando/);
    const ventas = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Organiza' }))).json();
    assert.equal(ventas.intercambios.filter((i) => i.respuesta).length, 0);
    assert.match(ventas.intercambios[0].error, /línea de mando/);
  });
});

test('el monitor de uso acumula por mes, agente y modelo, y el límite bloquea sin reiniciar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'uso-'));
  try {
    const u = crearUso(join(dir, 'uso.json'));
    u.registrar({ proveedor: 'anthropic', modelo: 'm1', entrada: 100, salida: 50, agente: 'finanzas' });
    u.registrar({ proveedor: 'anthropic', modelo: 'm1', entrada: 10, salida: 5, agente: 'ventas' });
    const r = u.resumen();
    assert.equal(r.mes, mesActual());
    assert.equal(r.llamadas, 2);
    assert.equal(r.total, 165);
    assert.equal(r.porAgente.finanzas, 150);
    assert.equal(r.porModelo['anthropic:m1'], 165);
    assert.equal(limiteAlcanzado(r, 0), false);
    assert.equal(limiteAlcanzado(r, 165), true);
    assert.equal(u.historial().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const llamarIA = async () => ({ texto: 'OK', uso: { entrada: 400, salida: 100 } });
  await conServidor({ llamarIA }, async (base) => {
    await fetch(`${base}/api/configuracion`, json('PUT', { proveedor: 'ninguno', limiteMensualTokens: 900 }));
    const r1 = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'uno' }))).json();
    assert.equal(r1.uso.total, 500);
    assert.equal(r1.uso.limite, 900);
    assert.equal(r1.uso.porcentaje, 56);
    const r2 = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'dos' }))).json();
    assert.equal(r2.uso.alcanzado, true);
    const r3 = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'tres' }))).json();
    assert.equal(r3.pendiente, true);
    assert.match(r3.motivo, /límite mensual/);
    const estado = await (await fetch(`${base}/api/estado`)).json();
    assert.equal(estado.uso.total, 1000);
    assert.equal(estado.uso.porAgente.ventas, 1000);
    const usoApi = await (await fetch(`${base}/api/uso`)).json();
    assert.equal(usoApi.historial.length, 1);
  });
});

test('los ajustes por negocio se guardan, entran al prompt y las propuestas se aceptan o rechazan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aj-'));
  try {
    const a = crearAjustes(join(dir, 'aj.json'));
    a.guardar('finanzas', { notas: 'Vendemos solo de contado.', marcos: 'Caja diaria', acciones: ['Arqueo semanal'] });
    assert.equal(a.leer('finanzas').notas, 'Vendemos solo de contado.');
    assert.match(describirAjustes(a.leer('finanzas')), /Indicaciones de este negocio para ti: Vendemos solo de contado/);
    const s = sistemaPara('finanzas', null, null, null, null, null, { ajuste: a.leer('finanzas') });
    assert.match(s, /Vendemos solo de contado/);
    a.proponer('finanzas', { notas: 'Temporada alta en diciembre.', marcos: ['Caja diaria', 'Presupuesto de temporada'] }, 'Por el giro');
    assert.equal(a.leer('finanzas').propuesta.motivo, 'Por el giro');
    assert.doesNotMatch(describirAjustes(a.leer('finanzas')), /Temporada alta/);
    a.aceptar('finanzas');
    const f = a.leer('finanzas');
    assert.equal(f.propuesta, null);
    assert.match(f.notas, /contado\. Temporada alta/);
    assert.deepEqual(f.marcos, ['Caja diaria', 'Presupuesto de temporada']);
    a.proponer('ventas', { notas: 'x' }, 'y');
    a.rechazar('ventas');
    assert.equal(a.leer('ventas').propuesta, null);
    assert.throws(() => a.guardar('../x', {}), /no válido/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parsearPropuestas entiende los bloques del Orquestador', () => {
  const texto = 'Propongo:\nAGENTE: [Finanzas]\nNOTAS: Negocio de temporada.\nMARCOS:\n- Presupuesto por temporada\nACCIONES:\n- Reservar caja en octubre\nLIMITES:\n- No proyectar sin ventas del año anterior\nMOTIVO: ventas concentradas en diciembre\n\nAGENTE: Ventas\nNOTAS: Clientes recurrentes.\nMOTIVO: recurrencia alta';
  const p = parsearPropuestas(texto);
  assert.equal(p.length, 2);
  assert.equal(p[0].nombre, 'Finanzas');
  assert.deepEqual(p[0].marcos, ['Presupuesto por temporada']);
  assert.deepEqual(p[0].limites, ['No proyectar sin ventas del año anterior']);
  assert.equal(p[0].motivo, 'ventas concentradas en diciembre');
  assert.equal(p[1].notas, 'Clientes recurrentes.');
});

test('"Optimizar agentes" genera propuestas por API y se aceptan desde la pantalla', async () => {
  const llamarIA = async () => 'AGENTE: [Finanzas]\nNOTAS: Vende solo de contado.\nACCIONES:\n- Arqueo diario\nMOTIVO: caja en rojo\n\nAGENTE: [Orquestador]\nNOTAS: Prioriza liquidez.\nMOTIVO: base en rojo';
  await conServidor({ llamarIA }, async (base) => {
    await fetch(`${base}/api/diagnosticos`, json('POST', { contacto_nombre: 'P', confianza: 'alto', giro: 'comercio', empleados: '1-5', ventas_anuales: 'menos_1m', antiguedad_anios: 1, meses_caja: 0.5 }));
    const r = await (await fetch(`${base}/api/ajustes/optimizar`, { method: 'POST' })).json();
    assert.equal(r.ok, true);
    assert.deepEqual(r.propuestas.map((p) => p.id).sort(), ['finanzas', 'orquestador']);
    assert.equal(r.ajustes.finanzas.propuesta.notas, 'Vende solo de contado.');
    const aceptado = await (await fetch(`${base}/api/ajustes/finanzas/aceptar`, { method: 'POST' })).json();
    assert.equal(aceptado.propuesta, null);
    assert.deepEqual(aceptado.acciones, ['Arqueo diario']);
    const rechazado = await (await fetch(`${base}/api/ajustes/orquestador/rechazar`, { method: 'POST' })).json();
    assert.equal(rechazado.propuesta, null);
    const manual = await (await fetch(`${base}/api/ajustes/ventas`, json('PUT', { notas: 'Solo mayoreo.' }))).json();
    assert.equal(manual.notas, 'Solo mayoreo.');
    assert.equal((await fetch(`${base}/api/ajustes/inventado`)).status, 404);
    const jer = await (await fetch(`${base}/api/jerarquia`)).json();
    assert.equal(jer.arbol.nombre, 'Orquestador');
  });
  await conServidor({}, async (base) => {
    const sin = await fetch(`${base}/api/ajustes/optimizar`, { method: 'POST' });
    assert.equal(sin.status, 422);
  });
});

test('el monitor cuenta la caché leída y las búsquedas web aparte', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uso-cache-'));
  try {
    const uso = crearUso(join(dir, 'uso.json'));
    uso.registrar({ proveedor: 'anthropic', modelo: 'm', entrada: 1000, salida: 100, cacheLeido: 800, busquedas: 3, agente: 'mercado' });
    uso.registrar({ proveedor: 'anthropic', modelo: 'm', entrada: 500, salida: 50 });
    const r = uso.resumen();
    assert.equal(r.total, 1650);
    assert.equal(r.cacheLeido, 800);
    assert.equal(r.busquedas, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el agente de investigación de mercado existe y no inventa cifras', () => {
  assert.ok(AREAS_CONVERSACION.includes('mercado'));
  assert.match(HABILIDADES.mercado.marcos.join(' '), /DENUE/);
  assert.match(HABILIDADES.mercado.limites.join(' '), /Solo navega por internet en la investigación semanal/);
});
