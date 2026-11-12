// Configuración que el usuario edita desde la pantalla "Configuración": proveedor de IA, clave y modelo.
// Vive en data/config.json, en texto plano dentro del equipo. Tiene prioridad sobre .env cuando trae valores.
import { proteger, revelar, estaProtegida } from './boveda.js';
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
  documentosIA: { nombre: 'Documentos con IA', descripcion: 'El Coordinador analiza con IA los documentos e imágenes que subes.', sale: 'El texto o la imagen del documento.' },
  tareasAutomaticas: { nombre: 'Tareas semanales automáticas', descripcion: 'Investigación de mercado y análisis del sitio corren solos cada semana.', sale: 'Lo mismo que las dos anteriores, sin que lo pidas cada vez.' },
  analizarSitio: { nombre: 'Análisis del sitio web', descripcion: 'La aplicación descarga tu página principal para revisarla.', sale: 'Una visita a tu propio sitio desde esta computadora; nada hacia la IA salvo que repartas con ella.' },
  rutinas: { nombre: 'Rutinas automáticas', descripcion: 'Órdenes repetidas que decidiste automatizar se envían solas al agente.', sale: 'La orden y su contexto, igual que si la escribieras tú.' },
  piloto: { nombre: 'Piloto automático de los agentes', descripcion: 'Cada agente hace su revisión periódica (semanal o mensual) sin que se la pidas y se coordina con los demás; el Coordinador reparte lo que detecte. Apagado hasta que lo enciendas.', sale: 'Igual que una orden tuya, una vez por periodo por cada agente activo en Agentes › Piloto.', defecto: false },
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
  const decimal = (v, max) => Math.min(max, Math.max(0, Math.round((Number(v) || 0) * 10000) / 10000));
  return {
    proveedor,
    anthropicKey: limpiar(e.anthropicKey, MAX_CLAVE),
    anthropicModelo: limpiar(e.anthropicModelo, MAX_MODELO),
    anthropicModeloBusqueda: limpiar(e.anthropicModeloBusqueda, MAX_MODELO), // vacío = el económico
    anthropicModeloAutomatico: limpiar(e.anthropicModeloAutomatico, MAX_MODELO), // vacío = claude-haiku-5-5
    revisionIA: e.revisionIA === 'nunca' ? 'nunca' : 'importante', // revisar la respuesta antes de entregarla
    herramientasIA: e.herramientasIA === 'no' ? 'no' : 'si', // los agentes pueden pedir cálculos y búsquedas locales
    anthropicModeloExperto: limpiar(e.anthropicModeloExperto, MAX_MODELO), // vacío = sin modelo mayor: todos usan el principal
    agentesExpertos: (Array.isArray(e.agentesExpertos) ? e.agentesExpertos : []).map((x) => String(x)).filter((x) => /^[a-z][a-z0-9-]{1,40}$/.test(x)).slice(0, 12), // quiénes lo usan
    openaiKey: limpiar(e.openaiKey, MAX_CLAVE),
    openaiModelo: limpiar(e.openaiModelo, MAX_MODELO),
    openaiModeloAutomatico: limpiar(e.openaiModeloAutomatico, MAX_MODELO), // vacío = el mismo del chat
    modoAhorro: MODOS_AHORRO.includes(e.modoAhorro) ? e.modoAhorro : 'equilibrado',
    usarLotes: e.usarLotes === undefined ? true : !(e.usarLotes === false || e.usarLotes === 'false' || e.usarLotes === 0), // piloto por Batches (50% de descuento)
    limiteMensualTokens: tope(e.limiteMensualTokens), // 0 = sin límite
    limiteMensualPesos: decimal(e.limiteMensualPesos, 10000000), // tope de gasto del mes en pesos; 0 = sin tope
    limiteDiarioTokens: tope(e.limiteDiarioTokens), // 0 = sin límite
    tipoCambio: decimal(e.tipoCambio, 1000), // pesos por dólar; 0 = el sugerido (src/precios.js)
    precioEntradaUsd: decimal(e.precioEntradaUsd, 10000), // dólares por millón de tokens; 0 = precio de lista
    precioSalidaUsd: decimal(e.precioSalidaUsd, 10000),
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
    anthropicModeloExperto: cfg.anthropicModeloExperto || '',
    revisionIA: cfg.revisionIA === 'nunca' ? 'nunca' : 'importante',
    herramientasIA: cfg.herramientasIA === 'no' ? 'no' : 'si',
    agentesExpertos: cfg.agentesExpertos || [],
    openaiKey: ocultar(cfg.openaiKey),
    openaiModelo: cfg.openaiModelo,
    openaiModeloAutomatico: cfg.openaiModeloAutomatico || '',
    modoAhorro: cfg.modoAhorro || 'equilibrado',
    usarLotes: cfg.usarLotes !== false,
    limiteMensualTokens: cfg.limiteMensualTokens || 0,
    limiteMensualPesos: cfg.limiteMensualPesos || 0,
    limiteDiarioTokens: cfg.limiteDiarioTokens || 0,
    tipoCambio: cfg.tipoCambio || 0,
    precioEntradaUsd: cfg.precioEntradaUsd || 0,
    precioSalidaUsd: cfg.precioSalidaUsd || 0,
    tieneClaveAnthropic: Boolean(cfg.anthropicKey),
    tieneClaveOpenAI: Boolean(cfg.openaiKey),
    permisos: sanitizarPermisos(cfg.permisos),
  };
}

