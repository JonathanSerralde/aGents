// Respaldo con un clic: un .zip con todo lo que la oficina guarda de todas las empresas (diagnósticos, equipo,
// conversaciones, bitácora, juntas, documentos subidos). Se arma en este equipo y se descarga al navegador:
// no se envía a ningún lado. La clave de IA no entra (config.json se excluye), así el archivo se puede guardar
// en una memoria USB o en la nube personal del dueño sin exponerla.
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { zip } from './reporte.js';

export const DIAS_PARA_RECORDAR = 30;
export const MAX_ARCHIVOS_RESPALDO = 20000;
export const MAX_BYTES_RESPALDO = 300 * 1024 * 1024;
// Lo que nunca entra: las claves de IA y los permisos de la instalación, el pid del servidor y el propio registro de respaldos.
const EXCLUIDOS = new Set(['config.json', 'servidor.pid', 'respaldo.json']);
const DIA = 24 * 60 * 60 * 1000;

const LEEME = `Respaldo de aGents

Este archivo contiene los datos de tu negocio que guarda la aplicación: diagnósticos, equipo, conversaciones con los
agentes, bitácora, juntas y documentos subidos, de todas tus empresas. Trátalo como información privada.

No contiene tu clave de IA. Después de restaurar, vuelve a escribirla en Configuración.

Para restaurar:
1. Cierra la aplicación (Ctrl+C en su ventana, o ciérrala).
2. Abre la carpeta "data" dentro de la carpeta donde está instalada la aplicación. Si no existe, créala.
3. Copia ahí todo el contenido de este .zip, menos este archivo LEEME, y acepta reemplazar los archivos.
4. Abre la aplicación de nuevo.
`;

// Archivos de la carpeta de datos, con ruta relativa y diagonales normales. Los excluidos solo aplican en la raíz.
export function archivosDeRespaldo(raiz) {
  const lista = [];
  let bytes = 0;
  const recorrer = (dir, relativa) => {
    for (const nombre of readdirSync(dir).sort()) {
      if (!relativa && EXCLUIDOS.has(nombre)) continue;
      const ruta = join(dir, nombre);
      const info = statSync(ruta);
      const rel = relativa ? `${relativa}/${nombre}` : nombre;
      if (info.isDirectory()) recorrer(ruta, rel);
      else if (info.isFile()) {
        lista.push({ nombre: rel, ruta, bytes: info.size });
        bytes += info.size;
        if (lista.length > MAX_ARCHIVOS_RESPALDO || bytes > MAX_BYTES_RESPALDO) throw new Error('Tus datos son demasiado grandes para respaldarlos desde la aplicación: copia la carpeta "data" a mano con la aplicación cerrada');
      }
    }
  };
  if (existsSync(raiz)) recorrer(raiz, '');
  return { lista, bytes };
}

export function crearRespaldos(raiz) {
  const archivo = join(raiz, 'respaldo.json');
  const leer = () => {
    if (!existsSync(archivo)) return {};
    try { const d = JSON.parse(readFileSync(archivo, 'utf8')); return d && typeof d === 'object' ? d : {}; } catch { return {}; }
  };
  return {
    // Cuándo fue el último respaldo y si ya conviene recordarlo. Sin datos que cuidar no se recuerda nada.
    estado(ahora = new Date()) {
      const ultimo = leer().ultimo || null;
      const { lista, bytes } = archivosDeRespaldo(raiz);
      const dias = ultimo ? Math.max(0, Math.floor((ahora - new Date(ultimo)) / DIA)) : null;
      return { ultimo, dias, archivos: lista.length, bytes, recordar: lista.length > 0 && (dias === null || dias >= DIAS_PARA_RECORDAR) };
    },

    // Arma el .zip y anota la fecha. Devuelve { zip, nombre, archivos }.
    generar(ahora = new Date()) {
      const { lista } = archivosDeRespaldo(raiz);
      if (!lista.length) throw new Error('Todavía no hay datos que respaldar');
      const entradas = [{ nombre: 'LEEME.txt', datos: Buffer.from(LEEME, 'utf8') }, ...lista.map((a) => ({ nombre: a.nombre, datos: readFileSync(a.ruta) }))];
      const contenido = zip(entradas);
      mkdirSync(raiz, { recursive: true });
      writeFileSync(archivo, JSON.stringify({ ultimo: ahora.toISOString(), archivos: lista.length }, null, 2), 'utf8');
      const dos = (n) => String(n).padStart(2, '0');
      return { zip: contenido, nombre: `respaldo-agents-${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}.zip`, archivos: lista.length };
    },
  };
}
