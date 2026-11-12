// Entrada única con ruteo por reglas, búsqueda en los documentos del negocio y herramientas locales para los agentes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rutear } from '../src/ruteo.js';
import { HABILIDADES } from '../src/habilidades.js';
import { NOMBRES_DISTRITOS } from '../src/diagnostico.js';
import { NOMBRES_APOYO } from '../src/apoyo.js';
import { AGENTES_OPCIONALES } from '../src/sectores.js';
import { buscarEnDocumentos } from '../src/documentos.js';
import { crearHerramientas, DEFINICIONES } from '../src/herramientas.js';
import { conversarConHerramientas } from '../src/agentes.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const JEFE = { credito: 'finanzas', contabilidad: 'finanzas', nomina: 'rh', reclutamiento: 'rh', inventarios: 'operaciones', trafico: 'marketing', atencion: 'ventas', ciberseguridad: 'tecnologia', juridico: 'fiscal' };
const candidatos = [...Object.keys(NOMBRES_DISTRITOS), ...Object.keys(NOMBRES_APOYO).filter((id) => !AGENTES_OPCIONALES[id])]
  .map((id) => ({ id, nombre: NOMBRES_DISTRITOS[id] || NOMBRES_APOYO[id], habilidad: HABILIDADES[id], jefe: JEFE[id] || '' }));

test('la orden llega al agente correcto con reglas, y lo que cruza áreas o no se parece a nada va al Coordinador', () => {
  const a = (texto) => rutear(texto, candidatos).agente;
  assert.equal(a('Necesito calcular el finiquito de un empleado que renunció'), 'rh');
  assert.equal(a('¿Cuánto efectivo voy a tener el próximo mes? Quiero mi flujo de caja'), 'finanzas');
  // Cuando el tema es muy propio de un especialista y su área casi no lo toca, va directo al especialista.
  assert.equal(a('Quiero poner anuncios pagados en Facebook e Instagram'), 'trafico');
  assert.equal(a('Se me agota la mercancía y no sé cuánto inventario tengo'), 'inventarios');
  assert.equal(a('Tengo que presentar mi declaración mensual ante el SAT'), 'fiscal');
  assert.equal(a('Hola, buenos días'), 'orquestador');
  assert.equal(a('¿Qué atiendo primero esta semana?'), 'orquestador', 'las prioridades son del Coordinador');
  assert.equal(a('Los clientes a crédito no pagan su cartera vencida'), 'credito');
  assert.equal(a(''), 'orquestador');

  const laboral = rutear('Necesito calcular el finiquito de un empleado que renunció', candidatos);
  assert.match(laboral.motivo, /es tema de Recursos humanos/);
  assert.ok(laboral.alternativas.length >= 1 && laboral.alternativas.every((x) => x.id && x.nombre));
  // Si el área también tiene que ver, la orden va al área y ella se apoya en su especialista.
  const quejas = rutear('Mis clientes se quejan del servicio', candidatos);
  assert.equal(quejas.agente, 'ventas');
  assert.match(quejas.motivo, /Se apoyará en Atención a clientes/);
});

test('la búsqueda en documentos devuelve los fragmentos relacionados con su fuente', () => {
  const docs = [
    { id: '1', nombre: 'Política de devoluciones.docx', texto: `${'Introducción general de la empresa. '.repeat(30)}Las devoluciones se aceptan dentro de 15 días con ticket y empaque original. ${'Otro tema. '.repeat(40)}` },
    { id: '2', nombre: 'Lista de precios.txt', texto: 'Martillo $180. Taladro $1,450. Pintura blanca 19 litros $1,200.' },
    { id: '3', nombre: 'imagen.png', texto: '' },
  ];
  const r = buscarEnDocumentos(docs, '¿Cuántos días tiene el cliente para una devolución?');
  assert.equal(r[0].fuente, 'Política de devoluciones.docx');
  assert.match(r[0].fragmento, /15 días con ticket/);
  assert.equal(buscarEnDocumentos(docs, 'precio del taladro')[0].fuente, 'Lista de precios.txt');
  assert.deepEqual(buscarEnDocumentos(docs, 'vacaciones del personal'), []);
  assert.deepEqual(buscarEnDocumentos(docs, ''), []);
});

