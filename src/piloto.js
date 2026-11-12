// Piloto automático: cada agente tiene una revisión periódica propia que hace sin que nadie se la pida
// (Finanzas revisa caja y cobranza cada semana, Fiscal el calendario del mes, el Orquestador reparte lo que detecte…).
// El usuario decide qué agentes van en piloto, con qué frecuencia, día y hora, y puede editar la tarea de cada uno.
// Vive en data/piloto.json. Apagado por defecto (permiso "piloto" en Accesos y permisos) para no gastar sin permiso.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { HABILIDADES } from './habilidades.js';
import { NOMBRES_DISTRITOS } from './diagnostico.js';
import { nombreDe, tipoDe } from './jerarquia.js';
import { proximaCorrida, FRECUENCIAS } from './rutinas.js';

export const MAX_POR_TICK = 3; // corridas por minuto como máximo: reparte el gasto y evita ráfagas
const AREAS = Object.keys(NOMBRES_DISTRITOS);
// Día de la semana por defecto para cada área, repartido de lunes a viernes para no concentrar el gasto.
const DIA_POR_AREA = { direccion: 1, finanzas: 1, ventas: 2, marketing: 2, compras: 3, operaciones: 3, rh: 4, tecnologia: 4, fiscal: 5, riesgos: 5, crecimiento: 1, orquestador: 1 };

export const TAREA_GENERICA = 'Es tu revisión periódica automática. Con el contexto que tienes (diagnóstico, ficha, sector, hechos registrados, investigación de mercado, análisis del sitio, agenda y tus acciones abiertas): 1) di en dos líneas cómo está tu área hoy; 2) revisa tus acciones abiertas y vencidas y di cuáles avanzar o cerrar; 3) propón como máximo tres acciones concretas para el periodo con responsable y plazo (ACCIONES); 4) si descubriste algo que le sirve a otra área, usa INFORMAR; si te falta un dato de otro agente, usa CONSULTAR (máximo uno). No repitas acciones que ya están abiertas ni inventes datos: si falta información, pide el dato en una pregunta concreta.';

const TAREAS_ORQUESTADOR = 'Es tu ciclo periódico automático como Orquestador. Revisa el estado completo del negocio (semáforo, contradicciones del motor, prioridad calculada, acciones abiertas y vencidas de la memoria, hechos e ideas nuevos, última investigación de mercado, análisis del sitio y agenda). Escribe un informe corto para el dueño: 1) tres cosas que cambiaron o urgen; 2) acciones vencidas y a quién reasignarlas; 3) qué área necesita trabajo ahora. Luego reparte con DELEGAR (máximo cuatro encargos, solo lo que de verdad haga falta) a los agentes que deban actuar, citando el dato que lo motiva. Termina con el siguiente paso que el dueño debe decidir.';

// Tarea periódica de un agente: la de su habilidad si la tiene, o la genérica.
export function tareaDe(id, propios = {}) {
  if (id === 'orquestador') return TAREAS_ORQUESTADOR;
  const h = HABILIDADES[id] || propios[id];
  return h?.piloto?.tarea || TAREA_GENERICA;
}

export function frecuenciaDe(id, propios = {}) {
  const h = HABILIDADES[id] || propios[id];
  return FRECUENCIAS.includes(h?.piloto?.frecuencia) ? h.piloto.frecuencia : 'semanal';
}

// Configuración por defecto: áreas y Orquestador encendidos (cuando el piloto global está activo), el resto apagado.
export function defectosDe(id, propios = {}) {
  const tipo = tipoDe(id, propios);
  return {
    activo: id === 'orquestador' || tipo === 'area',
    frecuencia: frecuenciaDe(id, propios),
    diaSemana: DIA_POR_AREA[id] ?? ((AREAS.indexOf(id) + 5) % 5) + 1,
    diaMes: 1,
    hora: 8,
    tarea: '',
  };
}

