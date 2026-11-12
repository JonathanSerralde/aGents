// Memoria compartida: el "cerebro" común de la oficina. Vive en data/memoria.json.
// Cada respuesta de un agente deja aquí sus ACCIONES como tareas abiertas y su conclusión principal; los agentes
// también pueden dejarse notas entre sí con "INFORMAR: [agente] — dato" sin gastar una llamada de IA.
// El Orquestador ve todo (qué tiene pendiente cada área); cada agente ve lo suyo y las notas que le dejaron.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolverAgente } from './colaboracion.js';
import { nombreDe } from './jerarquia.js';

const MAX_ACCIONES = 200;
const MAX_NOTAS = 60;
const MAX_TEXTO = 240;
const ID_VALIDO = /^[0-9a-f]{8}$/;

const recortar = (t, max = MAX_TEXTO) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, max);
const nuevoId = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
export const fechaLocal = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;

// Convierte el plazo que escribe un agente ("30 días", "2 semanas", "viernes", "fin de mes") en una fecha local AAAA-MM-DD.
export function fechaDePlazo(plazo, desde = new Date()) {
  const t = String(plazo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return null;
  const f = new Date(desde);
  f.setHours(12, 0, 0, 0);
  const num = (re) => { const m = t.match(re); return m ? (m[1] === 'un' || m[1] === 'una' ? 1 : Number(m[1])) : null; };
  let n;
  // Fecha explícita: los agentes suelen escribir "2026-11-08" o "8/11/2026" como plazo.
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/\bhoy\b|de inmediato|inmediat/.test(t)) return fechaLocal(f);
  if (/manana/.test(t)) { f.setDate(f.getDate() + 1); return fechaLocal(f); }
  if (/quincena/.test(t)) { f.setDate(f.getDate() + 15); return fechaLocal(f); }
  if (/trimestre/.test(t)) { f.setDate(f.getDate() + 90); return fechaLocal(f); }
  if ((n = num(/(\d+|un|una)\s*dia/)) !== null) { f.setDate(f.getDate() + n); return fechaLocal(f); }
  if ((n = num(/(\d+|un|una)\s*semana/)) !== null && !/esta semana|proxima semana|siguiente semana/.test(t)) { f.setDate(f.getDate() + 7 * n); return fechaLocal(f); }
  if ((n = num(/(\d+|un|una)\s*mes/)) !== null && !/este mes|fin de mes|proximo mes/.test(t)) { f.setMonth(f.getMonth() + n); return fechaLocal(f); }
  if (/esta semana|fin de semana/.test(t)) { f.setDate(f.getDate() + ((7 - f.getDay()) % 7 || 7)); return fechaLocal(f); }
  if (/proxima semana|siguiente semana/.test(t)) { f.setDate(f.getDate() + ((7 - f.getDay()) % 7 || 7) + 7); return fechaLocal(f); }
  if (/este mes|fin de mes/.test(t)) { f.setMonth(f.getMonth() + 1, 0); return fechaLocal(f); }
  if (/proximo mes|siguiente mes/.test(t)) { f.setMonth(f.getMonth() + 2, 0); return fechaLocal(f); }
  for (let i = 0; i < DIAS.length; i++) {
    if (new RegExp(`\\b${DIAS[i]}\\b`).test(t)) { f.setDate(f.getDate() + (((i - f.getDay()) + 7) % 7 || 7)); return fechaLocal(f); }
  }
  return null;
}

// Lee la sección "ACCIONES:" de una respuesta: "- [área] qué hacer — responsable — plazo".
export function extraerAcciones(respuesta) {
  const texto = String(respuesta || '');
  const cabecera = texto.match(/^[ \t]*ACCIONES[ \t]*:[^\n]*\n?/im);
  if (!cabecera) return [];
  const bloque = texto.slice(cabecera.index + cabecera[0].length).split('\n');
  const acciones = [];
  for (const linea of bloque) {
    const l = linea.trim();
    if (!l) continue;
    if (/^(CONSULTAR|DELEGAR|INFORMAR)\s*:/i.test(l) || /^[A-ZÁÉÍÓÚ ]{4,}:\s*$/.test(l)) break;
    const m = l.match(/^[-•*]\s*(?:\[([^\]]{2,40})\]\s*)?(.+)$/);
    if (!m) continue;
    const partes = m[2].split(/\s[—–]\s|\s-\s/).map((p) => p.trim());
    acciones.push({ areaTexto: (m[1] || '').trim(), texto: recortar(partes[0]), responsable: recortar(partes[1] || '', 80), plazo: recortar(partes[2] || '', 40) });
  }
  return acciones.filter((a) => a.texto.length >= 4);
}

