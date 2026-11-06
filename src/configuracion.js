// Configuración que el usuario edita desde la pantalla "Configuración": proveedor de IA, clave y modelo.
// Vive en data/config.json, en texto plano dentro del equipo. Tiene prioridad sobre .env cuando trae valores.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const PROVEEDORES = ['ninguno', 'anthropic', 'openai'];
const MAX_CLAVE = 300;
const MAX_MODELO = 80;
const limpiar = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Permisos que el usuario final decide desde el dashboard. Todos empiezan en "sí"; apagarlos corta esa capacidad.
export const PERMISOS = {
  ia: { nombre: 'Agentes con IA', descripcion: 'Los agentes responden con el proveedor de IA que configuraste.', sale: 'Tu orden, el contexto del área, la ficha, hechos e ideas registrados.' },
  busquedaWeb: { nombre: 'Búsqueda en internet', descripcion: 'Investigación semanal de mercado y el analista de inversiones buscan en internet con tu clave.', sale: 'Las consultas de búsqueda (giro, zona, productos, competidores). Cada búsqueda se cobra aparte.' },
  documentosIA: { nombre: 'Documentos con IA', descripcion: 'El Orquestador analiza con IA los documentos e imágenes que subes.', sale: 'El texto o la imagen del documento.' },
  tareasAutomaticas: { nombre: 'Tareas semanales automáticas', descripcion: 'Investigación de mercado y análisis del sitio corren solos cada semana.', sale: 'Lo mismo que las dos anteriores, sin que lo pidas cada vez.' },
  analizarSitio: { nombre: 'Análisis del sitio web', descripcion: 'La aplicación descarga tu página principal para revisarla.', sale: 'Una visita a tu propio sitio desde esta computadora; nada hacia la IA salvo que repartas con ella.' },
  rutinas: { nombre: 'Rutinas automáticas', descripcion: 'Órdenes repetidas que decidiste automatizar se envían solas al agente.', sale: 'La orden y su contexto, igual que si la escribieras tú.' },
  piloto: { nombre: 'Piloto automático de los agentes', descripcion: 'Cada agente hace su revisión periódica (semanal o mensual) sin que se la pidas y se coordina con los demás; el Orquestador reparte lo que detecte. Apagado hasta que lo enciendas.', sale: 'Igual que una orden tuya, una vez por periodo por cada agente activo en Agentes › Piloto.', defecto: false },
};

export function sanitizarPermisos(entrada, base = null) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const salida = {};
  for (const clave of Object.keys(PERMISOS)) {
    const v = e[clave];
    const defecto = PERMISOS[clave].defecto !== false;
    salida[clave] = v === undefined ? (base && clave in base ? base[clave] !== false : defecto) : !(v === false || v === 'false' || v === 0 || v === '0' || v === 'no');
  }
  return salida;
}

// Modo de ahorro: qué modelo atiende cada tipo de trabajo.
// equilibrado: tu chat con el modelo principal; lo automático (piloto, rutinas, consultas entre agentes) con el modelo económico.
// maximo: todo con el económico. calidad: todo con el principal.
export const MODOS_AHORRO = ['equilibrado', 'maximo', 'calidad'];
export const MODELO_ECONOMICO_ANTHROPIC = 'claude-haiku-5-5';

export function sanitizarConfiguracion(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const proveedor = PROVEEDORES.includes(e.proveedor) ? e.proveedor : 'ninguno';
  const tope = (v) => Math.min(1e9, Math.max(0, Math.round(Number(v) || 0)));
  return {
    proveedor,
    anthropicKey: limpiar(e.anthropicKey, MAX_CLAVE),
    anthropicModelo: limpiar(e.anthropicModelo, MAX_MODELO),
    anthropicModeloBusqueda: limpiar(e.anthropicModeloBusqueda, MAX_MODELO), // vacío = el económico
    anthropicModeloAutomatico: limpiar(e.anthropicModeloAutomatico, MAX_MODELO), // vacío = claude-haiku-5-5
    openaiKey: limpiar(e.openaiKey, MAX_CLAVE),
    openaiModelo: limpiar(e.openaiModelo, MAX_MODELO),
    openaiModeloAutomatico: limpiar(e.openaiModeloAutomatico, MAX_MODELO), // vacío = el mismo del chat
    modoAhorro: MODOS_AHORRO.includes(e.modoAhorro) ? e.modoAhorro : 'equilibrado',
    usarLotes: e.usarLotes === undefined ? true : !(e.usarLotes === false || e.usarLotes === 'false' || e.usarLotes === 0), // piloto por Batches (50% de descuento)
    limiteMensualTokens: tope(e.limiteMensualTokens), // 0 = sin límite
    limiteDiarioTokens: tope(e.limiteDiarioTokens), // 0 = sin límite
    permisos: sanitizarPermisos(e.permisos),
  };
}

