// Archivo de memoria: todo se guarda tipado, pero al agente solo le llega lo fijado, lo relacionado con la orden
// y lo más reciente. El contexto no crece con los meses y lo importante no se pierde por viejo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearArchivo, historialParaIA, palabrasDe, MAX_FIJOS } from '../src/archivo.js';
import { crearMemoria } from '../src/memoria.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const temporal = () => mkdtempSync(join(tmpdir(), 'agents-archivo-'));
const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('la búsqueda encuentra por palabra, por plural y por sinónimo de negocio', () => {
  const dir = temporal();
  try {
    const a = crearArchivo(join(dir, 'archivo.json'));
    assert.deepEqual(palabrasDe('Los proveedores de la empresa'), ['proveedor']);
    const credito = a.agregar({ tipo: 'hecho', area: 'ventas', texto: 'No damos crédito a clientes nuevos', fuente: 'dueño' });
    a.agregar({ tipo: 'hecho', area: 'compras', texto: 'El proveedor principal entrega los martes', fuente: 'dueño' });
    a.agregar({ tipo: 'concepto', texto: 'Capital de trabajo: dinero para operar el día a día' });
    assert.equal(a.agregar({ tipo: 'hecho', texto: 'no damos crédito a clientes nuevos' }).id, credito.id, 'no se duplica');
    assert.equal(a.agregar({ tipo: 'inventado', texto: 'algo' }), null);

    assert.equal(a.buscar('¿puedo ofrecer ventas a plazos?')[0].id, credito.id, 'plazos y crédito son sinónimos');
    assert.match(a.buscar('qué día llegan los proveedores')[0].texto, /martes/);
    assert.deepEqual(a.buscar('vacaciones del personal'), []);
    assert.deepEqual(a.buscar(''), []);

    // El área de la orden desempata a favor de lo propio.
    a.agregar({ tipo: 'hecho', area: 'finanzas', texto: 'El crédito del banco vence en marzo' });
    assert.equal(a.buscar('crédito', { area: 'finanzas' })[0].area, 'finanzas');
    assert.equal(a.buscar('crédito', { area: 'ventas' })[0].area, 'ventas');

    assert.equal(a.olvidar('hecho', 'No damos crédito a clientes nuevos'), 1);
    assert.equal(a.listar().total, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('después de cientos de entradas, el contexto sigue corto y un hecho viejo e importante sigue apareciendo', () => {
  const dir = temporal();
  try {
    const a = crearArchivo(join(dir, 'archivo.json'));
    a.agregar({ tipo: 'decision', area: 'ventas', texto: 'No vendemos a crédito a nadie sin contrato firmado', fuente: 'dueño', momento: '2026-01-10T12:00:00.000Z' });
    const fijo = a.agregar({ tipo: 'hecho', area: 'direccion', texto: 'El local se renta y el contrato termina en 2028', fuente: 'dueño', momento: '2026-01-11T12:00:00.000Z' });
    for (let i = 0; i < 400; i++) a.agregar({ tipo: i % 3 ? 'hecho' : 'acuerdo', area: 'operaciones', texto: `Revisión número ${i} del inventario de la bodega norte, sin novedades que reportar`, momento: new Date(Date.UTC(2026, 1, 1) + i * 86400000).toISOString() });
    a.cambiar(fijo.id, { fijo: true });

    const relacionado = a.paraPrompt({ consulta: '¿Le doy plazo de pago a este cliente nuevo?', area: 'ventas' });
    assert.match(relacionado, /HECHOS registrados de la empresa/);
    assert.match(relacionado, /Siempre presentes, fijados por el dueño: El local se renta/);
    assert.match(relacionado, /relacionados con esta orden: No vendemos a crédito a nadie sin contrato firmado/);
    assert.match(relacionado, /Lo más reciente: Revisión número 39\d/);
    assert.match(relacionado, /El archivo guarda 39\d entradas más/);
    assert.ok(relacionado.length <= 2200, `el bloque mide ${relacionado.length}`);

    // Una orden que no tiene que ver no arrastra la decisión de crédito, pero lo fijado va siempre.
    const ajeno = a.paraPrompt({ consulta: 'Escribe un saludo para el equipo', area: 'rh' });
    assert.doesNotMatch(ajeno, /No vendemos a crédito/);
    assert.match(ajeno, /El local se renta/);
    assert.ok(ajeno.length <= 2200);
    assert.equal(crearArchivo(join(dir, 'vacio.json')).paraPrompt({ consulta: 'algo' }), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('solo se pueden fijar unas cuantas entradas, y la memoria alimenta el archivo', () => {
  const dir = temporal();
  try {
    const a = crearArchivo(join(dir, 'archivo.json'));
    const ids = [];
    for (let i = 0; i <= MAX_FIJOS; i++) ids.push(a.agregar({ tipo: 'hecho', texto: `Dato permanente número ${i}` }).id);
    for (const id of ids.slice(0, MAX_FIJOS)) assert.equal(a.cambiar(id, { fijo: true }).fijo, true);
    assert.throws(() => a.cambiar(ids[MAX_FIJOS], { fijo: true }), /Solo se pueden fijar/);
    assert.equal(a.cambiar(ids[0], { fijo: false }).fijo, undefined);
    assert.equal(a.cambiar('0000000000', { fijo: true }), null);
    assert.equal(a.listar().fijas, MAX_FIJOS - 1);

    // Lo que la memoria registra, marca o borra se refleja en el archivo.
    const b = crearArchivo(join(dir, 'b.json'));
    const memoria = crearMemoria(join(dir, 'memoria.json'), { archivar: (e) => b.agregar(e), olvidar: (t, x) => b.olvidar(t, x) });
    memoria.agregarHechos('ventas', ['Vendemos sobre todo a constructoras'], 'dueño');
    memoria.registrarRespuesta('ventas', 'Propongo llamar a los diez clientes principales.\nACCIONES:\n- [Ventas] Llamar a los diez clientes principales — Rosa — 7 días\nESTADO: entregado — plan de llamadas');
    const accion = memoria.acciones({ estado: 'pendiente' })[0];
    memoria.marcar(accion.id, 'hecha');
    memoria.marcar(accion.id, 'hecha'); // marcarla dos veces no la archiva dos veces
    const tipos = b.listar().porTipo;
    assert.equal(tipos.hecho, 1);
    assert.equal(tipos.accion, 1);
    assert.ok(tipos.acuerdo >= 1, 'la conclusión del agente queda como acuerdo');
    memoria.borrarHecho(memoria.hechos()[0].id);
    assert.equal(b.listar().porTipo.hecho, 0, 'un hecho borrado en la bitácora no reaparece desde el archivo');

    // Primera vez: lo que ya había en la memoria entra al archivo sin duplicarse.
    const c = crearArchivo(join(dir, 'c.json'));
    const datos = { hechos: [{ area: 'finanzas', texto: 'Hay dos meses de caja', fuente: 'dueño', momento: '2026-03-01T00:00:00.000Z' }], ideas: [{ area: 'ventas', texto: 'Abrir los domingos', estado: 'aprobada' }], conceptos: [{ termino: 'Margen', texto: 'utilidad sobre venta' }], conclusiones: { ventas: { texto: 'Conviene subir precios 5%', momento: '2026-03-02T00:00:00.000Z' } }, acciones: [{ area: 'rh', texto: 'Contratar ayudante', estado: 'hecha' }, { area: 'rh', texto: 'Sigue abierta', estado: 'pendiente' }] };
    assert.equal(c.importar(datos), 5);
    assert.equal(c.importar(datos), 0);
    assert.match(c.listar({ tipo: 'decision' }).entradas[0].texto, /Idea aprobada: Abrir los domingos/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el historial que se reenvía recorta los mensajes viejos y deja completos los últimos', () => {
  const largo = 'x'.repeat(3000);
  const mensajes = [{ rol: 'agente', texto: largo }, { rol: 'usuario', texto: 'corto' }, { rol: 'agente', texto: largo }, { rol: 'usuario', texto: 'a' }, { rol: 'agente', texto: largo }, { rol: 'usuario', texto: 'b' }];
  const r = historialParaIA(mensajes);
  assert.match(r[0].texto, /mensaje anterior recortado\)$/);
  assert.ok(r[0].texto.length < 560);
  assert.equal(r[1].texto, 'corto');
  assert.equal(r[2].texto, largo, 'los cuatro últimos van completos');
  assert.equal(r[4].texto, largo);
  assert.equal(mensajes[0].texto, largo, 'no modifica la conversación guardada');
});

test('en el servidor, cada orden trae del archivo solo lo relacionado y el dueño puede fijar y borrar', async () => {
  const dir = temporal();
  const vistos = [];
  const llamarIA = async ({ sistema, mensajes }) => { vistos.push({ sistema, mensajes }); return `${'Respuesta larga. '.repeat(200)}\nESTADO: entregado — listo`; };
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const ordenar = async (area, texto) => (await fetch(`${base}/api/agentes/${area}/mensajes`, json('POST', { texto }))).json();
  try {
    await fetch(`${base}/api/memoria/hechos`, json('POST', { area: 'ventas', texto: 'No vendemos a crédito sin contrato firmado' }));
    for (let i = 0; i < 20; i++) await fetch(`${base}/api/memoria/hechos`, json('POST', { area: 'operaciones', texto: `La bodega se revisó el día ${i + 1} sin novedades` }));

    // Ya no está entre los hechos más nuevos, pero una orden sobre el tema lo trae del archivo.
    await ordenar('ventas', '¿Le doy plazo de pago a la constructora?');
    assert.match(vistos.at(-1).sistema, /relacionados con esta orden: No vendemos a crédito sin contrato firmado/);
    await ordenar('rh', 'Escribe un saludo para el equipo');
    assert.doesNotMatch(vistos.at(-1).sistema, /No vendemos a crédito/);
    assert.match(vistos.at(-1).sistema, /Lo más reciente: La bodega se revisó el día 20/);

    // El dueño lo fija desde el buscador: desde entonces viaja siempre.
    const hallado = await (await fetch(`${base}/api/archivo?q=${encodeURIComponent('crédito a plazos')}`)).json();
    assert.equal(hallado.entradas[0].texto, 'No vendemos a crédito sin contrato firmado');
    assert.equal(hallado.entradas[0].nombreArea, 'Ventas');
    assert.ok(hallado.total >= 21);
    const id = hallado.entradas[0].id;
    assert.equal((await (await fetch(`${base}/api/archivo/${id}`, json('PUT', { fijo: true }))).json()).entrada.fijo, true);
    await ordenar('rh', 'Otro saludo');
    assert.match(vistos.at(-1).sistema, /Siempre presentes, fijados por el dueño: No vendemos a crédito/);

    // El historial viejo viaja recortado: la primera respuesta larga de RH ya no va completa.
    await ordenar('rh', 'Tercera orden');
    await ordenar('rh', 'Cuarta orden');
    const enviados = vistos.at(-1).mensajes;
    assert.ok(enviados.some((m) => /mensaje anterior recortado\)$/.test(m.texto)), 'hay mensajes viejos recortados');
    assert.ok(enviados.at(-2).texto.length > 3000, 'la respuesta más reciente va completa');

    // Cuánto pesa cada agente.
    const contexto = await (await fetch(`${base}/api/contexto`)).json();
    assert.ok(contexto.agentes.length > 12);
    assert.ok(contexto.agentes.every((a) => a.tokens > 0 && a.nombre));
    assert.ok(contexto.agentes[0].tokens >= contexto.agentes.at(-1).tokens, 'del más pesado al más ligero');

    assert.equal((await fetch(`${base}/api/archivo/${id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/api/archivo/${id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await fetch(`${base}/api/archivo/${id}`, json('PUT', { fijo: true }))).status, 404);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
