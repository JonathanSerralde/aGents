// Investigación semanal de mercado y competencia.
// El agente de Investigación de mercado busca en internet (con la búsqueda web del proveedor de IA y la clave
// del usuario) al menos 10 competidores del sector y resume al menos 5 comentarios positivos y 5 negativos de
// clientes de cada uno. Con eso informa al Coordinador qué buscan y qué rechazan los clientes, y el Coordinador
// reparte el trabajo a Ventas, Marketing y a quien lo necesite. Todo queda en data/investigaciones/.
import { terminos } from './conocimiento.js';
import { crearRegistros } from './registros.js';

export const MINIMO_COMPETIDORES = 10;
export const MINIMO_RESENAS = 5; // por tipo (positivas y negativas) y por competidor
const MAX_COMPETIDORES = 20;
const MAX_RESENAS = 12;
const MAX_LINEA = 300;
const MAX_LISTA = 10;

const limpiar = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LINEA);

// Instrucción para el agente de mercado. Pide un formato fijo para poder leerlo sin IA después.
export function instruccionInvestigacion({ giro, productos, zona, competidores, nombre }) {
  const negocio = [
    nombre ? `Empresa: ${nombre}.` : '',
    giro ? `Giro: ${giro}.` : '',
    productos ? `Productos o servicios: ${productos}.` : '',
    zona ? `Zona: ${zona}.` : '',
    competidores ? `Competidores que ya conoce el dueño: ${competidores}.` : '',
  ].filter(Boolean).join(' ');
  return [
    'Tarea semanal de investigación de mercado y competencia. En esta tarea SÍ tienes búsqueda web: úsala.',
    negocio || 'La ficha de la empresa está incompleta: usa el giro y la zona del diagnóstico.',
    `1) Encuentra al menos ${MINIMO_COMPETIDORES} empresas del mismo sector, de preferencia de la misma zona; si no hay suficientes locales, completa con empresas de otras ciudades de México.`,
    `2) De cada una revisa comentarios y reseñas de clientes (Google Maps, Facebook, Mercado Libre, Amazon, foros, redes) y resume al menos ${MINIMO_RESENAS} comentarios positivos y ${MINIMO_RESENAS} negativos. Resume cada comentario en una frase con tus palabras; no copies el texto original.`,
    'Presupuesto de búsquedas: tienes pocas (unas 8). Úsalas así: 1 o 2 búsquedas amplias para listar competidores ("[giro] en [zona]", "mejores [giro] [zona]") y el resto para reseñas de varios competidores a la vez ("reseñas [giro] [zona]", "opiniones clientes [competidor]"). No repitas búsquedas ni busques competidor por competidor si ya tienes sus reseñas. Si una búsqueda no da reseñas, pasa al siguiente. Escribe la respuesta completa en el formato aunque falten datos: nunca dejes vacías las secciones LO QUE BUSCAN y LO QUE RECHAZAN.',
    '3) Concluye qué buscan los clientes del sector, qué rechazan y qué oportunidades abre eso para la empresa.',
    'Responde ÚNICAMENTE con este formato, una línea por dato, sin encabezados ni texto adicional:',
    'COMPETIDOR: nombre | ciudad o zona | fuente consultada',
    'POSITIVO: resumen de un comentario positivo',
    'NEGATIVO: resumen de un comentario negativo',
    '(repite POSITIVO y NEGATIVO las veces necesarias y luego el siguiente COMPETIDOR)',
    'LO QUE BUSCAN LOS CLIENTES:',
    '- un punto por línea',
    'LO QUE RECHAZAN:',
    '- un punto por línea',
    'OPORTUNIDADES PARA LA EMPRESA:',
    '- un punto por línea',
    'Si de un competidor no encuentras suficientes comentarios de un tipo, pon los que haya y agrega una línea "NOTA: ..." explicándolo. No inventes competidores ni comentarios: si algo no aparece en tus búsquedas, dilo en una NOTA.',
  ].join('\n');
}