export function sanitizarPiloto(entrada, base) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const num = (v, min, max, def) => (Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : def);
  return {
    activo: e.activo === undefined ? base.activo : !(e.activo === false || e.activo === 'false' || e.activo === 0),
    frecuencia: FRECUENCIAS.includes(e.frecuencia) ? e.frecuencia : base.frecuencia,
    diaSemana: num(e.diaSemana, 0, 6, base.diaSemana),
    diaMes: num(e.diaMes, 1, 28, base.diaMes),
    hora: num(e.hora, 0, 23, base.hora),
    tarea: typeof e.tarea === 'string' ? e.tarea.trim().slice(0, 2000) : base.tarea || '',
    ultimaEjecucion: base.ultimaEjecucion || null,
    ultimoResultado: base.ultimoResultado || null,
    creada: base.creada || new Date().toISOString(),
  };
}

export function crearPiloto(archivo) {
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
    // Configuración efectiva de un agente (guardada sobre defectos), con su próxima corrida.
    // "momento" (opcional) es desde cuándo cuenta un agente que aún no tiene nada guardado (por defecto, ahora mismo).
    de(id, propios = {}, momento = new Date()) {
      const todo = leerTodo();
      const guardado = todo[id];
      // Un agente que nunca se ha guardado cuenta desde que se encendió el piloto, no desde "ahora" en cada lectura
      // (antes su próxima revisión siempre quedaba en el futuro y no corría nunca).
      if (todo._encendido && momento.toISOString() > todo._encendido) momento = new Date(todo._encendido);
      // Los defectos dan la configuración; lo guardado aporta además su historial (creada, última corrida, resultado).
      const base = { ...defectosDe(id, propios), creada: guardado?.creada, ultimaEjecucion: guardado?.ultimaEjecucion || null, ultimoResultado: guardado?.ultimoResultado || null };
      const cfg = guardado ? sanitizarPiloto(guardado, base) : sanitizarPiloto(null, { ...base, creada: momento.toISOString() });
      return { id, nombre: nombreDe(id, propios), tipo: tipoDe(id, propios), ...cfg, tareaEfectiva: cfg.tarea || tareaDe(id, propios), proxima: cfg.activo ? proximaCorrida(cfg, cfg.ultimaEjecucion || cfg.creada).toISOString() : null };
    },
    // Marca el momento en que el usuario enciende el piloto: desde ahí cuentan los agentes sin configuración propia.
    encender(momento = new Date()) {
      const datos = leerTodo();
      datos._encendido = momento.toISOString();
      escribir(datos);
      return datos._encendido;
    },
    // Para instalaciones que ya tenían el piloto encendido antes de existir la marca.
    asegurarEncendido(momento = new Date()) {
      return leerTodo()._encendido || this.encender(momento);
    },
    listar(ids, propios = {}, momento = new Date()) {
      return ids.map((id) => this.de(id, propios, momento));
    },
    // "momento" (opcional) sella la fecha de alta la primera vez que se guarda; las pruebas lo pasan para no depender del reloj real.
    guardar(id, cambios, propios = {}, momento = new Date()) {
      const datos = leerTodo();
      const actual = this.de(id, propios, momento);
      datos[id] = sanitizarPiloto(cambios, actual);
      escribir(datos);
      return this.de(id, propios);
    },
    // Agentes activos a los que ya les tocó, en orden de la corrida más atrasada.
    vencidos(ids, ahora = new Date(), propios = {}) {
      return this.listar(ids, propios, ahora)
        .filter((p) => p.activo && new Date(p.proxima) <= ahora)
        .sort((a, b) => a.proxima.localeCompare(b.proxima));
    },
    marcarEjecutado(id, resultado, momento = new Date(), propios = {}) {
      const datos = leerTodo();
      const actual = this.de(id, propios);
      datos[id] = { ...sanitizarPiloto(null, actual), ultimaEjecucion: momento.toISOString(), ultimoResultado: resultado ? String(resultado).slice(0, 300) : null };
      escribir(datos);
      return this.de(id, propios);
    },
  };
}
