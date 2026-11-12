import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearPiloto, defectosDe, tareaDe, frecuenciaDe, sanitizarPiloto, TAREA_GENERICA, MAX_POR_TICK } from '../src/piloto.js';
import { HABILIDADES } from '../src/habilidades.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('cada área y el Orquestador tienen su tarea periódica; el resto usa la genérica y arranca apagado', () => {
  for (const id of ['direccion', 'finanzas', 'ventas', 'marketing', 'compras', 'operaciones', 'rh', 'tecnologia', 'fiscal', 'riesgos', 'crecimiento']) {
    assert.ok(HABILIDADES[id].piloto?.tarea.length > 80, id);
    assert.equal(defectosDe(id).activo, true, id);
  }
  assert.match(tareaDe('orquestador'), /DELEGAR/);
  assert.equal(frecuenciaDe('riesgos'), 'mensual');
  assert.equal(frecuenciaDe('ventas'), 'semanal');
  assert.equal(tareaDe('analista'), TAREA_GENERICA);
  assert.equal(defectosDe('analista').activo, false);
  assert.equal(defectosDe('nomina').activo, false);
  assert.match(tareaDe('nomina'), /Calendario mensual de Nómina/);
  // Las áreas se reparten de lunes a viernes para no concentrar el gasto.
  const dias = new Set(['finanzas', 'ventas', 'compras', 'rh', 'fiscal'].map((id) => defectosDe(id).diaSemana));
  assert.equal(dias.size, 5);
  assert.equal(sanitizarPiloto({ hora: 30, frecuencia: 'x', activo: 'false', tarea: ' Mi tarea ' }, defectosDe('ventas')).hora, 8);
  assert.equal(sanitizarPiloto({ activo: 'false' }, defectosDe('ventas')).activo, false);
  assert.equal(sanitizarPiloto({ tarea: ' Mi tarea ' }, defectosDe('ventas')).tarea, 'Mi tarea');
});

