// La junta del lunes: una hoja por semana con tres cifras, tres decisiones y hasta tres compromisos con responsable.
// Se arma con reglas, sin IA, con lo que la oficina ya sabe (diagnóstico, flujo de caja, facturas y bitácora).
// Los compromisos de la semana quedan fijos al abrirla y viven en la bitácora; la semana siguiente la hoja
// empieza por decir cuáles se cumplieron. La idea es crear el hábito de volver cada lunes.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { madurez } from './progreso.js';

export const MAX_COMPROMISOS = 3; // los que propone la oficina
export const MAX_EN_JUNTA = 6; // con los que agregue el dueño: pocos compromisos se cumplen mejor
const dinero = (n) => `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n)).toLocaleString('es-MX')}`;
const dosDigitos = (n) => String(n).padStart(2, '0');
const sinPunto = (t) => String(t).replace(/[.\s]+$/, '');
const fechaLocal = (d) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;

// Lunes de la semana de una fecha (hora local), como AAAA-MM-DD.
export function lunesDe(fecha = new Date()) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return fechaLocal(d);
}
export function domingoDe(lunes) {
  const [a, m, d] = lunes.split('-').map(Number);
  return fechaLocal(new Date(a, m - 1, d + 6));
}

// Tres cifras para abrir la junta. Con facturas analizadas hablan de dinero; sin ellas, del diagnóstico.
function cifrasDe({ flujo, distritos, abiertas, vencidas }) {
  const cifras = [];
  const enAtencion = Object.values(distritos || {}).filter((d) => d.color === 'rojo');
  if (flujo) {
    const s = flujo.semanas[0];
    cifras.push(flujo.tieneSaldo
      ? { titulo: 'Dinero al cierre de esta semana', valor: dinero(s.saldo), detalle: flujo.alerta.texto, nivel: flujo.alerta.nivel }
      : { titulo: 'Entra menos sale esta semana', valor: dinero(s.neto), detalle: 'Captura tu saldo de hoy en el flujo de caja para saber cuánto tendrías.', nivel: s.neto < 0 ? 'amarillo' : 'verde' });
    const mayor = flujo.deudores.find((d) => d.diasVencido > 0);
    cifras.push({ titulo: 'Cobranza vencida', valor: dinero(flujo.totales.porCobrarVencido), detalle: mayor ? `El mayor: ${mayor.nombre}, ${dinero(mayor.saldo)}, ${mayor.diasVencido} días vencido.` : `Te deben ${dinero(flujo.totales.porCobrar)} en total, al corriente.`, nivel: flujo.totales.porCobrarVencido > 0 ? 'rojo' : 'verde' });
  } else if (distritos) {
    const valor = madurez(distritos);
    cifras.push({ titulo: 'Madurez del negocio', valor: `${valor} de 5`, detalle: 'Sale de tu último diagnóstico.', nivel: valor >= 4 ? 'verde' : valor >= 2.5 ? 'amarillo' : 'rojo' });
    cifras.push({ titulo: 'Áreas en atención', valor: String(enAtencion.length), detalle: enAtencion.length ? enAtencion.map((d) => d.nombre).join(', ') : 'Ninguna.', nivel: enAtencion.length ? 'rojo' : 'verde' });
  }
  cifras.push({ titulo: 'Compromisos abiertos', valor: String(abiertas.length), detalle: vencidas.length ? `${vencidas.length} ya vencieron.` : 'Ninguno vencido.', nivel: vencidas.length ? 'rojo' : 'verde' });
  return cifras.slice(0, 3);
}

