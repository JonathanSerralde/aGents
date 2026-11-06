import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clasificarTexto, extraerHechosDeTexto, instruccionPorTipo } from '../src/clasificador.js';
import { crearMemoria, extraerSeccion, extraerHechos, extraerIdeas, extraerConceptos, extraerAcciones } from '../src/memoria.js';
import { sistemaPara } from '../src/prompts.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('el clasificador distingue hechos de la empresa, ideas, conceptos y órdenes', () => {
  assert.equal(clasificarTexto('Tenemos 12 empleados y vendemos $2 millones al año').tipo, 'hecho');
  assert.equal(clasificarTexto('El mes pasado perdimos a nuestro cliente principal').tipo, 'hecho');
  assert.equal(clasificarTexto('Quiero abrir una segunda sucursal en Zapopan').tipo, 'idea');
  assert.equal(clasificarTexto('¿Y si bajamos los precios 10% para vender más?').tipo, 'idea');
  assert.equal(clasificarTexto('Se me ocurre meter venta por WhatsApp').tipo, 'idea');
  assert.equal(clasificarTexto('¿Qué es el punto de equilibrio?').tipo, 'concepto');
  assert.equal(clasificarTexto('Explícame la diferencia entre margen bruto y neto').tipo, 'concepto');
  assert.equal(clasificarTexto('¿Cómo se lleva un flujo de caja?').tipo, 'concepto');
  assert.equal(clasificarTexto('Prepara la oferta de la semana').tipo, 'orden');
  assert.equal(clasificarTexto('Dame tres pasos para cobrar más rápido').tipo, 'orden');
  assert.equal(clasificarTexto('hola').tipo, 'orden');
  // Una idea que trae datos sigue siendo idea, pero se reconoce que contiene hechos.
  const mixto = clasificarTexto('Tenemos 2 sucursales y quiero abrir otra en el centro');
  assert.equal(mixto.tipo, 'idea');
  assert.equal(mixto.contieneHecho, true);
  assert.ok(mixto.confianza > 0 && mixto.confianza <= 1);
  assert.deepEqual(extraerHechosDeTexto('Tenemos 2 sucursales. Quiero abrir otra en el centro. Vendemos 60% a crédito.'), ['Tenemos 2 sucursales.', 'Vendemos 60% a crédito.']);
  assert.deepEqual(extraerHechosDeTexto('¿Qué es el margen?'), []);
  assert.match(instruccionPorTipo('idea'), /NO un hecho ni una decisión/);
  assert.match(instruccionPorTipo('concepto'), /CONCEPTOS:/);
  assert.match(instruccionPorTipo('hecho'), /HECHOS:/);
  assert.match(instruccionPorTipo('orden'), /qué es hecho/);
});

