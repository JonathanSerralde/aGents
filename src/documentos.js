// Ingesta de documentos: guarda el archivo en data/documentos/ y extrae su texto para que los agentes lo analicen.
// Sin dependencias. Word (.docx) y texto se leen completos; PDF de forma parcial (texto incrustado, sin OCR);
// las imágenes no tienen texto local: se analizan con la visión del proveedor de IA cuando está activo.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { palabrasDe } from './archivo.js';

// Búsqueda en los documentos subidos: el texto de cada uno se parte en fragmentos y se devuelven los que más tienen
// que ver con la consulta, con el nombre del documento como fuente. Es por palabras, sin IA ni índices aparte.
const TAM_FRAGMENTO = 700;
export function buscarEnDocumentos(documentos, consulta, { max = 3 } = {}) {
  const terminos = palabrasDe(consulta);
  if (!terminos.length) return [];
  const candidatos = [];
  for (const d of documentos) {
    const texto = String(d?.texto || '');
    if (!texto) continue;
    // Fragmentos con traslape, para no partir una idea justo en el corte.
    for (let i = 0; i < texto.length; i += TAM_FRAGMENTO - 100) {
      const fragmento = texto.slice(i, i + TAM_FRAGMENTO);
      const palabras = new Set(palabrasDe(fragmento));
      const puntos = terminos.filter((t) => palabras.has(t)).length;
      if (puntos) candidatos.push({ fuente: d.nombre || 'documento', fragmento: fragmento.replace(/\s+/g, ' ').trim(), puntos: puntos + (palabrasDe(d.nombre || '').some((p) => terminos.includes(p)) ? 1 : 0), id: d.id, inicio: i });
    }
  }
  // Como mucho dos fragmentos por documento, para que uno largo no tape a los demás.
  const porDocumento = new Map();
  return candidatos.sort((a, b) => b.puntos - a.puntos || a.inicio - b.inicio).filter((c) => {
    const n = porDocumento.get(c.id) || 0;
    porDocumento.set(c.id, n + 1);
    return n < 2;
  }).slice(0, max).map(({ fuente, fragmento }) => ({ fuente, fragmento }));
}

export const LIMITE_DOCUMENTO = 15 * 1024 * 1024; // 15 MB
export const MAX_DOCUMENTOS = 200;
export const MAX_TEXTO = 60000; // caracteres guardados por documento
export const TIPOS = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const IMAGENES = new Set(['png', 'jpg', 'webp']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function decodificarEntidades(t) {
  return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
}

// Lector ZIP mínimo: recorre las cabeceras locales y devuelve el contenido de una entrada por nombre.
function entradaZip(buffer, nombreBuscado) {
  let pos = 0;
  while (pos + 30 <= buffer.length && buffer.readUInt32LE(pos) === 0x04034b50) {
    const metodo = buffer.readUInt16LE(pos + 8);
    const banderas = buffer.readUInt16LE(pos + 6);
    let tamComp = buffer.readUInt32LE(pos + 18);
    const tamNombre = buffer.readUInt16LE(pos + 26);
    const tamExtra = buffer.readUInt16LE(pos + 28);
    const nombre = buffer.toString('utf8', pos + 30, pos + 30 + tamNombre);
    const inicioDatos = pos + 30 + tamNombre + tamExtra;
    if (banderas & 0x8) {
      // Tamaños en el descriptor posterior: se buscan en el directorio central.
      const central = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      let c = central;
      while (c !== -1 && c + 46 <= buffer.length && buffer.readUInt32LE(c) === 0x02014b50) {
        const n = buffer.readUInt16LE(c + 28);
        if (buffer.toString('utf8', c + 46, c + 46 + n) === nombre) { tamComp = buffer.readUInt32LE(c + 20); break; }
        c += 46 + n + buffer.readUInt16LE(c + 30) + buffer.readUInt16LE(c + 32);
      }
    }
    if (nombre === nombreBuscado) {
      const datos = buffer.subarray(inicioDatos, inicioDatos + tamComp);
      return metodo === 8 ? inflateRawSync(datos) : Buffer.from(datos);
    }
    pos = inicioDatos + tamComp + ((banderas & 0x8) ? 16 : 0);
    if (banderas & 0x8 && buffer.readUInt32LE(pos - 16) !== 0x08074b50) pos -= 4; // descriptor sin firma
  }
  return null;
}

export function textoDeDocx(buffer) {
  const xml = entradaZip(buffer, 'word/document.xml');
  if (!xml) throw new Error('El archivo .docx no contiene word/document.xml');
  const s = xml.toString('utf8');
  return decodificarEntidades(
    s.replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<w:br[^>]*\/>/g, '\n').replace(/<[^>]+>/g, ''),
  ).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// PDF: extrae cadenas de los operadores de texto en los streams (solo texto incrustado con codificación estándar).
export function textoDePdf(buffer) {
  const contenido = buffer.toString('latin1');
  const partes = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  let streams = 0;
  while ((m = re.exec(contenido)) !== null && streams < 2000) {
    streams++;
    let datos = Buffer.from(m[1], 'latin1');
    try { datos = inflateSync(datos); } catch { /* sin compresión o filtro no soportado: se intenta en crudo */ }
    const s = datos.toString('latin1');
    if (!/T[Jj]/.test(s)) continue;
    const reTexto = /\((?:\\.|[^\\)])*\)\s*Tj|\[((?:\((?:\\.|[^\\)])*\)|[^\]])*)\]\s*TJ|T\*|Td|TD|'/g;
    let t;
    let linea = '';
    while ((t = reTexto.exec(s)) !== null) {
      const token = t[0];
      if (token === 'T*' || token === 'Td' || token === 'TD' || token === "'") {
        if (linea.trim()) partes.push(linea.trim());
        linea = '';
        continue;
      }
      const cadenas = token.match(/\((?:\\.|[^\\)])*\)/g) || [];
      for (const c of cadenas) {
        const limpio = c.slice(1, -1).replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\').replace(/\\n/g, ' ').replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
        linea += limpio;
      }
      if (token.endsWith('TJ')) linea += ' ';
    }
    if (linea.trim()) partes.push(linea.trim());
  }
  return partes.join('\n').replace(/[ \t]{2,}/g, ' ').trim();
}

