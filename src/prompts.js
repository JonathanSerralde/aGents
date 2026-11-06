// Construye el contexto y las instrucciones de cada agente a partir del último diagnóstico.
// Todo el texto sale de los datos locales; el modelo nunca recibe más de lo que el área necesita.
import { NOMBRES_DISTRITOS } from './diagnostico.js';
import { ORQUESTADOR } from './conversaciones.js';
import { describirHabilidad, describirHabilidadDe } from './habilidades.js';
import { NOMBRES_APOYO, AGENTES_APOYO } from './apoyo.js';
import { fichaParaPrompt } from './empresa.js';
import { conocimientoPara } from './mexico.js';
import { describirPosicion, organigrama } from './jerarquia.js';
import { describirAjustes } from './ajustes.js';

const ETIQUETA = { verde: 'Bien', amarillo: 'Revisar', rojo: 'Atención', sin_datos: 'Sin datos' };

const REGLAS_COMUNES = [
  'Responde en español de México, breve y concreto: párrafos cortos o una lista numerada cuando propongas pasos.',
  'Estructura de cada respuesta: 1) qué entendiste, en una línea; 2) análisis con los datos que sí tienes (cita el dato); 3) propuesta; 4) sección ACCIONES si aplica. Si falta un dato clave para proponer bien, haz máximo dos preguntas y detente ahí en vez de suponer.',
  'No inventes cifras ni hechos sobre la empresa. Si te falta un dato, pídelo con una pregunta directa.',
  'Usa el contexto de sector, la investigación de mercado, el análisis del sitio y la memoria compartida cuando los tengas: cita de dónde sale cada dato. Si una acción ya está abierta en la memoria, da seguimiento en lugar de proponerla de nuevo.',
  'Distingue siempre tres cosas y no las mezcles: HECHO = información de la empresa con fuente (diagnóstico, ficha, documento, hechos registrados, lo que dice el usuario); IDEA = propuesta o supuesto no confirmado (tuyo o del usuario); CONCEPTO = conocimiento general (referencias, contexto de sector, definiciones). Un concepto no describe a esta empresa; una idea no es un hecho hasta que el dueño la aprueba o un dato la confirma. Cuando descubras un dato nuevo de la empresa, ponlo en una sección "HECHOS:" ("- dato — fuente: X"); las propuestas que no se decidieron, en "IDEAS:" ("- idea — veredicto: probar | esperar | descartar"); si explicaste un término, en "CONCEPTOS:" ("- término: definición"). Omite las secciones vacías.',
  'Tú propones y analizas; la persona responsable decide. Cuando propongas una acción, di quién la haría y en qué plazo.',
  'Si la orden toca un área que no es la tuya, dilo y sugiere hablar con el agente de esa área o con el orquestador.',
  'No des asesoría legal, fiscal o laboral definitiva: señala cuándo conviene confirmar con un contador o abogado.',
  'Cuando propongas acciones, termina con una sección "ACCIONES:" y una línea por acción con este formato exacto: "- [área] qué hacer — responsable — plazo". Si no propones acciones, omite la sección.',
  'Si para responder bien necesitas algo que solo otro agente sabe, escribe una línea aparte con este formato exacto: "CONSULTAR: [nombre del área o agente] — pregunta concreta". El sistema le hará la pregunta y te devolverá su respuesta. Máximo dos consultas por orden; no consultes lo que ya tienes en el contexto.',
  'Si descubres algo que otro agente debe saber pero no necesitas su respuesta, escribe una línea aparte: "INFORMAR: [nombre del área o agente] — dato concreto". Le quedará como nota en la memoria compartida y la verá en su siguiente orden. Máximo tres notas por orden.',
];

const REGLA_DELEGAR = 'Para repartir trabajo entre los agentes escribe una línea por encargo con este formato exacto: "DELEGAR: [nombre del área o agente] — orden concreta". El sistema la entregará y te devolverá lo que respondan. Máximo cuatro encargos por orden; después consolida sus respuestas en una propuesta única.';

