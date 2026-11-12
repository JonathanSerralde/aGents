import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { situacionOficina, situacionParaPrompt, resumirRespuesta, bloquesSituacion } from '../src/situacion.js';
import { crearMemoria, extraerEstado, extraerConclusion } from '../src/memoria.js';
import { informeOficina } from '../src/informe.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('resumirRespuesta deja lo esencial: sin "qué entendí", sin secciones de bitácora ni respuestas de otros', () => {
  const r = resumirRespuesta('**Qué entendí:** quieres caja.\n\n**Análisis:** La caja cubre 0.5 meses (HECHO, diagnóstico).\n\n**Propuesta:** cobrar antes.\n\nACCIONES:\n- [Finanzas] cobrar — Laura — 2026-11-08\n\n— Respuestas de otros agentes —\nConsulta a Ventas: x\n→ y');
  assert.equal(r, 'La caja cubre 0.5 meses (HECHO, diagnóstico). cobrar antes.');
  assert.ok(resumirRespuesta('a'.repeat(500)).length <= 220);
});

test('la situación sabe qué corre ahora, qué hizo cada agente y quién no ha hecho nada', () => {
  const dir = mkdtempSync(join(tmpdir(), 'situacion-'));
  try {
    const memoria = crearMemoria(join(dir, 'memoria.json'));
    memoria.registrarRespuesta('finanzas', 'Falta caja.\n\nACCIONES:\n- [Finanzas] pedir saldo de caja — Laura — 2026-11-01', {});
    const ahora = new Date('2026-11-06T18:00:00');
    const eventos = [
      { tipo: 'trabajo_fin', momento: '2026-11-06T17:30:00.000Z', datos: { area: 'finanzas', tipo: 'orden', ok: true, ms: 5000 } },
      { tipo: 'trabajo_fin', momento: '2026-11-05T10:00:00.000Z', datos: { area: 'ventas', tipo: 'encargo', ok: false, error: 'Anthropic respondió 500' } },
    ];
    const trabajando = [{ id: 't1', area: 'marketing', tipo: 'consulta', detalle: 'Pregunta de Dirección: ¿qué campañas hay?', desde: '2026-11-06T17:59:00.000Z' }];
    const conversaciones = { leer: (id) => (id === 'finanzas' ? [{ rol: 'usuario', texto: '¿Qué atiendo primero?', momento: '2026-11-06T17:29:00.000Z' }, { rol: 'agente', texto: '**Qué entendí:** prioridad.\n\n**Análisis:** La caja cubre 0.5 meses; cobranza a 45 días.\n\nACCIONES:\n- [Finanzas] x — y — z', momento: '2026-11-06T17:30:00.000Z' }] : id === 'compras' ? [{ rol: 'usuario', texto: 'Cotiza', momento: '2026-11-06T12:00:00.000Z', pendiente: true }] : []) };
    const piloto = { de: (id) => ({ activo: id === 'fiscal', ultimaEjecucion: id === 'fiscal' ? '2026-11-04T08:00:00.000Z' : null, ultimoResultado: null, proxima: null }) };
    const sit = situacionOficina({ ids: ['orquestador', 'finanzas', 'ventas', 'marketing', 'compras', 'fiscal', 'riesgos'], eventos, trabajando, conversaciones, memoria, piloto, ahora });
    const por = Object.fromEntries(sit.agentes.map((a) => [a.id, a]));
    assert.equal(por.marketing.estado, 'trabajando');
    assert.equal(por.finanzas.estado, 'activo');
    assert.equal(por.finanzas.ultimaRespuesta.resumen, 'La caja cubre 0.5 meses; cobranza a 45 días.');
    assert.equal(por.finanzas.acciones.abiertas, 1);
    assert.equal(por.finanzas.acciones.vencidas, 1);
    assert.equal(por.ventas.estado, 'bloqueado');
    assert.equal(por.compras.estado, 'bloqueado');
    assert.equal(por.compras.pendientes, 1);
    assert.equal(por.fiscal.estado, 'activo');
    assert.ok(por.fiscal.piloto.activo);
    assert.equal(por.riesgos.estado, 'sin_actividad');
    assert.equal(sit.agentes[0].id, 'marketing'); // lo que corre ahora va primero
    assert.equal(sit.resumen.trabajando, 1);
    assert.equal(sit.resumen.sin_actividad, 2); // orquestador y riesgos

    const texto = situacionParaPrompt(sit, { excepto: 'orquestador' });
    assert.match(texto, /Estado actual de la oficina/);
    assert.match(texto, /Trabajando en este momento: Marketing \(consulta de otro agente\)/);
    assert.match(texto, /- Finanzas: última actividad 06\/11 \d\d:\d\d: orden del usuario; último reporte .*caja cubre 0\.5 meses.*acciones abiertas 1 \(1 VENCIDA\)/);
    assert.match(texto, /- Ventas: .*FALLÓ: Anthropic respondió 500/);
    assert.match(texto, /- Compras: .*1 orden\(es\) pendiente\(s\) sin responder/);
    assert.match(texto, /- Fiscal y legal: .*piloto encendido, última revisión 04\/11/);
    assert.match(texto, /Sin actividad registrada todavía, 1 agente .*Riesgos/);
    assert.doesNotMatch(texto, /- Coordinador:/); // no se describe a sí mismo
    assert.match(texto, /nunca digas que no tienes registro/);

    const bloques = bloquesSituacion(sit);
    assert.match(bloques[0].texto, /1 trabajando ahora, 2 con actividad en los últimos 7 días, 2 con órdenes sin responder o errores, 2 sin actividad/);
    assert.ok(bloques.some((b) => b.tipo === 'vineta' && /Marketing: AHORA MISMO/.test(b.texto)));
    const informe = informeOficina({ diagnostico: null, equipo: {}, marca: {}, memoria, investigacion: null, sitio: null, apoyo: {}, situacion: sit, ahora });
    assert.ok(informe.bloques.some((b) => b.tipo === 'subtitulo' && b.texto === 'Qué está haciendo cada agente'));
    assert.equal(informe.resumen.agentes.trabajando, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el Coordinador y Dirección reciben la situación de los demás agentes en su contexto; un agente de área no', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'situacion-srv-'));
  const sistemas = {};
  const servidor = crearServidor(opcionesTemporales(dir, {
    llamarIA: async ({ sistema, mensajes }) => {
      const area = /Eres el Coordinador/.test(sistema) ? 'orquestador' : (sistema.match(/^Eres ([^,:]+)/)?.[1] || 'otro');
      sistemas[area] = sistema;
      return `**Qué entendí:** ${mensajes.at(-1).texto}\n\n**Análisis:** Finanzas revisó la caja y falta el saldo de hoy.`;
    },
  }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await fetch(`${base}/api/configuracion`, json('PUT', { proveedor: 'anthropic', anthropicKey: 'sk-ant-1234567890' }));
    let r = await fetch(`${base}/api/agentes/finanzas/mensajes`, json('POST', { texto: '¿Qué atiendo primero en tu área?' })).then((x) => x.json());
    assert.equal(r.ok, true);
    const fin_ = Object.entries(sistemas).find(([k]) => /Finanzas/.test(k))?.[1];
    assert.ok(fin_, `no se capturó el prompt de Finanzas: ${Object.keys(sistemas)}`);
    assert.doesNotMatch(fin_, /Estado actual de la oficina/);

    r = await fetch(`${base}/api/agentes/orquestador/mensajes`, json('POST', { texto: 'Prioriza el trabajo de los agentes para esta semana' })).then((x) => x.json());
    assert.equal(r.ok, true);
    assert.match(sistemas.orquestador, /Estado actual de la oficina/);
    assert.match(sistemas.orquestador, /- Finanzas: última actividad .*orden del usuario; último reporte .*Finanzas revisó la caja y falta el saldo de hoy/);
    assert.match(sistemas.orquestador, /Sin actividad registrada todavía/);

    r = await fetch(`${base}/api/agentes/direccion/mensajes`, json('POST', { texto: 'Analiza qué áreas van atrasadas y propón cómo apoyarlas' })).then((x) => x.json());
    assert.equal(r.ok, true);
    const dir_ = Object.entries(sistemas).find(([k]) => /Direcci/.test(k))?.[1] || '';
    assert.match(dir_, /Estado actual de la oficina/);
    assert.match(dir_, /- Coordinador: última actividad/);

    const s = await fetch(`${base}/api/situacion`).then((x) => x.json());
    assert.ok(s.agentes.length > 20);
    assert.match(s.texto, /Estado actual de la oficina/);
    const fin = s.agentes.find((a) => a.id === 'finanzas');
    assert.equal(fin.estado, 'activo');
    assert.equal(fin.ultimo.tipo, 'orden');
    const inf = await fetch(`${base}/api/informe`).then((x) => x.json());
    assert.ok(inf.bloques.some((b) => b.texto === 'Qué está haciendo cada agente'));
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('la pregunta de estado se contesta con reglas: sin IA, sin tokens y aunque la IA esté apagada', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'situacion-reglas-'));
  let llamadas = 0;
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA: async ({ mensajes }) => { llamadas++; return `Respuesta a: ${mensajes.at(-1).texto}\n\nESTADO: bloqueado — falta el saldo de caja de hoy.`; } }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    // Sin clave: la IA está bloqueada y aun así el estado se responde.
    let r = await fetch(`${base}/api/agentes/orquestador/mensajes`, json('POST', { texto: '¿Qué está haciendo cada agente?' })).then((x) => x.json());
    assert.equal(r.ok, true);
    assert.equal(r.reglas, true);
    assert.equal(r.pendiente, false);
    assert.match(r.respuesta, /Estado de la oficina al/);
    assert.match(r.respuesta, /Ningún agente ha trabajado todavía/);
    assert.equal(r.mensajes.at(-1).reglas, true);
    assert.equal(r.mensajes.at(-2).pendiente, undefined); // la pregunta no queda "pendiente para una persona"
    assert.equal(llamadas, 0);

    // Con IA: una orden normal sí llama a la IA y deja su ESTADO en la memoria; la pregunta de estado lo usa sin llamar.
    await fetch(`${base}/api/configuracion`, json('PUT', { proveedor: 'anthropic', anthropicKey: 'sk-ant-1234567890' }));
    r = await fetch(`${base}/api/agentes/finanzas/mensajes`, json('POST', { texto: '¿Qué atiendo primero en tu área?' })).then((x) => x.json());
    assert.equal(r.ok, true);
    assert.equal(llamadas, 1);
    assert.equal(r.memoria.estado.estado, 'bloqueado');
    const mem = await fetch(`${base}/api/memoria`).then((x) => x.json());
    assert.equal(mem.acciones.length, 0);
    r = await fetch(`${base}/api/agentes/direccion/mensajes`, json('POST', { texto: 'Dame un resumen de los demás agentes que están haciendo' })).then((x) => x.json());
    assert.equal(r.reglas, true);
    assert.equal(llamadas, 1);
    assert.match(r.respuesta, /Bloqueados o con pendientes:\*\* Finanzas/);
    assert.match(r.respuesta, /- Finanzas: .*ESTADO reportado .*"bloqueado: falta el saldo de caja de hoy\."/);
    assert.doesNotMatch(r.respuesta, /- Dirección:/);
    const s = await fetch(`${base}/api/situacion`).then((x) => x.json());
    assert.equal(s.agentes.find((a) => a.id === 'finanzas').estado, 'bloqueado');
    assert.match(s.texto, /ESTADO reportado/);
    assert.doesNotMatch(s.texto, /registro local de actividad, \d\d\/\d\d \d/); // solo fecha, sin hora: cacheable
    const act = await fetch(`${base}/api/actividad`).then((x) => x.json());
    assert.ok(act.eventos.some((e) => e.tipo === 'respuesta_reglas'));
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ESTADO se extrae de la respuesta y las notas INFORMAR caducan', () => {
  assert.deepEqual(extraerEstado('texto\n\n**ESTADO:** en curso — revisando la cobranza de noviembre.'), { estado: 'en curso', texto: 'revisando la cobranza de noviembre.' });
  assert.deepEqual(extraerEstado('ESTADO: Entregado'), { estado: 'entregado', texto: '' });
  assert.equal(extraerEstado('sin estado'), null);
  assert.equal(extraerConclusion('ESTADO: en curso — x\nLa caja va bien.'), 'La caja va bien.');
  const dir = mkdtempSync(join(tmpdir(), 'notas-'));
  try {
    const archivo = join(dir, 'memoria.json');
    const vieja = new Date(Date.now() - 20 * 86400000).toISOString();
    const reciente = new Date(Date.now() - 2 * 86400000).toISOString();
    writeFileSync(archivo, JSON.stringify({ notas: [
      { id: 'n1', destino: 'ventas', origen: 'marketing', texto: 'vieja sin leer', momento: vieja, leida: false },
      { id: 'n2', destino: 'ventas', origen: 'marketing', texto: 'reciente', momento: reciente, leida: false },
    ] }));
    const memoria = crearMemoria(archivo);
    assert.deepEqual(memoria.notasPara('ventas').map((n) => n.texto), ['reciente']);
    assert.doesNotMatch(memoria.resumenParaPrompt('ventas'), /vieja sin leer/);
    memoria.agregarNota('ventas', 'finanzas', 'nueva');
    assert.deepEqual(JSON.parse(readFileSync(archivo, 'utf8')).notas.map((n) => n.texto), ['reciente', 'nueva']); // la caducada se purgó
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