test('la memoria separa hechos, ideas y conceptos de las respuestas y no los mezcla con acciones', () => {
  const respuesta = [
    'Entendí que quieres abrir otra sucursal.',
    'HECHOS:',
    '- La empresa tiene 2 sucursales — fuente: lo dijo el usuario',
    '- Vende 60% a crédito — fuente: ficha',
    'IDEAS:',
    '- Abrir sucursal en el centro — veredicto: esperar',
    'CONCEPTOS:',
    '- Punto de equilibrio: venta mínima que cubre todos los costos',
    'ACCIONES:',
    '- [finanzas] Calcular el punto de equilibrio de la sucursal actual — Luis — 2 semanas',
    'CONSULTAR: [Operaciones] — ¿capacidad?',
  ].join('\n');
  assert.deepEqual(extraerHechos(respuesta), [{ texto: 'La empresa tiene 2 sucursales', fuente: 'lo dijo el usuario' }, { texto: 'Vende 60% a crédito', fuente: 'ficha' }]);
  assert.deepEqual(extraerIdeas(respuesta), [{ texto: 'Abrir sucursal en el centro', veredicto: 'esperar' }]);
  assert.deepEqual(extraerConceptos(respuesta), [{ termino: 'Punto de equilibrio', texto: 'venta mínima que cubre todos los costos' }]);
  assert.equal(extraerAcciones(respuesta).length, 1);
  assert.deepEqual(extraerSeccion('sin secciones', 'HECHOS'), []);

  const dir = mkdtempSync(join(tmpdir(), 'mem-tipos-'));
  try {
    const memoria = crearMemoria(join(dir, 'memoria.json'));
    const r = memoria.registrarRespuesta('ventas', respuesta);
    assert.equal(r.hechos, 2);
    assert.equal(r.ideas, 1);
    assert.equal(r.conceptos, 1);
    assert.equal(r.nuevas, 1);
    assert.equal(memoria.registrarRespuesta('ventas', respuesta).hechos, 0); // sin repetir
    assert.equal(memoria.agregarHechos('direccion', ['Tenemos 12 empleados', 'la empresa tiene 2 sucursales'], 'usuario'), 1);
    assert.equal(memoria.hechos().length, 3);
    assert.equal(memoria.hechos()[0].fuente, 'usuario');
    const prompt = memoria.resumenParaPrompt('marketing');
    assert.match(prompt, /HECHOS registrados de la empresa/);
    assert.match(prompt, /Vende 60% a crédito \[ficha\]/);
    assert.match(prompt, /IDEAS en evaluación \(NO son hechos/);
    const idea = memoria.ideas()[0];
    assert.equal(memoria.marcarIdea(idea.id, 'aprobada').estado, 'aprobada');
    assert.match(memoria.resumenParaPrompt('marketing'), /Ideas APROBADAS por el dueño/);
    assert.doesNotMatch(memoria.resumenParaPrompt('marketing'), /IDEAS en evaluación/);
    assert.equal(memoria.marcarIdea('zzzzzzzz', 'aprobada'), null);
    const hecho = memoria.hechos()[0];
    assert.equal(memoria.borrarHecho(hecho.id), true);
    assert.equal(memoria.borrarHecho(hecho.id), false);
    assert.equal(memoria.hechos().length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('las reglas comunes obligan a distinguir hecho, idea y concepto', () => {
  const s = sistemaPara('ventas', null, null, null);
  assert.match(s, /HECHO = información de la empresa con fuente/);
  assert.match(s, /IDEA = propuesta o supuesto no confirmado/);
  assert.match(s, /CONCEPTO = conocimiento general/);
});

test('el servidor clasifica cada orden, guarda los hechos del usuario y ajusta la instrucción al agente', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'clas-srv-'));
  const recibido = [];
  const llamarIA = async ({ sistema, mensajes, busqueda }) => {
    recibido.push(sistema);
    if (busqueda) return { texto: 'Investigué tasas.\nHECHOS:\n- Tasa de referencia 9% — fuente: Banxico', busquedas: [{ consulta: 'tasa CETES hoy', fuentes: [{ titulo: 'Banxico', url: 'https://www.banxico.org.mx' }] }] };
    if (/Esta petición viene de otro agente/.test(sistema)) return 'OK';
    if (/es una idea o propuesta por validar/.test(sistema)) return 'Evalúo la idea.\nIDEAS:\n- Abrir sucursal en el centro — veredicto: esperar';
    if (/pregunta sobre un concepto general/.test(sistema)) return 'El margen bruto es...\nCONCEPTOS:\n- Margen bruto: venta menos costo directo';
    return 'Anotado.\nHECHOS:\n- Vende 60% a crédito — fuente: lo dijo el usuario';
  };
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const idea = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Tenemos 2 sucursales y quiero abrir otra en el centro' }))).json();
    assert.equal(idea.clasificacion.tipo, 'idea');
    assert.match(recibido.at(-1), /El mensaje actual del usuario es una idea o propuesta por validar/);
    assert.equal(idea.memoria.ideas, 1);
    assert.equal(idea.mensajes[0].tipo, 'idea');
    let mem = await (await fetch(`${base}/api/memoria`)).json();
    assert.equal(mem.hechos.length, 1); // "Tenemos 2 sucursales" guardado con fuente usuario
    assert.equal(mem.hechos[0].fuente, 'usuario');
    assert.equal(mem.ideas.length, 1);

    const concepto = await (await fetch(`${base}/api/agentes/finanzas/mensajes`, json('POST', { texto: '¿Qué es el margen bruto?' }))).json();
    assert.equal(concepto.clasificacion.tipo, 'concepto');
    assert.equal(concepto.memoria.conceptos, 1);

    const hecho = await (await fetch(`${base}/api/agentes/finanzas/mensajes`, json('POST', { texto: 'Vendemos 60% a crédito a 30 días' }))).json();
    assert.equal(hecho.clasificacion.tipo, 'hecho');
    // A partir de ahora los demás agentes reciben los hechos y la idea en su contexto.
    recibido.length = 0;
    await fetch(`${base}/api/agentes/marketing/mensajes`, json('POST', { texto: 'Prepara la campaña' }));
    assert.match(recibido.at(-1), /HECHOS registrados de la empresa/);
    assert.match(recibido.at(-1), /Tenemos 2 sucursales/);
    assert.match(recibido.at(-1), /IDEAS en evaluación/);
    assert.match(recibido.at(-1), /es una orden de trabajo/);

    mem = await (await fetch(`${base}/api/memoria`)).json();
    assert.ok(mem.hechos.length >= 2 && mem.conceptos.length === 1);
    const ideaId = mem.ideas[0].id;
    assert.equal((await (await fetch(`${base}/api/memoria/ideas/${ideaId}`, json('PUT', { estado: 'aprobada' }))).json()).estado, 'aprobada');
    assert.equal((await fetch(`${base}/api/memoria/hechos`, json('POST', { texto: 'Somos 12 personas', area: 'rh' }))).status, 201);
    assert.equal((await fetch(`${base}/api/memoria/hechos`, json('POST', { texto: '' }))).status, 422);
    mem = await (await fetch(`${base}/api/memoria`)).json();
    const manual = mem.hechos.find((h) => h.texto === 'Somos 12 personas');
    assert.equal(manual.area, 'rh');
    assert.equal(manual.fuente, 'dueño');
    assert.equal((await fetch(`${base}/api/memoria/hechos/${manual.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/api/memoria/hechos/${manual.id}`, { method: 'DELETE' })).status, 404);
    // El gestor de proyectos ve la bitácora completa; Inversiones investiga con búsqueda web dentro del chat.
    recibido.length = 0;
    await fetch(`${base}/api/agentes/proyectos/mensajes`, json('POST', { texto: 'Planea el sprint' }));
    assert.match(recibido.at(-1), /acciones abiertas por área|Últimas conclusiones/);
    const buscadas = [];
    servidor.emit('x'); // sin efecto; solo para mantener el servidor referenciado
    const inv = await (await fetch(`${base}/api/agentes/inversiones/mensajes`, json('POST', { texto: '¿Me conviene comprar una camioneta de $400,000 a crédito?' }))).json();
    assert.match(recibido.at(-1), /Tienes búsqueda web activa/);
    assert.deepEqual(inv.busquedas.map((b) => b.consulta), ['tasa CETES hoy']); // el usuario ve qué buscó
    void buscadas;
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

import { esPreguntaDeEstado } from '../src/clasificador.js';
test('reconoce cuando el usuario pregunta qué están haciendo los agentes (se contesta con reglas)', () => {
  for (const t of ['¿Qué está haciendo cada agente?', 'Dame un resumen de los demás agentes que están haciendo', 'qué hacen mis agentes', '¿Quién está trabajando ahora?', 'estado actual de los agentes', 'en qué andan los demás departamentos', '¿Cómo van los agentes?']) {
    assert.ok(esPreguntaDeEstado(t), t);
  }
  for (const t of ['Resume cómo va el negocio', '¿Qué atiendo primero en tu área?', 'Analiza por qué Finanzas está bloqueado', 'Explícame qué es un flujo de caja', 'Haz un plan de ventas']) {
    assert.ok(!esPreguntaDeEstado(t), t);
  }
});
