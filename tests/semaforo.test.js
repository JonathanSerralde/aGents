// El semáforo del diagnóstico se mueve con las facturas: solo empeora o le da color a lo que no tenía datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluar, aplicarEvidencia } from '../src/diagnostico.js';
import { evidenciaDe } from '../src/semaforo.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const PROPIO = 'AAA010101AAA';
let folio = 0;
function cfdi({ emisor = PROPIO, receptor = 'CLI010101AA1', nombre = 'Cliente Uno', total = 1000, fecha = '2030-01-10T10:00:00', metodo = 'PUE' } = {}) {
  folio += 1;
  const uuid = `00000000-0000-0000-0000-${String(folio).padStart(12, '0')}`;
  return `<cfdi:Comprobante Version="4.0" Fecha="${fecha}" Moneda="MXN" Total="${total}" TipoDeComprobante="I" MetodoPago="${metodo}">
  <cfdi:Emisor Rfc="${emisor}" Nombre="Emisor ${emisor}"/><cfdi:Receptor Rfc="${receptor}" Nombre="${nombre}"/>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${uuid}"/></cfdi:Complemento></cfdi:Comprobante>`;
}

const BASE = { contacto_nombre: 'Prueba automática', confianza: 'medio', giro: 'comercio', empleados: '6-10', ventas_anuales: '1m-5m', antiguedad_anios: 4 };

test('la evidencia empeora un color, colorea lo que no tenía datos y nunca mejora lo declarado', () => {
  const resultado = evaluar({ ...BASE, meses_caja: 6, margen_pct: 30, dependencia_dueno: 1 });
  const antes = structuredClone(resultado);
  assert.equal(aplicarEvidencia(resultado, []), resultado, 'sin evidencia se devuelve el mismo resultado');

  const movido = aplicarEvidencia(resultado, [
    { area: 'finanzas', color: 'rojo', texto: 'Se gastó más de lo que se vendió.', accion: 'Recortar gastos.' },
    { area: 'compras', color: 'verde', texto: 'Compras repartidas.', accion: '' },
    { area: 'ventas', color: null, texto: 'Respondiste 20%; en tus facturas pesan 80%.', accion: '' },
  ]);
  assert.deepEqual(resultado, antes, 'el resultado original no se toca');
  assert.equal(movido.distritos.finanzas.color, 'rojo');
  assert.equal(movido.distritos.finanzas.declarado, resultado.distritos.finanzas.color);
  assert.ok(movido.distritos.finanzas.hallazgos.some((h) => h.startsWith('Según tus facturas: Se gastó más')));
  assert.ok(movido.plan.some((p) => p.distrito === 'finanzas' && p.accion === 'Recortar gastos.' && p.origen === 'facturas' && p.plazo === '30 días'));
  assert.equal(movido.prioridad[0], 'finanzas');
  // Finanzas en rojo bloquea el crecimiento, igual que en el diagnóstico.
  assert.equal(movido.distritos.crecimiento.color, 'rojo');
  assert.deepEqual(movido.crecimiento.bloqueos, ['Finanzas']);
  assert.equal(movido.crecimiento.preparado, false);
  assert.ok(movido.evidencia.movidas.some((m) => m.id === 'finanzas' && m.a === 'rojo'));
  assert.ok(movido.evidencia.movidas.some((m) => m.id === 'crecimiento'));
  // Un contraste informa sin mover el color.
  assert.equal(movido.distritos.ventas.color, resultado.distritos.ventas.color);
  assert.ok(movido.distritos.ventas.hallazgos.includes('Respondiste 20%; en tus facturas pesan 80%.'));
  // La evidencia en verde solo colorea un área sin datos.
  if (resultado.distritos.compras.color === 'sin_datos') assert.equal(movido.distritos.compras.color, 'verde');

  const enRojo = evaluar({ ...BASE, meses_caja: 0.5 });
  assert.equal(enRojo.distritos.finanzas.color, 'rojo');
  const igual = aplicarEvidencia(enRojo, [{ area: 'finanzas', color: 'verde', texto: 'Lo facturado cubre los gastos.', accion: '' }]);
  assert.equal(igual.distritos.finanzas.color, 'rojo', 'las facturas no mejoran lo que el dueño respondió');
  assert.deepEqual(igual.evidencia.movidas, []);
});

