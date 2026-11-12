// Presupuesto mensual por área y gastos por aprobar. El dueño captura cuánto puede gastar cada área al mes; los
// agentes lo ven en su contexto y, cuando una propuesta cuesta dinero, la escriben como "GASTO: [área] — concepto —
// monto". Ese gasto queda pendiente hasta que el dueño lo aprueba o lo rechaza en la pantalla: ningún agente gasta
// ni da un gasto por hecho. Todo vive en un archivo local; la aplicación no mueve dinero.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { NOMBRES_DISTRITOS } from './diagnostico.js';

export const MAX_GASTOS = 300; // se conservan los más recientes
export const MAX_GASTOS_POR_ORDEN = 4;
const MAX_MONTO = 1e9;
const ID_VALIDO = /^[0-9a-f]{8}$/;
const ESTADOS = ['pendiente', 'aprobado', 'rechazado'];

const monto = (v) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_MONTO, Math.round(n * 100) / 100) : 0;
};
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const dinero = (n) => `$${Math.round(n).toLocaleString('es-MX')}`;
const mesDe = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

// Líneas "GASTO: [área] — concepto — $monto" de una respuesta. Devuelve [{ areaTexto, concepto, monto }].
export function extraerGastos(respuesta) {
  const gastos = [];
  const re = /^\s*GASTO\s*:\s*\[?([^\]\n—–-]{2,60})\]?\s*[—–-]\s*(.+?)\s*[—–-]\s*\$?\s*([\d][\d.,]*)\s*(?:pesos|mxn)?\.?\s*$/gim;
  let m;
  while ((m = re.exec(String(respuesta || ''))) !== null && gastos.length < MAX_GASTOS_POR_ORDEN) {
    const cantidad = monto(m[3].replace(/\.$/, ''));
    const concepto = texto(m[2], 200);
    if (cantidad && concepto.length >= 3) gastos.push({ areaTexto: m[1].trim(), concepto, monto: cantidad });
  }
  return gastos;
}

