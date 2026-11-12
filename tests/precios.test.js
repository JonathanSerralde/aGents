// Costo de la IA en pesos: precios de lista, estimación antes de actuar y gasto acumulado del mes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { precioDe, costoUsd, estimar, pesosCortos, tipoCambioDe, tokensDe, TIPO_CAMBIO_SUGERIDO } from '../src/precios.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} no es ${b}`);

test('el precio sale de la lista, o de lo que escribió el dueño, y un modelo desconocido no tiene precio', () => {
  assert.deepEqual(precioDe('claude-haiku-5-5'), { entrada: 0.1, salida: 0.5, origen: 'lista' });
  assert.equal(precioDe('claude-opus-5-5').entrada, 4);
  assert.equal(precioDe('claude-opus-5').entrada, 5);
  assert.equal(precioDe('claude-sonnet-5-5').salida, 10);
  assert.equal(precioDe('modelo-de-otro-proveedor'), null);
  assert.deepEqual(precioDe('modelo-de-otro-proveedor', { precioEntradaUsd: 1, precioSalidaUsd: 3 }), { entrada: 1, salida: 3, origen: 'tuyo' });
  assert.equal(precioDe('claude-haiku-5-5', { precioEntradaUsd: 1 }).origen, 'lista', 'con un solo precio escrito se usa la lista');
  assert.equal(tipoCambioDe({}), TIPO_CAMBIO_SUGERIDO);
  assert.equal(tipoCambioDe({ tipoCambio: 20 }), 20);
});

test('el costo cuenta entrada, salida, caché, lotes y búsquedas', () => {
  cerca(costoUsd({ modelo: 'claude-sonnet-5-5', entrada: 1e6, salida: 1e6 }), 12);
  // La mitad de la entrada vino de caché: cuesta la décima parte.
  cerca(costoUsd({ modelo: 'claude-sonnet-5-5', entrada: 1e6, salida: 0, cacheLeido: 5e5 }), 1 + 0.1);
  cerca(costoUsd({ modelo: 'claude-sonnet-5-5 (lote)', entrada: 1e6, salida: 1e6 }), 6);
  cerca(costoUsd({ modelo: 'claude-haiku-5-5', entrada: 0, salida: 0, busquedas: 8 }), 0.08);
  assert.equal(costoUsd({ modelo: 'desconocido', entrada: 1000, salida: 1000 }), null);
});

test('la estimación da un aproximado y un tope en pesos', () => {
  const e = estimar({ modelo: 'claude-sonnet-5-5', tokensEntrada: 10000, salidaEsperada: 500, salidaMaxima: 2500 }, { tipoCambio: 20 });
  cerca(e.aproximado, ((10000 * 2 + 500 * 10) / 1e6) * 20);
  cerca(e.hasta, ((10000 * 2 + 2500 * 10) / 1e6) * 20);
  assert.ok(e.hasta > e.aproximado);
  assert.equal(estimar({ modelo: 'desconocido', tokensEntrada: 1, salidaEsperada: 1, salidaMaxima: 1 }), null);
  assert.equal(pesosCortos(0.004), 'menos de 1 centavo');
  assert.equal(pesosCortos(0.5), '$0.50');
  assert.equal(pesosCortos(35.4), '$35');
  assert.ok(tokensDe('a'.repeat(320)) >= 100);
});

test('el servidor estima cada acción antes de hacerla y acumula el gasto del mes en pesos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-precios-'));
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA: async () => 'x'.repeat(4000) }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const estado = async () => (await fetch(`${base}/api/estado`)).json();
  try {
    // El modelo por defecto está en la lista de precios: hay estimaciones desde el arranque.
    const inicial = await estado();
    assert.equal(inicial.costos.activo, true);
    assert.equal(inicial.costos.precioConocido, true);
    assert.ok(inicial.costos.acciones.orden.hasta > 0);

    await fetch(`${base}/api/configuracion`, json('PUT', { tipoCambio: 20, precioEntradaUsd: 2, precioSalidaUsd: 10 }));
    const conPrecio = await estado();
    assert.equal(conPrecio.costos.tipoCambio, 20);
    for (const accion of ['orden', 'entregable', 'campana', 'investigacion', 'documento', 'optimizar', 'diagnostico']) {
      const c = conPrecio.costos.acciones[accion];
      assert.ok(c && c.hasta >= c.aproximado && c.hasta > 0, `falta la estimación de ${accion}`);
      assert.match(c.texto, /^Cuesta /);
    }
    assert.ok(conPrecio.costos.acciones.investigacion.hasta > conPrecio.costos.acciones.diagnostico.hasta, 'investigar con búsquedas cuesta más');
    assert.equal(conPrecio.uso.pesos, 0);

    // Una orden real (simulada) suma al gasto del mes, con el precio y el tipo de cambio del dueño.
    const orden = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Hola' }))).json();
    assert.equal(orden.pendiente, false);
    const uso = (await (await fetch(`${base}/api/uso`)).json()).actual;
    assert.ok(uso.costoUsd > 0);
    assert.equal(uso.pesos, Math.round(uso.costoUsd * 20 * 100) / 100);
    assert.equal(uso.sinPrecio || 0, 0);

    // Sin precio propio, lo que gaste un modelo desconocido se cuenta aparte en vez de inventarle costo.
    await fetch(`${base}/api/configuracion`, json('PUT', { precioEntradaUsd: 0, precioSalidaUsd: 0 }));
    await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Otra' }));
    const despues = (await (await fetch(`${base}/api/uso`)).json()).actual;
    assert.ok(despues.sinPrecio > 0);
    assert.equal(despues.costoUsd, uso.costoUsd);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sin IA configurada no hay estimaciones', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-precios-'));
  const servidor = crearServidor(opcionesTemporales(dir));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  try {
    const s = await (await fetch(`http://127.0.0.1:${servidor.address().port}/api/estado`)).json();
    assert.equal(s.costos.activo, false);
    assert.deepEqual(s.costos.acciones, {});
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lo gastado antes de llevar el costo por llamada se estima con las proporciones del mes', async () => {
  const { costoLegado } = await import('../src/precios.js');
  const mes = { entrada: 900000, salida: 100000, cacheLeido: 0, busquedas: 3, porModelo: { 'anthropic:claude-sonnet-5-5': 800000, 'prueba:prueba': 200000 } };
  const l = costoLegado(mes);
  // 800,000 tokens de Sonnet: 90% entrada a 2 dólares y 10% salida a 10, más tres búsquedas.
  cerca(l.usd, (720000 * 2 + 80000 * 10) / 1e6 + 0.03);
  assert.equal(l.sinPrecio, 200000);
  // Lo que ya trae costo registrado no se vuelve a contar.
  assert.deepEqual(costoLegado({ ...mes, conCosto: 800000, sinPrecio: 200000 }), { usd: 0, sinPrecio: 0 });
});
