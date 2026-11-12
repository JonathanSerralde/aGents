// Avance entre diagnósticos: compara dos diagnósticos guardados del mismo negocio y arma la serie de madurez.
// Todo con reglas, sin IA. Sirve para responder "¿mejoré?" con evidencia: qué áreas cambiaron de color
// y qué acciones del plan anterior ya no aparecen en el nuevo.

// Misma escala que el dashboard: madurez de 0 a 5, promedio de las áreas evaluadas.
export const PUNTAJE = { verde: 5, amarillo: 3, rojo: 1.5, sin_datos: null };
const ORDEN = { rojo: 0, amarillo: 1, verde: 2 };
const DIA = 24 * 60 * 60 * 1000;

export function madurez(distritos) {
  const puntos = Object.values(distritos || {}).map((d) => PUNTAJE[d.color]).filter((p) => p !== null && p !== undefined);
  if (!puntos.length) return 0;
  return Math.round((puntos.reduce((a, b) => a + b, 0) / puntos.length) * 10) / 10;
}

function contar(distritos) {
  const cuenta = { rojo: 0, amarillo: 0, verde: 0, sin_datos: 0 };
  for (const d of Object.values(distritos || {})) if (d.color in cuenta) cuenta[d.color]++;
  return cuenta;
}

// Un punto por diagnóstico, del más antiguo al más reciente.
export function serieDeMadurez(diagnosticos) {
  return diagnosticos
    .filter((d) => d?.resultado?.distritos)
    .map((d) => ({ id: d.id, creado: d.creado, madurez: madurez(d.resultado.distritos), ...contar(d.resultado.distritos) }))
    .sort((a, b) => (a.creado < b.creado ? -1 : 1));
}

// Dos acciones son la misma si pertenecen a la misma área y dicen lo mismo (sin distinguir mayúsculas ni espacios).
const claveAccion = (p) => `${p.distrito}|${String(p.accion || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;

// Compara el diagnóstico anterior con el actual. Devuelve null si falta alguno.
export function compararDiagnosticos(anterior, actual) {
  const a = anterior?.resultado;
  const b = actual?.resultado;
  if (!a?.distritos || !b?.distritos) return null;

  const areas = [];
  for (const [id, ahora] of Object.entries(b.distritos)) {
    const antes = a.distritos[id]?.color || 'sin_datos';
    const despues = ahora.color;
    let cambio = 'igual';
    if (antes === 'sin_datos' && despues !== 'sin_datos') cambio = 'nuevo';
    else if (despues === 'sin_datos' && antes !== 'sin_datos') cambio = 'sin_datos';
    else if (antes !== despues) cambio = ORDEN[despues] > ORDEN[antes] ? 'mejoro' : 'empeoro';
    areas.push({ id, nombre: ahora.nombre, antes, despues, cambio });
  }

  const planAntes = a.plan || [];
  const planAhora = b.plan || [];
  const clavesAntes = new Set(planAntes.map(claveAccion));
  const clavesAhora = new Set(planAhora.map(claveAccion));
  const corta = (p) => ({ distrito: p.distrito, nombre: p.nombre, accion: p.accion, plazo: p.plazo });
  const acciones = {
    // "Resueltas" quiere decir que, con las respuestas nuevas, el motor ya no las pide.
    resueltas: planAntes.filter((p) => !clavesAhora.has(claveAccion(p))).map(corta),
    persistentes: planAhora.filter((p) => clavesAntes.has(claveAccion(p))).map(corta),
    nuevas: planAhora.filter((p) => !clavesAntes.has(claveAccion(p))).map(corta),
  };

  const antes = madurez(a.distritos);
  const despues = madurez(b.distritos);
  const eje = (nombre) => ({ antes: a.crecimiento?.[nombre]?.nivel ?? 0, despues: b.crecimiento?.[nombre]?.nivel ?? 0, max: b.crecimiento?.[nombre]?.max ?? 4 });
  const dias = Math.max(0, Math.round((new Date(actual.creado) - new Date(anterior.creado)) / DIA));
  const conteo = {
    mejoraron: areas.filter((x) => x.cambio === 'mejoro').length,
    empeoraron: areas.filter((x) => x.cambio === 'empeoro').length,
    iguales: areas.filter((x) => x.cambio === 'igual').length,
  };

  // Si las facturas movieron el semáforo del diagnóstico actual (src/semaforo.js), parte del cambio no viene de las
  // respuestas del dueño. Se dice cuánto sería la madurez solo con lo que respondió, para que una baja no parezca castigo.
  const movidas = b.evidencia?.movidas || [];
  let facturas = null;
  if (movidas.length) {
    const declarados = Object.fromEntries(Object.entries(b.distritos).map(([id, d]) => [id, { color: d.declarado || d.color }]));
    const sinFacturas = madurez(declarados);
    facturas = { movidas, madurezSinFacturas: sinFacturas, deltaSinFacturas: Math.round((sinFacturas - antes) * 10) / 10 };
  }

  return {
    facturas,
    anterior: { id: anterior.id, creado: anterior.creado },
    actual: { id: actual.id, creado: actual.creado },
    dias,
    madurez: { antes, despues, delta: Math.round((despues - antes) * 10) / 10 },
    areas,
    conteo,
    acciones,
    crecimiento: { vertical: eje('vertical'), horizontal: eje('horizontal') },
    resumen: resumenDeAvance({ antes, despues, dias, conteo, acciones, areas, facturas }),
  };
}

function resumenDeAvance({ antes, despues, dias, conteo, acciones, areas, facturas = null }) {
  const delta = Math.round((despues - antes) * 10) / 10;
  const lapso = dias === 0 ? 'el mismo día' : dias === 1 ? 'en 1 día' : `en ${dias} días`;
  const nombres = (cambio) => areas.filter((x) => x.cambio === cambio).map((x) => x.nombre).join(', ');
  const partes = [
    delta === 0 ? `La madurez sigue en ${despues} de 5 (${lapso}).` : `La madurez pasó de ${antes} a ${despues} de 5 (${delta > 0 ? '+' : ''}${delta}, ${lapso}).`,
  ];
  if (conteo.mejoraron) partes.push(`Mejoraron: ${nombres('mejoro')}.`);
  if (conteo.empeoraron) partes.push(`Empeoraron: ${nombres('empeoro')}.`);
  if (facturas) partes.push(`Tus facturas movieron ${facturas.movidas.map((m) => m.nombre).join(', ')}: solo con tus respuestas la madurez sería ${facturas.madurezSinFacturas} de 5.`);
  if (acciones.resueltas.length) partes.push(`${acciones.resueltas.length} ${acciones.resueltas.length === 1 ? 'acción del plan anterior ya no hace falta' : 'acciones del plan anterior ya no hacen falta'}.`);
  if (acciones.persistentes.length) partes.push(`${acciones.persistentes.length} ${acciones.persistentes.length === 1 ? 'sigue pendiente' : 'siguen pendientes'}.`);
  return partes.join(' ');
}

// Contra cuál diagnóstico comparar por defecto: el anterior más reciente del mismo giro; si no hay, el anterior inmediato.
// `lista` es el resumen del historial ({ id, creado, giro }).
export function elegirAnterior(lista, actual) {
  const previos = lista.filter((d) => d.id !== actual.id && d.creado < actual.creado).sort((x, y) => (x.creado < y.creado ? 1 : -1));
  if (!previos.length) return null;
  const giro = actual.giro ?? actual.datos?.giro;
  return previos.find((d) => giro && d.giro === giro) || previos[0];
}
