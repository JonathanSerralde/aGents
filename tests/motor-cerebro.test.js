import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validar } from '../src/formulario.js';
import { evaluar, hallazgosCruzados } from '../src/diagnostico.js';
import { fechaDePlazo, crearMemoria, fechaLocal } from '../src/memoria.js';
import { informeOficina } from '../src/informe.js';
import { sistemaPara } from '../src/prompts.js';
import { HABILIDADES, describirHabilidad } from '../src/habilidades.js';
import { contenidoReporte } from '../src/reporte.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const base = { contacto_nombre: 'Ana', confianza: 'alto', giro: 'comercio', empleados: '6-10', ventas_anuales: '1m-5m', antiguedad_anios: 4 };

test('el motor detecta contradicciones entre áreas y las mete al plan', () => {
  const datos = validar({ ...base, meses_caja: 0.5, presupuesto_marketing: 5000, clientes_recurrentes_pct: 20, meta_crecimiento: 'horizontal', dependencia_dueno: 5, concentracion_top3_pct: 70, contratos_escritos: 'parcial', cliente_unico: 'si', contabilidad: 'propia', respaldos: 'no', imss_infonavit: 'adeudo' }).datos;
  const cruzados = hallazgosCruzados(datos);
  const textos = cruzados.map((c) => c.texto);
  assert.ok(textos.some((t) => /captación con menos de un mes de caja/.test(t)));
  assert.ok(textos.some((t) => /pierde a los actuales/.test(t)));
  assert.ok(textos.some((t) => /depende del dueño/.test(t)));
  assert.ok(textos.some((t) => /sin contratos escritos/.test(t)));
  assert.ok(textos.some((t) => /si ese cliente se va/.test(t)));
  assert.ok(textos.some((t) => /sin respaldos/.test(t)));
  assert.ok(textos.some((t) => /adeudos ante IMSS/.test(t)));
  assert.equal(cruzados.length, 7);
  assert.equal(cruzados[0].nombre, 'Entre áreas: Finanzas y Marketing');
  const r = evaluar(datos);
  assert.equal(r.cruzados.length, 7);
  assert.ok(r.plan.some((p) => p.cruzado && p.areas.includes('marketing') && p.plazo === '30 días'));
  assert.equal(r.plan[0].color, 'rojo');
  // Sin datos conflictivos no hay cruzados.
  assert.deepEqual(evaluar(validar({ ...base, meses_caja: 6, presupuesto_marketing: 5000 }).datos).cruzados, []);
});

test('la prioridad pondera el área: fiscal en rojo va antes que marketing en rojo', () => {
  const datos = validar({ ...base, cfdi: 'no', presupuesto_marketing: 0, mide_marketing: 'no', meses_caja: 6 }).datos;
  const r = evaluar(datos);
  assert.equal(r.distritos.fiscal.color, 'rojo');
  assert.equal(r.distritos.marketing.color, 'rojo');
  assert.equal(r.prioridad[0], 'fiscal');
  assert.equal(r.prioridad[1], 'marketing');
  // Un amarillo nunca va antes que un rojo, aunque sea de un área pesada.
  const r2 = evaluar(validar({ ...base, meses_caja: 2, presupuesto_marketing: 0, mide_marketing: 'no' }).datos);
  assert.equal(r2.distritos.finanzas.color, 'amarillo');
  assert.equal(r2.prioridad[0], 'marketing');
  const prompt = sistemaPara('orquestador', { creado: '2026-11-05T00:00:00.000Z', datos, resultado: r }, null, null);
  assert.match(prompt, /Orden de prioridad calculado: Fiscal y legal > Marketing/);
  const conCruce = evaluar(validar({ ...base, meses_caja: 0.5, presupuesto_marketing: 5000 }).datos);
  assert.match(sistemaPara('orquestador', { datos, resultado: conCruce }, null, null), /Contradicciones entre áreas detectadas por el motor/);
  assert.ok(contenidoReporte({ resultado: conCruce, datos, creado: '2026-11-05' }, null, null).some((b) => b.texto === 'Contradicciones entre áreas'));
});