export function crearPresupuesto(archivo) {
  function leer() {
    let d = null;
    if (existsSync(archivo)) {
      try { d = JSON.parse(readFileSync(archivo, 'utf8')); } catch { d = null; }
    }
    const areas = {};
    for (const id of Object.keys(NOMBRES_DISTRITOS)) areas[id] = monto(d?.areas?.[id]);
    const gastos = Array.isArray(d?.gastos) ? d.gastos.filter((g) => g && ID_VALIDO.test(g.id) && NOMBRES_DISTRITOS[g.area] && ESTADOS.includes(g.estado)) : [];
    return { areas, nota: texto(d?.nota, 400), gastos };
  }
  function escribir(datos) {
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify({ ...datos, gastos: datos.gastos.slice(-MAX_GASTOS) }, null, 2), 'utf8');
    return datos;
  }

  // Por área: asignado al mes, aprobado en el mes de `ahora`, pendiente de aprobar y lo que queda disponible.
  function resumen(ahora = new Date()) {
    const { areas, gastos } = leer();
    const mes = mesDe(ahora);
    return Object.keys(NOMBRES_DISTRITOS).map((id) => {
      const suma = (estado) => gastos.filter((g) => g.area === id && g.estado === estado && (estado === 'pendiente' || (g.decidido || g.momento).slice(0, 7) === mes)).reduce((s, g) => s + g.monto, 0);
      const aprobado = suma('aprobado');
      return { area: id, nombre: NOMBRES_DISTRITOS[id], asignado: areas[id], aprobado, pendiente: suma('pendiente'), disponible: Math.round((areas[id] - aprobado) * 100) / 100 };
    });
  }

  return {
    leer,
    resumen,

    guardar(entrada) {
      const actual = leer();
      const areas = {};
      for (const id of Object.keys(NOMBRES_DISTRITOS)) areas[id] = monto(entrada?.areas?.[id]);
      return escribir({ ...actual, areas, nota: texto(entrada?.nota, 400) });
    },

    // Registra un gasto propuesto por un agente. Si ya hay uno igual pendiente, devuelve ese.
    solicitar(area, { concepto, monto: cantidad, origen = '' } = {}, ahora = new Date()) {
      if (!NOMBRES_DISTRITOS[area]) return null;
      const limpio = texto(concepto, 200);
      const valor = monto(cantidad);
      if (limpio.length < 3 || !valor) return null;
      const datos = leer();
      const repetido = datos.gastos.find((g) => g.estado === 'pendiente' && g.area === area && g.concepto.toLowerCase() === limpio.toLowerCase());
      if (repetido) return repetido;
      const gasto = { id: randomBytes(4).toString('hex'), area, concepto: limpio, monto: valor, origen: texto(origen, 60), estado: 'pendiente', momento: ahora.toISOString() };
      datos.gastos.push(gasto);
      escribir(datos);
      return gasto;
    },

    // El dueño aprueba, rechaza o regresa a pendiente. Devuelve el gasto o null si no existe.
    decidir(id, estado, ahora = new Date()) {
      if (!ID_VALIDO.test(String(id)) || !ESTADOS.includes(estado)) return null;
      const datos = leer();
      const gasto = datos.gastos.find((g) => g.id === id);
      if (!gasto) return null;
      gasto.estado = estado;
      gasto.decidido = estado === 'pendiente' ? undefined : ahora.toISOString();
      escribir(datos);
      return gasto;
    },

    // Gastos con el contexto para decidir: cuánto queda en el área y si se pasa. Los pendientes primero.
    gastos(ahora = new Date()) {
      const porArea = Object.fromEntries(resumen(ahora).map((r) => [r.area, r]));
      return leer().gastos.slice().reverse().map((g) => {
        const r = porArea[g.area];
        return { ...g, nombreArea: r.nombre, asignado: r.asignado, disponible: r.disponible, excede: g.estado === 'pendiente' ? Math.max(0, Math.round((g.monto - r.disponible) * 100) / 100) : 0 };
      }).sort((a, b) => (a.estado === 'pendiente' ? 0 : 1) - (b.estado === 'pendiente' ? 0 : 1));
    },

    // Texto para el contexto de los agentes. Vacío si el dueño no ha capturado presupuesto ni hay gastos.
    paraPrompt(ahora = new Date()) {
      const { nota, gastos } = leer();
      const filas = resumen(ahora);
      if (!filas.some((r) => r.asignado) && !gastos.length) return '';
      const con = filas.filter((r) => r.asignado);
      const sin = filas.filter((r) => !r.asignado).map((r) => r.nombre);
      const partes = ['Presupuesto del mes autorizado por el dueño (HECHO; no lo rebases sin decirlo):'];
      for (const r of con) partes.push(`- ${r.nombre}: ${dinero(r.asignado)} al mes; ya aprobado este mes ${dinero(r.aprobado)}; disponible ${dinero(r.disponible)}${r.pendiente ? `; por aprobar ${dinero(r.pendiente)}` : ''}.`);
      if (sin.length) partes.push(`- Sin presupuesto asignado: ${sin.join(', ')}. Cualquier gasto ahí necesita que el dueño lo autorice primero.`);
      if (nota) partes.push(`Nota del dueño sobre el presupuesto: ${nota}`);
      const pendientes = gastos.filter((g) => g.estado === 'pendiente').slice(-6);
      if (pendientes.length) partes.push(`Gastos propuestos que el dueño aún no decide (no los des por hechos): ${pendientes.map((g) => `${g.concepto} (${NOMBRES_DISTRITOS[g.area]}, ${dinero(g.monto)})`).join('; ')}.`);
      const decididos = gastos.filter((g) => g.estado !== 'pendiente').slice(-4);
      if (decididos.length) partes.push(`Últimas decisiones del dueño: ${decididos.map((g) => `${g.estado === 'aprobado' ? 'aprobó' : 'rechazó'} ${g.concepto} (${NOMBRES_DISTRITOS[g.area]}, ${dinero(g.monto)})`).join('; ')}.`);
      return partes.join('\n');
    },
  };
}
