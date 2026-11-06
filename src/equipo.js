// Equipo de trabajo: quién responde por cada área y cómo se llama el agente que la acompaña.
// Los agentes trabajan con las personas del negocio, no las sustituyen. Vive en data/equipo.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { NOMBRES_DISTRITOS } from './diagnostico.js';
import { AGENTES_APOYO, OPCIONALES, MODOS_OPCIONAL } from './apoyo.js';

// Áreas del negocio más los agentes de apoyo: todos pueden tener responsable y nombre de agente.
export const AREAS_EQUIPO = [...Object.keys(NOMBRES_DISTRITOS), ...AGENTES_APOYO];
const MAX_TEXTO = 80;

const limpiar = (valor) => (typeof valor === 'string' ? valor.trim().slice(0, MAX_TEXTO) : '');

// Solo se conservan las áreas conocidas (más los agentes propios en extras) y tres textos cortos por área.
// opcionales: para cada agente opcional, 'auto' (según el giro y la ficha), 'si' o 'no'.
export function sanitizarEquipo(entrada, extras = []) {
  const origen = entrada && typeof entrada.areas === 'object' && entrada.areas !== null ? entrada.areas : {};
  const areas = {};
  for (const id of [...AREAS_EQUIPO, ...extras]) {
    const a = origen[id] && typeof origen[id] === 'object' ? origen[id] : {};
    areas[id] = { responsable: limpiar(a.responsable), puesto: limpiar(a.puesto), agente: limpiar(a.agente) };
  }
  const opcionales = {};
  for (const id of Object.keys(OPCIONALES)) {
    const modo = entrada?.opcionales?.[id];
    opcionales[id] = MODOS_OPCIONAL.includes(modo) ? modo : 'auto';
  }
  return { areas, opcionales };
}

export function crearEquipo(archivo, obtenerExtras = () => []) {
  return {
    leer() {
      if (!existsSync(archivo)) return sanitizarEquipo(null, obtenerExtras());
      try {
        return sanitizarEquipo(JSON.parse(readFileSync(archivo, 'utf8')), obtenerExtras());
      } catch {
        return sanitizarEquipo(null, obtenerExtras());
      }
    },

    guardar(entrada) {
      const limpio = sanitizarEquipo(entrada, obtenerExtras());
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify(limpio, null, 2), 'utf8');
      return limpio;
    },
  };
}
