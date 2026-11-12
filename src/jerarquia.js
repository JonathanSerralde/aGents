// Jerarquía de los agentes: quién reporta a quién. Tiene efecto real: solo el Coordinador y los superiores
// pueden DELEGAR trabajo a sus subordinados; cualquiera puede CONSULTAR a cualquiera.
import { NOMBRES_DISTRITOS } from './diagnostico.js';
import { NOMBRES_APOYO } from './apoyo.js';

export const ORQ = 'orquestador';

// nivel 1: coordinación; 2: dirección y staff; 3: áreas y apoyo operativo; 4: agentes propios del usuario.
const BASE = {
  orquestador: { nivel: 1, reportaA: null },
  direccion: { nivel: 2, reportaA: ORQ },
  analista: { nivel: 2, reportaA: ORQ },
  planificador: { nivel: 2, reportaA: ORQ },
  brainstorm: { nivel: 2, reportaA: ORQ },
  descubrimiento: { nivel: 2, reportaA: ORQ },
  proyectos: { nivel: 2, reportaA: ORQ },
  inversiones: { nivel: 3, reportaA: 'finanzas' },
  auditoria: { nivel: 2, reportaA: ORQ },
  contraloria: { nivel: 2, reportaA: 'direccion' },
  finanzas: { nivel: 3, reportaA: 'direccion' },
  ventas: { nivel: 3, reportaA: 'direccion' },
  marketing: { nivel: 3, reportaA: 'direccion' },
  compras: { nivel: 3, reportaA: 'direccion' },
  operaciones: { nivel: 3, reportaA: 'direccion' },
  rh: { nivel: 3, reportaA: 'direccion' },
  tecnologia: { nivel: 3, reportaA: 'direccion' },
  fiscal: { nivel: 3, reportaA: 'direccion' },
  riesgos: { nivel: 3, reportaA: 'direccion' },
  crecimiento: { nivel: 3, reportaA: 'direccion' },
  mercado: { nivel: 3, reportaA: 'marketing' },
  trafico: { nivel: 3, reportaA: 'marketing' },
  capacitacion: { nivel: 3, reportaA: 'rh' },
  mejora: { nivel: 3, reportaA: 'operaciones' },
  transformacion: { nivel: 3, reportaA: 'tecnologia' },
  ciberseguridad: { nivel: 3, reportaA: 'tecnologia' },
  tienda: { nivel: 3, reportaA: 'operaciones' },
  imagen: { nivel: 3, reportaA: 'marketing' },
  alimentos: { nivel: 3, reportaA: 'operaciones' },
  produccion: { nivel: 3, reportaA: 'operaciones' },
  expansion: { nivel: 3, reportaA: 'crecimiento' },
  juridico: { nivel: 3, reportaA: 'fiscal' },
  mantenimiento: { nivel: 3, reportaA: 'operaciones' },
  reclutamiento: { nivel: 3, reportaA: 'rh' },
  nomina: { nivel: 3, reportaA: 'rh' },
  perdidas: { nivel: 3, reportaA: 'auditoria' },
  inventarios: { nivel: 3, reportaA: 'operaciones' },
  contabilidad: { nivel: 3, reportaA: 'finanzas' },
  logistica: { nivel: 3, reportaA: 'operaciones' },
  ecommerce: { nivel: 3, reportaA: 'ventas' },
  atencion: { nivel: 3, reportaA: 'ventas' },
  credito: { nivel: 3, reportaA: 'finanzas' },
  administracion: { nivel: 3, reportaA: 'direccion' },
  cuentas: { nivel: 3, reportaA: 'ventas' },
  escolar: { nivel: 3, reportaA: 'operaciones' },
  admisiones: { nivel: 3, reportaA: 'ventas' },
  clinico: { nivel: 3, reportaA: 'operaciones' },
};

export function nombreDe(id, propios = {}) {
  if (id === ORQ) return 'Coordinador';
  return NOMBRES_DISTRITOS[id] || NOMBRES_APOYO[id] || propios[id]?.nombre || id;
}

// Un agente propio reporta a la primera área que ve o, si ve todas, al Coordinador.
export function posicionDe(id, propios = {}) {
  if (BASE[id]) return BASE[id];
  const p = propios[id];
  if (!p) return null;
  const primera = p.areas?.find((a) => a !== 'todas' && BASE[a]);
  return { nivel: 4, reportaA: primera || ORQ };
}