test('los plazos de los agentes se vuelven fechas y la memoria sabe qué venció', () => {
  const desde = new Date(2026, 10, 5, 10); // jueves 5 de noviembre de 2026
  assert.equal(fechaDePlazo('30 días', desde), '2026-12-05');
  assert.equal(fechaDePlazo('2 semanas', desde), '2026-11-19');
  assert.equal(fechaDePlazo('una semana', desde), '2026-11-12');
  assert.equal(fechaDePlazo('1 mes', desde), '2026-12-05');
  assert.equal(fechaDePlazo('hoy', desde), '2026-11-05');
  assert.equal(fechaDePlazo('mañana', desde), '2026-11-06');
  assert.equal(fechaDePlazo('viernes', desde), '2026-11-06');
  assert.equal(fechaDePlazo('jueves', desde), '2026-11-12');
  assert.equal(fechaDePlazo('esta semana', desde), '2026-11-08');
  assert.equal(fechaDePlazo('fin de mes', desde), '2026-11-30');
  assert.equal(fechaDePlazo('quincena', desde), '2026-11-20');
  assert.equal(fechaDePlazo('2026-11-08', desde), '2026-11-08');
  assert.equal(fechaDePlazo('8/11/2026', desde), '2026-11-08');
  assert.equal(fechaDePlazo('cuando se pueda', desde), null);
  assert.equal(fechaDePlazo('', desde), null);

  const dir = mkdtempSync(join(tmpdir(), 'mem-venc-'));
  try {
    const memoria = crearMemoria(join(dir, 'memoria.json'));
    memoria.registrarRespuesta('ventas', 'Ok.\nACCIONES:\n- [ventas] Llamar clientes — Rosa — hoy\n- [ventas] Armar oferta — Luis — 3 semanas\n- [marketing] Publicar — Ana — sin fecha');
    const acciones = memoria.acciones();
    assert.equal(acciones.find((a) => /Llamar/.test(a.texto)).vence, fechaLocal(new Date()));
    assert.equal(acciones.find((a) => /Publicar/.test(a.texto)).vence, null);
    const manana = new Date(); manana.setDate(manana.getDate() + 1);
    assert.equal(memoria.vencidas(manana).length, 1);
    assert.equal(memoria.vencidas(new Date()).length, 0);
    assert.equal(memoria.porVencer(7, new Date()).length, 1);
    assert.equal(memoria.porVencer(30, new Date()).length, 2);
    assert.match(memoria.resumenParaPrompt('orquestador'), /acciones abiertas por área/);
    assert.match(memoria.resumenParaPrompt('ventas'), /vence \d{4}-\d{2}-\d{2}/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el informe del Coordinador se arma sin IA con estado, vencidas, mercado y siguiente paso', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inf-'));
  try {
    const memoria = crearMemoria(join(dir, 'memoria.json'));
    memoria.registrarRespuesta('ventas', 'ACCIONES:\n- [ventas] Llamar clientes — Rosa — hoy');
    const datos = validar({ ...base, meses_caja: 0.5, presupuesto_marketing: 5000, cfdi: 'no' }).datos;
    const diagnostico = { creado: '2026-11-05T10:00:00.000Z', datos, resultado: evaluar(datos) };
    const manana = new Date(); manana.setDate(manana.getDate() + 1);
    const { bloques, resumen } = informeOficina({
      diagnostico, equipo: { areas: { ventas: { responsable: 'Rosa' } } }, marca: { nombre: 'Tienda' }, memoria,
      investigacion: { momento: '2026-11-02T10:00:00.000Z', competidores: [{ positivos: [], negativos: [] }], buscan: ['surtido'], rechazan: ['precios altos'] },
      sitio: { urlFinal: 'https://t.mx/', puntaje: 40, hallazgos: [{ color: 'rojo', titulo: 'Conexión segura (HTTPS)' }] },
      apoyo: { sectores: ['retail'] }, ahora: manana,
    });
    assert.equal(bloques[0].texto, 'Informe del Coordinador — Tienda');
    assert.ok(resumen.rojos.includes('Finanzas') && resumen.rojos.includes('Fiscal y legal'));
    assert.equal(resumen.cruzados, 1);
    assert.equal(resumen.vencidas, 1);
    assert.equal(resumen.abiertas, 1);
    assert.match(resumen.siguientePaso, /Cerrar la acción vencida de Ventas/);
    const textos = bloques.map((b) => b.texto).join('\n');
    assert.match(textos, /Llamar clientes — Rosa — venció/);
    assert.match(textos, /Los clientes buscan: surtido/);
    assert.match(textos, /40\/100\. En rojo: Conexión segura/);
    assert.match(textos, /Contradicciones entre áreas/);
    // Sin nada: siguiente paso es el diagnóstico.
    const vacio = informeOficina({ diagnostico: null, memoria: crearMemoria(join(dir, 'm0.json')), apoyo: { sectores: [] } });
    assert.equal(vacio.resumen.siguientePaso, 'Hacer el diagnóstico.');
    // Sin vencidas, el siguiente paso es la contradicción o la primera acción del plan.
    const sinVencidas = informeOficina({ diagnostico, memoria: crearMemoria(join(dir, 'm1.json')), apoyo: { sectores: [] } });
    assert.match(sinVencidas.resumen.siguientePaso, /Pausar la pauta pagada/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('las áreas tienen indicadores y las reglas comunes exigen estructura y uso de la memoria', () => {
  for (const id of ['direccion', 'finanzas', 'ventas', 'marketing', 'compras', 'operaciones', 'rh', 'tecnologia', 'fiscal', 'riesgos', 'crecimiento', 'orquestador']) {
    assert.ok(HABILIDADES[id].indicadores?.length >= 3, id);
    assert.match(describirHabilidad(id), /Indicadores que vigilas/);
  }
  const s = sistemaPara('finanzas', null, null, null);
  assert.match(s, /Meses de caja/);
  assert.match(s, /Estructura de cada respuesta/);
  assert.match(s, /da seguimiento en lugar de proponerla de nuevo/);
});

test('un agente consultado puede hacer una consulta más (segunda vuelta) dentro del presupuesto de la orden', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vuelta-'));
  const llamadas = [];
  const llamarIA = async ({ sistema, mensajes }) => {
    const texto = mensajes.at(-1).texto;
    llamadas.push(sistema.match(/Eres ([^,]+),/)?.[1] || 'orq');
    if (/Eres el Coordinador/.test(sistema)) return 'Plan.\nDELEGAR: [Ventas] — Propón la oferta de la semana';
    if (/Esta petición viene de otro agente/.test(sistema) && /agente del área de Ventas/.test(sistema)) {
      assert.match(sistema, /puedes hacer UNA sola CONSULTAR/);
      return 'Oferta lista.\nCONSULTAR: [Finanzas] — ¿hay caja para un descuento de 10%?\nDELEGAR: [Marketing] — esto no debe ejecutarse';
    }
    if (/Esta petición viene de otro agente/.test(sistema) && /agente del área de Finanzas/.test(sistema)) {
      assert.match(sistema, /sin usar DELEGAR ni CONSULTAR/);
      return 'Sí, hay dos meses de caja.\nCONSULTAR: [Ventas] — esto ya no se resuelve';
    }
    return `OK a: ${texto.slice(0, 30)}`;
  };
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const res = await (await fetch(`${base}/api/agentes/orquestador/mensajes`, json('POST', { texto: 'Arma la oferta de la semana' }))).json();
    assert.equal(res.intercambios.length, 1);
    assert.equal(res.intercambios[0].destino, 'ventas');
    assert.match(res.intercambios[0].respuesta, /Consulta a Finanzas: ¿hay caja/);
    assert.match(res.intercambios[0].respuesta, /dos meses de caja/);
    assert.doesNotMatch(res.intercambios[0].respuesta, /Encargo a Marketing/);
    const finanzas = await (await fetch(`${base}/api/agentes/finanzas/mensajes`)).json();
    assert.equal(finanzas.mensajes.length, 2); // la consulta de segunda vuelta quedó registrada, sin tercera vuelta
    const marketing = await (await fetch(`${base}/api/agentes/marketing/mensajes`)).json();
    assert.equal(marketing.mensajes.length, 0);
    const informe = await (await fetch(`${base}/api/informe`)).json();
    assert.ok(informe.bloques.length > 5);
    assert.equal((await fetch(`${base}/api/informe/reporte.docx`)).status, 200);
    assert.match(await (await fetch(`${base}/api/informe/reporte.html`)).text(), /Informe del Coordinador/);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