function nombreAgente(area, equipo) {
  return equipo?.areas?.[area]?.agente || `Agente de ${NOMBRES_DISTRITOS[area] || NOMBRES_APOYO[area] || area}`;
}

function resumenTodas(diagnostico, equipo) {
  const areas = Object.keys(NOMBRES_DISTRITOS).map((id) => resumenArea(id, diagnostico, equipo)).join('\n\n');
  const crecimiento = diagnostico?.resultado?.crecimiento;
  const motor = crecimiento
    ? `Crecimiento: meta ${crecimiento.meta || 'sin definir'}; base ${crecimiento.preparado ? 'lista' : 'no lista'}${crecimiento.bloqueos?.length ? ` (bloquean: ${crecimiento.bloqueos.join(', ')})` : ''}; eje vertical ${crecimiento.vertical.nivel}/${crecimiento.vertical.max}, eje horizontal ${crecimiento.horizontal.nivel}/${crecimiento.horizontal.max}.`
    : 'Crecimiento: sin datos.';
  const cruzados = diagnostico?.resultado?.cruzados?.length
    ? `Contradicciones entre áreas detectadas por el motor (señálalas antes que cualquier otra cosa): ${diagnostico.resultado.cruzados.map((c) => `${c.texto} → ${c.accion}`).join(' | ')}`
    : '';
  const prioridad = diagnostico?.resultado?.prioridad?.length ? `Orden de prioridad calculado: ${diagnostico.resultado.prioridad.map((id) => NOMBRES_DISTRITOS[id]).join(' > ')}.` : '';
  return [areas, motor, prioridad, cruzados].filter(Boolean).join('\n\n');
}

function responsable(area, equipo) {
  return equipo?.areas?.[area]?.responsable || 'el dueño del negocio';
}

function resumenArea(id, diagnostico, equipo) {
  const d = diagnostico?.resultado?.distritos?.[id];
  if (!d) return `${NOMBRES_DISTRITOS[id] || id}: sin diagnóstico todavía.`;
  const acciones = (diagnostico.resultado.plan || []).filter((p) => p.distrito === id).map((p) => `${p.accion} (${p.plazo})`);
  return [
    `Área: ${d.nombre}. Estado: ${ETIQUETA[d.color]}. Responsable: ${responsable(id, equipo)}.`,
    d.hallazgos.length ? `Hallazgos: ${d.hallazgos.join(' ')}` : 'Hallazgos: ninguno registrado.',
    acciones.length ? `Acciones del plan: ${acciones.join(' | ')}` : 'Acciones del plan: ninguna.',
  ].join('\n');
}

function encabezadoEmpresa(diagnostico, marca, empresa) {
  const datos = diagnostico?.datos || {};
  const partes = [`Empresa: ${marca?.nombre || empresa?.razonSocial || 'sin nombre registrado'}.`];
  if (datos.giro) partes.push(`Giro: ${datos.giro}.`);
  if (datos.empleados) partes.push(`Empleados: ${datos.empleados}.`);
  if (diagnostico?.creado) partes.push(`Último diagnóstico: ${diagnostico.creado.slice(0, 10)}.`);
  const ficha = fichaParaPrompt(empresa);
  return ficha ? `${partes.join(' ')}\n\n${ficha}` : partes.join(' ');
}

