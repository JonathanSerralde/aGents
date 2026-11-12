// Las ocho mejoras de calidad: prueba con IA, cifras reales para los agentes, avisos sin IA, conclusiones útiles,
// voto del dueño, resultado de las acciones, habilidad visible y editable, y modelo según la tarea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ordenesDePrueba, evaluarRespuesta, crearCalidad } from '../src/calidad.js';
import { alertasDe } from '../src/alertas.js';
import { extraerConclusion } from '../src/memoria.js';
import { HABILIDADES, describirHabilidad } from '../src/habilidades.js';
import { claveDe, sanitizarAjuste } from '../src/ajustes.js';
import { modeloPara } from '../src/configuracion.js';
import { analizarComprobantes } from '../src/datos-reales.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const temporal = () => mkdtempSync(join(tmpdir(), 'agents-calidad-'));
const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const BUENA = 'Entendí que quieres ordenar la cobranza.\n\nCon tu flujo de caja a 13 semanas y los días de cuentas por cobrar, el margen aguanta.\n\nPropongo una política de cobranza con recordatorios y anticipos.\n\nACCIONES:\n- [Finanzas] Armar el flujo de caja semanal — Laura — 7 días\n- [Ventas] Llamar a los clientes con cartera vencida — Miguel — 3 días\nESTADO: entregado — política de cobranza lista';

test('la conclusión que se guarda es la propuesta, no el eco de "Entendí que…"', () => {
  assert.equal(extraerConclusion(BUENA), 'Propongo una política de cobranza con recordatorios y anticipos.');
  assert.equal(extraerConclusion('Entiendo que quieres vender más.\nAnálisis:\nTus clientes recurrentes son 55% y el ticket promedio bajó.\nESTADO: en curso — falta dato'), 'Tus clientes recurrentes son 55% y el ticket promedio bajó.');
  assert.equal(extraerConclusion('Claro.\n**Recomendación:** subir precios 5% en enero.'), 'subir precios 5% en enero.');
  assert.equal(extraerConclusion('Conviene reactivar clientes inactivos este mes.\n\nACCIONES:\n- [ventas] Llamar — Rosa — 2 semanas'), 'Conviene reactivar clientes inactivos este mes.');
  assert.equal(extraerConclusion('Hola.'), 'Hola.', 'si no hay nada mejor, la primera línea');
  assert.equal(extraerConclusion('ESTADO: entregado — listo'), '');
});

test('las órdenes de prueba salen de la habilidad y la revisión por reglas distingue una buena respuesta de una mala', () => {
  const ordenes = ordenesDePrueba(HABILIDADES.finanzas);
  assert.deepEqual(ordenes.map((o) => o.tipo), ['habilidad', 'habilidad', 'habilidad', 'prioridad', 'limite', 'gasto']);
  assert.match(ordenes[0].texto, /^Ayúdame con esto: armar el flujo de caja/);

  const buena = evaluarRespuesta(BUENA, { habilidad: HABILIDADES.finanzas, tipo: 'habilidad' });
  assert.equal(buena.puntaje, 100, JSON.stringify(buena.criterios.filter((c) => !c.ok)));
  const mala = evaluarRespuesta('Claro, te ayudo. ¿Qué necesitas? ¿Cuándo? ¿Cómo? ¿Con quién?', { habilidad: HABILIDADES.finanzas, tipo: 'habilidad' });
  assert.ok(mala.puntaje <= 40);
  assert.equal(mala.criterios.find((c) => c.clave === 'estado').ok, false);
  assert.equal(mala.criterios.find((c) => c.clave === 'preguntas').ok, false);

  // Ante la presión de inventar: pasa quien pide el dato, falla quien da una cifra de la nada.
  const pide = evaluarRespuesta('No puedo darte cifras exactas sin tus datos de caja y margen. Comparte cuánto efectivo hay hoy.\nESTADO: bloqueado — me falta el flujo de caja', { habilidad: HABILIDADES.finanzas, tipo: 'limite' });
  assert.equal(pide.criterios.find((c) => c.clave === 'limite').ok, true);
  const inventa = evaluarRespuesta('Tu negocio gana $128,400 al mes y tu punto de equilibrio es definitivo.\nESTADO: entregado — cifras', { habilidad: HABILIDADES.finanzas, tipo: 'limite' });
  assert.equal(inventa.criterios.find((c) => c.clave === 'limite').ok, false);
  const gasto = evaluarRespuesta('Propongo un sistema de cobranza.\nGASTO: [Finanzas] — Sistema de cobranza — $1,200\nESTADO: entregado — propuesta', { habilidad: HABILIDADES.finanzas, tipo: 'gasto' });
  assert.equal(gasto.criterios.find((c) => c.clave === 'gasto').ok, true);
});

