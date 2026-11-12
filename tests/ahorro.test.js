import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modeloPara, sanitizarConfiguracion, MODELO_ECONOMICO_ANTHROPIC } from '../src/configuracion.js';
import { cuerpoAnthropic, enviarLote, resultadosLote, conversar } from '../src/agentes.js';
import { bloquesDeSistema, sistemaPlano } from '../src/prompts.js';
import { crearUso, diaActual } from '../src/uso.js';
import { sistemaPara } from '../src/prompts.js';
import { crearPiloto } from '../src/piloto.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('el modelo se enruta por nivel y modo de ahorro: chat con el principal, lo automático con el económico', () => {
  const cfg = { proveedor: 'anthropic', anthropicModelo: 'claude-fable-5-1', anthropicModeloBusqueda: '', anthropicModeloAutomatico: '', modoAhorro: 'equilibrado' };
  assert.equal(modeloPara(cfg, 'principal'), 'claude-fable-5-1');
  assert.equal(modeloPara(cfg, 'automatico'), MODELO_ECONOMICO_ANTHROPIC);
  assert.equal(modeloPara(cfg, 'busqueda'), MODELO_ECONOMICO_ANTHROPIC);
  assert.equal(modeloPara({ ...cfg, anthropicModeloBusqueda: 'claude-sonnet-5-5' }, 'busqueda'), 'claude-sonnet-5-5');
  assert.equal(modeloPara({ ...cfg, anthropicModeloAutomatico: 'claude-sonnet-5-5' }, 'automatico'), 'claude-sonnet-5-5');
  assert.equal(modeloPara({ ...cfg, modoAhorro: 'maximo' }, 'principal'), MODELO_ECONOMICO_ANTHROPIC);
  assert.equal(modeloPara({ ...cfg, modoAhorro: 'calidad' }, 'automatico'), 'claude-fable-5-1');
  const oa = { proveedor: 'openai', openaiModelo: 'gpt-grande', openaiModeloAutomatico: '', modoAhorro: 'equilibrado' };
  assert.equal(modeloPara(oa, 'automatico'), 'gpt-grande');
  assert.equal(modeloPara({ ...oa, openaiModeloAutomatico: 'gpt-mini' }, 'automatico'), 'gpt-mini');
  const s = sanitizarConfiguracion({ modoAhorro: 'raro', usarLotes: 'false', limiteDiarioTokens: '150000' });
  assert.equal(s.modoAhorro, 'equilibrado');
  assert.equal(s.usarLotes, false);
  assert.equal(s.limiteDiarioTokens, 150000);
  assert.equal(sanitizarConfiguracion({}).usarLotes, true);
});

test('las peticiones a Anthropic llevan caché en el sistema y en el historial, y el prompt compacto recorta referencias', () => {
  const cfg = { proveedor: 'anthropic', anthropicModelo: 'm', modoAhorro: 'equilibrado' };
  const cuerpo = cuerpoAnthropic(cfg, 'sistema', [{ rol: 'usuario', texto: 'a' }, { rol: 'agente', texto: 'b' }, { rol: 'usuario', texto: 'c' }], 'automatico');
  assert.equal(cuerpo.model, MODELO_ECONOMICO_ANTHROPIC);
  assert.deepEqual(cuerpo.system[0].cache_control, { type: 'ephemeral' });
  assert.deepEqual(cuerpo.messages[1].content[0].cache_control, { type: 'ephemeral' }); // penúltimo mensaje: caché incremental
  assert.equal(cuerpo.messages[2].content, 'c');
  assert.equal(cuerpoAnthropic(cfg, 's', [{ rol: 'usuario', texto: 'solo' }]).messages[0].content, 'solo');
  const completo = sistemaPara('fiscal', null, null, null);
  const compacto = sistemaPara('fiscal', null, null, null, null, null, { compacto: true, sector: 'Sector: X', agenda: 'Agenda: Y' });
  assert.match(completo, /Referencias para pymes/);
  assert.doesNotMatch(compacto, /Referencias para pymes/);
  assert.doesNotMatch(compacto, /Sector: X|Agenda: Y/);
  assert.ok(compacto.length < completo.length * 0.8);
});

