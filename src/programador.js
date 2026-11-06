// Programador de tareas semanales (investigación de mercado, análisis del sitio). Vive en data/programacion.json.
// Corre mientras el servidor esté encendido: revisa cada minuto si ya tocó ejecutar. Si la computadora estaba
// apagada a la hora programada, la tarea corre en cuanto el servidor vuelve a arrancar (no se pierde la semana).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const INTERVALO_MS = 60 * 1000;
const REINTENTO_MS = 6 * 60 * 60 * 1000; // tras un intento fallido (sin IA, error), no insistir antes de 6 horas

export function sanitizarProgramacion(entrada, base = {}) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const dia = Number(e.diaSemana);
  const hora = Number(e.hora);
  return {
    activa: e.activa === undefined ? (base.activa ?? true) : Boolean(e.activa === true || e.activa === 1 || e.activa === '1' || e.activa === 'true'),
    diaSemana: Number.isInteger(dia) && dia >= 0 && dia <= 6 ? dia : (base.diaSemana ?? 1),
    hora: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : (base.hora ?? 9),
    activadaEn: base.activadaEn || new Date().toISOString(),
    ultimaEjecucion: base.ultimaEjecucion || null,
    ultimoIntento: base.ultimoIntento || null,
    ultimoResultado: base.ultimoResultado || null,
  };
}

// Primer momento con ese día y hora estrictamente posterior a "desde".
export function proximaEjecucion(prog, desde) {
  const d = new Date(desde);
  const candidato = new Date(d);
  candidato.setHours(prog.hora, 0, 0, 0);
  let delta = (prog.diaSemana - candidato.getDay() + 7) % 7;
  candidato.setDate(candidato.getDate() + delta);
  if (candidato <= d) candidato.setDate(candidato.getDate() + 7);
  return candidato;
}

export function debeEjecutar(prog, ahora = new Date()) {
  if (!prog.activa) return false;
  const desde = prog.ultimaEjecucion || prog.activadaEn;
  if (!desde) return false;
  if (ahora < proximaEjecucion(prog, desde)) return false;
  if (prog.ultimoIntento && ahora - new Date(prog.ultimoIntento.momento) < REINTENTO_MS) return false;
  return true;
}

export function crearProgramacion(archivo) {
  function leerTodo() {
    if (!existsSync(archivo)) return {};
    try {
      const d = JSON.parse(readFileSync(archivo, 'utf8'));
      return d && typeof d === 'object' ? d : {};
    } catch {
      return {};
    }
  }
  function escribir(datos) {
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(datos, null, 2), 'utf8');
  }
  return {
    leer(tarea) {
      const prog = sanitizarProgramacion(null, leerTodo()[tarea] || {});
      const desde = prog.ultimaEjecucion || prog.activadaEn;
      return { ...prog, proxima: prog.activa ? proximaEjecucion(prog, desde).toISOString() : null };
    },
    guardar(tarea, entrada) {
      const datos = leerTodo();
      datos[tarea] = sanitizarProgramacion(entrada, datos[tarea] || {});
      escribir(datos);
      return this.leer(tarea);
    },
    marcarEjecutada(tarea, resultado, momento = new Date()) {
      const datos = leerTodo();
      datos[tarea] = { ...sanitizarProgramacion(null, datos[tarea] || {}), ultimaEjecucion: momento.toISOString(), ultimoIntento: null, ultimoResultado: resultado || null };
      escribir(datos);
      return this.leer(tarea);
    },
    marcarIntento(tarea, error, momento = new Date()) {
      const datos = leerTodo();
      datos[tarea] = { ...sanitizarProgramacion(null, datos[tarea] || {}), ultimoIntento: { momento: momento.toISOString(), error: String(error || '').slice(0, 300) } };
      escribir(datos);
      return this.leer(tarea);
    },
  };
}

// tareas: { nombre: async () => resultado }. Cada tick revisa cada tarea; nunca corre dos a la vez.
export function crearProgramador({ programacion, tareas, ahora = () => new Date(), intervaloMs = INTERVALO_MS }) {
  let temporizador = null;
  const enCurso = new Set();

  async function tick() {
    for (const [nombre, tarea] of Object.entries(tareas)) {
      if (enCurso.has(nombre)) continue;
      const prog = programacion.leer(nombre);
      if (!debeEjecutar(prog, ahora())) continue;
      enCurso.add(nombre);
      try {
        const resultado = await tarea();
        programacion.marcarEjecutada(nombre, resultado, ahora());
      } catch (err) {
        programacion.marcarIntento(nombre, err.message, ahora());
      } finally {
        enCurso.delete(nombre);
      }
    }
  }

  return {
    iniciar() {
      if (temporizador) return;
      temporizador = setInterval(() => { tick().catch(() => {}); }, intervaloMs);
      temporizador.unref?.(); // no mantiene vivo el proceso por sí solo
      tick().catch(() => {});
    },
    detener() {
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
    },
    tick,
  };
}