// Hasta tres decisiones que solo el dueño puede tomar esta semana, en orden de urgencia. Cada una dice por qué.
function decisionesDe({ flujo, resultado, datosReales, vencidas }) {
  const d = [];
  const push = (texto, motivo) => { if (d.length < 3 && !d.some((x) => x.texto === texto)) d.push({ texto, motivo }); };
  if (flujo?.tieneSaldo && flujo.alerta.nivel === 'rojo') {
    const mayor = flujo.deudores[0];
    push(`Cómo cubrir el faltante de la semana ${flujo.alerta.semana}: cobrar antes, aplazar un pago o conseguir financiamiento`, `${flujo.alerta.texto}${mayor ? ` Quien más te debe es ${mayor.nombre} (${dinero(mayor.saldo)}).` : ''}`);
  }
  if (flujo && flujo.totales.porCobrarVencido > 0) {
    const mayor = flujo.deudores.find((x) => x.diasVencido > 0);
    push('A quién se le cobra esta semana y quién hace la llamada', `Hay ${dinero(flujo.totales.porCobrarVencido)} vencidos${mayor ? `; el mayor es ${mayor.nombre}` : ''}.`);
  }
  for (const c of resultado?.cruzados || []) push(c.accion, c.texto);
  if (vencidas.length) push(`Qué hacer con ${vencidas.length === 1 ? 'la acción vencida' : `las ${vencidas.length} acciones vencidas`}: cerrarla, reasignarla o darle fecha nueva`, `La más atrasada: ${vencidas[0].texto} (venció ${vencidas[0].vence}).`);
  if (resultado?.crecimiento?.bloqueos?.length) push('Posponer los planes de crecimiento hasta ordenar la base', `En atención: ${resultado.crecimiento.bloqueos.join(', ')}.`);
  for (const h of (datosReales?.hallazgos || []).filter((x) => x.color === 'rojo')) push('Qué hacer con lo que muestran las facturas', h.texto);
  if (resultado?.plan?.[0]) push(`Arrancar: ${resultado.plan[0].accion}`, `Es la primera acción del plan (${resultado.plan[0].nombre}, ${resultado.plan[0].plazo}).`);
  return d;
}

// Compromisos de la semana: primero lo vencido, luego lo que vence pronto y al final el plan del diagnóstico.
// Se prefiere un compromiso por área para repartir la carga.
function compromisosDe({ vencidas, porVencer, plan, abiertas, responsableDe, nombreDe }) {
  const elegidos = [];
  const usado = new Set();
  const yaEnBitacora = new Set(abiertas.map((a) => `${a.area}|${a.texto.toLowerCase()}`));
  const candidatos = [
    ...vencidas.map((a) => ({ accionId: a.id, area: a.area, texto: a.texto, responsable: a.responsable || responsableDe(a.area), vence: a.vence, origen: 'vencida' })),
    ...porVencer.map((a) => ({ accionId: a.id, area: a.area, texto: a.texto, responsable: a.responsable || responsableDe(a.area), vence: a.vence, origen: 'bitacora' })),
    ...(plan || []).filter((p) => !yaEnBitacora.has(`${p.distrito}|${p.accion.toLowerCase()}`)).map((p) => ({ accionId: null, area: p.distrito, texto: p.accion, responsable: responsableDe(p.distrito), vence: null, origen: 'plan' })),
  ];
  for (const pasada of [true, false]) {
    for (const c of candidatos) {
      if (elegidos.length >= MAX_COMPROMISOS) break;
      if (elegidos.includes(c) || (pasada && usado.has(c.area))) continue;
      elegidos.push(c);
      usado.add(c.area);
    }
  }
  return elegidos.map((c) => ({ ...c, nombreArea: nombreDe(c.area) }));
}

// Propuesta de junta para la semana de `ahora`. No guarda nada.
export function armarJunta({ ahora = new Date(), diagnostico = null, flujo = null, datosReales = null, abiertas = [], vencidas = [], porVencer = [], responsableDe = () => '', nombreDe = (id) => id }) {
  const resultado = diagnostico?.resultado || null;
  const semana = lunesDe(ahora);
  return {
    semana,
    hasta: domingoDe(semana),
    cifras: cifrasDe({ flujo, distritos: resultado?.distritos, abiertas, vencidas }),
    decisiones: decisionesDe({ flujo, resultado, datosReales, vencidas }),
    compromisos: compromisosDe({ vencidas, porVencer, plan: resultado?.plan, abiertas, responsableDe, nombreDe }),
  };
}