test('el almacén del piloto combina defectos con lo guardado y sabe a quién le toca', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pil-'));
  try {
    const p = crearPiloto(join(dir, 'piloto.json'));
    const fin = p.de('finanzas');
    assert.equal(fin.activo, true);
    assert.equal(fin.tareaEfectiva, HABILIDADES.finanzas.piloto.tarea);
    assert.ok(fin.proxima);
    assert.equal(p.de('analista').proxima, null);
    p.guardar('finanzas', { frecuencia: 'diaria', hora: 7, tarea: 'Revisa solo la caja' });
    assert.equal(p.de('finanzas').tareaEfectiva, 'Revisa solo la caja');
    const manana = new Date(); manana.setDate(manana.getDate() + 1); manana.setHours(7, 30);
    const vencidos = p.vencidos(['finanzas', 'analista', 'ventas'], manana);
    assert.ok(vencidos.some((v) => v.id === 'finanzas'));
    assert.ok(!vencidos.some((v) => v.id === 'analista'));
    p.marcarEjecutado('finanzas', 'respondida', manana);
    assert.ok(!p.vencidos(['finanzas'], manana).some((v) => v.id === 'finanzas'));
    assert.equal(p.de('finanzas').ultimoResultado, 'respondida');
    p.guardar('analista', { activo: true, frecuencia: 'semanal', diaSemana: 2, hora: 9 });
    assert.equal(p.de('analista').activo, true);
    assert.ok(p.de('analista').proxima);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('con el piloto encendido los agentes hacen su revisión solos, se coordinan y respetan el tope por minuto', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pil-srv-'));
  const recibido = [];
  let reloj = new Date(2026, 10, 9, 7, 59); // lunes 9 de noviembre de 2026
  const llamarIA = async ({ sistema, mensajes }) => {
    recibido.push({ sistema, texto: mensajes.at(-1).texto });
    if (/Esta petición viene de otro agente/.test(sistema)) return 'Dato: dos meses de caja.';
    if (/agente del área de Finanzas/.test(sistema)) return 'Caja ajustada.\nACCIONES:\n- [finanzas] Cobrar las facturas vencidas — Luis — 1 semana\nINFORMAR: [Ventas] — no ofrecer crédito esta semana';
    if (/Eres el Orquestador/.test(sistema)) return 'Resumen semanal.\nDELEGAR: [Compras] — Renegocia plazos con el proveedor principal';
    return 'Sin novedades desde la última revisión.';
  };
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA, ahora: () => reloj }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const estado0 = await (await fetch(`${base}/api/piloto`)).json();
    assert.equal(estado0.activo, false);
    assert.ok(estado0.agentes.length > 40);
    assert.equal(estado0.agentes.find((a) => a.id === 'finanzas').activo, true);
    assert.equal(estado0.agentes.find((a) => a.id === 'orquestador').frecuencia, 'semanal');
    // Todos los agentes quedan dados de alta con el reloj de la prueba (lunes 7:59), en el mismo archivo que usa
    // el servidor: así lo que "toca" no depende de la fecha real en que corre la prueba.
    const almacen = crearPiloto(join(dir, 'piloto.json'));
    for (const a of estado0.agentes) almacen.guardar(a.id, {}, {}, reloj);
    // Apagado: aunque toque, nadie corre.
    reloj = new Date(2026, 10, 9, 8, 5);
    assert.deepEqual(await servidor.tickPiloto(reloj), []);
    await fetch(`${base}/api/permisos`, json('PUT', { piloto: true }));
    await fetch(`${base}/api/configuracion`, json('PUT', { usarLotes: false })); // esta prueba cubre las corridas en directo; los lotes van en ahorro.test.js
    assert.equal((await (await fetch(`${base}/api/piloto`)).json()).activo, true);
    // El usuario enciende también al Analista para los lunes.
    await fetch(`${base}/api/piloto/analista`, json('PUT', { activo: true, frecuencia: 'semanal', diaSemana: 1, hora: 8 }));
    // Lunes 8:05: toca Dirección, Finanzas, Orquestador y Analista (4; Crecimiento y Riesgos son mensuales), pero máximo 3 por tick.
    const primera = await servidor.tickPiloto(reloj);
    assert.equal(primera.length, MAX_POR_TICK);
    const segunda = await servidor.tickPiloto(reloj);
    assert.equal(segunda.length, 1);
    assert.deepEqual(await servidor.tickPiloto(reloj), []); // ya nadie pendiente
    const corridos = [...primera, ...segunda].sort();
    assert.deepEqual(corridos, ['analista', 'direccion', 'finanzas', 'orquestador']);
    // Finanzas dejó acción y nota a Ventas; el Orquestador encargó a Compras sin que nadie lo pidiera.
    const fin = (await (await fetch(`${base}/api/agentes/finanzas/mensajes`)).json()).mensajes;
    assert.equal(fin[0].origen, 'piloto');
    assert.match(recibido.find((r) => /agente del área de Finanzas/.test(r.sistema)).sistema, /revisión periódica automática/);
    const mem = await (await fetch(`${base}/api/memoria`)).json();
    assert.ok(mem.acciones.some((a) => a.area === 'finanzas' && /facturas vencidas/.test(a.texto)));
    assert.ok(mem.notas.some((n) => n.destino === 'ventas' && n.origen === 'finanzas'));
    const compras = (await (await fetch(`${base}/api/agentes/compras/mensajes`)).json()).mensajes;
    assert.match(compras[0].texto, /Encargo del Orquestador: Renegocia plazos/);
    const estado1 = await (await fetch(`${base}/api/piloto`)).json();
    assert.match(estado1.agentes.find((a) => a.id === 'finanzas').ultimoResultado, /respondida/);
    const act = await (await fetch(`${base}/api/actividad`)).json();
    assert.equal(act.eventos.filter((e) => e.tipo === 'piloto_ejecutado').length, 4);
    // Martes 8:05: tocan Ventas y Marketing; configurar y ejecutar a mano también funciona.
    reloj = new Date(2026, 10, 10, 8, 5);
    assert.deepEqual((await servidor.tickPiloto(reloj)).sort(), ['marketing', 'ventas']);
    assert.equal((await (await fetch(`${base}/api/piloto/rh`, json('PUT', { activo: false }))).json()).activo, false);
    const manual = await (await fetch(`${base}/api/piloto/analista/ejecutar`, { method: 'POST' })).json();
    assert.equal(manual.ok, true);
    assert.match(manual.piloto.ultimoResultado, /respondida/);
    assert.equal((await fetch(`${base}/api/piloto/nadie`, json('PUT', {}))).status, 404);
    // Sin IA, el tick no gasta ni deja pendientes en cadena.
    await fetch(`${base}/api/permisos`, json('PUT', { ia: false }));
    reloj = new Date(2026, 10, 11, 8, 5);
    assert.deepEqual(await servidor.tickPiloto(reloj), []);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