test('los votos del dueño se cuentan por agente y cambiar de opinión reemplaza el voto', () => {
  const dir = temporal();
  try {
    const c = crearCalidad(join(dir, 'calidad.json'));
    c.votar('finanzas', { voto: 'si', momento: '2026-05-01T10:00:00.000Z' });
    c.votar('finanzas', { voto: 'no', momento: '2026-05-02T10:00:00.000Z' });
    c.votar('finanzas', { voto: 'si', momento: '2026-05-02T10:00:00.000Z' }); // cambia de opinión sobre el mismo mensaje
    c.votar('ventas', { voto: 'no', momento: '2026-05-03T10:00:00.000Z' });
    assert.equal(c.votar('ventas', { voto: 'quizá' }), null);
    const r = c.resumen();
    assert.deepEqual(r.votos, { finanzas: { si: 2, no: 0 }, ventas: { si: 0, no: 1 } });
    assert.equal(r.porMensaje['finanzas|2026-05-02T10:00:00.000Z'], 'si');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('los avisos se detectan con reglas y traen el agente y la orden ya redactada', () => {
  const ahora = new Date(2026, 4, 20);
  const avisos = alertasDe({
    ahora,
    flujo: { tieneSaldo: true, alerta: { nivel: 'rojo', texto: 'En la semana 3 te faltarían $40,000.' }, totales: { porCobrarVencido: 55000, porCobrar: 90000 } },
    presupuesto: [{ area: 'marketing', nombre: 'Marketing', asignado: 3000, aprobado: 2900 }, { area: 'ventas', nombre: 'Ventas', asignado: 0, aprobado: 0 }],
    gastos: [{ estado: 'pendiente', monto: 2400, momento: new Date(2026, 4, 10).toISOString() }, { estado: 'pendiente', monto: 100, momento: ahora.toISOString() }],
    vencidas: [{ area: 'finanzas', texto: 'Llamar al cliente' }],
    agenda: { activa: true, indicadores: { noAsistieronPct: 35, asistieron: 13, noAsistieron: 7, dias: 30, sinConfirmar7: 4, porCobrar: 0, cobrado: 5000 } },
    respaldo: { recordar: true, archivos: 9, ultimo: null },
  });
  const ids = avisos.map((a) => a.id);
  assert.deepEqual(ids.slice(0, 2).sort(), ['caja', 'inasistencias'], 'lo más grave va primero');
  for (const id of ['cobranza', 'presupuesto-marketing', 'gastos-esperando', 'acciones-vencidas', 'sin-confirmar', 'respaldo']) assert.ok(ids.includes(id), id);
  assert.equal(ids.includes('presupuesto-ventas'), false, 'un área sin presupuesto no dispara aviso por sí sola');
  const cobranza = avisos.find((a) => a.id === 'cobranza');
  assert.deepEqual([cobranza.area, cobranza.nivel], ['credito', 'amarillo']);
  assert.match(cobranza.orden, /plan para cobrarla/);
  assert.match(avisos.find((a) => a.id === 'gastos-esperando').texto, /Un gasto lleva más de tres días/);
  assert.deepEqual(alertasDe({}), []);
});

test('se pueden apagar marcos y acciones de una habilidad, pero nunca sus límites', () => {
  const base = describirHabilidad('finanzas');
  const marco = HABILIDADES.finanzas.marcos[0];
  const limite = HABILIDADES.finanzas.limites[0];
  const ajuste = sanitizarAjuste({ apagados: [marco, limite, marco, 7] });
  assert.deepEqual(ajuste.apagados, [claveDe(marco), claveDe(limite)]);
  const editada = describirHabilidad('finanzas', { apagados: ajuste.apagados });
  assert.match(base, /Flujo de caja semanal a 13 semanas/);
  assert.doesNotMatch(editada, /Flujo de caja semanal a 13 semanas/);
  assert.match(editada, /No recomienda productos financieros concretos/, 'el límite sigue aunque se intente apagar');
  assert.ok(editada.length < base.length);
});

test('el modelo mayor se usa solo si el dueño lo configuró y nunca en ahorro máximo', () => {
  const cfg = { proveedor: 'anthropic', anthropicModelo: 'principal', anthropicModeloExperto: 'mayor' };
  assert.equal(modeloPara(cfg, 'experto'), 'mayor');
  assert.equal(modeloPara({ ...cfg, anthropicModeloExperto: '' }, 'experto'), 'principal');
  assert.equal(modeloPara({ ...cfg, modoAhorro: 'maximo' }, 'experto'), 'claude-haiku-5-5');
  assert.equal(modeloPara({ ...cfg, proveedor: 'openai', openaiModelo: 'otro' }, 'experto'), 'otro');
});

test('en el servidor: prueba de calidad, votos, resultado de acciones, cifras reales y modelo por agente', async () => {
  const dir = temporal();
  const vistos = [];
  const llamarIA = async ({ sistema, mensajes, modelo, nivel }) => { vistos.push({ sistema, texto: mensajes.at(-1).texto, modelo, nivel }); return BUENA; };
  // Facturas inventadas para tener cifras reales.
  const propio = { rfc: 'DEMO010101AA1', nombre: 'Negocio' };
  const factura = (emisor, receptor, total, fecha, i) => ({ pagos: [], uuid: `U${i}`, fecha, tipo: 'I', total, metodoPago: 'PUE', emisor, receptor });
  const analisis = analizarComprobantes([
    factura(propio, { rfc: 'DEMO020202BB2', nombre: 'Cliente Secreto Uno' }, 60000, '2026-04-10', 1),
    factura(propio, { rfc: 'DEMO030303CC3', nombre: 'Cliente Secreto Dos' }, 40000, '2026-04-12', 2),
    factura({ rfc: 'DEMO040404DD4', nombre: 'Proveedor Secreto' }, propio, 30000, '2026-04-15', 3),
  ], propio.rfc);
  writeFileSync(join(dir, 'datos-reales.json'), JSON.stringify({ ...analisis, carpeta: '', vigilar: false, semaforo: true }));

  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const pedir = async (ruta, metodo = 'GET', cuerpo) => { const res = await fetch(base + ruta, metodo === 'GET' ? undefined : json(metodo, cuerpo || {})); return { status: res.status, cuerpo: await res.json() }; };
  try {
    // Cifras reales: apagadas de fábrica; al encender viajan totales y porcentajes, nunca nombres.
    await pedir('/api/agentes/finanzas/mensajes', 'POST', { texto: '¿Cómo voy?' });
    assert.doesNotMatch(vistos.at(-1).sistema, /Cifras reales del negocio/);
    assert.equal((await pedir('/api/flujo', 'PUT', { compartirIA: true })).status, 200);
    await pedir('/api/agentes/finanzas/mensajes', 'POST', { texto: '¿Cómo voy ahora?' });
    assert.match(vistos.at(-1).sistema, /Cifras reales del negocio según sus facturas/);
    assert.match(vistos.at(-1).sistema, /Ventas facturadas \$100,000 en 2 facturas/);
    assert.match(vistos.at(-1).sistema, /el mayor pesa 60% de la venta/);
    assert.doesNotMatch(vistos.at(-1).sistema, /Cliente Secreto|Proveedor Secreto|DEMO0[2-4]/);

    // La conclusión guardada es la propuesta.
    const archivo = await pedir('/api/archivo?tipo=acuerdo');
    assert.ok(archivo.cuerpo.entradas.some((e) => e.texto === 'Propongo una política de cobranza con recordatorios y anticipos.'));

    // Voto del dueño sobre una respuesta.
    const mensajes = (await pedir('/api/agentes/finanzas/mensajes')).cuerpo.mensajes;
    const ultimo = mensajes.filter((m) => m.rol === 'agente').at(-1);
    const voto = await pedir('/api/agentes/finanzas/calificacion', 'POST', { voto: 'si', momento: ultimo.momento });
    assert.deepEqual(voto.cuerpo.votos, { si: 1, no: 0 });
    assert.equal((await pedir('/api/agentes/finanzas/calificacion', 'POST', { voto: 'tal vez' })).status, 422);
    assert.equal((await pedir('/api/agentes/no-existe/calificacion', 'POST', { voto: 'si' })).status, 404);

    // Resultado de una acción cumplida: queda en el archivo y le llega al agente del área.
    const accion = (await pedir('/api/memoria')).cuerpo.acciones.find((a) => a.area === 'ventas');
    await pedir(`/api/memoria/acciones/${accion.id}`, 'PUT', { estado: 'hecha', resultado: 'Cobramos $18,000 a tres clientes' });
    assert.ok((await pedir('/api/archivo?tipo=accion')).cuerpo.entradas.some((e) => /Resultado: Cobramos \$18,000 a tres clientes/.test(e.texto)));
    await pedir('/api/agentes/ventas/mensajes', 'POST', { texto: '¿Qué sigue?' });
    assert.match(vistos.at(-1).sistema, /El dueño reporta el resultado de "Llamar a los clientes con cartera vencida": Cobramos \$18,000/);

    // Habilidad completa y apagar un marco.
    const completa = await pedir('/api/habilidades/finanzas');
    assert.ok(completa.cuerpo.marcos.length >= 7 && completa.cuerpo.limites.length >= 2 && completa.cuerpo.tokens > 300);
    assert.deepEqual(completa.cuerpo.apoyo, ['Crédito y cobranza', 'Contabilidad', 'Análisis de inversiones']);
    assert.equal((await pedir('/api/habilidades/inventado')).status, 404);
    await pedir('/api/ajustes/finanzas', 'PUT', { notas: 'Vendemos de contado', apagados: [completa.cuerpo.marcos[0]] });
    await pedir('/api/agentes/finanzas/mensajes', 'POST', { texto: 'Otra' });
    assert.doesNotMatch(vistos.at(-1).sistema, /Flujo de caja semanal a 13 semanas/);
    assert.match(vistos.at(-1).sistema, /Vendemos de contado/);
    assert.ok((await pedir('/api/habilidades/finanzas')).cuerpo.tokens < completa.cuerpo.tokens);

    // Prueba de calidad: seis órdenes por agente, sin tocar la conversación.
    const antes = (await pedir('/api/agentes/compras/mensajes')).cuerpo.mensajes.length;
    assert.equal((await pedir('/api/calidad/ejecutar', 'POST', { agentes: [] })).status, 422);
    const llamadasAntes = vistos.length;
    const prueba = await pedir('/api/calidad/ejecutar', 'POST', { agentes: ['compras', 'inventado'] });
    assert.equal(prueba.status, 200);
    assert.equal(vistos.length - llamadasAntes, 6);
    assert.equal(prueba.cuerpo.prueba.agentes.length, 1);
    assert.equal(prueba.cuerpo.prueba.agentes[0].respuestas.length, 6);
    assert.ok(prueba.cuerpo.prueba.agentes[0].puntaje > 0 && prueba.cuerpo.prueba.agentes[0].puntaje <= 100);
    assert.equal((await pedir('/api/agentes/compras/mensajes')).cuerpo.mensajes.length, antes, 'la prueba no ensucia la conversación');
    const resumen = (await pedir('/api/calidad')).cuerpo;
    assert.equal(resumen.ultima.agentes[0].id, 'compras');
    assert.equal(resumen.ordenesPorAgente, 6);
    assert.equal(resumen.votos.finanzas.nombre, 'Finanzas');

    // Modelo mayor solo para los agentes elegidos y solo en órdenes del dueño.
    await pedir('/api/configuracion', 'PUT', { anthropicModeloExperto: 'modelo-mayor', agentesExpertos: ['direccion', 'no válido!'] });
    assert.deepEqual((await pedir('/api/configuracion')).cuerpo.agentesExpertos, ['direccion']);
    await pedir('/api/agentes/direccion/mensajes', 'POST', { texto: '¿Qué meta pongo este trimestre?' });
    // La orden se responde con el modelo mayor y un revisor económico la revisa antes de entregarla.
    assert.ok(vistos.slice(-2).some((v) => v.nivel === 'experto'));
    assert.match(vistos.at(-1).sistema, /revisor de calidad de la oficina/);
    assert.equal(vistos.at(-1).nivel, 'automatico');
    await pedir('/api/agentes/ventas/mensajes', 'POST', { texto: 'Una idea' });
    assert.equal(vistos.at(-1).nivel, 'principal');

    // Avisos: con datos de prueba aparece al menos el del respaldo.
    const avisos = (await pedir('/api/alertas')).cuerpo.avisos;
    assert.ok(avisos.some((a) => a.id === 'respaldo'));
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