// Oculta las claves: solo se muestran los últimos 4 caracteres.
export function enmascarar(cfg) {
  const ocultar = (k) => (k ? `••••${k.slice(-4)}` : '');
  return {
    proveedor: cfg.proveedor,
    anthropicKey: ocultar(cfg.anthropicKey),
    anthropicModelo: cfg.anthropicModelo,
    anthropicModeloBusqueda: cfg.anthropicModeloBusqueda || '',
    anthropicModeloAutomatico: cfg.anthropicModeloAutomatico || '',
    openaiKey: ocultar(cfg.openaiKey),
    openaiModelo: cfg.openaiModelo,
    openaiModeloAutomatico: cfg.openaiModeloAutomatico || '',
    modoAhorro: cfg.modoAhorro || 'equilibrado',
    usarLotes: cfg.usarLotes !== false,
    limiteMensualTokens: cfg.limiteMensualTokens || 0,
    limiteDiarioTokens: cfg.limiteDiarioTokens || 0,
    tieneClaveAnthropic: Boolean(cfg.anthropicKey),
    tieneClaveOpenAI: Boolean(cfg.openaiKey),
    permisos: sanitizarPermisos(cfg.permisos),
  };
}

export function crearConfiguracion(archivo) {
  return {
    leer() {
      if (!existsSync(archivo)) return sanitizarConfiguracion(null);
      try {
        return sanitizarConfiguracion(JSON.parse(readFileSync(archivo, 'utf8')));
      } catch {
        return sanitizarConfiguracion(null);
      }
    },

    // Una clave enmascarada o vacía en la entrada conserva la que ya estaba guardada; los permisos que no vienen, también.
    guardar(entrada) {
      const actual = this.leer();
      const nueva = sanitizarConfiguracion(entrada);
      for (const campo of ['anthropicKey', 'openaiKey']) {
        if (!nueva[campo] || nueva[campo].startsWith('••••')) nueva[campo] = actual[campo];
      }
      nueva.permisos = sanitizarPermisos(entrada?.permisos, actual.permisos);
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify(nueva, null, 2), 'utf8');
      return nueva;
    },

    // Cambia uno o varios permisos sin tocar lo demás.
    guardarPermisos(cambios) {
      const actual = this.leer();
      const cfg = { ...actual, permisos: sanitizarPermisos(cambios, actual.permisos) };
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify(cfg, null, 2), 'utf8');
      return cfg.permisos;
    },

    borrarClaves() {
      const cfg = { ...this.leer(), anthropicKey: '', openaiKey: '', proveedor: 'ninguno' };
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify(cfg, null, 2), 'utf8');
      return cfg;
    },
  };
}

// Combina la configuración base (.env y variables de entorno) con la guardada desde la pantalla.
// La guardada manda cuando trae valores; así el empresario nunca necesita tocar .env.
export function configuracionEfectiva(base, guardada) {
  const g = guardada || {};
  const activo = g.proveedor && g.proveedor !== 'ninguno';
  return {
    ...base,
    proveedor: activo ? g.proveedor : base.proveedor,
    anthropicKey: g.anthropicKey || base.anthropicKey,
    anthropicModelo: g.anthropicModelo || base.anthropicModelo,
    anthropicModeloBusqueda: g.anthropicModeloBusqueda || base.anthropicModeloBusqueda || '',
    anthropicModeloAutomatico: g.anthropicModeloAutomatico || base.anthropicModeloAutomatico || '',
    openaiKey: g.openaiKey || base.openaiKey,
    openaiModelo: g.openaiModelo || base.openaiModelo,
    openaiModeloAutomatico: g.openaiModeloAutomatico || base.openaiModeloAutomatico || '',
    modoAhorro: g.modoAhorro || 'equilibrado',
    usarLotes: g.usarLotes !== false,
    limiteMensualTokens: g.limiteMensualTokens || 0,
    limiteDiarioTokens: g.limiteDiarioTokens || 0,
    permisos: sanitizarPermisos(g.permisos),
  };
}

// Nombre del modelo que responde con la configuración dada.
export function modeloActivo(cfg) {
  if (cfg.proveedor === 'anthropic' && cfg.anthropicKey) return cfg.anthropicModelo || '';
  if (cfg.proveedor === 'openai' && cfg.openaiKey) return cfg.openaiModelo || '';
  return '';
}

// Modelo según el nivel del trabajo ('principal' = lo que pide la persona; 'automatico' = piloto, rutinas, consultas
// entre agentes; 'busqueda' = tareas con búsqueda web) y el modo de ahorro elegido.
export function modeloPara(cfg, nivel = 'principal') {
  const proveedor = cfg.proveedor;
  const principal = proveedor === 'openai' ? cfg.openaiModelo : cfg.anthropicModelo;
  const economico = proveedor === 'openai' ? (cfg.openaiModeloAutomatico || cfg.openaiModelo) : (cfg.anthropicModeloAutomatico || MODELO_ECONOMICO_ANTHROPIC);
  const busqueda = proveedor === 'openai' ? (cfg.openaiModeloAutomatico || cfg.openaiModelo) : (cfg.anthropicModeloBusqueda || economico);
  const modo = cfg.modoAhorro || 'equilibrado';
  if (modo === 'calidad') return nivel === 'busqueda' && cfg.anthropicModeloBusqueda && proveedor !== 'openai' ? cfg.anthropicModeloBusqueda : principal;
  if (modo === 'maximo') return nivel === 'busqueda' ? busqueda : economico;
  if (nivel === 'automatico') return economico;
  if (nivel === 'busqueda') return busqueda;
  return principal;
}
