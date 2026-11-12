// Entrada única: el dueño escribe lo que necesita sin elegir agente y la oficina decide, con reglas y sin IA, quién
// lo atiende. Se compara el vocabulario de la orden con el de cada habilidad (rol, especialidad, marcos, acciones,
// indicadores y "cuándo usarlo"). Si la orden toca varias áreas a la vez, o no se parece a ninguna, va al Coordinador.
import { palabrasDe } from './archivo.js';

export const COORDINADOR = 'orquestador';
const MINIMO = 3; // puntos para considerar que un agente sí tiene que ver con la orden
// Palabras que aparecen en casi cualquier orden y no dicen de qué área es: se ignoran al comparar.
const GENERICAS = new Set(['dia', 'dias', 'semana', 'mes', 'mese', 'ano', 'hoy', 'manana', 'ahora', 'primero', 'proximo', 'cuanto', 'cuanta', 'otra', 'otro', 'ante', 'mensual', 'tengo', 'tener', 'voy', 'saber', 'buen', 'bueno', 'buena', 'hola', 'gracia', 'ayuda', 'ayudame', 'algo', 'esta', 'este', 'mis', 'cosa', 'forma', 'manera', 'llego', 'dijo']);
// Preguntas de prioridad o de panorama general: son del Coordinador aunque mencionen palabras de un área.
const PANORAMA = /por d[oó]nde (empiezo|empezar)|qu[eé] (atiendo|hago|sigue) primero|prioridad|c[oó]mo va (el|mi) negocio|resumen general|qu[eé] est[aá]n haciendo/i;
const PESO = { nombre: 4, cuando: 2.5, especialidad: 2, acciones: 1.5, indicadores: 1.2, marcos: 1 };

// Vocabulario ponderado de un agente: palabra -> peso (el nombre del área pesa más que un marco).
function vocabularioDe(nombre, h) {
  const v = new Map();
  const sumar = (texto, peso) => { for (const p of palabrasDe(texto)) v.set(p, Math.max(v.get(p) || 0, peso)); };
  sumar(nombre, PESO.nombre);
  sumar(h.cuando || '', PESO.cuando);
  sumar(`${h.rol || ''} ${h.especialidad || ''}`, PESO.especialidad);
  sumar((h.acciones || []).join(' '), PESO.acciones);
  sumar((h.indicadores || []).join(' '), PESO.indicadores);
  sumar((h.marcos || []).join(' '), PESO.marcos);
  return v;
}

// candidatos: [{ id, nombre, habilidad, jefe }] con los agentes activos. Devuelve a quién mandar la orden y por qué.
export function rutear(texto, candidatos) {
  const terminos = palabrasDe(texto).filter((p) => !GENERICAS.has(p));
  const vacio = { agente: COORDINADOR, motivo: 'No se parece al tema de ningún agente en particular: lo ve el Coordinador.', alternativas: [], puntos: 0 };
  if (PANORAMA.test(String(texto || ''))) return { ...vacio, motivo: 'Es una pregunta de prioridades o de panorama general: la ve el Coordinador.' };
  if (!terminos.length) return vacio;
  // Una palabra que casi todos los agentes comparten ("plan", "cliente") no distingue a nadie: vale menos.
  const vocabularios = candidatos.map((c) => ({ ...c, v: vocabularioDe(c.nombre, c.habilidad || {}) }));
  const frecuencia = new Map();
  for (const c of vocabularios) for (const p of c.v.keys()) frecuencia.set(p, (frecuencia.get(p) || 0) + 1);
  const rareza = (p) => Math.log(1 + vocabularios.length / (frecuencia.get(p) || 1));
  const puntuados = vocabularios.map((c) => {
    const coincidencias = terminos.filter((t) => c.v.has(t));
    return { id: c.id, nombre: c.nombre, jefe: c.jefe || '', coincidencias, puntos: Math.round(coincidencias.reduce((s, t) => s + c.v.get(t) * rareza(t), 0) * 10) / 10 };
  }).filter((c) => c.id !== COORDINADOR && c.puntos >= MINIMO).sort((a, b) => b.puntos - a.puntos);
  if (!puntuados.length) return vacio;

  let elegido = puntuados[0];
  // El dueño habla con el área; ella usa a sus especialistas. Si gana un especialista y su área también tiene que ver, va al área.
  const area = elegido.jefe ? puntuados.find((c) => c.id === elegido.jefe) : null;
  let nota = '';
  if (area && area.puntos >= elegido.puntos * 0.5) {
    nota = ` Se apoyará en ${elegido.nombre}.`;
    elegido = area;
  }
  // Si el segundo lugar es de otra área y viene casi empatado, la orden cruza áreas: la reparte el Coordinador.
  const familia = (c) => c.jefe || c.id;
  const rival = puntuados.find((c) => familia(c) !== familia(elegido) && c.id !== elegido.id);
  const alternativas = puntuados.filter((c) => c.id !== elegido.id).slice(0, 3).map((c) => ({ id: c.id, nombre: c.nombre }));
  if (rival && rival.puntos >= elegido.puntos * 0.85 && terminos.length >= 4) {
    return { agente: COORDINADOR, motivo: `Toca a ${elegido.nombre} y a ${rival.nombre} por igual: lo reparte el Coordinador.`, alternativas: [{ id: elegido.id, nombre: elegido.nombre }, ...alternativas].slice(0, 3), puntos: elegido.puntos };
  }
  return { agente: elegido.id, motivo: `Por lo que escribiste, es tema de ${elegido.nombre}.${nota}`, alternativas, puntos: elegido.puntos };
}