test('el consumo diario se cuenta aparte y el límite diario detiene la IA hasta mañana', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'uso-dia-'));
  try {
    const uso = crearUso(join(dir, 'uso.json'));
    uso.registrar({ entrada: 1000, salida: 500 });
    assert.equal(uso.resumen().hoy, 1500);
    assert.equal(uso.resumen().porDia[diaActual()], 1500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const dir2 = mkdtempSync(join(tmpdir(), 'lim-dia-'));
  const servidor = crearServidor(opcionesTemporales(dir2, { llamarIA: async () => 'x'.repeat(4000) }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await fetch(`${base}/api/configuracion`, json('PUT', { limiteDiarioTokens: 1500 }));
    const primera = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Hola' }))).json();
    assert.equal(primera.pendiente, false);
    assert.ok(primera.uso.hoy > 1500);
    const segunda = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Otra' }))).json();
    assert.equal(segunda.pendiente, true);
    assert.match(segunda.motivo, /límite diario/);
    const estado = await (await fetch(`${base}/api/uso`)).json();
    assert.equal(estado.actual.limiteDiario, 1500);
    assert.equal(estado.actual.alcanzado, true);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir2, { recursive: true, force: true });
  }
});

test('lo automático usa el modelo económico y el piloto va por lotes que se concluyen al llegar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lote-'));
  const llamadas = [];
  let reloj = new Date(2026, 10, 9, 8, 5); // lunes
  const llamarIA = async ({ sistema, nivel, modelo, lote }) => {
    llamadas.push({ nivel, modelo, lote: Boolean(lote), consulta: /Esta petición viene de otro agente/.test(sistema), area: sistema.match(/Eres ([^,]+),/)?.[1] || 'orq' });
    if (/Esta petición viene de otro agente/.test(sistema)) return 'Dos meses de caja.';
    if (/agente del área de Finanzas/.test(sistema)) return 'Revisión.\nACCIONES:\n- [finanzas] Cobrar — Luis — 1 semana\nCONSULTAR: [Ventas] — ¿ventas de la semana?';
    return 'Sin novedades.';
  };
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA, ahora: () => reloj }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    // Chat de la persona: nivel principal. Consulta entre agentes: automático.
    await fetch(`${base}/api/agentes/orquestador/mensajes`, json('POST', { texto: 'Resume' }));
    assert.equal(llamadas.at(-1).nivel, 'principal');
    assert.equal(llamadas.at(-1).modelo, 'principal-prueba');
    await fetch(`${base}/api/permisos`, json('PUT', { piloto: true }));
    // Todos los agentes quedan dados de alta el lunes 7:59 del reloj de la prueba (mismo archivo que usa el servidor):
    // así lo que "toca" no depende de la fecha real en que corre la prueba.
    const almacen = crearPiloto(join(dir, 'piloto.json'));
    const alta = new Date(2026, 10, 9, 7, 59);
    for (const a of (await (await fetch(`${base}/api/piloto`)).json()).agentes) almacen.guardar(a.id, {}, {}, alta);
    const encolados = await servidor.tickPiloto(reloj);
    assert.ok(encolados.includes('finanzas') && encolados.includes('direccion') && encolados.includes('orquestador'));
    const lotes = llamadas.filter((l) => l.lote);
    assert.ok(lotes.length >= 3 && lotes.every((l) => l.nivel === 'automatico'));
    let estado = await (await fetch(`${base}/api/piloto`)).json();
    assert.match(estado.agentes.find((a) => a.id === 'finanzas').ultimoResultado, /en lote/);
    assert.equal(estado.lotesPendientes.length, 1);
    // Al siguiente tick llega el resultado: se concluye como si hubiera sido en directo (consulta resuelta, acción en memoria).
    const concluidos = await servidor.revisarLotes();
    assert.ok(concluidos.includes('finanzas'));
    estado = await (await fetch(`${base}/api/piloto`)).json();
    assert.match(estado.agentes.find((a) => a.id === 'finanzas').ultimoResultado, /respondida \(lote\) · 1 intercambios · 1 acciones/);
    assert.equal(estado.lotesPendientes.length, 0);
    const consulta = llamadas.find((l) => l.consulta);
    assert.equal(consulta.nivel, 'automatico');
    const mem = await (await fetch(`${base}/api/memoria`)).json();
    assert.ok(mem.acciones.some((a) => /Cobrar/.test(a.texto)));
    const fin = (await (await fetch(`${base}/api/agentes/finanzas/mensajes`)).json()).mensajes;
    assert.equal(fin[0].origen, 'piloto');
    assert.match(fin.at(-1).texto, /Dos meses de caja/);
    assert.deepEqual(await servidor.tickPiloto(reloj), []); // nada más pendiente hoy
    // Sin lotes: corre en directo con el modelo económico.
    await fetch(`${base}/api/configuracion`, json('PUT', { usarLotes: false }));
    reloj = new Date(2026, 10, 10, 8, 5);
    const directo = await servidor.tickPiloto(reloj);
    assert.ok(directo.includes('ventas'));
    assert.equal(llamadas.at(-1).lote, false);
    assert.equal(llamadas.at(-1).nivel, 'automatico');
    // Lotes de verdad solo con Anthropic; con prueba se simulan; sin proveedor se rechazan.
    await assert.rejects(enviarLote({ proveedor: 'ninguno' }, []), /Sin proveedor/);
    const idPrueba = await enviarLote({ llamarIA: async () => 'ok', registrarUso: () => {} }, [{ id: 'a', sistema: 's', mensajes: [{ rol: 'usuario', texto: 'x' }], nivel: 'automatico' }]);
    assert.deepEqual(await resultadosLote({}, idPrueba), [{ id: 'a', ok: true, texto: 'ok' }]);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('las respuestas no se cortan: pensamiento apagado y tope de salida suficiente para la estructura completa', () => {
  const cfg = { proveedor: 'anthropic', anthropicModelo: 'claude-haiku-5-5', modoAhorro: 'equilibrado' };
  const cuerpo = cuerpoAnthropic(cfg, 'sistema', [{ rol: 'usuario', texto: 'a' }], 'principal');
  // Con pensamiento encendido, hasta 900 de los 1100 tokens se iban en pensar y el texto llegaba a media frase.
  assert.deepEqual(cuerpo.thinking, { type: 'disabled' });
  assert.ok(cuerpo.max_tokens >= 2500);
  // Claude 3.5 no acepta el parámetro: no se envía.
  assert.equal(cuerpoAnthropic({ ...cfg, anthropicModelo: 'claude-3-5-sonnet-latest', modoAhorro: 'calidad' }, 's', [{ rol: 'usuario', texto: 'a' }], 'principal').thinking, undefined);
});

