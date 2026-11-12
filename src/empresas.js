// Varias empresas en una misma instalación (para consultores y despachos): cada una tiene su propia carpeta de datos.
// La empresa "principal" usa la carpeta data/ de siempre, así una instalación existente no cambia de lugar;
// las demás viven en data/empresas/<id>/. La clave de IA y los permisos son de la instalación, no de cada empresa.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export const PRINCIPAL = 'principal';
export const MAX_EMPRESAS = 200;
const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,50}$/;

const limpiarNombre = (t) => String(t ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const aId = (nombre) => `${nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'empresa'}-${randomBytes(3).toString('hex')}`;

export function crearEmpresas(archivo, raizDatos) {
  function leer() {
    let datos = null;
    if (existsSync(archivo)) {
      try { datos = JSON.parse(readFileSync(archivo, 'utf8')); } catch { datos = null; }
    }
    const lista = Array.isArray(datos?.lista) ? datos.lista.filter((e) => e && ID_VALIDO.test(e.id)).map((e) => ({ id: e.id, nombre: limpiarNombre(e.nombre) || e.id, creada: e.creada || null })) : [];
    if (!lista.some((e) => e.id === PRINCIPAL)) lista.unshift({ id: PRINCIPAL, nombre: 'Empresa principal', creada: null });
    const activa = lista.some((e) => e.id === datos?.activa) ? datos.activa : PRINCIPAL;
    return { activa, lista };
  }
  function escribir(datos) {
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(datos, null, 2), 'utf8');
    return datos;
  }
  const dirDe = (id) => (id === PRINCIPAL ? raizDatos : join(raizDatos, 'empresas', id));

  return {
    leer,
    dirDe,
    dirActiva: () => dirDe(leer().activa),

    crear(nombre) {
      const limpio = limpiarNombre(nombre);
      if (!limpio) throw new Error('Escribe el nombre de la empresa');
      const datos = leer();
      if (datos.lista.length >= MAX_EMPRESAS) throw new Error(`Máximo ${MAX_EMPRESAS} empresas por instalación`);
      const empresa = { id: aId(limpio), nombre: limpio, creada: new Date().toISOString() };
      mkdirSync(dirDe(empresa.id), { recursive: true });
      escribir({ ...datos, lista: [...datos.lista, empresa] });
      return empresa;
    },

    renombrar(id, nombre) {
      const limpio = limpiarNombre(nombre);
      const datos = leer();
      const empresa = datos.lista.find((e) => e.id === id);
      if (!empresa || !limpio) return null;
      empresa.nombre = limpio;
      escribir(datos);
      return empresa;
    },

    // Cambia la empresa activa. Devuelve null si el id no existe.
    activar(id) {
      const datos = leer();
      if (!datos.lista.some((e) => e.id === id)) return null;
      escribir({ ...datos, activa: id });
      return id;
    },
  };
}
