// Reportes para personas: Word (.docx) y página imprimible (para "Guardar como PDF" desde el navegador).
// Sin dependencias: el .docx se arma como ZIP propio con los XML mínimos que Word, Pages y LibreOffice aceptan.
import { deflateRawSync, crc32 } from 'node:zlib';
import { NOMBRES_DISTRITOS } from './diagnostico.js';

const ETIQUETA = { verde: 'Bien', amarillo: 'Revisar', rojo: 'Atención', sin_datos: 'Sin datos' };
const PUNTAJE = { verde: 5, amarillo: 3, rojo: 1.5 };

function fechaLarga(iso) {
  return new Date(iso || Date.now()).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function madurez(distritos) {
  const puntos = Object.values(distritos).map((d) => PUNTAJE[d.color]).filter((p) => p !== undefined);
  return puntos.length ? Math.round((puntos.reduce((a, b) => a + b, 0) / puntos.length) * 10) / 10 : 0;
}

// ---- Contenido del reporte, independiente del formato ----
// Devuelve bloques: { tipo: 'titulo'|'subtitulo'|'parrafo'|'vineta'|'nota', texto }
export function contenidoReporte(registro, equipo, marca) {
  const r = registro.resultado;
  const nombre = marca?.nombre || registro.contacto_nombre || 'Tu negocio';
  const responsable = (id) => equipo?.areas?.[id]?.responsable || 'Dueño';
  const cuenta = { rojo: 0, amarillo: 0, verde: 0, sin_datos: 0 };
  for (const d of Object.values(r.distritos)) cuenta[d.color]++;
  const b = [];
  const push = (tipo, texto) => b.push({ tipo, texto });

  push('titulo', `Diagnóstico de ${nombre}`);
  push('parrafo', `Generado el ${fechaLarga(registro.creado)}. Giro: ${registro.datos?.giro || 'sin especificar'}.`);

  push('subtitulo', 'Resumen');
  push('parrafo', `Nivel de madurez: ${madurez(r.distritos)} de 5. Áreas en atención: ${cuenta.rojo}. Por revisar: ${cuenta.amarillo}. Bien: ${cuenta.verde}. Sin datos: ${cuenta.sin_datos}.`);
  const prioridades = r.prioridad.map((id) => r.distritos[id].nombre);
  push('parrafo', prioridades.length ? `Atender primero: ${prioridades.join(', ')}.` : 'Sin prioridades críticas con las respuestas actuales.');

  push('subtitulo', 'Plan de acción');
  if (!r.plan.length) push('parrafo', 'No hay acciones pendientes.');
  const plazos = [...new Set(r.plan.map((p) => p.plazo))];
  for (const plazo of plazos) {
    push('parrafo', `Plazo: ${plazo}`);
    for (const p of r.plan.filter((x) => x.plazo === plazo)) push('vineta', `${p.nombre}: ${p.accion} Responsable: ${responsable(p.distrito)}.`);
  }

  if (r.cruzados?.length) {
    push('subtitulo', 'Contradicciones entre áreas');
    for (const c of r.cruzados) push('vineta', `${c.nombre}: ${c.texto} Acción: ${c.accion}`);
  }

  if (r.crecimiento) {
    const c = r.crecimiento;
    push('subtitulo', 'Motor de crecimiento');
    push('parrafo', c.bloqueos?.length
      ? `Antes de crecer conviene resolver: ${c.bloqueos.join(', ')}.`
      : (c.meta ? 'Base lista para crecer: finanzas, dirección y operaciones fuera de atención.' : 'Sin respuestas de crecimiento.'));
    push('parrafo', `Eje vertical (vender más al mercado actual): ${c.vertical.nivel} de ${c.vertical.max}. Eje horizontal (nuevos mercados): ${c.horizontal.nivel} de ${c.horizontal.max}.`);
    for (const f of [...c.vertical.faltantes, ...c.horizontal.faltantes]) push('vineta', f);
  }

  push('subtitulo', 'Estado por área');
  const orden = { rojo: 0, amarillo: 1, verde: 2, sin_datos: 3 };
  for (const [id, d] of Object.entries(r.distritos).sort(([, a], [, bb]) => orden[a.color] - orden[bb.color])) {
    push('parrafo', `${d.nombre} — ${ETIQUETA[d.color]}. Responsable: ${responsable(id)}. Agente: ${equipo?.areas?.[id]?.agente || `Agente de ${NOMBRES_DISTRITOS[id] || id}`}.`);
    for (const h of d.hallazgos) push('vineta', h);
    if (!d.hallazgos.length) push('vineta', d.color === 'sin_datos' ? 'Sin respuestas en esta área.' : 'Sin hallazgos.');
  }

  if (registro.resumenIA?.texto) {
    push('subtitulo', 'Plan sugerido por el asistente de IA');
    for (const linea of registro.resumenIA.texto.split('\n').map((l) => l.trim()).filter(Boolean)) push('parrafo', linea);
  }

  push('subtitulo', 'Sobre este reporte');
  push('nota', 'El semáforo y el plan salen de reglas de arranque pensadas para pymes mexicanas; no sustituyen la revisión de un contador, un abogado o un consultor. Este reporte se generó en el equipo del usuario y no se envió a ningún servidor.');
  return b;
}

// ---- DOCX ----
const xmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parrafoXml(texto, { negrita = false, tam = 22, vineta = false, color = null, espacio = 120 } = {}) {
  const rpr = `<w:rPr>${negrita ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${tam}"/></w:rPr>`;
  const ind = vineta ? '<w:ind w:left="480" w:hanging="240"/>' : '';
  return `<w:p><w:pPr><w:spacing w:after="${espacio}"/>${ind}</w:pPr><w:r>${rpr}<w:t xml:space="preserve">${vineta ? '• ' : ''}${xmlEsc(texto)}</w:t></w:r></w:p>`;
}

function documentoXml(bloques) {
  const cuerpo = bloques.map((b) => {
    if (b.tipo === 'titulo') return parrafoXml(b.texto, { negrita: true, tam: 40, color: '1F3B6B', espacio: 240 });
    if (b.tipo === 'subtitulo') return parrafoXml(b.texto, { negrita: true, tam: 28, color: '1F3B6B', espacio: 160 });
    if (b.tipo === 'vineta') return parrafoXml(b.texto, { vineta: true, espacio: 60 });
    if (b.tipo === 'nota') return parrafoXml(b.texto, { tam: 18, color: '666666' });
    return parrafoXml(b.texto);
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200"/></w:sectPr></w:body></w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

// Escritor ZIP mínimo (método deflate), suficiente para un .docx.
function zip(entradas) {
  const locales = [];
  const centrales = [];
  let offset = 0;
  const fechaDos = 0x5000 | (1 << 5) | 1; // 2020-01-01 (los lectores no la usan)
  for (const { nombre, datos } of entradas) {
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const comprimido = deflateRawSync(datos);
    const crc = crc32(datos) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(fechaDos, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18); local.writeUInt32LE(datos.length, 22); local.writeUInt16LE(nombreBuf.length, 26); local.writeUInt16LE(0, 28);
    locales.push(local, nombreBuf, comprimido);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12); central.writeUInt16LE(fechaDos, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(datos.length, 24); central.writeUInt16LE(nombreBuf.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centrales.push(central, nombreBuf);
    offset += local.length + nombreBuf.length + comprimido.length;
  }
  const tamCentral = centrales.reduce((s, b) => s + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(0, 4); fin.writeUInt16LE(0, 6); fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10); fin.writeUInt32LE(tamCentral, 12); fin.writeUInt32LE(offset, 16); fin.writeUInt16LE(0, 20);
  return Buffer.concat([...locales, ...centrales, fin]);
}

// Cualquier lista de bloques (diagnóstico, investigación de mercado, análisis del sitio) se vuelve un .docx.
export function docxDesdeBloques(bloques) {
  return zip([
    { nombre: '[Content_Types].xml', datos: Buffer.from(CONTENT_TYPES, 'utf8') },
    { nombre: '_rels/.rels', datos: Buffer.from(RELS, 'utf8') },
    { nombre: 'word/document.xml', datos: Buffer.from(documentoXml(bloques), 'utf8') },
  ]);
}

export function generarDocx(registro, equipo, marca) {
  return docxDesdeBloques(contenidoReporte(registro, equipo, marca));
}

// ---- Página imprimible (el navegador la convierte a PDF con "Imprimir → Guardar como PDF") ----
const htmlEsc = xmlEsc;

export function generarHtml(registro, equipo, marca) {
  return htmlDesdeBloques(contenidoReporte(registro, equipo, marca));
}

export function htmlDesdeBloques(bloques) {
  const cuerpo = bloques.map((b) => {
    if (b.tipo === 'titulo') return `<h1>${htmlEsc(b.texto)}</h1>`;
    if (b.tipo === 'subtitulo') return `<h2>${htmlEsc(b.texto)}</h2>`;
    if (b.tipo === 'vineta') return `<li>${htmlEsc(b.texto)}</li>`;
    if (b.tipo === 'nota') return `<p class="nota">${htmlEsc(b.texto)}</p>`;
    return `<p>${htmlEsc(b.texto)}</p>`;
  }).join('\n').replace(/(<li>.*?<\/li>\n?)+/gs, (m) => `<ul>\n${m}</ul>\n`);
  const titulo = bloques[0]?.texto || 'Reporte';
  return `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${htmlEsc(titulo)}</title>
<style>
body{font:11pt/1.5 Georgia,"Times New Roman",serif;color:#1d232b;max-width:800px;margin:32px auto;padding:0 24px;background:#fff}
h1{font:700 24pt system-ui,sans-serif;color:#1f3b6b;margin:0 0 6px}h2{font:700 15pt system-ui,sans-serif;color:#1f3b6b;margin:26px 0 8px;border-bottom:1px solid #d7deea;padding-bottom:4px}
p{margin:6px 0}ul{margin:4px 0 10px 22px;padding:0}li{margin:3px 0}.nota{font-size:9pt;color:#666}
.barra{position:sticky;top:0;background:#fff;padding:12px 0;border-bottom:1px solid #d7deea;margin-bottom:16px;display:flex;gap:10px;align-items:center;font-family:system-ui,sans-serif}
.barra button{font:600 11pt system-ui,sans-serif;padding:8px 16px;border-radius:8px;border:0;background:#1f3b6b;color:#fff;cursor:pointer}
.barra span{font-size:9.5pt;color:#555}
@media print{.barra{display:none}body{margin:0;max-width:none}h2{break-after:avoid}}
</style></head><body>
<div class="barra"><button type="button" onclick="window.print()">Guardar como PDF o imprimir</button><span>En el cuadro de impresión elige «Guardar como PDF».</span></div>
${cuerpo}
</body></html>`;
}
