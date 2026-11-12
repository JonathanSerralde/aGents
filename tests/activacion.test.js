// Activación del piloto y de las tareas semanales: lo que nunca se configuró a mano también debe correr cuando toca,
// contando desde que se encendió, y nada que gaste IA debe arrancar sin que el usuario lo active.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearPiloto, MAX_POR_TICK } from '../src/piloto.js';
import { crearProgramacion, crearProgramador, debeEjecutar } from '../src/programador.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

// 7 de enero de 2030 es lunes. Fechas lejanas a propósito: la prueba no depende del día en que se corre.
const LUNES_759 = new Date(2030, 0, 7, 7, 59);
const LUNES_805 = new Date(2030, 0, 7, 8, 5);

test('un agente sin configuración propia cuenta desde que se encendió el piloto y su próxima revisión no se mueve', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-act-'));
  try {
    const piloto = crearPiloto(join(dir, 'piloto.json'));
    piloto.encender(LUNES_759);
    // Dirección va los lunes a las 8 por defecto. Se lee varias veces, en momentos distintos: siempre la misma fecha.
    const a = piloto.de('direccion', {}, LUNES_805).proxima;
    const b = piloto.de('direccion', {}, new Date(2030, 0, 9, 12)).proxima;
    assert.equal(a, b);
    assert.equal(new Date(a).getTime(), new Date(2030, 0, 7, 8).getTime());
    assert.ok(piloto.vencidos(['direccion', 'ventas'], LUNES_805).some((p) => p.id === 'direccion'));
    assert.ok(!piloto.vencidos(['direccion', 'ventas'], LUNES_805).some((p) => p.id === 'ventas'), 'Ventas va los martes');
    // Tras correr, la siguiente es una semana después.
    piloto.marcarEjecutado('direccion', 'respondida', LUNES_805);
    assert.equal(new Date(piloto.de('direccion').proxima).getTime(), new Date(2030, 0, 14, 8).getTime());
    // asegurarEncendido no pisa la marca que ya existe.
    assert.equal(piloto.asegurarEncendido(new Date(2031, 0, 1)), LUNES_759.toISOString());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('las tareas semanales cuentan desde el primer arranque; la que gasta IA empieza en pausa y no se activa sola', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-act-'));
  try {
    const programacion = crearProgramacion(join(dir, 'programacion.json'), { pausadas: ['investigacion'] });
    let reloj = new Date(2030, 0, 2, 12); // miércoles
    const corridas = [];
    const programador = crearProgramador({ programacion, ahora: () => reloj, tareas: { investigacion: async () => { corridas.push('investigacion'); return {}; }, sitio: async () => { corridas.push('sitio'); return {}; } } });
    await programador.tick(); // primer arranque: nada toca todavía
    assert.deepEqual(corridas, []);
    assert.equal(programacion.leer('sitio').activadaEn, reloj.toISOString());
    assert.equal(programacion.leer('investigacion').activa, false);

    reloj = new Date(2030, 0, 7, 9, 5); // lunes 9:05: el sitio (sin IA) corre; la investigación sigue en pausa
    await programador.tick();
    await programador.tick();
    assert.deepEqual(corridas, ['sitio']);

    // Una investigación hecha a mano queda registrada pero no enciende la programación.
    programacion.marcarEjecutada('investigacion', { id: 'x' }, reloj);
    assert.equal(programacion.leer('investigacion').activa, false);

    // El usuario la activa tres semanas después: cuenta desde ese momento, sin disparar la corrida "atrasada".
    reloj = new Date(2030, 0, 29, 10); // martes
    programacion.guardar('investigacion', { activa: true, diaSemana: 1, hora: 9 }, reloj);
    assert.equal(debeEjecutar(programacion.leer('investigacion'), reloj), false);
    await programador.tick();
    assert.ok(!corridas.includes('investigacion'));
    reloj = new Date(2030, 1, 4, 9, 5); // el lunes siguiente
    await programador.tick();
    assert.ok(corridas.includes('investigacion'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('en el servidor, encender el piloto basta para que los agentes por defecto hagan su revisión cuando toca', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-act-'));
  let reloj = LUNES_759;
  const servidor = crearServidor(opcionesTemporales(dir, { proveedor: 'prueba', llamarIA: async () => 'Todo en orden.\nESTADO: entregado — revisión hecha', ahora: () => reloj }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  try {
    await fetch(`${base}/api/configuracion`, json('PUT', { usarLotes: false }));
    // Apagado (como viene de fábrica): aunque sea lunes a las 8:05, nadie corre.
    reloj = LUNES_805;
    assert.deepEqual(await servidor.tickPiloto(reloj), []);
    // El usuario lo enciende el lunes 7:59 y no configura nada más.
    reloj = LUNES_759;
    await fetch(`${base}/api/permisos`, json('PUT', { piloto: true }));
    assert.deepEqual(await servidor.tickPiloto(reloj), [], 'recién encendido, todavía no toca');
    reloj = LUNES_805;
    const primera = await servidor.tickPiloto(reloj);
    assert.equal(primera.length, MAX_POR_TICK, 'respeta el tope por minuto');
    const todas = [...primera, ...(await servidor.tickPiloto(reloj))];
    assert.ok(todas.includes('direccion') && todas.includes('finanzas') && todas.includes('orquestador'));
    assert.deepEqual(await servidor.tickPiloto(reloj), [], 'cada uno corre una sola vez');
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
