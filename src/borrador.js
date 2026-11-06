// Borrador del diagnóstico: guarda lo ya respondido para no perderlo al recargar.
// Vive en data/borrador.json dentro del equipo. Solo se conservan campos conocidos del formulario.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { CAMPOS } from './formulario.js';

const IDS = new Set(CAMPOS.map((c) => c.id));
const MAX_TEXTO = 500;
const MAX_PASO = 50;

export function sanitizarBorrador(entrada) {
  const respuestas = {};
  const origen = entrada && typeof entrada.respuestas === 'object' && entrada.respuestas !== null ? entrada.respuestas : {};
  for (const [id, valor] of Object.entries(origen)) {
    if (!IDS.has(id)) continue;
    if (typeof valor === 'number' && Number.isFinite(valor)) respuestas[id] = valor;
    else if (typeof valor === 'string') respuestas[id] = valor.slice(0, MAX_TEXTO);
  }
  const paso = Number.isInteger(entrada?.paso) && entrada.paso >= 0 && entrada.paso < MAX_PASO ? entrada.paso : 0;
  return { respuestas, paso };
}

export function crearBorrador(archivo) {
  return {
    leer() {
      if (!existsSync(archivo)) return { respuestas: {}, paso: 0 };
      try {
        return sanitizarBorrador(JSON.parse(readFileSync(archivo, 'utf8')));
      } catch {
        return { respuestas: {}, paso: 0 };
      }
    },

    guardar(entrada) {
      const limpio = sanitizarBorrador(entrada);
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify(limpio), 'utf8');
      return limpio;
    },

    borrar() {
      if (existsSync(archivo)) rmSync(archivo);
    },
  };
}
