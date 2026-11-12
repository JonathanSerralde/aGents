// Informe del Coordinador sin IA: el "cerebro" resume el estado del negocio con reglas, a partir del último diagnóstico,
// la memoria compartida (acciones vencidas y abiertas), la última investigación de mercado y el último análisis del sitio.
// Se calcula al vuelo; en Word o PDF con reporte.js.
import { NOMBRES_DISTRITOS } from './diagnostico.js';
import { nombreDe } from './jerarquia.js';
import { bloquesSituacion } from './situacion.js';
import { resumenDatosReales } from './datos-reales.js';

const ETIQUETA = { verde: 'bien', amarillo: 'por revisar', rojo: 'en atención', sin_datos: 'sin datos' };
const fecha = (iso) => new Date(iso || Date.now()).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

export function informeOficina({ diagnostico, equipo, marca, memoria, investigacion, sitio, apoyo, propios = {}, situacion = null, progreso = null, datosReales = null, flujo = null, ahora = new Date() }) {
  const r = diagnostico?.resultado;
  const b = [];
  const push = (tipo, texto) => b.push({ tipo, texto });
  const responsable = (id) => equipo?.areas?.[id]?.responsable || 'el dueño';
  const resumen = { rojos: [], amarillos: [], verdes: [], cruzados: 0, vencidas: 0, porVencer: 0, abiertas: 0, porArea: {}, siguientePaso: '', avance: '', datosReales: '', flujo: '', flujoNivel: '', sector: (apoyo?.sectores || []).map((id) => apoyo.nombresSectores?.[id] || id) };

  push('titulo', `Informe del Coordinador — ${marca?.nombre || 'Tu negocio'}`);
  push('parrafo', `Generado el ${fecha(ahora.toISOString())} con reglas locales, sin IA. ${diagnostico ? `Último diagnóstico: ${fecha(diagnostico.creado)}.` : 'Todavía no hay diagnóstico.'}`);

  push('subtitulo', 'Estado del negocio');
  if (r) {
    for (const [id, d] of Object.entries(r.distritos)) {
      if (d.color === 'rojo') resumen.rojos.push(d.nombre);
      else if (d.color === 'amarillo') resumen.amarillos.push(d.nombre);
      else if (d.color === 'verde') resumen.verdes.push(d.nombre);
    }
    push('parrafo', `En atención: ${resumen.rojos.join(', ') || 'ninguna'}. Por revisar: ${resumen.amarillos.join(', ') || 'ninguna'}. Bien: ${resumen.verdes.join(', ') || 'ninguna'}.`);
    resumen.cruzados = (r.cruzados || []).length;
    if (resumen.cruzados) {
      push('parrafo', 'Contradicciones entre áreas (atenderlas primero):');
      for (const c of r.cruzados) push('vineta', `${c.texto} → ${c.accion}`);
    }
    if (r.crecimiento?.bloqueos?.length) push('parrafo', `Crecer ahora sería arriesgado: ${r.crecimiento.bloqueos.join(', ')} en atención.`);
  } else {
    push('parrafo', 'Sin diagnóstico: haz el primero para que el Coordinador tenga con qué trabajar.');
  }

  // Avance contra el diagnóstico anterior (src/progreso.js): la evidencia de que el negocio se movió.
  if (progreso) {
    resumen.avance = progreso.resumen;
    push('subtitulo', 'Avance desde el diagnóstico anterior');
    push('parrafo', `Comparado con el diagnóstico del ${fecha(progreso.anterior.creado)}. ${progreso.resumen}`);
    for (const a of progreso.acciones.resueltas.slice(0, 8)) push('vineta', `Ya no hace falta: ${a.accion} (${a.nombre}).`);
  }

  // Datos reales (src/datos-reales.js): lo que dicen las facturas, no solo lo que contestó el dueño.
  if (datosReales) {
    resumen.datosReales = resumenDatosReales(datosReales);
    push('subtitulo', 'Datos reales (facturas y ventas)');
    push('parrafo', resumen.datosReales);
    for (const h of datosReales.hallazgos || []) push('vineta', `${NOMBRES_DISTRITOS[h.area] || h.area} (${ETIQUETA[h.color] || h.color}): ${h.texto}`);
  }
  // Flujo de caja a 13 semanas (src/flujo.js): cuándo faltaría dinero.
  if (flujo) {
    resumen.flujo = flujo.alerta.texto;
    resumen.flujoNivel = flujo.alerta.nivel;
    push('subtitulo', 'Flujo de caja a 13 semanas');
    push('parrafo', flujo.alerta.texto);
    push('vineta', `Por cobrar: $${Math.round(flujo.totales.porCobrar).toLocaleString('es-MX')} (vencido: $${Math.round(flujo.totales.porCobrarVencido).toLocaleString('es-MX')}). Por pagar: $${Math.round(flujo.totales.porPagar).toLocaleString('es-MX')}.`);
  }

  push('subtitulo', 'Acciones de los agentes');
  const vencidas = memoria?.vencidas?.(ahora) || [];
  const porVencer = memoria?.porVencer?.(7, ahora) || [];
  const abiertas = memoria?.acciones?.({ estado: 'pendiente' }) || [];
  resumen.vencidas = vencidas.length;
  resumen.porVencer = porVencer.length;
  resumen.abiertas = abiertas.length;
  for (const a of abiertas) resumen.porArea[a.area] = (resumen.porArea[a.area] || 0) + 1;
  if (vencidas.length) {
    push('parrafo', `Vencidas (${vencidas.length}):`);
    for (const a of vencidas.slice(0, 10)) push('vineta', `${nombreDe(a.area, propios)}: ${a.texto} — ${a.responsable || responsable(a.area)} — venció ${a.vence}`);
  }
  if (porVencer.length) {
    push('parrafo', `Vencen en los próximos 7 días (${porVencer.length}):`);
    for (const a of porVencer.slice(0, 10)) push('vineta', `${nombreDe(a.area, propios)}: ${a.texto} — ${a.responsable || responsable(a.area)} — ${a.vence}`);
  }
  if (abiertas.length) {
    push('parrafo', `Abiertas por área: ${Object.entries(resumen.porArea).sort((x, y) => y[1] - x[1]).map(([id, n]) => `${nombreDe(id, propios)} ${n}`).join(', ')}.`);
  } else {
    push('parrafo', 'No hay acciones abiertas en la bitácora. Aparecen cuando los agentes responden órdenes.');
  }

  if (situacion) {
    push('subtitulo', 'Qué está haciendo cada agente');
    for (const bloque of bloquesSituacion(situacion)) b.push(bloque);
    resumen.agentes = situacion.resumen;
  }

  push('subtitulo', 'Mercado y sitio web');
  if (investigacion) {
    push('parrafo', `Investigación de mercado del ${fecha(investigacion.momento)}: ${investigacion.competidores.length} competidores.`);
    if (investigacion.buscan?.length) push('vineta', `Los clientes buscan: ${investigacion.buscan.slice(0, 3).join('; ')}.`);
    if (investigacion.rechazan?.length) push('vineta', `Rechazan: ${investigacion.rechazan.slice(0, 3).join('; ')}.`);
  } else {
    push('parrafo', 'Sin investigación de mercado todavía (corre cada semana con IA, o captura reseñas a mano).');
  }
  if (sitio) {
    const rojos = sitio.hallazgos.filter((h) => h.color === 'rojo').map((h) => h.titulo);
    push('parrafo', `Sitio ${sitio.urlFinal}: ${sitio.puntaje}/100${rojos.length ? `. En rojo: ${rojos.join(', ')}` : ''}.`);
  } else {
    push('parrafo', 'Sin análisis del sitio web todavía.');
  }

  push('subtitulo', 'Siguiente paso');
  const siguiente = vencidas[0]
    ? `Cerrar la acción vencida de ${nombreDe(vencidas[0].area, propios)}: ${vencidas[0].texto}.`
    : r?.cruzados?.[0]
      ? `${r.cruzados[0].accion} (${r.cruzados[0].nombre}).`
      : r?.plan?.[0]
        ? `${r.plan[0].accion} (${r.plan[0].nombre}, ${r.plan[0].plazo}, ${responsable(r.plan[0].distrito)}).`
        : 'Hacer el diagnóstico.';
  resumen.siguientePaso = siguiente;
  push('parrafo', siguiente);
  push('nota', 'Este informe lo arma el Coordinador con reglas del proyecto y los datos guardados en tu equipo; no sustituye el criterio del dueño ni la revisión de un profesional.');
  return { bloques: b, resumen };
}

export { NOMBRES_DISTRITOS };