// Primera frase útil de una respuesta: lo que el agente concluyó.
export function extraerConclusion(respuesta) {
  for (const linea of String(respuesta || '').split('\n')) {
    const l = linea.trim().replace(/^[#*\-•\d.)\s]+/, '');
    if (!l || /^(ACCIONES|CONSULTAR|DELEGAR|INFORMAR|HECHOS|IDEAS|CONCEPTOS|ESTADO)\s*:/i.test(l)) continue;
    return recortar(l);
  }
  return '';
}

// Línea final "ESTADO: en curso | entregado | bloqueado — por qué": el estado estructurado que cada agente reporta.
export const ESTADOS_AGENTE = ['en curso', 'entregado', 'bloqueado'];
export function extraerEstado(respuesta) {
  const m = String(respuesta || '').match(/^[ \t]*\**[ \t]*ESTADO[ \t]*\**[ \t]*:[ \t]*\**[ \t]*(en curso|entregado|bloqueado)\b\**[ \t]*(?:[—–:-][ \t]*)?(.*)$/im);
  if (!m) return null;
  return { estado: m[1].toLowerCase(), texto: recortar(m[2].replace(/\*\*/g, '').trim(), 200) };
}

// Viñetas de una sección con encabezado "CLAVE:" (HECHOS, IDEAS, CONCEPTOS). Cada viñeta se parte en "texto — detalle".
const ENCABEZADOS = 'ACCIONES|CONSULTAR|DELEGAR|INFORMAR|HECHOS|IDEAS|CONCEPTOS|ESTADO';
export function extraerSeccion(respuesta, clave) {
  const texto = String(respuesta || '');
  const cabecera = texto.match(new RegExp(`^[ \\t]*${clave}[ \\t]*:[^\\n]*\\n?`, 'im'));
  if (!cabecera) return [];
  const items = [];
  for (const linea of texto.slice(cabecera.index + cabecera[0].length).split('\n')) {
    const l = linea.trim();
    if (!l) continue;
    if (new RegExp(`^(${ENCABEZADOS})\\s*:`, 'i').test(l) || /^[A-ZÁÉÍÓÚ ]{4,}:\s*$/.test(l)) break;
    const m = l.match(/^[-•*]\s*(.+)$/);
    if (!m) continue;
    const [principal, ...resto] = m[1].split(/\s[—–]\s|\s-\s(?=[a-záéíóú])/);
    items.push({ texto: recortar(principal), detalle: recortar(resto.join(' — '), 160) });
  }
  return items.filter((i) => i.texto.length >= 3);
}

// Hechos: "- dato — fuente: X". Ideas: "- idea — veredicto: probar". Conceptos: "- término: definición".
export function extraerHechos(respuesta) {
  return extraerSeccion(respuesta, 'HECHOS').map((i) => ({ texto: i.texto, fuente: i.detalle.replace(/^fuente\s*:\s*/i, '') || 'agente' }));
}
export function extraerIdeas(respuesta) {
  return extraerSeccion(respuesta, 'IDEAS').map((i) => ({ texto: i.texto, veredicto: i.detalle.replace(/^veredicto\s*:\s*/i, '') }));
}
export function extraerConceptos(respuesta) {
  return extraerSeccion(respuesta, 'CONCEPTOS').map((i) => {
    const m = i.texto.match(/^([^:]{2,60}):\s*(.+)$/);
    return m ? { termino: m[1].trim(), texto: recortar(m[2], 300) } : { termino: i.texto.slice(0, 60), texto: i.detalle || i.texto };
  });
}

export function crearMemoria(archivo) {
  const VACIO = () => ({ acciones: [], conclusiones: {}, estados: {}, notas: [], hechos: [], ideas: [], conceptos: [] });
  function leerTodo() {
    if (!existsSync(archivo)) return VACIO();
    try {
      const d = JSON.parse(readFileSync(archivo, 'utf8'));
      const lista = (k) => (Array.isArray(d[k]) ? d[k] : []);
      const objeto = (k) => (d[k] && typeof d[k] === 'object' ? d[k] : {});
      return { acciones: lista('acciones'), conclusiones: objeto('conclusiones'), estados: objeto('estados'), notas: lista('notas'), hechos: lista('hechos'), ideas: lista('ideas'), conceptos: lista('conceptos') };
    } catch {
      return VACIO();
    }
  }
  // Las notas INFORMAR caducan: sin leer a los 14 días (ya no son "lo último"), leídas a los 30.
  const DIAS_NOTA = 14;
  const DIAS_NOTA_LEIDA = 30;
  const notaVigente = (n, ahora = new Date()) => {
    const dias = (ahora - new Date(n.momento || 0)) / 86400000;
    return n.leida ? dias <= DIAS_NOTA_LEIDA : dias <= DIAS_NOTA;
  };
  const MAX_HECHOS = 150;
  const MAX_IDEAS = 80;
  const MAX_CONCEPTOS = 80;
  const igual = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

  // Guarda hechos, ideas y conceptos de una respuesta (o del usuario) sin repetir.
  function guardarTipos(datos, { area, origen, hechos = [], ideas = [], conceptos = [] }) {
    const cuenta = { hechos: 0, ideas: 0, conceptos: 0 };
    for (const h of hechos) {
      if (datos.hechos.some((x) => igual(x.texto, h.texto))) continue;
      datos.hechos.push({ id: nuevoId(), area, texto: recortar(h.texto), fuente: recortar(h.fuente || origen, 80), origen, momento: new Date().toISOString() });
      cuenta.hechos++;
    }
    for (const i of ideas) {
      if (datos.ideas.some((x) => igual(x.texto, i.texto))) continue;
      datos.ideas.push({ id: nuevoId(), area, texto: recortar(i.texto), veredicto: recortar(i.veredicto || '', 80), estado: 'por_validar', origen, momento: new Date().toISOString() });
      cuenta.ideas++;
    }
    for (const c of conceptos) {
      if (datos.conceptos.some((x) => igual(x.termino, c.termino))) continue;
      datos.conceptos.push({ id: nuevoId(), termino: recortar(c.termino, 60), texto: recortar(c.texto, 300), origen, momento: new Date().toISOString() });
      cuenta.conceptos++;
    }
    datos.hechos = datos.hechos.slice(-MAX_HECHOS);
    datos.ideas = datos.ideas.slice(-MAX_IDEAS);
    datos.conceptos = datos.conceptos.slice(-MAX_CONCEPTOS);
    return cuenta;
  }
  function escribir(datos) {
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(datos, null, 2), 'utf8');
  }

  return {
    leer: leerTodo,

    // Registra lo que un agente concluyó y las acciones que propuso. origen: quién lo dijo; propios: agentes del usuario.
    registrarRespuesta(area, respuesta, propios = {}) {
      const datos = leerTodo();
      const conclusion = extraerConclusion(respuesta);
      if (conclusion) datos.conclusiones[area] = { texto: conclusion, momento: new Date().toISOString() };
      const estado = extraerEstado(respuesta);
      if (estado) datos.estados[area] = { ...estado, momento: new Date().toISOString() };
      let nuevas = 0;
      for (const a of extraerAcciones(respuesta)) {
        const destino = (a.areaTexto && resolverAgente(a.areaTexto, propios)) || area;
        const repetida = datos.acciones.some((x) => x.estado === 'pendiente' && x.area === destino && x.texto.toLowerCase() === a.texto.toLowerCase());
        if (repetida) continue;
        datos.acciones.push({ id: nuevoId(), area: destino, texto: a.texto, responsable: a.responsable, plazo: a.plazo, vence: fechaDePlazo(a.plazo), origen: area, estado: 'pendiente', momento: new Date().toISOString() });
        nuevas++;
      }
      if (datos.acciones.length > MAX_ACCIONES) {
        const hechas = datos.acciones.filter((x) => x.estado !== 'pendiente');
        const sobra = datos.acciones.length - MAX_ACCIONES;
        const quitar = new Set(hechas.slice(0, sobra).map((x) => x.id));
        datos.acciones = datos.acciones.filter((x) => !quitar.has(x.id)).slice(-MAX_ACCIONES);
      }
      // Lo que el agente distinguió como hecho, idea o concepto se guarda en su lista.
      const tipos = guardarTipos(datos, { area, origen: area, hechos: extraerHechos(respuesta), ideas: extraerIdeas(respuesta), conceptos: extraerConceptos(respuesta) });
      escribir(datos);
      return { conclusion, estado, nuevas, ...tipos };
    },

    // Último ESTADO reportado por cada agente: { area: { estado, texto, momento } }.
    estados() { return leerTodo().estados; },

    // Hechos que aporta el usuario en una orden (fuente "usuario") o a mano desde la bitácora.
    agregarHechos(area, textos, fuente = 'usuario') {
      const datos = leerTodo();
      const cuenta = guardarTipos(datos, { area, origen: fuente, hechos: textos.map((t) => ({ texto: t, fuente })) });
      escribir(datos);
      return cuenta.hechos;
    },

    hechos() { return [...leerTodo().hechos].reverse(); },
    ideas() { return [...leerTodo().ideas].reverse(); },
    conceptos() { return [...leerTodo().conceptos].reverse(); },

    borrarHecho(id) {
      const datos = leerTodo();
      const antes = datos.hechos.length;
      datos.hechos = datos.hechos.filter((h) => h.id !== id);
      if (datos.hechos.length === antes) return false;
      escribir(datos);
      return true;
    },

    marcarIdea(id, estado) {
      const datos = leerTodo();
      const i = datos.ideas.find((x) => x.id === id);
      if (!i) return null;
      i.estado = ['por_validar', 'aprobada', 'descartada'].includes(estado) ? estado : 'por_validar';
      i.actualizado = new Date().toISOString();
      escribir(datos);
      return i;
    },

    // Nota de un agente para otro (INFORMAR). No llama a la IA: el destino la verá en su siguiente orden.
    agregarNota(destino, origen, texto) {
      const datos = leerTodo();
      const nota = { id: nuevoId(), destino, origen, texto: recortar(texto, 400), momento: new Date().toISOString(), leida: false };
      datos.notas = [...datos.notas.filter((n) => notaVigente(n)), nota].slice(-MAX_NOTAS);
      escribir(datos);
      return nota;
    },

    // Agrega una acción a mano (por ejemplo, un compromiso de la junta semanal). Si ya hay una igual abierta, devuelve esa.
    agregarAccion(area, { texto, responsable = '', vence = null, origen = 'usuario' } = {}) {
      const datos = leerTodo();
      const limpio = recortar(String(texto || '').trim(), 300);
      const repetida = datos.acciones.find((x) => x.estado === 'pendiente' && x.area === area && x.texto.toLowerCase() === limpio.toLowerCase());
      if (repetida) return repetida;
      const accion = { id: nuevoId(), area, texto: limpio, responsable, plazo: '', vence, origen, estado: 'pendiente', momento: new Date().toISOString() };
      datos.acciones.push(accion);
      escribir(datos);
      return accion;
    },

    acciones({ area = null, estado = null } = {}) {
      return leerTodo().acciones.filter((a) => (!area || a.area === area) && (!estado || a.estado === estado)).sort((a, b) => b.momento.localeCompare(a.momento));
    },

    // Pendientes cuya fecha ya pasó, y las que vencen en los próximos "dias".
    vencidas(hoy = new Date()) {
      const h = fechaLocal(hoy);
      return this.acciones({ estado: 'pendiente' }).filter((a) => a.vence && a.vence < h).sort((a, b) => a.vence.localeCompare(b.vence));
    },
    porVencer(dias = 7, hoy = new Date()) {
      const h = fechaLocal(hoy);
      const limite = new Date(hoy); limite.setDate(limite.getDate() + dias);
      const l = fechaLocal(limite);
      return this.acciones({ estado: 'pendiente' }).filter((a) => a.vence && a.vence >= h && a.vence <= l).sort((a, b) => a.vence.localeCompare(b.vence));
    },

    // Corrige el texto, el responsable o la fecha de una acción (por ejemplo, desde la junta semanal).
    editarAccion(id, { texto, responsable, vence } = {}) {
      if (!ID_VALIDO.test(String(id))) return null;
      const datos = leerTodo();
      const a = datos.acciones.find((x) => x.id === id);
      if (!a) return null;
      if (typeof texto === 'string' && texto.trim().length >= 3) a.texto = recortar(texto.trim(), 300);
      if (typeof responsable === 'string') a.responsable = recortar(responsable.trim(), 80);
      if (vence === null || /^\d{4}-\d{2}-\d{2}$/.test(String(vence ?? ''))) a.vence = vence;
      a.actualizado = new Date().toISOString();
      escribir(datos);
      return a;
    },

    marcar(id, estado) {
      if (!ID_VALIDO.test(String(id))) return null;
      const datos = leerTodo();
      const a = datos.acciones.find((x) => x.id === id);
      if (!a) return null;
      a.estado = estado === 'hecha' ? 'hecha' : 'pendiente';
      a.actualizado = new Date().toISOString();
      escribir(datos);
      return a;
    },

    notasPara(area, { marcarLeidas = false } = {}) {
      const datos = leerTodo();
      const lista = datos.notas.filter((n) => n.destino === area && !n.leida && notaVigente(n));
      if (marcarLeidas && lista.length) {
        for (const n of lista) n.leida = true;
        escribir(datos);
      }
      return lista;
    },

    // Texto para el prompt. El Orquestador recibe el panorama completo; un agente, lo suyo.
    resumenParaPrompt(area, propios = {}) {
      const datos = leerTodo();
      const pendientes = datos.acciones.filter((a) => a.estado === 'pendiente');
      const hoy = fechaLocal(new Date());
      const vencidas = pendientes.filter((a) => a.vence && a.vence < hoy);
      const lineas = [];
      // El gestor ágil de proyectos ve el panorama completo, igual que el Orquestador: la bitácora es su backlog.
      if (area === 'orquestador' || area === 'proyectos') {
        if (vencidas.length) lineas.push(`Acciones VENCIDAS (${vencidas.length}), atiéndelas o reasígnalas antes de proponer nuevas: ${vencidas.slice(0, 6).map((a) => `${nombreDe(a.area, propios)}: ${a.texto} (venció ${a.vence})`).join(' | ')}`);
        const porArea = new Map();
        for (const a of pendientes) porArea.set(a.area, [...(porArea.get(a.area) || []), a]);
        if (porArea.size) {
          lineas.push('Memoria compartida — acciones abiertas por área (las más recientes primero):');
          for (const [id, lista] of [...porArea.entries()].sort((x, y) => y[1].length - x[1].length).slice(0, 12)) {
            lineas.push(`- ${nombreDe(id, propios)} (${lista.length}): ${lista.slice(-2).reverse().map((a) => a.texto).join(' | ')}`);
          }
        }
        const conclusiones = Object.entries(datos.conclusiones).sort((x, y) => y[1].momento.localeCompare(x[1].momento)).slice(0, 10);
        if (conclusiones.length) {
          lineas.push('Últimas conclusiones de los agentes:');
          for (const [id, c] of conclusiones) lineas.push(`- ${nombreDe(id, propios)}: ${c.texto}`);
        }
        lineas.push('Si una acción ya está abierta, no la repitas: da seguimiento o reasígnala.');
      } else {
        const mias = pendientes.filter((a) => a.area === area).slice(-8).reverse();
        if (mias.length) lineas.push(`Tus acciones abiertas (dales seguimiento antes de proponer nuevas): ${mias.map((a) => `${a.texto}${a.vence ? (a.vence < hoy ? ` (VENCIDA el ${a.vence})` : ` (vence ${a.vence})`) : a.plazo ? ` (${a.plazo})` : ''}`).join(' | ')}`);
        const notas = datos.notas.filter((n) => n.destino === area && !n.leida && notaVigente(n)).slice(-6);
        if (notas.length) lineas.push(`Notas que te dejaron otros agentes: ${notas.map((n) => `${nombreDe(n.origen, propios)}: ${n.texto}`).join(' | ')}`);
      }
      // Hechos e ideas van a todos: son la diferencia entre lo que la empresa ES y lo que alguien PROPUSO.
      const hechos = datos.hechos.slice(-12).reverse();
      if (hechos.length) lineas.push(`HECHOS registrados de la empresa (trátalos como información real; cita la fuente): ${hechos.map((h) => `${h.texto} [${h.fuente}]`).join(' | ')}`);
      const ideas = datos.ideas.filter((i) => i.estado === 'por_validar').slice(-6).reverse();
      if (ideas.length) lineas.push(`IDEAS en evaluación (NO son hechos ni decisiones; no las des por aprobadas): ${ideas.map((i) => `${i.texto}${i.veredicto ? ` (veredicto previo: ${i.veredicto})` : ''}`).join(' | ')}`);
      const aprobadas = datos.ideas.filter((i) => i.estado === 'aprobada').slice(-4).reverse();
      if (aprobadas.length) lineas.push(`Ideas APROBADAS por el dueño (ya son decisiones): ${aprobadas.map((i) => i.texto).join(' | ')}`);
      return lineas.join('\n').slice(0, 3200);
    },
  };
}
