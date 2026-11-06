// Conversaciones con los agentes: una por área más la del orquestador.
// Cada una vive en data/conversaciones/<area>.json. Solo se aceptan áreas conocidas (evita rutas arbitrarias).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AREAS_EQUIPO } from './equipo.js';

export const ORQUESTADOR = 'orquestador';
export const AREAS_CONVERSACION = [ORQUESTADOR, ...AREAS_EQUIPO];
export const MAX_TEXTO = 2000; // lo que escribe la persona
export const MAX_TEXTO_AGENTE = 12000; // respuestas de los agentes y mensajes entre agentes: no se recortan a la mitad
const MAX_HISTORIAL = 60;

// extras: ids de agentes creados por el usuario (x-...). Solo [a-z0-9-], así nunca forman rutas raras.
export function esAreaValida(area, extras = []) {
  return AREAS_CONVERSACION.includes(area) || (typeof area === 'string' && /^x-[a-z0-9-]{1,30}$/.test(area) && extras.includes(area));
}

export function limpiarTexto(texto) {
  return typeof texto === 'string' ? texto.trim().slice(0, MAX_TEXTO) : '';
}

export function crearConversaciones(dir, obtenerExtras = () => []) {
  mkdirSync(dir, { recursive: true });
  const ruta = (area) => join(dir, `${area}.json`);
  const valida = (area) => esAreaValida(area, obtenerExtras());

  return {
    leer(area) {
      if (!valida(area) || !existsSync(ruta(area))) return [];
      try {
        const lista = JSON.parse(readFileSync(ruta(area), 'utf8'));
        return Array.isArray(lista) ? lista : [];
      } catch {
        return [];
      }
    },

    // rol: 'usuario' | 'agente'. pendiente: la orden espera a una persona porque no hay IA.
    // tipo: cómo se clasificó el mensaje del usuario (hecho, idea, concepto u orden).
    // origen: 'rutina' cuando la orden la mandó una rutina automática; 'agente' cuando el texto viene de otro agente.
    agregar(area, { rol, texto, pendiente = false, tipo = null, origen = null }) {
      if (!valida(area)) throw new Error('Área desconocida');
      const largo = rol === 'agente' || ['agente', 'sistema', 'piloto', 'rutina'].includes(origen);
      const limpio = typeof texto === 'string' ? texto.trim().slice(0, largo ? MAX_TEXTO_AGENTE : MAX_TEXTO) : '';
      if (!limpio) throw new Error('El mensaje está vacío');
      const mensaje = { rol: rol === 'agente' ? 'agente' : 'usuario', texto: limpio, momento: new Date().toISOString() };
      if (pendiente) mensaje.pendiente = true;
      if (['rutina', 'agente', 'sistema', 'piloto'].includes(origen)) mensaje.origen = origen;
      if (tipo && ['hecho', 'idea', 'concepto', 'orden'].includes(tipo)) mensaje.tipo = tipo;
      const lista = [...this.leer(area), mensaje].slice(-MAX_HISTORIAL);
      mkdirSync(dir, { recursive: true }); // la carpeta puede haberse borrado con el servidor en marcha
      writeFileSync(ruta(area), JSON.stringify(lista, null, 2), 'utf8');
      return mensaje;
    },
  };
}