// Mensaje para cada responsable, listo para enviarse por WhatsApp o copiarse.
export function mensajesDe(junta, negocio = '') {
  const porPersona = new Map();
  for (const c of junta.compromisos) {
    const quien = c.responsable || 'Sin responsable';
    if (!porPersona.has(quien)) porPersona.set(quien, []);
    porPersona.get(quien).push(c);
  }
  return [...porPersona.entries()].map(([responsable, lista]) => ({
    responsable,
    texto: [`${responsable === 'Sin responsable' ? 'Hola' : `Hola, ${responsable}`}. ${lista.length === 1 ? 'Este es tu compromiso' : 'Estos son tus compromisos'} de la semana del ${junta.semana}${negocio ? ` en ${negocio}` : ''}:`,
      ...lista.map((c, i) => `${i + 1}. ${sinPunto(c.texto)} (${c.nombreArea})${c.vence ? `, para el ${c.vence}` : ''}.`),
      'El lunes revisamos cómo quedó.'].join('\n'),
  }));
}

// Bloques para Word o PDF.
export function bloquesJunta(junta, negocio = 'Tu negocio') {
  const b = [];
  const push = (tipo, texto) => b.push({ tipo, texto });
  push('titulo', `Junta de la semana del ${junta.semana} — ${negocio}`);
  if (junta.anterior) {
    push('subtitulo', 'De la semana pasada');
    push('parrafo', `Se cumplieron ${junta.anterior.hechos} de ${junta.anterior.total} compromisos.`);
    for (const c of junta.anterior.compromisos) push('vineta', `${c.hecho ? 'Cumplido' : 'Pendiente'}: ${sinPunto(c.texto)} (${c.responsable || 'sin responsable'}).`);
  }
  push('subtitulo', 'Tres cifras');
  for (const c of junta.cifras) push('vineta', `${c.titulo}: ${c.valor}. ${c.detalle}`);
  push('subtitulo', 'Decisiones de esta semana');
  if (!junta.decisiones.length) push('parrafo', 'Sin decisiones urgentes con la información actual.');
  for (const d of junta.decisiones) push('vineta', `${sinPunto(d.texto)}. Por qué: ${d.motivo}`);
  push('subtitulo', 'Compromisos');
  if (!junta.compromisos.length) push('parrafo', 'Sin compromisos: haz el diagnóstico o registra acciones en la bitácora.');
  for (const c of junta.compromisos) push('vineta', `${sinPunto(c.texto)} — ${c.responsable || 'sin responsable'} (${c.nombreArea})${c.vence ? `, para el ${c.vence}` : ''}.`);
  push('nota', 'Hoja armada con reglas, sin IA, con el diagnóstico, las facturas y la bitácora guardados en este equipo.');
  return b;
}

// Juntas guardadas: los compromisos de cada semana, por su lunes.
export function crearJuntas(archivo) {
  function leer() {
    if (!existsSync(archivo)) return {};
    try { const d = JSON.parse(readFileSync(archivo, 'utf8')); return d && typeof d === 'object' ? d : {}; } catch { return {}; }
  }
  return {
    de: (semana) => leer()[semana] || null,
    // La junta guardada más reciente anterior a esa semana.
    anteriorA(semana) {
      const todas = leer();
      const clave = Object.keys(todas).filter((k) => k < semana).sort().at(-1);
      return clave ? { semana: clave, ...todas[clave] } : null;
    },
    guardar(semana, junta) {
      const todas = leer();
      todas[semana] = junta;
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify(todas, null, 2), 'utf8');
      return junta;
    },
  };
}