// Con `proteger`, las claves se guardan cifradas (boveda.js) y se descifran al leer; el resto del programa
// siempre las ve en claro. Una clave que ya estaba en texto plano se cifra la próxima vez que se guarde algo.
export function crearConfiguracion(archivo, { proteger: protegerClaves = false } = {}) {
  const CLAVES = ['anthropicKey', 'openaiKey'];
  function escribir(cfg, { borrar = false } = {}) {
    const enDisco = { ...cfg };
    if (protegerClaves) {
      let previo = {};
      try { previo = JSON.parse(readFileSync(archivo, 'utf8')); } catch { previo = {}; }
      for (const campo of CLAVES) {
        // Si una clave cifrada no se pudo leer (fallo pasajero), se conserva tal cual en disco en vez de borrarla.
        if (!cfg[campo] && !borrar && estaProtegida(previo?.[campo])) enDisco[campo] = previo[campo];
        else enDisco[campo] = proteger(cfg[campo]);
      }
    }
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(enDisco, null, 2), 'utf8');
  }
  return {
    leer() {
      if (!existsSync(archivo)) return sanitizarConfiguracion(null);
      try {
        const crudo = JSON.parse(readFileSync(archivo, 'utf8'));
        for (const campo of CLAVES) if (estaProtegida(crudo?.[campo])) crudo[campo] = revelar(crudo[campo]);
        return sanitizarConfiguracion(crudo);
      } catch {
        return sanitizarConfiguracion(null);
      }
    },

    // Cifra en disco una clave que estaba en texto plano. Devuelve true si cambió algo.
    protegerExistentes() {
      if (!protegerClaves || !existsSync(archivo)) return false;
      let crudo;
      try { crudo = JSON.parse(readFileSync(archivo, 'utf8')); } catch { return false; }
      if (!CLAVES.some((c) => crudo?.[c] && !estaProtegida(crudo[c]))) return false;
      escribir(this.leer());
      return true;
    },

    // Una clave enmascarada o vacía en la entrada conserva la que ya estaba guardada; los permisos que no vienen, también.
    guardar(entrada) {
      const actual = this.leer();
      const nueva = sanitizarConfiguracion(entrada);
      for (const campo of ['anthropicKey', 'openaiKey']) {
        if (!nueva[campo] || nueva[campo].startsWith('••••')) nueva[campo] = actual[campo];
      }
      nueva.permisos = sanitizarPermisos(entrada?.permisos, actual.permisos);
      escribir(nueva);
      return nueva;
    },

    // Cambia solo los límites de consumo (tope en pesos y límites por tokens) sin tocar lo demás.
    guardarLimites(cambios) {
      const actual = this.leer();
      const limpio = sanitizarConfiguracion(cambios);
      const cfg = { ...actual };
      for (const campo of ['limiteMensualPesos', 'limiteMensualTokens', 'limiteDiarioTokens']) {
        if (cambios && Object.hasOwn(cambios, campo)) cfg[campo] = limpio[campo];
      }
      escribir(cfg);
      return cfg;
    },

    // Cambia uno o varios permisos sin tocar lo demás.
    guardarPermisos(cambios) {
      const actual = this.leer();
      const cfg = { ...actual, permisos: sanitizarPermisos(cambios, actual.permisos) };
      escribir(cfg);
      return cfg.permisos;
    },

    borrarClaves() {
      const cfg = { ...this.leer(), anthropicKey: '', openaiKey: '', proveedor: 'ninguno' };
      escribir(cfg, { borrar: true });
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
    anthropicModeloExperto: g.anthropicModeloExperto || '',
    revisionIA: g.revisionIA === 'nunca' ? 'nunca' : 'importante',
    herramientasIA: g.herramientasIA === 'no' ? 'no' : 'si',
    agentesExpertos: g.agentesExpertos || [],
    openaiKey: g.openaiKey || base.openaiKey,
    openaiModelo: g.openaiModelo || base.openaiModelo,
    openaiModeloAutomatico: g.openaiModeloAutomatico || base.openaiModeloAutomatico || '',
    modoAhorro: g.modoAhorro || 'equilibrado',
    usarLotes: g.usarLotes !== false,
    limiteMensualTokens: g.limiteMensualTokens || 0,
    limiteMensualPesos: g.limiteMensualPesos || 0,
    limiteDiarioTokens: g.limiteDiarioTokens || 0,
    tipoCambio: g.tipoCambio || 0,
    precioEntradaUsd: g.precioEntradaUsd || 0,
    precioSalidaUsd: g.precioSalidaUsd || 0,
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
  // 'experto': el modelo mayor que el dueño reservó para ciertos agentes; sin él, el principal.
  if (nivel === 'experto') return proveedor !== 'openai' && cfg.anthropicModeloExperto ? cfg.anthropicModeloExperto : principal;
  if (nivel === 'automatico') return economico;
  if (nivel === 'busqueda') return busqueda;
  return principal;
}
