// Monitor de consumo de IA: tokens por mes, por agente y por modelo. Vive en data/uso.json.
// Sirve para el límite mensual configurable: al alcanzarlo, las llamadas al proveedor se detienen.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const MESES_GUARDADOS = 24;

export function mesActual(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

function vacio(mes) {
  return { mes, llamadas: 0, entrada: 0, salida: 0, cacheLeido: 0, busquedas: 0, porAgente: {}, porModelo: {}, porDia: {} };
}

export const diaActual = (fecha = new Date()) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

export function crearUso(archivo) {
  function leerTodo() {
    if (!existsSync(archivo)) return { meses: {} };
    try {
      const d = JSON.parse(readFileSync(archivo, 'utf8'));
      return d && typeof d.meses === 'object' ? d : { meses: {} };
    } catch {
      return { meses: {} };
    }
  }
  function escribir(datos) {
    const claves = Object.keys(datos.meses).sort();
    for (const k of claves.slice(0, Math.max(0, claves.length - MESES_GUARDADOS))) delete datos.meses[k];
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(datos, null, 2), 'utf8');
  }

  return {
    // cacheLeido: parte de "entrada" que vino de la caché del proveedor (más barata); busquedas: búsquedas web cobradas aparte.
    registrar({ proveedor = '', modelo = '', entrada = 0, salida = 0, agente = '', cacheLeido = 0, busquedas = 0, costoUsd = null }, fecha = new Date()) {
      const datos = leerTodo();
      const mes = mesActual(fecha);
      const m = datos.meses[mes] || (datos.meses[mes] = vacio(mes));
      const e = Math.max(0, Math.round(Number(entrada) || 0));
      const s = Math.max(0, Math.round(Number(salida) || 0));
      m.llamadas += 1;
      m.entrada += e;
      m.salida += s;
      m.cacheLeido = (m.cacheLeido || 0) + Math.max(0, Math.round(Number(cacheLeido) || 0));
      m.busquedas = (m.busquedas || 0) + Math.max(0, Math.round(Number(busquedas) || 0));
      // Costo en dólares de la llamada (src/precios.js). Si el modelo no tiene precio conocido, se cuentan sus tokens aparte.
      if (typeof costoUsd === 'number' && Number.isFinite(costoUsd)) { m.costoUsd = Math.round(((m.costoUsd || 0) + Math.max(0, costoUsd)) * 1e6) / 1e6; m.conCosto = (m.conCosto || 0) + e + s; }
      else m.sinPrecio = (m.sinPrecio || 0) + e + s;
      const clave = `${proveedor}:${modelo}`;
      m.porModelo[clave] = (m.porModelo[clave] || 0) + e + s;
      if (agente) m.porAgente[agente] = (m.porAgente[agente] || 0) + e + s;
      m.porDia = m.porDia || {};
      m.porDia[diaActual(fecha)] = (m.porDia[diaActual(fecha)] || 0) + e + s;
      escribir(datos);
      return this.resumen(fecha);
    },

    resumen(fecha = new Date()) {
      const mes = mesActual(fecha);
      const m = leerTodo().meses[mes] || vacio(mes);
      return { ...m, total: m.entrada + m.salida, hoy: (m.porDia || {})[diaActual(fecha)] || 0 };
    },

    historial() {
      const { meses } = leerTodo();
      return Object.keys(meses).sort().reverse().map((k) => ({ ...meses[k], total: meses[k].entrada + meses[k].salida }));
    },
  };
}

// ¿Se alcanzó el límite mensual? limite 0 = sin límite.
export function limiteAlcanzado(resumen, limite) {
  const l = Number(limite) || 0;
  return l > 0 && resumen.total >= l;
}