// Lee la respuesta (o un texto capturado a mano) en el formato fijo. Tolera viñetas, numeración y mayúsculas.
export function parsearInvestigacion(texto) {
  const competidores = [];
  const listas = { buscan: [], rechazan: [], oportunidades: [] };
  const notas = [];
  let actual = null;
  let modo = null;
  for (const cruda of String(texto || '').split(/\r?\n/)) {
    const linea = cruda.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim();
    if (!linea) continue;
    const encabezado = linea.toUpperCase().replace(/[:：]\s*$/, '');
    if (/^LO QUE BUSCAN/.test(encabezado)) { modo = 'buscan'; actual = null; continue; }
    if (/^LO QUE RECHAZAN/.test(encabezado)) { modo = 'rechazan'; actual = null; continue; }
    if (/^OPORTUNIDADES/.test(encabezado)) { modo = 'oportunidades'; actual = null; continue; }
    const m = linea.match(/^(COMPETIDOR|POSITIVO|NEGATIVO|NOTA)\s*[:：]\s*(.+)$/i);
    if (m) {
      const clave = m[1].toUpperCase();
      const valor = limpiar(m[2]);
      if (clave === 'COMPETIDOR') {
        if (competidores.length >= MAX_COMPETIDORES) { actual = null; continue; }
        const [nombre, zona, fuente] = valor.split('|').map((p) => limpiar(p));
        actual = { nombre: nombre || 'Sin nombre', zona: zona || '', fuente: fuente || '', positivos: [], negativos: [], notas: [] };
        competidores.push(actual);
        modo = null;
      } else if (clave === 'NOTA') {
        (actual ? actual.notas : notas).push(valor);
      } else if (actual) {
        const lista = clave === 'POSITIVO' ? actual.positivos : actual.negativos;
        if (lista.length < MAX_RESENAS) lista.push(valor);
      }
      continue;
    }
    if (modo && listas[modo].length < MAX_LISTA) listas[modo].push(limpiar(linea));
  }
  const incompletos = competidores.filter((c) => c.positivos.length < MINIMO_RESENAS || c.negativos.length < MINIMO_RESENAS).map((c) => c.nombre);
  return {
    competidores,
    buscan: listas.buscan,
    rechazan: listas.rechazan,
    oportunidades: listas.oportunidades,
    notas,
    cumple: {
      competidores: competidores.length >= MINIMO_COMPETIDORES,
      resenas: competidores.length > 0 && incompletos.length === 0,
      incompletos,
    },
  };
}

// Sin IA, el usuario captura las reseñas a mano: las conclusiones salen de las palabras más repetidas.
export function resumirSinIA(inv) {
  const contar = (textos) => {
    const cuenta = new Map();
    for (const t of textos) for (const p of new Set(terminos(t))) cuenta.set(p, (cuenta.get(p) || 0) + 1);
    return [...cuenta.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, n]) => `${p} (${n} menciones)`);
  };
  const positivos = inv.competidores.flatMap((c) => c.positivos);
  const negativos = inv.competidores.flatMap((c) => c.negativos);
  return {
    ...inv,
    buscan: inv.buscan.length ? inv.buscan : contar(positivos),
    rechazan: inv.rechazan.length ? inv.rechazan : contar(negativos),
  };
}

const fecha = (iso) => new Date(iso || Date.now()).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

// Texto breve para el prompt de todos los agentes: lo que buscan y rechazan los clientes según la última investigación.
export function resumenParaPrompt(inv) {
  if (!inv) return '';
  const lista = (l) => l.slice(0, 5).join('; ');
  const lineas = [`Última investigación de mercado (${fecha(inv.momento)}, ${inv.competidores.length} competidores, ${inv.competidores.reduce((s, c) => s + c.positivos.length + c.negativos.length, 0)} comentarios de clientes resumidos):`];
  if (inv.buscan.length) lineas.push(`Los clientes del sector buscan: ${lista(inv.buscan)}.`);
  if (inv.rechazan.length) lineas.push(`Rechazan: ${lista(inv.rechazan)}.`);
  if (inv.oportunidades.length) lineas.push(`Oportunidades detectadas: ${lista(inv.oportunidades)}.`);
  return lineas.join('\n').slice(0, 900);
}