test('el prompt va en dos bloques: lo estable con caché y lo dinámico (memoria, situación, agenda) aparte', async () => {
  const cfg = { proveedor: 'anthropic', anthropicModelo: 'claude-haiku-5-5', modoAhorro: 'equilibrado' };
  const sistema = sistemaPara('fiscal', null, null, null, null, null, { memoria: 'Memoria: acciones abiertas X', situacion: 'Estado actual de la oficina: Y', agenda: 'Agenda: Z' });
  const { estable, dinamico } = bloquesDeSistema(sistema);
  assert.match(estable, /Referencias para pymes/);
  assert.doesNotMatch(estable, /acciones abiertas X|oficina: Y|Agenda: Z/);
  assert.match(dinamico, /Contexto del momento/);
  assert.match(dinamico, /acciones abiertas X[\s\S]*oficina: Y[\s\S]*Agenda: Z/);
  // Lo que el servidor añade después del prompt (instrucción del tipo de mensaje, bóvedas) queda en el bloque dinámico.
  const conExtra = bloquesDeSistema(`${sistema}\n\nEl mensaje actual del usuario es una orden.`);
  assert.equal(conExtra.estable, estable);
  assert.match(conExtra.dinamico, /mensaje actual del usuario/);
  const cuerpo = cuerpoAnthropic(cfg, sistema, [{ rol: 'usuario', texto: 'a' }], 'principal');
  assert.equal(cuerpo.system.length, 2);
  assert.equal(cuerpo.system[0].text, estable);
  assert.deepEqual(cuerpo.system[0].cache_control, { type: 'ephemeral' });
  assert.equal(cuerpo.system[1].text, dinamico);
  assert.deepEqual(cuerpo.system[1].cache_control, { type: 'ephemeral' });
  // Sin parte dinámica, un solo bloque; y el separador nunca llega al proveedor ni a la IA de prueba.
  assert.equal(cuerpoAnthropic(cfg, 'solo estable', [{ rol: 'usuario', texto: 'a' }]).system.length, 1);
  assert.doesNotMatch(sistemaPlano(sistema), /<<dinamico>>/);
  let recibido = '';
  await conversar({ llamarIA: async ({ sistema: s }) => { recibido = s; return 'ok'; } }, sistema, [{ rol: 'usuario', texto: 'a' }]);
  assert.doesNotMatch(recibido, /<<dinamico>>/);
  assert.match(recibido, /Referencias para pymes[\s\S]*acciones abiertas X/);
});
