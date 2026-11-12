// Agentes creados por el usuario desde la pantalla. Viven en data/agentes.json.
// Cada uno tiene su habilidad (igual que los agentes del proyecto) y la lista de áreas que puede ver.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { NOMBRES_DISTRITOS } from './diagnostico.js';

export const PREFIJO = 'x-'; // evita choques con los ids de áreas y agentes del proyecto
export const MAX_AGENTES = 20;
const MAX_TEXTO = 200;
const MAX_LISTA = 8;
const AREAS = Object.keys(NOMBRES_DISTRITOS);
const ID_VALIDO = /^x-[a-z0-9-]{1,30}$/;

export const AVATARES_PERMITIDOS = Array.from({ length: 14 }, (_, i) => `assets/avatares/avatar-${String(i + 1).padStart(2, '0')}.png`);

export function esIdPersonalizado(id) {
  return ID_VALIDO.test(id);
}

export function slug(nombre) {
  const base = String(nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return PREFIJO + (base || 'agente');
}

const texto = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_TEXTO) : '');
const lista = (v) => {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [];
  return arr.map(texto).filter(Boolean).slice(0, MAX_LISTA);
};

export function sanitizarAgente(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const nombre = texto(e.nombre);
  if (nombre.length < 2) throw new Error('El agente necesita un nombre de al menos 2 letras');
  const areasEntrada = Array.isArray(e.areas) ? e.areas : [];
  const areas = areasEntrada.includes('todas') ? ['todas'] : areasEntrada.filter((a) => AREAS.includes(a));
  return {
    nombre,
    rol: texto(e.rol),
    especialidad: texto(e.especialidad),
    pregunta_primero: lista(e.pregunta_primero),
    marcos: lista(e.marcos),
    acciones: lista(e.acciones),
    limites: lista(e.limites),
    areas: areas.length ? areas : ['todas'],
    avatar: AVATARES_PERMITIDOS.includes(e.avatar) ? e.avatar : '',
  };
}

export function crearPersonalizados(archivo) {
  function escribir(datos) {
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(datos, null, 2), 'utf8');
  }

  // Propuestas del Coordinador ("Optimizar agentes"): agentes nuevos que no se crean hasta que el usuario acepta.
  const MAX_PROPUESTAS = 6;
  function leerPropuestas() {
    if (!existsSync(archivo)) return [];
    try {
      const d = JSON.parse(readFileSync(archivo, 'utf8'));
      return (Array.isArray(d?.propuestas) ? d.propuestas : []).map((p) => {
        try { return { ...sanitizarAgente(p), motivo: texto(p.motivo), momento: p.momento || '' }; } catch { return null; }
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  return {
    leer() {
      if (!existsSync(archivo)) return { agentes: {} };
      try {
        const d = JSON.parse(readFileSync(archivo, 'utf8'));
        const agentes = {};
        for (const [id, a] of Object.entries(d?.agentes || {})) {
          if (!esIdPersonalizado(id)) continue;
          try { agentes[id] = sanitizarAgente(a); } catch { /* entrada corrupta: se omite */ }
        }
        return { agentes };
      } catch {
        return { agentes: {} };
      }
    },

    propuestas: leerPropuestas,

    // Sustituye las propuestas pendientes por las nuevas (sin repetir nombres ya existentes como agente).
    proponer(lista) {
      const datos = { ...this.leer(), propuestas: [] };
      const existentes = new Set(Object.values(datos.agentes).map((a) => a.nombre.toLowerCase()));
      for (const p of lista.slice(0, MAX_PROPUESTAS)) {
        try {
          const agente = sanitizarAgente(p);
          if (existentes.has(agente.nombre.toLowerCase())) continue;
          datos.propuestas.push({ ...agente, motivo: texto(p.motivo), momento: new Date().toISOString() });
        } catch { /* propuesta sin nombre: se omite */ }
      }
      escribir(datos);
      return datos.propuestas;
    },

    aceptarPropuesta(indice) {
      const propuestas = leerPropuestas();
      const p = propuestas[indice];
      if (!p) return null;
      const creado = this.guardar(p);
      const restantes = propuestas.filter((_, i) => i !== indice);
      escribir({ ...this.leer(), propuestas: restantes });
      return creado;
    },

    rechazarPropuesta(indice) {
      const propuestas = leerPropuestas();
      if (!propuestas[indice]) return false;
      escribir({ ...this.leer(), propuestas: propuestas.filter((_, i) => i !== indice) });
      return true;
    },

    ids() {
      return Object.keys(this.leer().agentes);
    },

    obtener(id) {
      return this.leer().agentes[id] || null;
    },

    // Sin id crea uno nuevo (id derivado del nombre); con id actualiza el existente.
    guardar(entrada, id = null) {
      const datos = { ...this.leer(), propuestas: leerPropuestas() };
      const agente = sanitizarAgente(entrada);
      let clave = id;
      if (clave) {
        if (!datos.agentes[clave]) throw new Error('Ese agente no existe');
      } else {
        if (Object.keys(datos.agentes).length >= MAX_AGENTES) throw new Error(`Máximo ${MAX_AGENTES} agentes propios`);
        clave = slug(agente.nombre);
        let n = 2;
        while (datos.agentes[clave]) clave = `${slug(agente.nombre).slice(0, 27)}-${n++}`;
      }
      datos.agentes[clave] = agente;
      escribir(datos);
      return { id: clave, ...agente };
    },

    borrar(id) {
      const datos = { ...this.leer(), propuestas: leerPropuestas() };
      if (!datos.agentes[id]) return false;
      delete datos.agentes[id];
      escribir(datos);
      return true;
    },
  };
}
