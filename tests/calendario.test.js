import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generarIcs, parsearIcs, eventosDeOficina, crearCalendario, agendaParaPrompt } from '../src/calendario.js';
import { crearMemoria, fechaLocal } from '../src/memoria.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

const ICS_GOOGLE = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Google Inc//Google Calendar//EN',
  'BEGIN:VEVENT', 'DTSTART:20261110T150000Z', 'DTEND:20261110T160000Z', 'SUMMARY:Reunión con proveedor\\, Juan', 'UID:abc@google.com',
  'DESCRIPTION:Revisar precios de', ' pintura', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261112', 'DTEND;VALUE=DATE:20261113', 'SUMMARY:Inventario mensual', 'END:VEVENT',
  'BEGIN:VEVENT', 'SUMMARY:Sin fecha', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('generarIcs produce un calendario válido con eventos de todo el día y texto escapado', () => {
  const ics = generarIcs([{ id: 'a1', titulo: 'Ventas: llamar, clientes; hoy', fecha: '2026-11-20', descripcion: 'Rosa' }, { id: 'malo', titulo: 'x', fecha: 'no' }], { nombre: 'Mi tienda' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /X-WR-CALNAME:Mi tienda/);
  assert.match(ics, /UID:a1@agents/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261120/);
  assert.match(ics, /DTEND;VALUE=DATE:20261121/);
  assert.match(ics, /SUMMARY:Ventas: llamar\\, clientes\\; hoy/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  for (const linea of ics.split('\r\n')) assert.ok(Buffer.byteLength(linea, 'utf8') <= 75, linea);
});

test('parsearIcs lee eventos de Google/Outlook con hora UTC, todo el día y líneas plegadas', () => {
  const eventos = parsearIcs(ICS_GOOGLE);
  assert.equal(eventos.length, 2);
  assert.equal(eventos[0].titulo, 'Reunión con proveedor, Juan');
  assert.equal(eventos[0].fecha, '2026-11-10');
  assert.match(eventos[0].hora, /^\d{2}:\d{2}$/);
  assert.equal(eventos[0].descripcion, 'Revisar precios depintura'.replace('depintura', 'depintura')); // plegado sin espacio inicial extra
  assert.equal(eventos[1].fecha, '2026-11-12');
  assert.equal(eventos[1].hora, '');
  assert.deepEqual(parsearIcs('nada'), []);
});

test('la oficina exporta acciones con vencimiento, plan y tareas semanales, y arma la agenda para el prompt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cal-'));
  try {
    const memoria = crearMemoria(join(dir, 'memoria.json'));
    memoria.registrarRespuesta('ventas', 'ACCIONES:\n- [ventas] Llamar clientes — Rosa — 3 días\n- [ventas] Sin fecha — Luis — cuando se pueda');
    const diagnostico = { id: 'd1', creado: new Date().toISOString(), resultado: { plan: [{ nombre: 'Finanzas', accion: 'Proyectar caja', plazo: '30 días' }] } };
    const programacion = { leer: (t) => ({ activa: t === 'investigacion', proxima: new Date(Date.now() + 2 * 86400000).toISOString() }) };
    const eventos = eventosDeOficina({ memoria, diagnostico, programacion });
    assert.equal(eventos.length, 3);
    assert.match(eventos[0].titulo, /Ventas: Llamar clientes/);
    assert.match(eventos[1].titulo, /Plan \(Finanzas\): Proyectar caja/);
    assert.equal(eventos[2].titulo, 'Investigación semanal de mercado');
    const cal = crearCalendario(join(dir, 'calendario.json'));
    assert.throws(() => cal.importar('nada'), /no trae eventos/);
    const hoy = new Date();
    const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
    const lejos = new Date(hoy); lejos.setDate(hoy.getDate() + 40);
    const ics = generarIcs([{ id: 'x', titulo: 'Junta', fecha: fechaLocal(manana) }, { id: 'y', titulo: 'Lejos', fecha: fechaLocal(lejos) }]);
    assert.equal(cal.importar(ics, 'mi.ics').eventos.length, 2);
    assert.equal(cal.proximos(14).length, 1);
    assert.match(agendaParaPrompt(cal.proximos(14)), /Agenda de la empresa/);
    assert.match(agendaParaPrompt(cal.proximos(14)), /Junta/);
    assert.equal(agendaParaPrompt([]), '');
    cal.borrar();
    assert.equal(cal.leer().eventos.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el servidor entrega el .ics, importa la agenda y se la da al Orquestador pero no a un agente de área', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cal-srv-'));
  const recibido = [];
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA: async ({ sistema }) => { recibido.push(sistema); return 'OK'; } }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const ics = await fetch(`${base}/api/calendario.ics`);
    assert.equal(ics.status, 200);
    assert.match(ics.headers.get('content-type'), /text\/calendar/);
    assert.match(await ics.text(), /BEGIN:VCALENDAR/);
    const manana = new Date(); manana.setDate(manana.getDate() + 1);
    const propio = generarIcs([{ id: 'j', titulo: 'Junta con el banco', fecha: fechaLocal(manana) }]);
    const imp = await fetch(`${base}/api/calendario/importar`, { method: 'POST', headers: { 'content-type': 'text/calendar', 'x-nombre': 'banco.ics' }, body: propio });
    assert.equal(imp.status, 201);
    assert.equal((await imp.json()).eventos, 1);
    const estado = await (await fetch(`${base}/api/calendario`)).json();
    assert.equal(estado.eventosImportados, 1);
    assert.equal(estado.proximos[0].titulo, 'Junta con el banco');
    await fetch(`${base}/api/agentes/orquestador/mensajes`, json('POST', { texto: '¿Qué hacemos esta semana?' }));
    assert.match(recibido.at(-1), /Agenda de la empresa[\s\S]*Junta con el banco/);
    await fetch(`${base}/api/agentes/compras/mensajes`, json('POST', { texto: 'Cotiza pintura' }));
    assert.doesNotMatch(recibido.at(-1), /Junta con el banco/);
    assert.equal((await fetch(`${base}/api/calendario/importar`, { method: 'POST', headers: { 'content-type': 'text/calendar' }, body: 'basura' })).status, 422);
    assert.equal((await fetch(`${base}/api/calendario`, { method: 'DELETE' })).status, 200);
    assert.equal((await (await fetch(`${base}/api/calendario`)).json()).eventosImportados, 0);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
