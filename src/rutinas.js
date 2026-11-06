// Detección de órdenes repetidas y rutinas automáticas. Vive en data/rutinas.json.
// Si el usuario pide lo mismo (o casi) tres veces al mismo agente, la oficina se lo hace notar y le ofrece
// automatizarlo: una rutina envía esa orden sola cada día, semana o mes, y el resultado queda en la conversación.
// El usuario decide: nada se automatiza sin que acepte la sugerencia o cree la rutina a mano.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { terminos } from './conocimiento.js';
import { proximaEjecucion } from './programador.js';

export const VECES_PARA_SUGERIR = 3;
export const SIMILITUD_MINIMA = 0.5; // "dame el resumen de ventas de la semana" ≈ "resumen de ventas de esta semana"
export const FRECUENCIAS = ['diaria', 'semanal', 'mensual'];
const MAX_HISTORIAL = 80;
const MAX_RUTINAS = 30;
const DIAS_VENTANA = 90;
const nuevoId = () => Math.random().toString(16).slice(2, 10).padEnd(8, '0');
const ID_VALIDO = /^[0-9a-f]{8}$/;

// Parecido entre dos órdenes (Jaccard sobre palabras significativas).
export function similitud(a, b) {
  const A = new Set(terminos(a));
  const B = new Set(terminos(b));
  if (!A.size || !B.size) return 0;
  let comun = 0;
  for (const t of A) if (B.has(t)) comun++;
  return comun / (A.size + B.size - comun);
}

export function sanitizarRutina(entrada, base = {}) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const texto = typeof e.texto === 'string' ? e.texto.trim().slice(0, 2000) : base.texto || '';
  if (!texto) throw new Error('La rutina necesita la orden que se enviará');
  const area = typeof e.area === 'string' && /^[a-z][a-z0-9-]{1,40}$/.test(e.area) ? e.area : base.area;
  if (!area) throw new Error('La rutina necesita un agente');
  const frecuencia = FRECUENCIAS.includes(e.frecuencia) ? e.frecuencia : base.frecuencia || 'semanal';
  const hora = Number.isInteger(Number(e.hora)) && Number(e.hora) >= 0 && Number(e.hora) <= 23 ? Number(e.hora) : base.hora ?? 9;
  const diaSemana = Number.isInteger(Number(e.diaSemana)) && Number(e.diaSemana) >= 0 && Number(e.diaSemana) <= 6 ? Number(e.diaSemana) : base.diaSemana ?? 1;
  const diaMes = Number.isInteger(Number(e.diaMes)) && Number(e.diaMes) >= 1 && Number(e.diaMes) <= 28 ? Number(e.diaMes) : base.diaMes ?? 1;
  const nombre = typeof e.nombre === 'string' && e.nombre.trim() ? e.nombre.trim().slice(0, 80) : base.nombre || texto.slice(0, 60);
  const activa = e.activa === undefined ? (base.activa ?? true) : !(e.activa === false || e.activa === 'false' || e.activa === 0);
  return { texto, area, frecuencia, hora, diaSemana, diaMes, nombre, activa };
}

// Próxima corrida de una rutina a partir de "desde" (su última ejecución o su creación).
export function proximaCorrida(r, desde) {
  const d = new Date(desde);
  if (r.frecuencia === 'semanal') return proximaEjecucion({ diaSemana: r.diaSemana, hora: r.hora }, d);
  const c = new Date(d);
  c.setHours(r.hora, 0, 0, 0);
  if (r.frecuencia === 'diaria') {
    if (c <= d) c.setDate(c.getDate() + 1);
    return c;
  }
  c.setDate(r.diaMes);
  if (c <= d) c.setMonth(c.getMonth() + 1, r.diaMes);
  return c;
}