test('la evidencia sale de las facturas y del flujo, y se puede apagar', () => {
  const datosReales = {
    periodo: { desde: '2030-01-01', hasta: '2030-03-31', meses: 3 },
    ventas: { total: 100000, clientes: 6, publicoGeneralPct: 0, top1Pct: 55, top3Pct: 80, recurrenciaPct: 10, creditoPct: 70, topClientes: [{ nombre: 'Cliente Uno' }] },
    gastos: { total: 120000, proveedores: 3, top1Pct: 60, topProveedores: [{ nombre: 'Proveedor Uno' }] },
    nomina: 0, diferencia: -20000,
  };
  const flujo = { tieneSaldo: true, alerta: { nivel: 'rojo', texto: 'En la semana 3 te faltarían $5,000.' }, totales: { porCobrar: 70000, porCobrarVencido: 30000 } };
  const ev = evidenciaDe({ datosReales, flujo, datos: { concentracion_top3_pct: 20, clientes_recurrentes_pct: 60 } });
  const de = (area, color) => ev.filter((e) => e.area === area && e.color === color);
  assert.equal(de('ventas', 'rojo').length, 1);
  assert.equal(de('finanzas', 'rojo').length, 2, 'gastos mayores que ventas y faltante de caja');
  assert.ok(de('finanzas', 'amarillo').some((e) => /cobranza vencida/.test(e.texto)));
  assert.equal(de('compras', 'amarillo').length, 1);
  assert.equal(ev.filter((e) => e.color === null).length, 2, 'dos contrastes con lo declarado');
  assert.ok(ev.filter((e) => e.color === 'rojo' || e.color === 'amarillo').every((e) => e.accion), 'cada señal trae su acción');

  assert.deepEqual(evidenciaDe({ datosReales: { ...datosReales, semaforo: false }, flujo }), []);
  assert.deepEqual(evidenciaDe({ datosReales: null, flujo }), []);
  // Con la mayoría de la venta al público en general no se contrasta la concentración.
  const publico = evidenciaDe({ datosReales: { ...datosReales, ventas: { ...datosReales.ventas, publicoGeneralPct: 70 } }, datos: { concentracion_top3_pct: 20 } });
  assert.equal(publico.filter((e) => e.color === null).length, 0);
});

test('el servidor entrega el último diagnóstico con el semáforo movido y deja intacto lo guardado', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-semaforo-'));
  const facturas = join(dir, 'facturas');
  mkdirSync(facturas);
  // Un cliente concentra 60% de la venta y se compró más de lo que se vendió.
  writeFileSync(join(facturas, 'v1.xml'), cfdi({ total: 6000, receptor: 'CLI010101AA1', nombre: 'Cliente Uno' }));
  writeFileSync(join(facturas, 'v2.xml'), cfdi({ total: 2000, receptor: 'CLI020202BB2', nombre: 'Cliente Dos' }));
  writeFileSync(join(facturas, 'v3.xml'), cfdi({ total: 2000, receptor: 'CLI030303CC3', nombre: 'Cliente Tres' }));
  writeFileSync(join(facturas, 'g1.xml'), cfdi({ total: 15000, emisor: 'PRO010101AA1', receptor: PROPIO, nombre: 'Negocio de prueba' }));
  const servidor = crearServidor(opcionesTemporales(dir, { ahora: () => new Date('2030-03-15T12:00:00.000Z') }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const leer = async (id) => (await fetch(`${base}/api/diagnosticos/${id}`)).json();
  try {
    const primero = await (await fetch(`${base}/api/diagnosticos`, json('POST', { ...BASE, meses_caja: 6, margen_pct: 30 }))).json();
    const declarado = primero.resultado.distritos;
    assert.notEqual(declarado.finanzas.color, 'rojo');
    assert.equal(primero.resultado.evidencia, undefined, 'sin facturas no hay nada que mover');

    await fetch(`${base}/api/datos-reales/analizar`, json('POST', { carpeta: facturas }));
    const movido = (await leer(primero.id)).resultado;
    assert.equal(movido.distritos.ventas.color, 'rojo');
    assert.equal(movido.distritos.ventas.declarado, declarado.ventas.color);
    assert.equal(movido.distritos.finanzas.color, 'rojo');
    assert.equal(movido.distritos.crecimiento.color, 'rojo');
    assert.ok(movido.evidencia.movidas.length >= 2);
    assert.ok(movido.plan.some((p) => p.origen === 'facturas'));

    // Lo demás de la oficina ve el mismo semáforo: la junta y el informe.
    const junta = (await (await fetch(`${base}/api/junta`)).json()).junta;
    assert.ok(junta.cifras.length > 0);
    const pasaporte = (await (await fetch(`${base}/api/pasaporte`)).json()).pasaporte;
    assert.equal(pasaporte.areas.find((a) => a.id === 'ventas').color, 'rojo');

    // Apagarlo regresa a lo que el dueño respondió; encenderlo lo vuelve a mover.
    await fetch(`${base}/api/flujo`, json('PUT', { semaforo: false }));
    const apagado = (await leer(primero.id)).resultado;
    assert.equal(apagado.distritos.ventas.color, declarado.ventas.color);
    assert.equal(apagado.evidencia, undefined);
    await fetch(`${base}/api/flujo`, json('PUT', { semaforo: true }));
    assert.equal((await leer(primero.id)).resultado.distritos.ventas.color, 'rojo');

    // Un diagnóstico nuevo nace ya con el semáforo movido, y el anterior queda como se respondió.
    await new Promise((r) => setTimeout(r, 15));
    const segundo = await (await fetch(`${base}/api/diagnosticos`, json('POST', { ...BASE, meses_caja: 6, margen_pct: 30 }))).json();
    assert.equal(segundo.resultado.distritos.ventas.color, 'rojo');
    assert.equal((await leer(primero.id)).resultado.distritos.ventas.color, declarado.ventas.color);

    // Olvidar el análisis regresa todo a lo declarado.
    await fetch(`${base}/api/datos-reales`, { method: 'DELETE' });
    assert.equal((await leer(segundo.id)).resultado.distritos.ventas.color, declarado.ventas.color);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
