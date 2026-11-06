// Calendario sin cuentas: la oficina exporta sus fechas (acciones con vencimiento, plan del diagnóstico, tareas
// semanales) como un archivo .ics que Google Calendar, Outlook y Calendario de Apple importan o al que se suscriben
// por la URL local, y el usuario puede importar su propio .ics para que los agentes conozcan la agenda del negocio.
// Todo local: nada se sincroniza con servicios en internet.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { nombreDe } from './jerarquia.js';
import { fechaLocal } from './memoria.js';

export const LIMITE_ICS = 2 * 1024 * 1024;
const MAX_EVENTOS = 500;

const escapar = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const desescapar = (t) => String(t || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
const compacta = (fecha) => fecha.replace(/-/g, '');
const plegar = (linea) => { // las líneas ICS no pasan de 75 bytes; se continúan con un espacio inicial
  const partes = [];
  let resto = linea;
  while (Buffer.byteLength(resto, 'utf8') > 73) {
    let corte = 73;
    while (Buffer.byteLength(resto.slice(0, corte), 'utf8') > 73) corte--;
    partes.push(resto.slice(0, corte));
    resto = ` ${resto.slice(corte)}`;
  }
  partes.push(resto);
  return partes.join('\r\n');
};

// eventos: [{ id, titulo, fecha: 'AAAA-MM-DD', descripcion }] (todo el día). Devuelve el texto del .ics.
export function generarIcs(eventos, { nombre = 'Oficina Multiagente' } = {}) {
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Oficina Multiagente//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapar(nombre)}`];
  for (const e of eventos) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha || '')) continue;
    const fin = new Date(`${e.fecha}T12:00:00`);
    fin.setDate(fin.getDate() + 1);
    lineas.push('BEGIN:VEVENT', `UID:${e.id}@oficina-multiagente`, `DTSTAMP:${sello}`, `DTSTART;VALUE=DATE:${compacta(e.fecha)}`, `DTEND;VALUE=DATE:${compacta(fechaLocal(fin))}`, `SUMMARY:${escapar(e.titulo)}`);
    if (e.descripcion) lineas.push(`DESCRIPTION:${escapar(e.descripcion)}`);
    lineas.push('END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return `${lineas.map(plegar).join('\r\n')}\r\n`;
}

// Lee un .ics (Google, Outlook, Apple) y devuelve [{ uid, titulo, fecha, hora, descripcion }]. Ignora lo que no entienda.
export function parsearIcs(texto) {
  const crudo = String(texto || '').replace(/\r+\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const eventos = [];
  let actual = null;
  for (const linea of crudo) {
    if (linea === 'BEGIN:VEVENT') { actual = {}; continue; }
    if (linea === 'END:VEVENT') {
      if (actual?.fecha && actual.titulo) eventos.push(actual);
      actual = null;
      continue;
    }
    if (!actual) continue;
    const i = linea.indexOf(':');
    if (i === -1) continue;
    const clave = linea.slice(0, i).split(';')[0].toUpperCase();
    const valor = linea.slice(i + 1).trim();
    if (clave === 'SUMMARY') actual.titulo = desescapar(valor).slice(0, 200);
    else if (clave === 'DESCRIPTION') actual.descripcion = desescapar(valor).slice(0, 500);
    else if (clave === 'UID') actual.uid = valor.slice(0, 120);
    else if (clave === 'DTSTART') {
      const m = valor.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
      if (!m) continue;
      if (m[4] && m[7]) { // hora UTC: convertir a local
        const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)));
        actual.fecha = fechaLocal(d);
        actual.hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      } else {
        actual.fecha = `${m[1]}-${m[2]}-${m[3]}`;
        if (m[4]) actual.hora = `${m[4]}:${m[5]}`;
      }
    }
  }
  return eventos.slice(0, MAX_EVENTOS).map((e) => ({ uid: e.uid || `${e.fecha}-${e.titulo}`.slice(0, 120), titulo: e.titulo, fecha: e.fecha, hora: e.hora || '', descripcion: e.descripcion || '' }));
}

// Fechas que genera la oficina: acciones con vencimiento, plan del diagnóstico y tareas semanales.
export function eventosDeOficina({ memoria, diagnostico, programacion, propios = {} }) {
  const eventos = [];
  for (const a of memoria?.acciones?.({ estado: 'pendiente' }) || []) {
    if (a.vence) eventos.push({ id: `accion-${a.id}`, titulo: `${nombreDe(a.area, propios)}: ${a.texto}`, fecha: a.vence, descripcion: `Responsable: ${a.responsable || 'por asignar'}. Propuso ${nombreDe(a.origen, propios)}.` });
  }
  if (diagnostico?.resultado?.plan?.length && diagnostico.creado) {
    diagnostico.resultado.plan.forEach((p, i) => {
      const dias = Number(String(p.plazo).match(/\d+/)?.[0] || 30);
      const f = new Date(diagnostico.creado);
      f.setDate(f.getDate() + dias);
      eventos.push({ id: `plan-${diagnostico.id || 'ultimo'}-${i}`, titulo: `Plan (${p.nombre}): ${p.accion.slice(0, 80)}`, fecha: fechaLocal(f), descripcion: `${p.accion} Plazo: ${p.plazo}.` });
    });
  }
  for (const [tarea, titulo] of [['investigacion', 'Investigación semanal de mercado'], ['sitio', 'Análisis semanal del sitio web']]) {
    const prog = programacion?.leer?.(tarea);
    if (prog?.activa && prog.proxima) eventos.push({ id: `tarea-${tarea}-${prog.proxima.slice(0, 10)}`, titulo, fecha: fechaLocal(new Date(prog.proxima)), descripcion: 'Corre sola si la aplicación está abierta.' });
  }
  return eventos;
}

export function crearCalendario(archivo) {
  return {
    leer() {
      if (!existsSync(archivo)) return { eventos: [], importado: null, nombre: '' };
      try {
        const d = JSON.parse(readFileSync(archivo, 'utf8'));
        return { eventos: Array.isArray(d.eventos) ? d.eventos : [], importado: d.importado || null, nombre: d.nombre || '' };
      } catch {
        return { eventos: [], importado: null, nombre: '' };
      }
    },
    importar(textoIcs, nombre = '') {
      const eventos = parsearIcs(textoIcs);
      if (!eventos.length) throw new Error('El archivo no trae eventos que se puedan leer (.ics de Google, Outlook o Apple)');
      mkdirSync(dirname(archivo), { recursive: true });
      const datos = { eventos, importado: new Date().toISOString(), nombre: String(nombre || '').slice(0, 80) };
      writeFileSync(archivo, JSON.stringify(datos, null, 2), 'utf8');
      return datos;
    },
    borrar() {
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify({ eventos: [], importado: null, nombre: '' }, null, 2), 'utf8');
    },
    proximos(dias = 14, ahora = new Date()) {
      const desde = fechaLocal(ahora);
      const hasta = new Date(ahora); hasta.setDate(hasta.getDate() + dias);
      const h = fechaLocal(hasta);
      return this.leer().eventos.filter((e) => e.fecha >= desde && e.fecha <= h).sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
    },
  };
}

// Texto para el prompt: la agenda importada y las fechas propias de los próximos días.
export function agendaParaPrompt(eventos, dias = 14) {
  if (!eventos?.length) return '';
  return `Agenda de la empresa (próximos ${dias} días; cuenta con estas fechas al proponer plazos y capacidad):\n${eventos.slice(0, 20).map((e) => `- ${e.fecha}${e.hora ? ` ${e.hora}` : ''}: ${e.titulo}`).join('\n')}`;
}
