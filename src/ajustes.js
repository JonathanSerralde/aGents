// Ajustes por negocio para cada agente: notas, marcos, acciones y límites adicionales a su habilidad base.
// El usuario los escribe a mano o acepta propuestas que el Coordinador genera con IA ("Optimizar agentes").
// Vive en data/ajustes.json. Las propuestas no se aplican hasta que el usuario las acepta.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_NOTAS = 800;
const MAX_ITEM = 200;
const MAX_LISTA = 6;
const ID_VALIDO = /^[a-z][a-z0-9-]{1,40}$/;
const MAX_APAGADOS = 60;
// Un marco o acción se identifica por el inicio de su texto: basta para distinguirlos y no guarda párrafos enteros.
export const claveDe = (t) => (typeof t === 'string' ? t.trim().slice(0, 80) : '');

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const lista = (v) => {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [];
  return arr.map((x) => texto(x, MAX_ITEM)).filter(Boolean).slice(0, MAX_LISTA);
};

export function sanitizarAjuste(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  // apagados: inicio del texto de cada marco o acción de la habilidad base que el dueño apagó para este negocio.
  const apagados = (Array.isArray(e.apagados) ? e.apagados : []).map((x) => claveDe(x)).filter(Boolean).slice(0, MAX_APAGADOS);
  return { notas: texto(e.notas, MAX_NOTAS), marcos: lista(e.marcos), acciones: lista(e.acciones), limites: lista(e.limites), apagados: [...new Set(apagados)] };
}

export function crearAjustes(archivo) {
  function leerTodo() {
    if (!existsSync(archivo)) return {};
    try {
      const d = JSON.parse(readFileSync(archivo, 'utf8'));
      return d && typeof d === 'object' ? d : {};
    } catch {
      return {};
    }
  }
  function escribir(datos) {
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(datos, null, 2), 'utf8');
  }

  return {
    leer(id) {
      const d = leerTodo()[id];
      return { ...sanitizarAjuste(d), propuesta: d?.propuesta ? { ...sanitizarAjuste(d.propuesta), motivo: texto(d.propuesta.motivo, 400), momento: d.propuesta.momento || '' } : null };
    },

    todos() {
      const d = leerTodo();
      const salida = {};
      for (const id of Object.keys(d)) if (ID_VALIDO.test(id)) salida[id] = this.leer(id);
      return salida;
    },

    guardar(id, entrada) {
      if (!ID_VALIDO.test(id)) throw new Error('Agente no válido');
      const datos = leerTodo();
      datos[id] = { ...sanitizarAjuste(entrada), propuesta: datos[id]?.propuesta || null };
      escribir(datos);
      return this.leer(id);
    },

    proponer(id, propuesta, motivo) {
      if (!ID_VALIDO.test(id)) throw new Error('Agente no válido');
      const datos = leerTodo();
      datos[id] = { ...sanitizarAjuste(datos[id]), propuesta: { ...sanitizarAjuste(propuesta), motivo: texto(motivo, 400), momento: new Date().toISOString() } };
      escribir(datos);
      return this.leer(id);
    },

    // Acepta la propuesta: se suma a lo existente sin duplicar; las notas nuevas se agregan al final.
    aceptar(id) {
      const datos = leerTodo();
      const actual = datos[id];
      if (!actual?.propuesta) return null;
      const p = sanitizarAjuste(actual.propuesta);
      const base = sanitizarAjuste(actual);
      const unir = (a, b) => [...new Set([...a, ...b])].slice(0, MAX_LISTA);
      datos[id] = {
        notas: texto([base.notas, p.notas].filter(Boolean).join(' '), MAX_NOTAS),
        marcos: unir(base.marcos, p.marcos), acciones: unir(base.acciones, p.acciones), limites: unir(base.limites, p.limites),
        apagados: base.apagados,
        propuesta: null,
      };
      escribir(datos);
      return this.leer(id);
    },

    rechazar(id) {
      const datos = leerTodo();
      if (!datos[id]) return null;
      datos[id].propuesta = null;
      escribir(datos);
      return this.leer(id);
    },
  };
}

