import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizarPermisos, sanitizarConfiguracion, crearConfiguracion, PERMISOS } from '../src/configuracion.js';
import { similitud, crearRutinas, proximaCorrida, sanitizarRutina, VECES_PARA_SUGERIR } from '../src/rutinas.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('los permisos empiezan en sí, se apagan uno por uno y sobreviven a guardar la configuración de IA', () => {
  assert.deepEqual(Object.keys(PERMISOS), ['ia', 'busquedaWeb', 'documentosIA', 'tareasAutomaticas', 'analizarSitio', 'rutinas', 'piloto']);
  assert.equal(sanitizarPermisos(null).ia, true);
  assert.equal(sanitizarPermisos(null).piloto, false); // el piloto automático se enciende a propósito
  assert.equal(sanitizarPermisos({ piloto: true }).piloto, true);
  assert.equal(sanitizarPermisos({}, { ia: true }).piloto, false);
  assert.equal(sanitizarPermisos({ ia: false }).ia, false);
  assert.equal(sanitizarPermisos({ ia: 'no' }).ia, false);
  assert.equal(sanitizarPermisos({}, { ia: false, busquedaWeb: true }).ia, false);
  assert.equal(sanitizarConfiguracion({ permisos: { rutinas: false } }).permisos.rutinas, false);
  const dir = mkdtempSync(join(tmpdir(), 'perm-'));
  try {
    const c = crearConfiguracion(join(dir, 'config.json'));
    c.guardarPermisos({ busquedaWeb: false });
    assert.equal(c.leer().permisos.busquedaWeb, false);
    c.guardar({ proveedor: 'anthropic', anthropicKey: 'sk-1234' }); // sin permisos en la entrada: se conservan
    assert.equal(c.leer().permisos.busquedaWeb, false);
    assert.equal(c.leer().anthropicKey, 'sk-1234');
    c.guardarPermisos({ busquedaWeb: true, ia: false });
    assert.deepEqual([c.leer().permisos.busquedaWeb, c.leer().permisos.ia], [true, false]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('las órdenes parecidas se detectan y a la tercera vez nace una sugerencia de rutina', () => {
  assert.ok(similitud('Dame el resumen de ventas de la semana', 'Resumen de ventas de esta semana') >= 0.5);
  assert.ok(similitud('Dame el resumen de ventas de la semana', 'Calcula el aguinaldo de Juan') < 0.2);
  const dir = mkdtempSync(join(tmpdir(), 'rut-'));
  try {
    const r = crearRutinas(join(dir, 'rutinas.json'));
    assert.equal(r.registrarOrden('ventas', 'Dame el resumen de ventas de la semana').sugerencia, null);
    assert.equal(r.registrarOrden('ventas', 'Resumen de ventas de esta semana por favor').sugerencia, null);
    assert.equal(r.registrarOrden('marketing', 'Dame el resumen de ventas de la semana').sugerencia, null); // otro agente no cuenta
    const tercera = r.registrarOrden('ventas', 'dame el resumen de ventas de la semana');
    assert.equal(tercera.veces, VECES_PARA_SUGERIR);
    assert.equal(tercera.sugerencia.area, 'ventas');
    assert.equal(r.sugerencias().length, 1);
    const cuarta = r.registrarOrden('ventas', 'resumen de ventas de la semana');
    assert.equal(cuarta.sugerencia.id, tercera.sugerencia.id); // no se duplica, se actualiza
    assert.equal(cuarta.sugerencia.veces, 4);
    const rutina = r.crear({ area: 'ventas', texto: 'Dame el resumen de ventas de la semana', frecuencia: 'semanal', diaSemana: 1, hora: 8 });
    assert.equal(r.sugerencias().length, 0); // la sugerencia se consumió
    assert.equal(r.registrarOrden('ventas', 'resumen de ventas de la semana').sugerencia, null); // ya hay rutina
    assert.equal(r.listar()[0].nombre, 'Dame el resumen de ventas de la semana');
    assert.ok(r.listar()[0].proxima);
    assert.equal(r.actualizar(rutina.id, { activa: false }).activa, false);
    assert.equal(r.listar()[0].proxima, null);
    assert.equal(r.actualizar('zzzzzzzz', {}), null);
    assert.throws(() => r.crear({ area: 'ventas', texto: '' }), /necesita la orden/);
    assert.throws(() => sanitizarRutina({ texto: 'x' }), /necesita un agente/);
    assert.equal(r.borrar(rutina.id), true);
    assert.equal(r.borrar(rutina.id), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('la próxima corrida respeta la frecuencia y las vencidas corren una vez', () => {
  const lunes = new Date(2026, 10, 9, 10); // lunes 9 nov 2026 10:00
  assert.equal(proximaCorrida({ frecuencia: 'diaria', hora: 9 }, lunes).getDate(), 10);
  assert.equal(proximaCorrida({ frecuencia: 'diaria', hora: 15 }, lunes).getDate(), 9);
  const sem = proximaCorrida({ frecuencia: 'semanal', diaSemana: 1, hora: 9 }, lunes);
  assert.equal(sem.getDate(), 16);
  const mes = proximaCorrida({ frecuencia: 'mensual', diaMes: 5, hora: 9 }, lunes);
  assert.equal(`${mes.getMonth()}-${mes.getDate()}`, '11-5');
  const dir = mkdtempSync(join(tmpdir(), 'rut2-'));
  try {
    const r = crearRutinas(join(dir, 'rutinas.json'));
    const rutina = r.crear({ area: 'ventas', texto: 'Resumen', frecuencia: 'diaria', hora: 9 });
    assert.equal(r.vencidas(new Date()).length, 0);
    const manana = new Date(); manana.setDate(manana.getDate() + 1); manana.setHours(9, 30);
    assert.equal(r.vencidas(manana).length, 1);
    r.marcarEjecutada(rutina.id, 'respondida', manana);
    assert.equal(r.vencidas(manana).length, 0);
    const pasado = new Date(manana); pasado.setDate(pasado.getDate() + 1);
    assert.equal(r.vencidas(pasado).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el servidor expone el panel de permisos, los aplica y sugiere/ejecuta rutinas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'perm-srv-'));
  const recibido = [];
  let reloj = new Date();
  const llamarIA = async ({ sistema, busqueda }) => { recibido.push({ sistema, busqueda: Boolean(busqueda) }); return busqueda ? 'COMPETIDOR: A | B | C' : 'Reporte listo.'; };
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA, ahora: () => reloj, fetchSitio: async (url) => ({ url, status: 200, headers: new Headers(), body: null, arrayBuffer: async () => new TextEncoder().encode('<html></html>').buffer }) }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const panel = await (await fetch(`${base}/api/permisos`)).json();
    assert.equal(panel.filas.filter((f) => f.tipo === 'permiso').length, 7);
    assert.equal(panel.filas.find((f) => f.id === 'piloto').activo, false);
    assert.ok(panel.filas.some((f) => f.id === 'servidor' && /127\.0\.0\.1/.test(f.descripcion)));
    assert.equal(panel.permisos.ia, true);

    // Apagar la IA: las órdenes quedan pendientes con motivo claro, aunque haya proveedor.
    await fetch(`${base}/api/permisos`, json('PUT', { ia: false }));
    const sinIA = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Dame el resumen de ventas' }))).json();
    assert.equal(sinIA.pendiente, true);
    assert.match(sinIA.motivo, /desactivada por ti/);
    await fetch(`${base}/api/permisos`, json('PUT', { ia: true, busquedaWeb: false, analizarSitio: false }));
    const inv = await fetch(`${base}/api/investigacion/ejecutar`, { method: 'POST' });
    assert.equal(inv.status, 422);
    assert.match((await inv.json()).errores[0], /Búsqueda en internet desactivada/);
    const sitio = await fetch(`${base}/api/sitio/analizar`, json('POST', { url: 'http://mitienda.mx' }));
    assert.equal(sitio.status, 422);
    assert.match((await sitio.json()).errores[0], /desactivado por ti/);
    // Inversiones sin permiso de búsqueda responde sin buscar.
    recibido.length = 0;
    await fetch(`${base}/api/agentes/inversiones/mensajes`, json('POST', { texto: '¿Compro la camioneta?' }));
    assert.equal(recibido.at(-1).busqueda, false);
    await fetch(`${base}/api/permisos`, json('PUT', { busquedaWeb: true, analizarSitio: true }));
    recibido.length = 0;
    await fetch(`${base}/api/agentes/inversiones/mensajes`, json('POST', { texto: '¿Compro la camioneta?' }));
    assert.equal(recibido.at(-1).busqueda, true);

    // Orden repetida tres veces → sugerencia; crear rutina; ejecutar ahora y por reloj.
    let ultima;
    for (let i = 0; i < 3; i++) ultima = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Dame el resumen de ventas de la semana' }))).json();
    assert.ok(ultima.sugerenciaRutina, 'debió sugerir una rutina');
    assert.equal(ultima.sugerenciaRutina.veces, 4); // la primera orden (sin IA) también contó
    const lista = await (await fetch(`${base}/api/rutinas`)).json();
    assert.equal(lista.sugerencias.length, 1);
    const creada = await fetch(`${base}/api/rutinas`, json('POST', { area: 'ventas', texto: 'Dame el resumen de ventas de la semana', frecuencia: 'diaria', hora: 7, nombre: 'Resumen diario' }));
    assert.equal(creada.status, 201);
    const rutina = await creada.json();
    assert.equal((await (await fetch(`${base}/api/rutinas`)).json()).sugerencias.length, 0);
    const antes = (await (await fetch(`${base}/api/agentes/ventas/mensajes`)).json()).mensajes.length;
    const ejec = await (await fetch(`${base}/api/rutinas/${rutina.id}/ejecutar`, { method: 'POST' })).json();
    assert.equal(ejec.ok, true);
    assert.equal(ejec.rutina.ultimoResultado, 'respondida');
    const mensajes = (await (await fetch(`${base}/api/agentes/ventas/mensajes`)).json()).mensajes;
    assert.equal(mensajes.length, antes + 2);
    assert.equal(mensajes[antes].origen, 'rutina');
    assert.match(recibido.at(-1).sistema, /rutina automática/);
    // Por reloj: mañana a las 7:30 ya tocó; con el permiso apagado no corre.
    reloj = new Date(); reloj.setDate(reloj.getDate() + 2); reloj.setHours(7, 30);
    await fetch(`${base}/api/permisos`, json('PUT', { rutinas: false }));
    assert.deepEqual(await servidor.tickRutinas(reloj), []);
    await fetch(`${base}/api/permisos`, json('PUT', { rutinas: true }));
    assert.deepEqual(await servidor.tickRutinas(reloj), [rutina.id]);
    assert.deepEqual(await servidor.tickRutinas(reloj), []); // no repite
    assert.equal((await fetch(`${base}/api/rutinas/${rutina.id}`, json('PUT', { activa: false }))).status, 200);
    assert.equal((await fetch(`${base}/api/rutinas/${rutina.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/api/rutinas`, json('POST', { area: 'nadie', texto: 'x' }))).status, 422);
    // Tareas semanales apagadas: el programador anota el motivo y no corre.
    await fetch(`${base}/api/permisos`, json('PUT', { tareasAutomaticas: false }));
    await fetch(`${base}/api/investigacion/programacion`, json('PUT', { diaSemana: reloj.getDay(), hora: 7, activa: true }));
    reloj = new Date(reloj); reloj.setDate(reloj.getDate() + 7);
    await servidor.programador.tick();
    assert.match((await (await fetch(`${base}/api/investigacion`)).json()).programacion.ultimoIntento?.error || '', /desactivadas/);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