test('las herramientas dan cifras exactas y respetan lo que el dueño no ha compartido', () => {
  let compartir = false;
  const h = crearHerramientas({
    buscarMemoria: (q) => (/credito|crédito/i.test(q) ? [{ texto: 'No vendemos a crédito sin contrato', tipo: 'decision', fuente: 'dueño', momento: '2026-01-10T00:00:00.000Z' }] : []),
    buscarDocumentos: () => [{ fuente: 'Política.docx', fragmento: 'Devoluciones en 15 días.' }],
    flujo: () => ({ tieneSaldo: true, alerta: { texto: 'En la semana 3 te faltarían $40,000.' }, totales: { porCobrar: 90000, porCobrarVencido: 55000, porPagar: 30000 }, semanas: [{ numero: 1, desde: '2026-05-18', totalEntradas: 50000, totalSalidas: 60000, saldo: 20000 }] }),
    presupuesto: () => [{ nombre: 'Marketing', asignado: 3000, aprobado: 2800, disponible: 200, pendiente: 0 }, { nombre: 'Ventas', asignado: 0, aprobado: 0, disponible: 0, pendiente: 0 }],
    compartirCifras: () => compartir,
    permiteDocumentos: () => true,
  });
  assert.deepEqual(h.definiciones.map((d) => d.name), ['buscar_en_memoria', 'buscar_en_documentos', 'calcular_laboral', 'leer_flujo_de_caja', 'leer_presupuesto']);
  for (const d of DEFINICIONES) assert.ok(d.description.length > 40 && d.input_schema.type === 'object', d.name);

  assert.match(h.ejecutar('buscar_en_memoria', { consulta: 'crédito' }), /No vendemos a crédito sin contrato \[decision, dueño, 2026-01-10\]/);
  assert.match(h.ejecutar('buscar_en_memoria', { consulta: 'vacaciones' }), /No hay nada en la memoria/);
  assert.match(h.ejecutar('buscar_en_documentos', { consulta: 'devoluciones' }), /\[Política\.docx\] Devoluciones en 15 días/);
  // La calculadora laboral da la cifra; el modelo no la estima.
  const aguinaldo = h.ejecutar('calcular_laboral', { tipo: 'aguinaldo', parametros: { salarioDiario: 400, diasTrabajadosAnio: 365 } });
  assert.match(aguinaldo, /6,000/);
  assert.match(aguinaldo, /calculadora laboral/);
  assert.match(h.ejecutar('calcular_laboral', { tipo: 'inventado', parametros: {} }), /No se pudo calcular/);
  // El flujo de caja solo se entrega si el dueño compartió las cifras de sus facturas.
  assert.match(h.ejecutar('leer_flujo_de_caja', {}), /no ha compartido/);
  compartir = true;
  assert.match(h.ejecutar('leer_flujo_de_caja', {}), /Por cobrar \$90,000 \(\$55,000 vencido\)/);
  assert.match(h.ejecutar('leer_presupuesto', {}), /Marketing: asignado \$3,000, aprobado este mes \$2,800, disponible \$200/);
  assert.equal(h.ejecutar('borrar_todo', {}), 'Esa herramienta no existe.');
});

test('el agente pide una herramienta, recibe el resultado y responde; hay tope de usos', async () => {
  const pedidos = [];
  const herramientas = { definiciones: DEFINICIONES, ejecutar: (nombre, entrada) => { pedidos.push([nombre, entrada]); return 'Aguinaldo: $6,000'; } };
  const llamarIA = async ({ resultados, herramientas: disponibles }) => {
    assert.ok(disponibles.includes('calcular_laboral'));
    if (!resultados.length) return { herramienta: { nombre: 'calcular_laboral', entrada: { tipo: 'aguinaldo', parametros: { salarioDiario: 400 } } } };
    return `Con la calculadora: ${resultados[0].resultado}.`;
  };
  const r = await conversarConHerramientas({ llamarIA }, 'sistema', [{ rol: 'usuario', texto: '¿Cuánto es el aguinaldo?' }], { herramientas });
  assert.equal(r.texto, 'Con la calculadora: Aguinaldo: $6,000.');
  assert.deepEqual(r.usos, [{ nombre: 'calcular_laboral', entrada: { tipo: 'aguinaldo', parametros: { salarioDiario: 400 } } }]);

  // Un modelo que pide herramientas sin parar se corta al llegar al tope.
  pedidos.length = 0;
  const terco = async ({ sinHerramientas }) => (sinHerramientas ? 'Respondo con lo que tengo.' : { herramienta: { nombre: 'leer_presupuesto', entrada: {} } });
  const t = await conversarConHerramientas({ llamarIA: terco }, 'sistema', [{ rol: 'usuario', texto: 'x' }], { herramientas, maxUsos: 2 });
  assert.equal(pedidos.length, 2);
  assert.equal(t.texto, 'Respondo con lo que tengo.');
});

