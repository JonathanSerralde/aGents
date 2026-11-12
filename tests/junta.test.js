// La junta del lunes: cifras, decisiones y compromisos de la semana, y el seguimiento de la anterior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lunesDe, domingoDe, armarJunta, mensajesDe, bloquesJunta, MAX_COMPROMISOS } from '../src/junta.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

test('la semana va de lunes a domingo, sin importar el día en que se abra', () => {
  assert.equal(lunesDe(new Date(2030, 0, 7, 9)), '2030-01-07'); // lunes
  assert.equal(lunesDe(new Date(2030, 0, 9, 23)), '2030-01-07'); // miércoles
  assert.equal(lunesDe(new Date(2030, 0, 13, 8)), '2030-01-07'); // domingo
  assert.equal(lunesDe(new Date(2030, 0, 14, 0, 1)), '2030-01-14');
  assert.equal(domingoDe('2030-01-28'), '2030-02-03');
});

const flujo = {
  tieneSaldo: true,
  alerta: { nivel: 'rojo', semana: 2, texto: 'En la semana 2 (del 2030-01-14) te faltarían $12,000.' },
  semanas: [{ saldo: 3000, neto: -2000 }],
  totales: { porCobrar: 50000, porCobrarVencido: 20000 },
  deudores: [{ nombre: 'Hotel Costa', saldo: 20000, diasVencido: 35 }],
};
const diagnostico = { resultado: {
  distritos: { finanzas: { nombre: 'Finanzas', color: 'rojo' }, ventas: { nombre: 'Ventas', color: 'amarillo' } },
  cruzados: [{ texto: 'Se gasta en captar sin retener.', accion: 'Medir la recompra antes de invertir más en publicidad' }],
  plan: [{ distrito: 'finanzas', nombre: 'Finanzas', accion: 'Hacer un plan de caja', plazo: '30 días' }, { distrito: 'ventas', nombre: 'Ventas', accion: 'Llamar a clientes inactivos', plazo: '30 días' }, { distrito: 'ventas', nombre: 'Ventas', accion: 'Otra de ventas', plazo: '60 días' }],
  crecimiento: { bloqueos: ['Finanzas'] },
} };
const nombreDe = (id) => ({ finanzas: 'Finanzas', ventas: 'Ventas', rh: 'Recursos humanos' }[id] || id);

test('la junta abre con dinero, pone primero la decisión más urgente y reparte los compromisos entre áreas', () => {
  const vencida = { id: 'a1', area: 'rh', texto: 'Firmar contratos', responsable: 'Lucía', vence: '2030-01-02' };
  const j = armarJunta({ ahora: new Date(2030, 0, 9), diagnostico, flujo, abiertas: [vencida], vencidas: [vencida], responsableDe: (id) => (id === 'ventas' ? 'Marco' : ''), nombreDe });
  assert.equal(j.semana, '2030-01-07');
  assert.equal(j.cifras.length, 3);
  assert.equal(j.cifras[0].valor, '$3,000');
  assert.equal(j.cifras[1].valor, '$20,000');
  assert.match(j.cifras[1].detalle, /Hotel Costa/);
  assert.equal(j.cifras[2].valor, '1');
  assert.equal(j.decisiones.length, 3);
  assert.match(j.decisiones[0].texto, /faltante de la semana 2/);
  assert.match(j.decisiones[1].texto, /A quién se le cobra/);
  assert.match(j.decisiones[2].texto, /Medir la recompra/);
  // Lo vencido va primero; luego el plan, una acción por área.
  assert.deepEqual(j.compromisos.map((c) => [c.area, c.origen]), [['rh', 'vencida'], ['finanzas', 'plan'], ['ventas', 'plan']]);
  assert.equal(j.compromisos.length, MAX_COMPROMISOS);
  assert.equal(j.compromisos[2].responsable, 'Marco');

  const mensajes = mensajesDe(j, 'Taller Luna');
  assert.equal(mensajes.find((m) => m.responsable === 'Lucía').texto.split('\n')[0], 'Hola, Lucía. Este es tu compromiso de la semana del 2030-01-07 en Taller Luna:');
  assert.ok(mensajes.some((m) => m.responsable === 'Sin responsable'));
  assert.match(bloquesJunta({ ...j, anterior: null }, 'Taller Luna').map((b) => b.texto).join('\n'), /Tres cifras[\s\S]*Decisiones de esta semana[\s\S]*Firmar contratos — Lucía/);
});

