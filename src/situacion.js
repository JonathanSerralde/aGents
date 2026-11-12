// Situación de la oficina: qué está haciendo y qué hizo cada agente, armada con reglas (sin IA) a partir del registro
// de actividad, las conversaciones, la memoria compartida y el piloto automático. El Coordinador, Dirección y el staff
// la reciben en su contexto para contestar "¿qué están haciendo los demás?" con hechos, en vez de decir que no lo saben.
import { nombreDe } from './jerarquia.js';

export const NOMBRE_TIPO_TRABAJO = {
  orden: 'orden del usuario',
  consulta: 'consulta de otro agente',
  encargo: 'encargo del Coordinador',
  busqueda: 'orden con búsqueda en internet',
  investigacion: 'investigación de mercado',
  reparto: 'reparto de trabajo',
  lote: 'envío del lote del piloto',
};

const DIAS_ACTIVO = 7;
const MAX_DETALLADOS = 16;

const fechaCorta = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Lo esencial de una respuesta de agente: sin "qué entendí", sin las respuestas de otros ni las secciones de bitácora.
export function resumirRespuesta(texto, largo = 220) {
  const t = String(texto || '').split(/\n— Respuestas de otros agentes —/)[0];
  const lineas = [];
  let enSeccion = false;
  for (const linea of t.split('\n')) {
    const l = linea.trim();
    if (!l) continue;
    // Sin marcadores de lista ni negritas: "1) **Qué entendí:**" y "**Análisis:**" se reconocen igual.
    const plano = l.replace(/\*\*/g, '').replace(/^[#\-•*\d.)\s]+/, '');
    if (/^(qué entend|entendido|entendí)/i.test(plano)) continue;
    if (/^ESTADO\s*:/i.test(plano) || /^\(La respuesta se cortó/.test(plano)) continue;
    if (/^(ACCIONES|HECHOS|IDEAS|CONCEPTOS|CONSULTAR|DELEGAR|INFORMAR)\s*:/i.test(plano)) { enSeccion = true; continue; }
    if (enSeccion && /^[-•*]/.test(l)) continue;
    enSeccion = false;
    lineas.push(plano.replace(/^(análisis|analisis|propuesta)[^:]{0,40}:\s*/i, ''));
  }
  const limpio = lineas.join(' ').replace(/\s+/g, ' ').trim();
  return limpio.length > largo ? `${limpio.slice(0, largo - 1).trimEnd()}…` : limpio;
}

// ids: agentes a considerar. eventos: registro de actividad (los más recientes primero). trabajando: lo que corre ahora.
export function situacionOficina({ ids = [], propios = {}, eventos = [], trabajando = [], conversaciones = null, memoria = null, piloto = null, ahora = new Date() }) {
  const hoy = fechaLocal(ahora);
  const limiteActivo = new Date(ahora.getTime() - DIAS_ACTIVO * 86400000).toISOString();
  const abiertas = memoria?.acciones?.({ estado: 'pendiente' }) || [];
  // ESTADO estructurado que cada agente reporta al final de su respuesta (más fiable que resumir el texto libre).
  const estados = memoria?.estados?.() || {};
  const agentes = ids.map((id) => {
    const nombre = nombreDe(id, propios);
    const enCurso = trabajando.find((t) => t.area === id) || null;
    const fin = eventos.find((e) => e.tipo === 'trabajo_fin' && e.datos?.area === id);
    const ultimo = fin ? { momento: fin.momento, tipo: fin.datos.tipo, ok: fin.datos.ok !== false, error: fin.datos.error || null } : null;
    const errores = eventos.filter((e) => e.tipo === 'trabajo_fin' && e.datos?.area === id && e.datos.ok === false && e.momento >= limiteActivo).length;
    const mensajes = conversaciones?.leer?.(id) || [];
    let ultimaRespuesta = null;
    let pendientes = 0;
    for (let i = mensajes.length - 1; i >= 0; i--) {
      const m = mensajes[i];
      if (m.rol === 'agente') { ultimaRespuesta = { momento: m.momento, resumen: resumirRespuesta(m.texto) }; break; }
      if (m.pendiente) pendientes++;
    }
    // Si el agente reportó ESTADO en su última respuesta, ese es su reporte (y "bloqueado" cuenta como bloqueo).
    const reportado = estados[id] && (!ultimaRespuesta || estados[id].momento >= ultimaRespuesta.momento.slice(0, 19)) ? estados[id] : null;
    if (reportado) ultimaRespuesta = { momento: reportado.momento, resumen: reportado.texto ? `${reportado.estado}: ${reportado.texto}` : reportado.estado, reportado: reportado.estado };
    const mias = abiertas.filter((a) => a.area === id);
    const vencidas = mias.filter((a) => a.vence && a.vence < hoy);
    const proxima = mias.filter((a) => a.vence && a.vence >= hoy).sort((a, b) => a.vence.localeCompare(b.vence))[0] || null;
    const notas = (memoria?.notasPara?.(id) || []).length;
    let p = null;
    try { p = piloto?.de?.(id, propios) || null; } catch { p = null; }
    const pilotoInfo = p ? { activo: Boolean(p.activo), ultimaEjecucion: p.ultimaEjecucion || null, ultimoResultado: p.ultimoResultado || null, proxima: p.proxima || null } : null;
    const ultimaActividad = [ultimo?.momento, ultimaRespuesta?.momento, pilotoInfo?.ultimaEjecucion].filter(Boolean).sort().pop() || null;
    const estado = enCurso ? 'trabajando'
      : pendientes || (ultimo && !ultimo.ok) || reportado?.estado === 'bloqueado' ? 'bloqueado'
        : ultimaActividad && ultimaActividad >= limiteActivo ? 'activo'
          : ultimaActividad ? 'inactivo' : 'sin_actividad';
    return {
      id, nombre, estado, enCurso, ultimo, errores, ultimaRespuesta, pendientes, ultimaActividad,
      acciones: { abiertas: mias.length, vencidas: vencidas.length, proxima: proxima ? { texto: proxima.texto, vence: proxima.vence } : null, ultima: mias[0]?.texto || null },
      notasSinLeer: notas,
      piloto: pilotoInfo,
    };
  });
  const orden = { trabajando: 0, bloqueado: 1, activo: 2, inactivo: 3, sin_actividad: 4 };
  agentes.sort((a, b) => orden[a.estado] - orden[b.estado] || String(b.ultimaActividad || '').localeCompare(String(a.ultimaActividad || '')));
  const resumen = { total: agentes.length };
  for (const k of Object.keys(orden)) resumen[k] = agentes.filter((a) => a.estado === k).length;
  resumen.pendientes = agentes.reduce((s, a) => s + a.pendientes, 0);
  resumen.vencidas = agentes.reduce((s, a) => s + a.acciones.vencidas, 0);
  return { generado: ahora.toISOString(), agentes, resumen };
}

// Línea de un agente para el prompt o el informe. Sin "hace N minutos": el texto debe ser idéntico entre órdenes
// cercanas para que el proveedor lo lea de caché.
function lineaDe(a) {
  const partes = [];
  if (a.enCurso) partes.push(`AHORA MISMO: ${NOMBRE_TIPO_TRABAJO[a.enCurso.tipo] || a.enCurso.tipo}${a.enCurso.detalle ? ` "${a.enCurso.detalle.slice(0, 90)}"` : ''} (desde las ${fechaCorta(a.enCurso.desde).slice(6)})`);
  if (a.ultimo) partes.push(`última actividad ${fechaCorta(a.ultimo.momento)}: ${NOMBRE_TIPO_TRABAJO[a.ultimo.tipo] || a.ultimo.tipo}${a.ultimo.ok ? '' : ` (FALLÓ: ${a.ultimo.error || 'error'})`}`);
  if (a.ultimaRespuesta?.resumen) partes.push(`${a.ultimaRespuesta.reportado ? 'ESTADO reportado' : 'último reporte'} (${fechaCorta(a.ultimaRespuesta.momento)}): "${a.ultimaRespuesta.resumen}"`);
  if (a.pendientes) partes.push(`${a.pendientes} orden(es) pendiente(s) sin responder (sin IA)`);
  if (a.acciones.abiertas) partes.push(`acciones abiertas ${a.acciones.abiertas}${a.acciones.vencidas ? ` (${a.acciones.vencidas} VENCIDA${a.acciones.vencidas > 1 ? 'S' : ''})` : ''}${a.acciones.proxima ? `, próxima "${a.acciones.proxima.texto}" vence ${a.acciones.proxima.vence}` : ''}`);
  if (a.piloto?.activo) partes.push(`piloto encendido${a.piloto.ultimaEjecucion ? `, última revisión ${fechaCorta(a.piloto.ultimaEjecucion)}` : ', sin revisión todavía'}`);
  if (a.notasSinLeer) partes.push(`${a.notasSinLeer} nota(s) sin leer`);
  return `- ${a.nombre}: ${partes.join('; ')}.`;
}

// Texto para el prompt del Coordinador, Dirección y staff. excepto: el propio agente (no se describe a sí mismo).
export function situacionParaPrompt(sit, { excepto = null, maximo = 3000 } = {}) {
  if (!sit?.agentes?.length) return '';
  const otros = sit.agentes.filter((a) => a.id !== excepto);
  const conDatos = otros.filter((a) => a.estado !== 'sin_actividad');
  const sinDatos = otros.filter((a) => a.estado === 'sin_actividad');
  // Solo la fecha (no la hora): así el bloque no cambia entre órdenes del mismo día y el proveedor lo lee de caché.
  const lineas = [`Estado actual de la oficina (registro local de actividad, ${fechaCorta(sit.generado).slice(0, 5)}; son HECHOS: cuando te pregunten qué hace cada agente, responde con esto, agente por agente, y nunca digas que no tienes registro):`];
  const ahoraMismo = otros.filter((a) => a.enCurso);
  lineas.push(ahoraMismo.length ? `Trabajando en este momento: ${ahoraMismo.map((a) => `${a.nombre} (${NOMBRE_TIPO_TRABAJO[a.enCurso.tipo] || a.enCurso.tipo})`).join(', ')}.` : 'Nadie está ejecutando algo en este instante.');
  for (const a of conDatos.slice(0, MAX_DETALLADOS)) lineas.push(lineaDe(a));
  if (conDatos.length > MAX_DETALLADOS) lineas.push(`- Con actividad más antigua: ${conDatos.slice(MAX_DETALLADOS).map((a) => a.nombre).join(', ')}.`);
  if (sinDatos.length) {
    const nombres = sinDatos.map((a) => a.nombre);
    lineas.push(`- Sin actividad registrada todavía, ${sinDatos.length} agente${sinDatos.length > 1 ? 's' : ''} (no han recibido órdenes ni revisiones): ${nombres.slice(0, 14).join(', ')}${nombres.length > 14 ? ` y ${nombres.length - 14} más` : ''}.`);
  }
  lineas.push('Para un detalle que no esté aquí, CONSULTAR al agente; para poner a trabajar a los que no tienen actividad, DELEGAR o proponer encender su piloto.');
  return lineas.join('\n').slice(0, maximo);
}

// Bloques para el informe del Coordinador sin IA.
export function bloquesSituacion(sit) {
  const b = [];
  if (!sit?.agentes?.length) return b;
  const conDatos = sit.agentes.filter((a) => a.estado !== 'sin_actividad');
  b.push({ tipo: 'parrafo', texto: `${sit.resumen.trabajando} trabajando ahora, ${sit.resumen.activo} con actividad en los últimos ${DIAS_ACTIVO} días, ${sit.resumen.bloqueado} con órdenes sin responder o errores, ${sit.resumen.sin_actividad} sin actividad.` });
  for (const a of conDatos.slice(0, MAX_DETALLADOS)) b.push({ tipo: 'vineta', texto: lineaDe(a).slice(2) });
  if (!conDatos.length) b.push({ tipo: 'parrafo', texto: 'Ningún agente ha trabajado todavía: da una orden o enciende el piloto automático.' });
  return b;
}

// Respuesta directa para el usuario cuando pregunta "¿qué están haciendo los agentes?": se arma con reglas, sin IA
// ni tokens, en el chat de cualquier agente. excepto: el agente al que se le preguntó (habla de los demás).
export function respuestaDeEstado(sit, { excepto = null } = {}) {
  if (!sit?.agentes?.length) return 'Todavía no hay agentes registrados.';
  const otros = sit.agentes.filter((a) => a.id !== excepto);
  const ahoraMismo = otros.filter((a) => a.enCurso);
  const bloqueados = otros.filter((a) => a.estado === 'bloqueado');
  const conDatos = otros.filter((a) => !['sin_actividad'].includes(a.estado));
  const sinDatos = otros.filter((a) => a.estado === 'sin_actividad');
  const lineas = [`**Estado de la oficina al ${fechaCorta(sit.generado)}** (armado con reglas a partir del registro de actividad, sin gastar tokens).`, ''];
  lineas.push(ahoraMismo.length ? `**Trabajando ahora:** ${ahoraMismo.map((a) => `${a.nombre} (${NOMBRE_TIPO_TRABAJO[a.enCurso.tipo] || a.enCurso.tipo}${a.enCurso.detalle ? `: ${a.enCurso.detalle.slice(0, 80)}` : ''})`).join('; ')}.` : '**Trabajando ahora:** nadie está ejecutando algo en este instante.');
  if (bloqueados.length) lineas.push(`**Bloqueados o con pendientes:** ${bloqueados.map((a) => a.nombre).join(', ')}.`);
  lineas.push('', '**Por agente:**');
  for (const a of conDatos.slice(0, MAX_DETALLADOS)) lineas.push(lineaDe(a));
  if (conDatos.length > MAX_DETALLADOS) lineas.push(`- Con actividad más antigua: ${conDatos.slice(MAX_DETALLADOS).map((a) => a.nombre).join(', ')}.`);
  if (!conDatos.length) lineas.push('- Ningún agente ha trabajado todavía.');
  if (sinDatos.length) lineas.push('', `**Sin actividad todavía (${sinDatos.length}):** ${sinDatos.map((a) => a.nombre).join(', ')}. Dales una orden o enciende su piloto automático en Agentes › Piloto.`);
  lineas.push('', 'Si quieres análisis o decisiones sobre esto, pídemelo con palabras como "analiza", "prioriza" o "reparte" (eso sí usa la IA).');
  return lineas.join('\n');
}