export function crearRutinas(archivo) {
  function leerTodo() {
    if (!existsSync(archivo)) return { rutinas: [], sugerencias: [], historial: [] };
    try {
      const d = JSON.parse(readFileSync(archivo, 'utf8'));
      const lista = (k) => (Array.isArray(d[k]) ? d[k] : []);
      return { rutinas: lista('rutinas'), sugerencias: lista('sugerencias'), historial: lista('historial') };
    } catch {
      return { rutinas: [], sugerencias: [], historial: [] };
    }
  }
  function escribir(datos) {
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(datos, null, 2), 'utf8');
  }

  return {
    leer: leerTodo,

    // Registra una orden del usuario y, si ya es repetitiva, devuelve la sugerencia de rutina (o null).
    registrarOrden(area, texto, ahora = new Date()) {
      const datos = leerTodo();
      const desde = new Date(ahora); desde.setDate(desde.getDate() - DIAS_VENTANA);
      datos.historial = datos.historial.filter((h) => new Date(h.momento) >= desde);
      const parecidas = datos.historial.filter((h) => h.area === area && similitud(h.texto, texto) >= SIMILITUD_MINIMA);
      datos.historial = [...datos.historial, { area, texto: texto.slice(0, 500), momento: ahora.toISOString() }].slice(-MAX_HISTORIAL);
      const veces = parecidas.length + 1;
      let sugerencia = null;
      const yaCubierta = datos.rutinas.some((r) => r.area === area && similitud(r.texto, texto) >= SIMILITUD_MINIMA)
        || datos.sugerencias.some((s) => s.area === area && similitud(s.texto, texto) >= SIMILITUD_MINIMA);
      if (veces >= VECES_PARA_SUGERIR && !yaCubierta) {
        sugerencia = { id: nuevoId(), area, texto: texto.slice(0, 500), veces, momento: ahora.toISOString() };
        datos.sugerencias = [...datos.sugerencias, sugerencia].slice(-20);
      } else if (veces >= VECES_PARA_SUGERIR) {
        const previa = datos.sugerencias.find((s) => s.area === area && similitud(s.texto, texto) >= SIMILITUD_MINIMA);
        if (previa) { previa.veces = veces; sugerencia = previa; }
      }
      escribir(datos);
      return { veces, sugerencia };
    },

    sugerencias() { return leerTodo().sugerencias; },
    descartarSugerencia(id) {
      const datos = leerTodo();
      const antes = datos.sugerencias.length;
      datos.sugerencias = datos.sugerencias.filter((s) => s.id !== id);
      if (datos.sugerencias.length === antes) return false;
      escribir(datos);
      return true;
    },

    listar() {
      return leerTodo().rutinas.map((r) => ({ ...r, proxima: r.activa ? proximaCorrida(r, r.ultimaEjecucion || r.creada).toISOString() : null }));
    },

    crear(entrada) {
      const datos = leerTodo();
      if (datos.rutinas.length >= MAX_RUTINAS) throw new Error(`Máximo ${MAX_RUTINAS} rutinas`);
      const r = { id: nuevoId(), ...sanitizarRutina(entrada), creada: new Date().toISOString(), ultimaEjecucion: null, ultimoResultado: null };
      datos.rutinas.push(r);
      // La sugerencia que dio origen a la rutina ya no hace falta.
      datos.sugerencias = datos.sugerencias.filter((s) => !(s.area === r.area && similitud(s.texto, r.texto) >= SIMILITUD_MINIMA));
      escribir(datos);
      return r;
    },

    actualizar(id, cambios) {
      if (!ID_VALIDO.test(String(id))) return null;
      const datos = leerTodo();
      const i = datos.rutinas.findIndex((r) => r.id === id);
      if (i === -1) return null;
      datos.rutinas[i] = { ...datos.rutinas[i], ...sanitizarRutina(cambios, datos.rutinas[i]) };
      escribir(datos);
      return datos.rutinas[i];
    },

    borrar(id) {
      const datos = leerTodo();
      const antes = datos.rutinas.length;
      datos.rutinas = datos.rutinas.filter((r) => r.id !== id);
      if (datos.rutinas.length === antes) return false;
      escribir(datos);
      return true;
    },

    obtener(id) { return leerTodo().rutinas.find((r) => r.id === id) || null; },

    // Rutinas activas a las que ya les tocó correr.
    vencidas(ahora = new Date()) {
      return leerTodo().rutinas.filter((r) => r.activa && proximaCorrida(r, r.ultimaEjecucion || r.creada) <= ahora);
    },

    marcarEjecutada(id, resultado, momento = new Date()) {
      const datos = leerTodo();
      const r = datos.rutinas.find((x) => x.id === id);
      if (!r) return null;
      r.ultimaEjecucion = momento.toISOString();
      r.ultimoResultado = resultado ? String(resultado).slice(0, 300) : null;
      escribir(datos);
      return r;
    },
  };
}