// Lo que el agente de mercado entrega al Coordinador para que reparta el trabajo.
export function informeParaOrquestador(inv) {
  const porCompetidor = inv.competidores.slice(0, 12).map((c) => {
    const pos = c.positivos.slice(0, 3).join(' / ');
    const neg = c.negativos.slice(0, 3).join(' / ');
    return `- ${c.nombre}${c.zona ? ` (${c.zona})` : ''}: valoran ${pos || 'sin datos'}; se quejan de ${neg || 'sin datos'}`;
  });
  return [
    `Informe del agente de Investigación de mercado (${fecha(inv.momento)}): ${inv.competidores.length} competidores y ${inv.competidores.reduce((s, c) => s + c.positivos.length + c.negativos.length, 0)} comentarios de clientes.`,
    inv.buscan.length ? `Lo que buscan los clientes:\n- ${inv.buscan.join('\n- ')}` : '',
    inv.rechazan.length ? `Lo que rechazan:\n- ${inv.rechazan.join('\n- ')}` : '',
    inv.oportunidades.length ? `Oportunidades:\n- ${inv.oportunidades.join('\n- ')}` : '',
    porCompetidor.length ? `Por competidor:\n${porCompetidor.join('\n')}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 6000);
}

// Bloques para el reporte en Word o PDF (mismo formato que reporte.js).
export function contenidoInvestigacion(inv, marca) {
  const b = [];
  const push = (tipo, texto) => b.push({ tipo, texto });
  const total = inv.competidores.reduce((s, c) => s + c.positivos.length + c.negativos.length, 0);
  push('titulo', `Investigación de mercado y competencia — ${marca?.nombre || 'Tu negocio'}`);
  push('parrafo', `Generada el ${fecha(inv.momento)} (${inv.origen === 'manual' ? 'reseñas capturadas a mano' : 'búsqueda automática semanal'}). ${inv.competidores.length} competidores y ${total} comentarios de clientes resumidos.`);
  if (!inv.cumple?.competidores || !inv.cumple?.resenas) {
    push('nota', `Cobertura incompleta: ${!inv.cumple?.competidores ? `se pedían ${MINIMO_COMPETIDORES} competidores y se encontraron ${inv.competidores.length}. ` : ''}${inv.cumple?.incompletos?.length ? `Con menos de ${MINIMO_RESENAS} comentarios por tipo: ${inv.cumple.incompletos.join(', ')}.` : ''}`);
  }
  push('subtitulo', 'Lo que buscan los clientes');
  for (const x of inv.buscan) push('vineta', x);
  if (!inv.buscan.length) push('parrafo', 'Sin conclusiones registradas.');
  push('subtitulo', 'Lo que rechazan');
  for (const x of inv.rechazan) push('vineta', x);
  if (!inv.rechazan.length) push('parrafo', 'Sin conclusiones registradas.');
  if (inv.oportunidades.length) {
    push('subtitulo', 'Oportunidades para la empresa');
    for (const x of inv.oportunidades) push('vineta', x);
  }
  if (inv.encargos?.length) {
    push('subtitulo', 'Trabajo repartido por el Coordinador');
    for (const e of inv.encargos) push('vineta', `${e.nombreDestino || e.destinoTexto}: ${e.texto}${e.respuesta ? ` → ${e.respuesta.slice(0, 400)}` : e.error ? ` (sin respuesta: ${e.error})` : ' (pendiente para la persona responsable)'}`);
  }
  if (inv.busquedas?.length) {
    push('subtitulo', 'Búsquedas realizadas en internet');
    for (const b of inv.busquedas) push('vineta', `"${b.consulta}"${b.fuentes?.length ? ` → ${b.fuentes.map((f) => f.titulo || f.url).join('; ')}` : ''}`);
  }
  push('subtitulo', 'Competidores analizados');
  for (const c of inv.competidores) {
    push('parrafo', `${c.nombre}${c.zona ? ` — ${c.zona}` : ''}${c.fuente ? ` (fuente: ${c.fuente})` : ''}`);
    for (const p of c.positivos) push('vineta', `Positivo: ${p}`);
    for (const n of c.negativos) push('vineta', `Negativo: ${n}`);
    for (const n of c.notas) push('vineta', `Nota: ${n}`);
  }
  for (const n of inv.notas || []) push('nota', n);
  push('subtitulo', 'Sobre este reporte');
  push('nota', 'Los comentarios son resúmenes de reseñas públicas hechos por el agente, no citas textuales, y pueden contener errores: confirma antes de tomar decisiones con ellos. El reporte se generó en el equipo del usuario.');
  return b;
}

export function crearInvestigaciones(dir) {
  const registros = crearRegistros(dir, (r) => ({
    id: r.id, momento: r.momento, origen: r.origen || 'programada', competidores: (r.competidores || []).length,
    comentarios: (r.competidores || []).reduce((s, c) => s + c.positivos.length + c.negativos.length, 0),
    cumple: r.cumple, encargos: (r.encargos || []).length, pendienteReparto: Boolean(r.pendienteReparto),
  }));
  return { ...registros, guardar: (inv) => registros.guardar({ origen: 'programada', ...inv }), ultima: () => registros.ultimo() };
}