export function superiorDe(id, propios = {}) {
  return posicionDe(id, propios)?.reportaA ?? null;
}

// Tipo de cada agente: 'orquestador' (coordina), 'staff' (reporta al Coordinador o a Dirección sin ser área:
// Analista, Planificador, Auditoría, Contraloría), 'area' (los 11 distritos del diagnóstico), 'subagente' (agente de
// apoyo que cuelga de un área o de un staff: Tráfico digital de Marketing, Nómina de RH, etc.) y 'propio' (creado por el usuario).
export function tipoDe(id, propios = {}) {
  if (id === ORQ) return 'orquestador';
  if (NOMBRES_DISTRITOS[id]) return 'area';
  if (propios[id]) return 'propio';
  if (!BASE[id]) return null;
  return BASE[id].nivel === 2 ? 'staff' : 'subagente';
}

// Subagentes agrupados por el agente del que dependen: { finanzas: ['contabilidad', 'credito'], ... }
export function subagentesPorArea(propios = {}, inactivos = []) {
  const grupos = {};
  for (const id of Object.keys(BASE)) {
    if (tipoDe(id) !== 'subagente' || inactivos.includes(id)) continue;
    const jefe = BASE[id].reportaA;
    (grupos[jefe] ||= []).push(id);
  }
  return grupos;
}

// inactivos: agentes opcionales apagados (no aparecen como subordinados ni en el organigrama).
export function subordinadosDe(id, propios = {}, inactivos = []) {
  const todos = [...Object.keys(BASE), ...Object.keys(propios)].filter((x) => !inactivos.includes(x));
  return todos.filter((x) => x !== id && superiorDe(x, propios) === id);
}

// ¿Puede "origen" delegar trabajo a "destino"? El Coordinador a cualquiera; los demás solo a sus subordinados directos.
export function puedeDelegar(origen, destino, propios = {}) {
  if (origen === ORQ) return destino !== ORQ;
  return superiorDe(destino, propios) === origen;
}

// Texto para el prompt de un agente: a quién reporta y a quién puede encargar trabajo.
export function describirPosicion(id, propios = {}, inactivos = []) {
  const pos = posicionDe(id, propios);
  if (!pos) return '';
  const partes = [];
  const tipo = tipoDe(id, propios);
  if (tipo === 'subagente') partes.push(`Eres subagente de ${nombreDe(pos.reportaA, propios)}: tu trabajo alimenta a esa área y sus prioridades mandan sobre las tuyas.`);
  if (pos.reportaA) partes.push(`Reportas a ${nombreDe(pos.reportaA, propios)}; el Coordinador dirige a todos.`);
  const sub = subordinadosDe(id, propios, inactivos).map((x) => nombreDe(x, propios));
  if (sub.length) partes.push(`Puedes encargar trabajo con "DELEGAR: [agente] — orden" solo a: ${sub.join(', ')}. Son tus especialistas: el dueño te escribe a ti y no siempre sabe que existen, así que cuando la orden toque el tema de alguno, encárgaselo o consúltalo antes de responder, sin esperar a que te lo pida.`);
  else if (id !== ORQ) partes.push('No puedes delegar; sí puedes consultar a cualquier agente.');
  return partes.join(' ');
}

// Organigrama en texto, para el Coordinador y para la pantalla.
export function organigrama(propios = {}, inactivos = []) {
  const todos = [...Object.keys(BASE), ...Object.keys(propios)].filter((x) => !inactivos.includes(x));
  const hijos = (id) => todos.filter((x) => superiorDe(x, propios) === id);
  const lineas = [];
  const etiqueta = { staff: ' (staff)', subagente: ' (subagente)', propio: ' (agente propio)' };
  const recorrer = (id, nivel) => {
    lineas.push(`${'  '.repeat(nivel)}- ${nombreDe(id, propios)}${etiqueta[tipoDe(id, propios)] || ''}`);
    for (const h of hijos(id)) recorrer(h, nivel + 1);
  };
  recorrer(ORQ, 0);
  return lineas.join('\n');
}

export function arbol(propios = {}, inactivos = []) {
  const todos = [...Object.keys(BASE), ...Object.keys(propios)].filter((x) => !inactivos.includes(x));
  const nodo = (id) => ({ id, nombre: nombreDe(id, propios), nivel: posicionDe(id, propios)?.nivel ?? 4, tipo: tipoDe(id, propios), hijos: todos.filter((x) => superiorDe(x, propios) === id).map(nodo) });
  return nodo(ORQ);
}
