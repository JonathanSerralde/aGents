import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { armarPasaporte, bloquesPasaporte, nivelDeMadurez, tendenciaDe } from '../src/pasaporte.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const diag = (creado, colores) => ({
  id: creado, creado, datos: { giro: 'servicios' },
  resultado: { distritos: Object.fromEntries(Object.entries(colores).map(([k, c]) => [k, { nombre: k, color: c, hallazgos: [] }])), plan: [] },
});
const reales = { periodo: { desde: '2026-07-01', hasta: '2026-10-31' }, comprobantes: 40, nomina: 5000, diferencia: 12000,
  ventas: { total: 100000, clientes: 8, top1Pct: 30, top3Pct: 55, recurrenciaPct: 62.5, creditoPct: 20 }, gastos: { total: 83000 } };

test('el nivel y la tendencia se leen de la madurez y de la serie', () => {
  assert.equal(nivelDeMadurez(4.2), 'Sólida');
  assert.equal(nivelDeMadurez(2.5), 'En desarrollo');
  assert.equal(nivelDeMadurez(1.5), 'Frágil');
  assert.equal(tendenciaDe([{ madurez: 2 }]).clave, 'sin_historial');
  assert.equal(tendenciaDe([{ madurez: 2 }, { madurez: 2.1 }]).clave, 'estable');
  assert.equal(tendenciaDe([{ madurez: 2 }, { madurez: 3.4 }]).clave, 'mejora');
  assert.equal(tendenciaDe([{ madurez: 4 }, { madurez: 3 }]).clave, 'baja');
});

test('el pasaporte resume el negocio, oculta los montos si no se piden y su huella depende solo del contenido', () => {
  const actual = diag('2026-11-05T10:00:00.000Z', { finanzas: 'verde', ventas: 'amarillo', rh: 'rojo', fiscal: 'sin_datos' });
  const serie = [{ creado: '2026-08-01T10:00:00.000Z', madurez: 2.2 }, { creado: actual.creado, madurez: 3.2 }];
  const base = { diagnostico: actual, serie, datosReales: reales, acciones: { hechas: 4, abiertas: 2, vencidas: 1 }, marca: { nombre: 'Taller Luna' }, ficha: { rfc: 'TLU010101AAA' } };
  const p = armarPasaporte({ ...base, ahora: new Date('2026-11-10T12:00:00.000Z') });
  assert.equal(p.madurez.valor, 3.2);
  assert.equal(p.madurez.nivel, 'En desarrollo');
  assert.equal(p.madurez.tendencia.clave, 'mejora');
  assert.deepEqual(p.resumenAreas, { bien: 1, revisar: 1, atencion: 1, sinDatos: 1 });
  assert.equal(p.historial.dias, 96);
  assert.equal(p.facturas.cubreGastos, true);
  assert.equal(p.facturas.ventas, undefined, 'sin pedir cifras no viajan los montos');
  assert.match(p.folio, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);

  const texto = bloquesPasaporte(p).map((b) => b.texto).join('\n');
  assert.match(texto, /Pasaporte de madurez — Taller Luna/);
  assert.match(texto, /3\.2 de 5 \(En desarrollo\)/);
  assert.match(texto, /No es una auditoría/);
  assert.ok(!texto.includes('$100,000'));
  assert.ok(texto.includes(p.huella));

  // Otro día, mismos datos: misma huella. Con cifras o con otro estado: huella distinta.
  const otroDia = armarPasaporte({ ...base, ahora: new Date('2026-11-10T18:00:00.000Z') });
  assert.equal(otroDia.huella, p.huella);
  const conCifras = armarPasaporte({ ...base, cifras: true, ahora: new Date('2026-11-10T12:00:00.000Z') });
  assert.notEqual(conCifras.huella, p.huella);
  assert.match(bloquesPasaporte(conCifras).map((b) => b.texto).join('\n'), /Ventas facturadas: \$100,000/);
  const cambiado = armarPasaporte({ ...base, diagnostico: diag(actual.creado, { finanzas: 'verde', ventas: 'verde', rh: 'verde', fiscal: 'verde' }) });
  assert.notEqual(cambiado.huella, p.huella);

  // Sin facturas y con un solo diagnóstico también se emite, diciéndolo.
  const minimo = armarPasaporte({ diagnostico: actual, ahora: new Date('2027-06-01T12:00:00.000Z') });
  const textoMinimo = bloquesPasaporte(minimo).map((b) => b.texto).join('\n');
  assert.match(textoMinimo, /Sin análisis de facturas/);
  assert.match(textoMinimo, /Conviene actualizarlo/);
  assert.equal(armarPasaporte({ diagnostico: null }), null);
});

test('el servidor emite el pasaporte en Word, lo verifica por huella y avisa cuando ya cambió', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-pasaporte-'));
  const servidor = crearServidor(opcionesTemporales(dir));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const diagnosticar = (extra) => fetch(`${base}/api/diagnosticos`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contacto_nombre: 'Prueba automática', confianza: 'medio', giro: 'comercio', empleados: '6-10', ventas_anuales: '1m-5m', antiguedad_anios: 4, ...extra }) });
  try {
    assert.equal((await fetch(`${base}/api/pasaporte`)).status, 404, 'sin diagnóstico no hay pasaporte');
    await diagnosticar({ meses_caja: 0.5, margen_pct: 5 });
    const p1 = (await (await fetch(`${base}/api/pasaporte`)).json()).pasaporte;
    assert.equal(p1.historial.diagnosticos, 1);
    assert.equal(p1.facturas, null);

    const docx = await fetch(`${base}/api/pasaporte/reporte.docx`);
    assert.equal(docx.status, 200);
    assert.equal(Buffer.from(await docx.arrayBuffer()).subarray(0, 2).toString(), 'PK');
    assert.match(await (await fetch(`${base}/api/pasaporte/reporte.html`)).text(), /Pasaporte de madurez/);

    const vigente = await (await fetch(`${base}/api/pasaporte/verificar?huella=${p1.huella}`)).json();
    assert.equal(vigente.coincide, true);
    assert.equal((await (await fetch(`${base}/api/pasaporte/verificar?huella=${p1.folio}`)).json()).coincide, true, 'también por folio');

    // Con facturas y un segundo diagnóstico el pasaporte cambia y la huella vieja deja de coincidir.
    const facturas = join(dir, '_facturas');
    mkdirSync(facturas);
    writeFileSync(join(facturas, 'ventas.csv'), 'fecha,cliente,total\n2026-09-01,Cliente A,2000\n2026-10-01,Cliente A,1000\n2026-10-02,Cliente B,1000');
    await fetch(`${base}/api/datos-reales/analizar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ carpeta: facturas }) });
    await new Promise((r) => setTimeout(r, 15));
    await diagnosticar({ meses_caja: 6, margen_pct: 30 });
    const p2 = (await (await fetch(`${base}/api/pasaporte?cifras=1`)).json()).pasaporte;
    assert.equal(p2.historial.diagnosticos, 2);
    assert.equal(p2.facturas.ventas, 4000);
    assert.equal(p2.facturas.top1Pct, 75);
    assert.ok(p2.avance);
    const viejo = await (await fetch(`${base}/api/pasaporte/verificar?huella=${p1.huella}`)).json();
    assert.equal(viejo.coincide, false);
    assert.equal((await (await fetch(`${base}/api/pasaporte/verificar?huella=${p2.huella}`)).json()).coincide, true);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