test('en el servidor: ruteo, documentos en el contexto y herramientas en las órdenes del dueño', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-ruteo-'));
  // Un documento ya subido, con su texto extraído.
  mkdirSync(join(dir, 'documentos'), { recursive: true });
  const id = '11111111-1111-4111-8111-111111111111';
  writeFileSync(join(dir, 'documentos', `${id}.json`), JSON.stringify({ id, nombre: 'Política de devoluciones.txt', extension: 'txt', tipo: 'text/plain', tam: 90, creado: '2026-05-01T00:00:00.000Z', metodo: 'texto', texto: 'Las devoluciones se aceptan dentro de 15 días con ticket y empaque original.' }));
  const vistos = [];
  const llamarIA = async (p) => {
    vistos.push(p);
    if (p.herramientas && !p.resultados.length && /aguinaldo/i.test(p.mensajes.at(-1).texto)) return { herramienta: { nombre: 'calcular_laboral', entrada: { tipo: 'aguinaldo', parametros: { salarioDiario: 400, diasTrabajadosAnio: 365 } } } };
    if (p.resultados?.length) return `El aguinaldo es el que dio la calculadora: ${p.resultados[0].resultado}\nESTADO: entregado — cálculo`;
    return 'Respuesta.\nESTADO: entregado — listo';
  };
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const pedir = async (ruta, metodo = 'GET', cuerpo) => (await fetch(base + ruta, metodo === 'GET' ? undefined : json(metodo, cuerpo || {}))).json();
  try {
    // Ruteo: sin IA y sin guardar nada.
    const ruta = await pedir('/api/ruteo', 'POST', { texto: 'Necesito calcular el aguinaldo y el finiquito de mi personal' });
    assert.deepEqual([ruta.agente, ruta.nombre], ['rh', 'Recursos humanos']);
    assert.equal((await pedir('/api/ruteo', 'POST', { texto: 'Hola' })).agente, 'orquestador');
    assert.equal(vistos.length, 0, 'rutear no gasta IA');

    // El agente pide la calculadora laboral y responde con su cifra.
    const r = await pedir('/api/agentes/rh/mensajes', 'POST', { texto: '¿Cuánto es el aguinaldo de alguien que gana 400 diarios?' });
    assert.deepEqual(r.herramientas.map((u) => u.nombre), ['calcular_laboral']);
    assert.match(r.respuesta, /6,000/);
    assert.match(vistos[0].sistema, /Tienes herramientas locales para cifras exactas/);

    // El documento subido llega como contexto cuando la orden toca su tema, y se cita como fuente.
    const d = await pedir('/api/agentes/ventas/mensajes', 'POST', { texto: '¿Cuántos días tiene un cliente para una devolución?' });
    assert.match(vistos.at(-1).sistema, /Documentos de la empresa relacionados con esta orden/);
    assert.match(vistos.at(-1).sistema, /\[Política de devoluciones\.txt\]\nLas devoluciones se aceptan dentro de 15 días/);
    assert.ok(d.notas.some((n) => n.titulo === 'Política de devoluciones.txt'));
    await pedir('/api/agentes/ventas/mensajes', 'POST', { texto: 'Dame una idea para vender más' });
    assert.doesNotMatch(vistos.at(-1).sistema, /Documentos de la empresa relacionados/);

    // Con las herramientas apagadas la orden va como antes.
    await pedir('/api/configuracion', 'PUT', { herramientasIA: 'no' });
    const sin = await pedir('/api/agentes/rh/mensajes', 'POST', { texto: '¿Y el aguinaldo de 500 diarios?' });
    assert.equal(vistos.at(-1).herramientas, undefined);
    assert.deepEqual(sin.herramientas, []);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
