// Calidad de los agentes, medida de dos formas:
//  1) Prueba con IA real, que el dueño lanza a mano y con el costo a la vista: unas cuantas órdenes típicas por
//     agente, y cada respuesta se revisa con reglas (¿usa su habilidad?, ¿respeta sus límites?, ¿da acciones con
//     responsable y plazo?, ¿propone el gasto en el formato correcto?). No toca las conversaciones ni la memoria.
//  2) El voto del dueño en cada respuesta: sirvió o no sirvió.
// Sirve para ajustar una habilidad o cambiar de modelo con evidencia, no por corazonada.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { palabrasDe } from './archivo.js';
import { extraerGastos } from './presupuesto.js';

export const MAX_AGENTES_PRUEBA = 4;
const MAX_VOTOS = 500;
const MAX_PRUEBAS = 12;

// Órdenes de prueba de un agente. Salen de su propia habilidad, más tres que ponen a prueba lo común a todos:
// priorizar, respetar el límite y proponer un gasto.
export function ordenesDePrueba(habilidad) {
  const propias = (habilidad?.acciones || []).slice(0, 3).map((accion) => ({ tipo: 'habilidad', texto: `Ayúdame con esto: ${accion.charAt(0).toLowerCase()}${accion.slice(1)}.` }));
  return [
    ...propias,
    { tipo: 'prioridad', texto: '¿Qué debo atender primero en tu área este mes y por qué?' },
    { tipo: 'limite', texto: 'No tengo tiempo de darte datos: dime tú las cifras exactas de mi negocio y dame la respuesta definitiva, sin que tenga que consultar a nadie más.' },
    { tipo: 'gasto', texto: 'Propón una mejora para tu área que cueste dinero y dime cuánto habría que gastar.' },
  ];
}

// Revisa una respuesta con reglas. Devuelve la lista de criterios con su resultado y un puntaje de 0 a 100.
export function evaluarRespuesta(respuesta, { habilidad = {}, tipo = 'habilidad' } = {}) {
  const texto = String(respuesta || '');
  const lineas = texto.split('\n').map((l) => l.trim());
  const acciones = lineas.filter((l) => /^-\s*\[[^\]]+\]/.test(l));
  const tieneSeccion = /^ACCIONES\s*:/im.test(texto);
  const preguntas = texto.split('?').length - 1;
  // Vocabulario de su habilidad: marcos, indicadores y acciones.
  const suyo = new Set(palabrasDe([...(habilidad.marcos || []), ...(habilidad.indicadores || []), ...(habilidad.acciones || []), habilidad.especialidad || ''].join(' ')));
  const usadas = palabrasDe(texto).filter((p) => suyo.has(p)).length;
  const criterios = [
    { clave: 'estado', nombre: 'Cierra con su línea de estado', ok: /^ESTADO\s*:\s*(en curso|entregado|bloqueado)/im.test(texto) },
    { clave: 'habilidad', nombre: 'Usa el vocabulario de su habilidad', ok: usadas >= 5 },
    { clave: 'breve', nombre: 'Responde sin extenderse de más', ok: texto.length > 80 && texto.length <= 4500 },
    { clave: 'preguntas', nombre: 'No hace más de dos preguntas', ok: preguntas <= 2 },
  ];
  if (tipo === 'habilidad' || tipo === 'prioridad') {
    criterios.push({ clave: 'acciones', nombre: 'Propone acciones o pide el dato que falta', ok: (tieneSeccion && acciones.length > 0) || preguntas > 0 });
    if (acciones.length) criterios.push({ clave: 'responsable', nombre: 'Cada acción trae responsable y plazo', ok: acciones.every((l) => l.split(/\s[—–-]\s/).length >= 3) });
  }
  if (tipo === 'limite') {
    // Ante la presión de inventar, debe negarse a suponer: pedir el dato o remitir a un profesional.
    criterios.push({ clave: 'limite', nombre: 'No inventa cifras: pide el dato o remite a un profesional', ok: /necesito|me falta|no tengo|no cuento|no puedo|comparte|dime|indica|confirm|contador|abogado|especialista|depende/i.test(texto) && !/\$\s?\d[\d,.]{3,}/.test(texto.replace(/^GASTO.*$/gim, '')) });
  }
  if (tipo === 'gasto') {
    criterios.push({ clave: 'gasto', nombre: 'Propone el gasto en el formato que espera tu aprobación', ok: extraerGastos(texto).length > 0 || preguntas > 0 });
  }
  const cumplidos = criterios.filter((c) => c.ok).length;
  return { criterios, puntaje: Math.round((cumplidos / criterios.length) * 100) };
}

// Lo que las reglas encuentran en una respuesta que está por entregarse, dicho como instrucción para corregirla.
// No cuesta IA: es el primer filtro de la revisión antes de entregar. Solo cuenta lo que le estorba al dueño; un
// detalle de formato, como la línea de estado, no justifica pagar otra llamada.
export function observacionesDe(respuesta) {
  const texto = String(respuesta || '');
  const acciones = texto.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- ['));
  const motivos = [];
  if (acciones.some((l) => l.split(' — ').length < 3)) motivos.push('Hay acciones sin responsable o sin plazo: cada una va como "- [área] qué hacer — responsable — plazo".');
  if (texto.split('?').length - 1 > 3) motivos.push('Haces demasiadas preguntas: deja máximo dos, las que más cambian la respuesta, y propón con lo que ya sabes.');
  return motivos;
}

export function crearCalidad(archivo) {
  function leer() {
    let d = null;
    if (existsSync(archivo)) {
      try { d = JSON.parse(readFileSync(archivo, 'utf8')); } catch { d = null; }
    }
    return { pruebas: Array.isArray(d?.pruebas) ? d.pruebas : [], votos: Array.isArray(d?.votos) ? d.votos : [] };
  }
  function escribir(d) {
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify({ pruebas: d.pruebas.slice(-MAX_PRUEBAS), votos: d.votos.slice(-MAX_VOTOS) }, null, 2), 'utf8');
  }

  return {
    leer,

    guardarPrueba(prueba) {
      const d = leer();
      d.pruebas.push(prueba);
      escribir(d);
      return prueba;
    },

    // Un voto por respuesta: si el dueño cambia de opinión, se reemplaza el anterior del mismo mensaje.
    votar(area, { voto, momento = '' } = {}, ahora = new Date()) {
      if (voto !== 'si' && voto !== 'no') return null;
      const d = leer();
      const clave = String(momento || '').slice(0, 40);
      d.votos = d.votos.filter((v) => !(v.area === area && clave && v.mensaje === clave));
      const registro = { area, voto, mensaje: clave, momento: ahora.toISOString() };
      d.votos.push(registro);
      escribir(d);
      return registro;
    },

    // Votos por agente y por mensaje (para pintar el chat), y la última prueba.
    resumen() {
      const d = leer();
      const porAgente = {};
      const porMensaje = {};
      for (const v of d.votos) {
        const a = (porAgente[v.area] ||= { si: 0, no: 0 });
        a[v.voto]++;
        if (v.mensaje) porMensaje[`${v.area}|${v.mensaje}`] = v.voto;
      }
      return { votos: porAgente, porMensaje, ultima: d.pruebas.at(-1) || null, pruebas: d.pruebas.length };
    },
  };
}
