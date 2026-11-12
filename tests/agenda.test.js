// Agenda de citas y clientes: módulo opcional. Los datos de las personas no salen hacia la IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearAgenda, recordatorio } from '../src/agenda.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const temporal = () => mkdtempSync(join(tmpdir(), 'agents-agenda-'));
const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('la agenda guarda personas y citas, evita encimes y calcula sus cifras', () => {
  const dir = temporal();
  try {
    const a = crearAgenda(join(dir, 'agenda.json'));
    assert.equal(a.leer().activa, false, 'apagada de fábrica');
    assert.equal(a.paraPrompt(), '');
    a.configurar({ activa: true, etiqueta: 'pacientes' });
    assert.deepEqual(a.configurar({ etiqueta: 'inventada' }), { activa: true, etiqueta: 'pacientes' });

    const ana = a.guardarCliente({ nombre: 'Ana Prueba', telefono: '55 0000 0001' });
    assert.equal(ana.telefono, '5500000001');
    assert.equal(a.guardarCliente({ nombre: 'ana prueba' }).id, ana.id, 'no duplica a la misma persona');
    const luis = a.guardarCliente({ nombre: 'Luis Ejemplo' });
    assert.throws(() => a.guardarCliente({ nombre: 'A' }), /nombre/);

    const hoy = new Date(2026, 4, 20, 9);
    const cita = a.agregarCita({ clienteId: ana.id, fecha: '2026-05-20', hora: '10:00', duracion: 60, atiende: 'Dra. Uno', servicio: 'Consulta', precio: 600 });
    assert.throws(() => a.agregarCita({ clienteId: luis.id, fecha: '2026-05-20', hora: '10:30', atiende: 'dra. uno' }), /se encima/);
    assert.ok(a.agregarCita({ clienteId: luis.id, fecha: '2026-05-20', hora: '10:30', atiende: 'Dr. Dos' }), 'con otra persona que atiende no choca');
    assert.ok(a.agregarCita({ clienteId: luis.id, fecha: '2026-05-20', hora: '11:00', atiende: 'Dra. Uno' }), 'justo al terminar la anterior sí cabe');
    assert.throws(() => a.agregarCita({ clienteId: 'no-existe', fecha: '2026-05-20', hora: '12:00' }), /a quién/);
    assert.throws(() => a.agregarCita({ clienteId: ana.id, fecha: '20/05/2026', hora: '12:00' }), /fecha/);
    assert.throws(() => a.agregarCita({ clienteId: ana.id, fecha: '2026-05-21', hora: '25:00' }), /hora/);

    // Días anteriores: dos asistieron (una sin pagar), una faltó y una canceló.
    const pasada = (cliente, fecha, estado, pagado) => a.cambiarCita(a.agregarCita({ clienteId: cliente, fecha, hora: '09:00', precio: 500 }).id, { estado, pagado });
    pasada(ana.id, '2026-05-11', 'asistio', true);
    pasada(ana.id, '2026-05-12', 'asistio', false);
    pasada(luis.id, '2026-05-13', 'no_asistio', false);
    pasada(luis.id, '2026-05-14', 'cancelada', false);
    assert.throws(() => a.cambiarCita(cita.id, { estado: 'inventado' }), /estado/);
    assert.equal(a.cambiarCita('0000000000', { estado: 'asistio' }), null);

    const i = a.indicadores(hoy);
    assert.deepEqual([i.citas, i.asistieron, i.noAsistieron, i.canceladas, i.noAsistieronPct], [4, 2, 1, 1, 33]);
    assert.deepEqual([i.cobrado, i.porCobrar, i.ingresoPorVisita, i.hoy, i.proximas7], [500, 500, 250, 3, 3]);
    assert.equal(i.vuelven, 100, 'la única persona que vino lo hizo dos veces');
    assert.equal(a.clientesConResumen(hoy).find((c) => c.id === ana.id).debe, 500);

    // A los agentes solo les llegan cifras: ningún nombre ni teléfono.
    const prompt = a.paraPrompt(hoy);
    assert.match(prompt, /2 pacientes registrados/);
    assert.match(prompt, /1 no se presentaron \(33%\)/);
    assert.doesNotMatch(prompt, /Ana|Luis|5500000001|Dra\./);

    assert.match(recordatorio({ nombre: 'Ana Prueba', fecha: '2026-05-20', hora: '10:00', servicio: 'Consulta' }, 'Consultorio Demo'), /^Hola, Ana\. Te recordamos tu cita de Consulta el miércoles, 20 de mayo a las 10:00 en Consultorio Demo/);

    // Borrar a una persona se lleva sus citas.
    assert.equal(a.borrarCliente(luis.id), true);
    assert.equal(a.leer().citas.some((c) => c.clienteId === luis.id), false);
    assert.equal(a.borrarCliente(luis.id), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('en el servidor la agenda es opcional y los datos de las personas no viajan a la IA', async () => {
  const dir = temporal();
  let sistema = '';
  const ahora = () => new Date(2026, 4, 20, 9);
  const servidor = crearServidor(opcionesTemporales(dir, { ahora, llamarIA: async (p) => { sistema = p.sistema; return 'Listo.\nESTADO: entregado — listo'; } }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const pedir = async (ruta, metodo = 'GET', cuerpo) => { const res = await fetch(base + ruta, metodo === 'GET' ? undefined : json(metodo, cuerpo || {})); return { status: res.status, cuerpo: await res.json() }; };
  try {
    // Apagada: no acepta citas y no añade nada al contexto.
    assert.equal((await pedir('/api/agenda')).cuerpo.activa, false);
    assert.equal((await pedir('/api/agenda/citas', 'POST', { nombre: 'Ana Prueba', fecha: '2026-05-20', hora: '10:00' })).status, 409);

    const activa = await pedir('/api/agenda/config', 'PUT', { activa: true, etiqueta: 'pacientes' });
    assert.deepEqual([activa.cuerpo.activa, activa.cuerpo.etiqueta, activa.cuerpo.citas.length], [true, 'pacientes', 0]);

    // Alta de persona y cita en un paso; un horario encimado se rechaza y se puede forzar.
    const primera = await pedir('/api/agenda/citas', 'POST', { nombre: 'Ana Prueba', telefono: '5500000001', fecha: '2026-05-20', hora: '10:00', duracion: 45, servicio: 'Consulta', precio: 600 });
    assert.equal(primera.status, 201);
    assert.equal(primera.cuerpo.citas[0].nombre, 'Ana Prueba');
    assert.match(primera.cuerpo.citas[0].recordatorio, /Hola, Ana/);
    assert.equal((await pedir('/api/agenda/citas', 'POST', { nombre: 'Luis Ejemplo', fecha: '2026-05-20', hora: '10:15' })).status, 422);
    assert.equal((await pedir('/api/agenda/citas', 'POST', { nombre: 'Luis Ejemplo', fecha: '2026-05-20', hora: '10:15', forzar: true })).status, 201);

    const id = primera.cuerpo.cita.id;
    const asistio = await pedir(`/api/agenda/citas/${id}`, 'PUT', { estado: 'asistio', pagado: true });
    assert.deepEqual([asistio.cuerpo.cita.estado, asistio.cuerpo.indicadores.cobrado], ['asistio', 600]);
    assert.equal((await pedir('/api/agenda/citas/0000000000', 'PUT', { estado: 'asistio' })).status, 404);

    // Otra semana no trae las citas de esta.
    assert.equal((await pedir('/api/agenda?desde=2026-06-01&dias=7')).cuerpo.citas.length, 0);

    // Una orden a un agente lleva las cifras, nunca el nombre ni el teléfono.
    await pedir('/api/agentes/operaciones/mensajes', 'POST', { texto: '¿Cómo bajo las citas que no se presentan?' });
    assert.match(sistema, /Agenda de citas del negocio \(HECHO; cifras agregadas, sin datos personales\): 2 pacientes registrados/);
    assert.doesNotMatch(sistema, /Ana Prueba|Luis Ejemplo|5500000001/);

    // Borrar a la persona elimina sus citas; apagar la agenda la saca del contexto sin borrar nada.
    const personas = (await pedir('/api/agenda')).cuerpo.clientes;
    const ana = personas.find((c) => c.nombre === 'Ana Prueba');
    assert.equal(ana.visitas, 1);
    assert.equal((await pedir(`/api/agenda/clientes/${ana.id}`, 'DELETE')).cuerpo.citas.some((c) => c.nombre === 'Ana Prueba'), false);
    await pedir('/api/agenda/config', 'PUT', { activa: false });
    await pedir('/api/agentes/operaciones/mensajes', 'POST', { texto: 'Otra pregunta' });
    assert.doesNotMatch(sistema, /Agenda de citas del negocio/);
    assert.equal((await pedir('/api/agenda/config', 'PUT', { activa: true })).cuerpo.clientes.length, 1, 'al encender de nuevo, los datos siguen ahí');
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