test('sin facturas la junta habla del diagnóstico, y sin nada no inventa compromisos', () => {
  const j = armarJunta({ ahora: new Date(2030, 0, 9), diagnostico, nombreDe });
  assert.deepEqual(j.cifras.map((c) => c.titulo), ['Madurez del negocio', 'Áreas en atención', 'Compromisos abiertos']);
  assert.match(j.decisiones[0].texto, /Medir la recompra/);
  const vacia = armarJunta({ ahora: new Date(2030, 0, 9) });
  assert.deepEqual(vacia.compromisos, []);
  assert.deepEqual(vacia.decisiones, []);
  assert.equal(vacia.cifras.length, 1);
});

test('en el servidor los compromisos se fijan al abrir la semana y la siguiente dice cuáles se cumplieron', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-junta-'));
  let reloj = new Date(2030, 0, 9, 10); // miércoles
  const servidor = crearServidor(opcionesTemporales(dir, { ahora: () => reloj }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  try {
    const vacia = await (await fetch(`${base}/api/junta`)).json();
    assert.equal(vacia.junta.hayDiagnostico, false);
    assert.deepEqual(vacia.junta.compromisos, []);

    await fetch(`${base}/api/diagnosticos`, json('POST', { contacto_nombre: 'Prueba automática', confianza: 'medio', giro: 'comercio', empleados: '6-10', ventas_anuales: '1m-5m', antiguedad_anios: 4, meses_caja: 0.5, margen_pct: 5, imss_infonavit: 'adeudo' }));
    const j1 = await (await fetch(`${base}/api/junta`)).json();
    assert.equal(j1.junta.semana, '2030-01-07');
    assert.ok(j1.junta.compromisos.length >= 1 && j1.junta.compromisos.length <= 3);
    assert.ok(j1.junta.compromisos.every((c) => c.hecho === false && c.vence === '2030-01-13'));
    assert.equal(j1.junta.anterior, null);
    assert.ok(j1.mensajes.length >= 1);
    // Los compromisos que salieron del plan quedaron en la bitácora, y volver a abrir la semana no los duplica.
    const abiertas = async () => (await (await fetch(`${base}/api/memoria`)).json()).acciones.filter((a) => a.estado === 'pendiente').length;
    assert.equal(await abiertas(), j1.junta.compromisos.length);
    const repetida = await (await fetch(`${base}/api/junta`)).json();
    assert.deepEqual(repetida.junta.compromisos.map((c) => c.id), j1.junta.compromisos.map((c) => c.id));
    assert.equal(await abiertas(), j1.junta.compromisos.length);

    // Se cumple el primero.
    await fetch(`${base}/api/memoria/acciones/${j1.junta.compromisos[0].id}`, json('PUT', { estado: 'hecha' }));
    assert.equal((await (await fetch(`${base}/api/junta`)).json()).junta.compromisos[0].hecho, true);

    // El lunes siguiente: la hoja nueva empieza por lo que se cumplió.
    reloj = new Date(2030, 0, 14, 9);
    const j2 = await (await fetch(`${base}/api/junta`)).json();
    assert.equal(j2.junta.semana, '2030-01-14');
    assert.equal(j2.junta.anterior.semana, '2030-01-07');
    assert.equal(j2.junta.anterior.hechos, 1);
    assert.equal(j2.junta.anterior.total, j1.junta.compromisos.length);
    // Lo que no se cumplió y ya venció vuelve como compromiso de esta semana.
    if (j1.junta.compromisos.length > 1) assert.ok(j2.junta.compromisos.some((c) => c.id === j1.junta.compromisos[1].id));

    const docx = await fetch(`${base}/api/junta/reporte.docx`);
    assert.equal(Buffer.from(await docx.arrayBuffer()).subarray(0, 2).toString(), 'PK');
    assert.match(await (await fetch(`${base}/api/junta/reporte.html`)).text(), /De la semana pasada/);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