// Texto para el prompt con los ajustes aplicados (no las propuestas pendientes).
export function describirAjustes(ajuste) {
  if (!ajuste) return '';
  const lineas = [];
  if (ajuste.notas) lineas.push(`Indicaciones de este negocio para ti: ${ajuste.notas}`);
  if (ajuste.marcos?.length) lineas.push(`Marcos adicionales: ${ajuste.marcos.join('; ')}.`);
  if (ajuste.acciones?.length) lineas.push(`Acciones adicionales que sabes hacer: ${ajuste.acciones.join('; ')}.`);
  if (ajuste.limites?.length) lineas.push(`Límites adicionales: ${ajuste.limites.join('; ')}.`);
  return lineas.join('\n');
}

// Parsea los bloques "NUEVO AGENTE: nombre" con ROL/ESPECIALIDAD/AREAS/MARCOS/ACCIONES/LIMITES/MOTIVO: subagentes que
// el Coordinador propone crear porque ningún agente cubre esa necesidad del negocio.
export function parsearNuevosAgentes(respuesta) {
  const nuevos = [];
  const partes = String(respuesta || '').split(/^\s*NUEVO AGENTE\s*:\s*/im).slice(1);
  for (const parte of partes) {
    const [primeraLinea, ...resto] = parte.split('\n');
    const nombre = primeraLinea.replace(/[[\]]/g, '').trim();
    const cuerpo = resto.join('\n').split(/^\s*AGENTE\s*:/im)[0];
    const seccion = (clave) => {
      const m = cuerpo.match(new RegExp(`^\\s*${clave}\\s*:\\s*([\\s\\S]*?)(?=^\\s*(?:ROL|ESPECIALIDAD|AREAS|ÁREAS|MARCOS|ACCIONES|LIMITES|LÍMITES|MOTIVO|PREGUNTA)\\s*:|$)`, 'im'));
      return m ? m[1].trim() : '';
    };
    const aLista = (t) => t.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
    const areas = (seccion('AREAS') || seccion('ÁREAS')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[,\n]/).map((a) => a.trim().replace(/^-\s*/, '')).filter(Boolean);
    nuevos.push({
      nombre, rol: seccion('ROL').replace(/\s+/g, ' '), especialidad: seccion('ESPECIALIDAD').replace(/\s+/g, ' '),
      pregunta_primero: aLista(seccion('PREGUNTA')), marcos: aLista(seccion('MARCOS')), acciones: aLista(seccion('ACCIONES')),
      limites: aLista(seccion('LIMITES') || seccion('LÍMITES')), areas, motivo: seccion('MOTIVO').replace(/\s+/g, ' '),
    });
  }
  return nuevos.filter((n) => n.nombre.length >= 2);
}

// Parsea la respuesta del Coordinador con bloques "AGENTE: nombre" y secciones NOTAS/MARCOS/ACCIONES/LIMITES/MOTIVO.
export function parsearPropuestas(respuesta) {
  const bloques = [];
  const partes = String(respuesta || '').replace(/^\s*NUEVO AGENTE\s*:[\s\S]*?(?=^\s*AGENTE\s*:|(?![\s\S]))/gim, '').split(/^\s*AGENTE\s*:\s*/im).slice(1);
  for (const parte of partes) {
    const [primeraLinea, ...resto] = parte.split('\n');
    const nombre = primeraLinea.replace(/[[\]]/g, '').trim();
    const cuerpo = resto.join('\n');
    const seccion = (clave) => {
      const m = cuerpo.match(new RegExp(`^\\s*${clave}\\s*:\\s*([\\s\\S]*?)(?=^\\s*(?:NOTAS|MARCOS|ACCIONES|LIMITES|LÍMITES|MOTIVO)\\s*:|$)`, 'im'));
      return m ? m[1].trim() : '';
    };
    const aLista = (t) => t.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
    bloques.push({
      nombre,
      notas: seccion('NOTAS').replace(/\s+/g, ' '),
      marcos: aLista(seccion('MARCOS')),
      acciones: aLista(seccion('ACCIONES')),
      limites: aLista(seccion('LIMITES') || seccion('LÍMITES')),
      motivo: seccion('MOTIVO').replace(/\s+/g, ' '),
    });
  }
  return bloques.filter((b) => b.nombre && (b.notas || b.marcos.length || b.acciones.length || b.limites.length));
}