// Instrucciones del sistema para un área, para el orquestador, para un agente de apoyo o para uno creado por el usuario.
// extras: { propios: { id: agente }, ajuste: { notas, marcos, acciones, limites } } para jerarquía y ajustes por negocio.
// extras también puede traer textos ya armados: investigacion (última investigación de mercado), sitio (último análisis
// del sitio), memoria (acciones abiertas y notas de la memoria compartida) y situacion (qué hace cada agente, solo para
// quienes coordinan). Van después de la ficha para todos los agentes.
export function sistemaPara(area, diagnostico, equipo, marca, personalizado = null, ficha = null, extras = {}) {
  // situacion (estado de cada agente) va también en el prompt compacto: cuando Dirección consulta al Orquestador
  // "qué hacen los demás", la respuesta sale de ahí.
  const empresa = [encabezadoEmpresa(diagnostico, marca, ficha), extras.compacto ? '' : extras.sector, extras.investigacion, extras.compacto ? '' : extras.sitio, extras.memoria, extras.situacion, extras.compacto ? '' : extras.agenda].filter(Boolean).join('\n\n');
  // "personalizado" es un agente propio solo si trae sus áreas; para el Orquestador llega la lista de nombres propios.
  const nombresPropios = personalizado?.nombresPropios || [];
  if (personalizado && !Array.isArray(personalizado.areas)) personalizado = null;
  const propios = extras.propios || {};
  const inactivos = extras.inactivos || []; // agentes opcionales apagados: no se mencionan ni se les puede delegar
  const posicion = describirPosicion(area, propios, inactivos);
  const ajustes = describirAjustes(extras.ajuste);

  if (personalizado) {
    const nombre = equipo?.areas?.[area]?.agente || personalizado.nombre;
    const veTodas = personalizado.areas.includes('todas');
    const contexto = veTodas
      ? resumenTodas(diagnostico, equipo)
      : personalizado.areas.map((id) => resumenArea(id, diagnostico, equipo)).join('\n\n');
    return [
      `Eres ${nombre}, un agente creado por la empresa. Trabajas junto a ${responsable(area, equipo)}, que es quien decide, y en coordinación con el Orquestador.`,
      empresa,
      describirHabilidadDe(personalizado) || 'Tu rol lo define la persona responsable en cada orden.',
      ajustes,
      posicion,
      ...REGLAS_COMUNES,
      veTodas ? 'Estado de las áreas según el último diagnóstico:' : 'Solo conoces estas áreas. Contexto del último diagnóstico:',
      contexto,
    ].filter(Boolean).join('\n\n');
  }

  // compacto: para consultas y encargos entre agentes se omiten las referencias largas (ya las tiene quien pregunta).
  const referencias = extras.compacto ? '' : conocimientoPara(area);

  if (area === ORQUESTADOR) {
    return [
      `Eres el Orquestador: coordinas a los agentes de todas las áreas de la empresa y ayudas a ${responsable('direccion', equipo)} a priorizar.`,
      empresa,
      describirHabilidad(ORQUESTADOR),
      ajustes,
      ...REGLAS_COMUNES,
      REGLA_DELEGAR,
      `Organigrama (quién reporta a quién):\n${organigrama(propios, inactivos)}`,
      `Agentes disponibles: ${[...Object.values(NOMBRES_DISTRITOS), ...AGENTES_APOYO.filter((id) => !inactivos.includes(id)).map((id) => NOMBRES_APOYO[id]), ...nombresPropios].join(', ')}.`,
      'Estado de las áreas según el último diagnóstico:',
      resumenTodas(diagnostico, equipo),
      referencias,
    ].filter(Boolean).join('\n\n');
  }

  // Agentes de apoyo: ven todas las áreas, pero no son dueños de ninguna.
  if (AGENTES_APOYO.includes(area)) {
    return [
      `Eres ${nombreAgente(area, equipo)}, agente de apoyo de ${NOMBRES_APOYO[area]}. Trabajas junto a ${responsable(area, equipo)}, que es quien decide, y en coordinación con el Orquestador.`,
      empresa,
      describirHabilidad(area),
      ajustes,
      posicion,
      ...REGLAS_COMUNES,
      'Estado de las áreas según el último diagnóstico (no eres responsable de ninguna; cuando una acción sea de un área, dilo):',
      resumenTodas(diagnostico, equipo),
      referencias,
    ].filter(Boolean).join('\n\n');
  }

  const nombre = NOMBRES_DISTRITOS[area] || area;
  return [
    `Eres ${nombreAgente(area, equipo)}, el agente del área de ${nombre}. Trabajas junto a ${responsable(area, equipo)}, que es quien decide.`,
    empresa,
    describirHabilidad(area),
    ajustes,
    posicion,
    `Solo conoces tu área. Contexto del último diagnóstico:\n${resumenArea(area, diagnostico, equipo)}`,
    ...REGLAS_COMUNES,
    referencias,
  ].filter(Boolean).join('\n\n');
}