export function extraerTexto(extension, buffer) {
  if (IMAGENES.has(extension)) return { texto: '', metodo: 'imagen' };
  if (extension === 'docx') return { texto: textoDeDocx(buffer).slice(0, MAX_TEXTO), metodo: 'docx' };
  if (extension === 'pdf') {
    const texto = textoDePdf(buffer).slice(0, MAX_TEXTO);
    return { texto, metodo: texto.length > 80 ? 'pdf' : 'pdf-sin-texto' };
  }
  return { texto: buffer.toString('utf8').slice(0, MAX_TEXTO), metodo: 'texto' };
}

export function crearDocumentos(dir) {
  mkdirSync(dir, { recursive: true });
  const rutaMeta = (id) => join(dir, `${id}.json`);

  return {
    listar() {
      if (!existsSync(dir)) return [];
      return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
        try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; }
      }).filter(Boolean).sort((a, b) => (a.creado < b.creado ? 1 : -1)).map(({ texto, ...resto }) => ({ ...resto, caracteres: (texto || '').length }));
    },

    obtener(id) {
      if (!UUID.test(id) || !existsSync(rutaMeta(id))) return null;
      try { return JSON.parse(readFileSync(rutaMeta(id), 'utf8')); } catch { return null; }
    },

    contenido(id) {
      const meta = this.obtener(id);
      if (!meta) return null;
      const ruta = join(dir, `${id}.${meta.extension}`);
      return existsSync(ruta) ? readFileSync(ruta) : null;
    },

    guardar(nombreOriginal, tipoMime, buffer) {
      const extension = TIPOS[tipoMime];
      if (!extension) throw new Error('Formato no permitido: usa PDF, Word (.docx), texto, CSV o imágenes PNG, JPG o WebP');
      if (!buffer.length) throw new Error('El archivo está vacío');
      if (buffer.length > LIMITE_DOCUMENTO) throw new Error('El documento supera 15 MB');
      if (this.listar().length >= MAX_DOCUMENTOS) throw new Error(`Máximo ${MAX_DOCUMENTOS} documentos`);
      const nombre = String(nombreOriginal || `documento.${extension}`).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
      let extraccion;
      try {
        extraccion = extraerTexto(extension, buffer);
      } catch (err) {
        extraccion = { texto: '', metodo: `error: ${err.message.slice(0, 80)}` };
      }
      const id = randomUUID();
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${id}.${extension}`), buffer);
      const meta = { id, nombre, extension, tipo: tipoMime, tam: buffer.length, creado: new Date().toISOString(), metodo: extraccion.metodo, texto: extraccion.texto, analisis: null };
      writeFileSync(rutaMeta(id), JSON.stringify(meta, null, 2), 'utf8');
      const { texto, ...resto } = meta;
      return { ...resto, caracteres: texto.length };
    },

    guardarAnalisis(id, analisis) {
      const meta = this.obtener(id);
      if (!meta) return null;
      meta.analisis = { ...analisis, momento: new Date().toISOString() };
      writeFileSync(rutaMeta(id), JSON.stringify(meta, null, 2), 'utf8');
      return meta.analisis;
    },

    borrar(id) {
      const meta = this.obtener(id);
      if (!meta) return false;
      rmSync(join(dir, `${id}.${meta.extension}`), { force: true });
      rmSync(rutaMeta(id), { force: true });
      return true;
    },

    esImagen(meta) {
      return IMAGENES.has(meta.extension);
    },
  };
}
