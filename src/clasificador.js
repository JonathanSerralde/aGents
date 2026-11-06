// Clasificador sin IA de lo que escribe el usuario: ¿es información de la empresa (hecho), una idea o propuesta
// por validar, una pregunta sobre un concepto general, o una orden de trabajo? Con eso el agente sabe cómo tratar
// el mensaje (registrar, evaluar, explicar o ejecutar) y la memoria guarda cada cosa en su lugar.
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const SENALES = {
  concepto: [/\bque es\b/, /\bque son\b/, /\bque significa/, /\bcomo funciona/, /\bexplica(me)?\b/, /\bdefin[ei]/, /\bdiferencia entre/, /\bpara que sirve/, /\bconcepto/, /\ben que consiste/, /\bcuando conviene/, /\bventajas y desventajas/, /\bejemplo de\b/, /\bcomo se calcula/, /\bque quiere decir/],
  idea: [/\bpodria(mos)?\b/, /\bme gustaria/, /\bquisiera(mos)?\b/, /\bquiero (abrir|lanzar|probar|hacer|poner|crear|vender|ofrecer|contratar|invertir|cambiar|subir|bajar|meter|sacar)/, /\bque tal si/, /\by si\b/, /\bpropongo/, /\bse me ocurre/, /\btengo (una|la) idea/, /\bidea\b/, /\bestoy pensando/, /\bestamos pensando/, /\bplaneo|planeamos/, /\bdeberia(mos)?\b/, /\bconvendria/, /\bvale la pena/, /\bcrees que/, /\bseria bueno/, /\bhipotesis/, /\bsupongo/, /\bpienso (que|en)\b/],
  hecho: [/\b(tenemos|tengo|somos|vendemos|vendimos|facturamos|facturo|contamos con|trabajamos|operamos|abrimos|cerramos|pagamos|cobramos|compramos|perdimos|ganamos|crecimos|bajamos|subimos|llevamos|manejamos|atendemos)\b/, /\d+\s*(%|por ciento|empleados|trabajadores|clientes|sucursales|pesos|mxn|meses|anos|años|dias|unidades|pedidos|mesas|alumnos|pacientes)/, /\$\s?\d/, /\bel (mes|ano|año|trimestre|semestre) pasado/, /\bactualmente|hoy en dia|ahora mismo|desde hace/, /\bnuestr[oa]s? (cliente|proveedor|local|equipo|margen|inventario|venta|caja|nomina)/, /\bya (tenemos|hicimos|contratamos|firmamos|pagamos)/],
  orden: [/^\s*(haz|hazme|prepara|preparame|arma|armame|redacta|disena|diseña|calcula|revisa|propon|dame|elabora|genera|crea|escribe|lista|analiza|evalua|compara|planea|organiza|busca|resume|ayudame|necesito|quiero que)\b/, /\bnecesito que\b/, /\bayudame a\b/, /\bquiero que\b/, /\bpor favor\b/],
};

// Orden de desempate: una idea con datos sigue siendo una idea; una pregunta general con datos sigue siendo concepto.
const DESEMPATE = ['idea', 'concepto', 'orden', 'hecho'];

export const TIPOS = ['hecho', 'idea', 'concepto', 'orden'];
export const DESCRIPCION_TIPO = {
  hecho: 'información de la empresa (dato real que aporta el usuario)',
  idea: 'una idea o propuesta por validar, no un hecho',
  concepto: 'una pregunta sobre un concepto general',
  orden: 'una orden de trabajo',
};

export function clasificarTexto(texto) {
  const t = norm(texto);
  const puntos = { hecho: 0, idea: 0, concepto: 0, orden: 0 };
  const senales = { hecho: [], idea: [], concepto: [], orden: [] };
  for (const [tipo, lista] of Object.entries(SENALES)) {
    for (const re of lista) {
      const m = t.match(re);
      if (m) { puntos[tipo] += 1; senales[tipo].push(m[0].trim()); }
    }
  }
  // Pregunta abierta sin otra señal: suele ser un concepto ("¿cómo se lleva un flujo de caja?").
  if (/\?/.test(t) && /\b(que|como|cual|cuando|por que|donde)\b/.test(t) && puntos.concepto === 0 && puntos.idea === 0 && puntos.orden === 0) puntos.concepto += 0.5;
  const total = Object.values(puntos).reduce((a, b) => a + b, 0);
  if (total === 0) return { tipo: 'orden', confianza: 0, senales: [], contieneHecho: false };
  // Lo que pide algo (idea, pregunta, orden) manda sobre los datos que lo acompañan: "tenemos 2 sucursales y quiero
  // abrir otra" es una idea que trae un hecho, no un hecho.
  const intencion = ['idea', 'concepto', 'orden'].sort((a, b) => puntos[b] - puntos[a] || DESEMPATE.indexOf(a) - DESEMPATE.indexOf(b))[0];
  const mejor = puntos[intencion] > 0 ? intencion : 'hecho';
  return { tipo: mejor, confianza: Math.round((puntos[mejor] / total) * 100) / 100, senales: senales[mejor].slice(0, 4), contieneHecho: puntos.hecho > 0 };
}

// ¿Pregunta qué están haciendo los agentes? Eso se contesta con reglas (situación de la oficina), sin gastar tokens.
const SENALES_ESTADO = [
  /\bque (esta|estan) haciendo\b/, /\bque hace cada (agente|area|departamento|quien)/, /\bque hacen (los|mis|las|tus|cada|otros) (demas )?(agentes|areas|departamentos|equipos)/,
  /\b(estado|situacion|resumen|avance|avances|status|estatus) (actual |general |de hoy )?(de|sobre) (los|mis|cada|las|tus|todos los|otros) (demas )?(agentes|areas|departamentos|equipos?)/,
  /\ben que (andan|estan|trabajan|van) (los|mis|las|tus) (demas )?(agentes|areas|departamentos)/, /\bquien(es)? esta(n)? trabajando\b/, /\bcomo van (los|mis|las) (demas )?(agentes|areas|departamentos)/,
  /\bque han hecho (los|mis|las) (demas )?(agentes|areas|departamentos)/, /\bque tienen (en curso|pendiente) (los|mis|las) (demas )?(agentes|areas|departamentos)/, /\bresumen de (los|lo que hacen los) (demas )?agentes/,
];
export function esPreguntaDeEstado(texto) {
  const t = norm(texto);
  return SENALES_ESTADO.some((re) => re.test(t));
}

// Frases del mensaje que traen datos de la empresa (para guardarlas como hechos con fuente "usuario").
export function extraerHechosDeTexto(texto) {
  // Se parte por oraciones y también por "y / pero / aunque": "tenemos 2 sucursales y quiero abrir otra" trae un hecho y una idea.
  const frases = String(texto || '').split(/(?<=[.;!?])\s+|\n+|,\s+|\s+(?:y|pero|aunque|e)\s+(?=\S)/i).map((f) => f.trim()).filter((f) => f.length >= 8);
  return frases.filter((f) => { const n = norm(f); return SENALES.hecho.some((re) => re.test(n)) && !SENALES.idea.some((re) => re.test(n)); }).slice(0, 3).map((f) => f.slice(0, 240));
}

// Instrucción adicional para el agente según el tipo del mensaje actual.
export function instruccionPorTipo(tipo) {
  if (tipo === 'hecho') {
    return 'El mensaje aporta INFORMACIÓN DE LA EMPRESA. Confírmala en una frase, úsala en tu análisis y regístrala en una sección "HECHOS:" con una línea por dato en este formato: "- dato — fuente: lo dijo el usuario". No la conviertas en idea ni la pongas en duda sin motivo; si contradice un hecho previo, dilo y pregunta cuál vale.';
  }
  if (tipo === 'idea') {
    return 'El mensaje es una IDEA o propuesta del usuario, NO un hecho ni una decisión tomada. Evalúala con esta estructura: qué problema resuelve; qué supuestos tiene; qué hecho de la empresa la apoya o la contradice (cita la fuente); qué dato faltaría para decidir; la prueba mínima y barata para validarla; el riesgo principal. Cierra con una sección "IDEAS:" con una línea: "- la idea en pocas palabras — veredicto: probar | esperar | descartar". Si hace falta, también ACCIONES para la prueba.';
  }
  if (tipo === 'concepto') {
    return 'El mensaje pregunta por un CONCEPTO general. Explícalo en lenguaje llano en menos de 120 palabras y da un ejemplo aplicado a este negocio con los hechos que sí tienes (si no los tienes, el ejemplo es hipotético y lo dices). Cierra con una sección "CONCEPTOS:" con una línea: "- término: definición breve". No propongas ACCIONES salvo que te las pidan.';
  }
  return 'Es una ORDEN de trabajo. Si para cumplirla usas datos de la empresa, distingue en tu respuesta qué es hecho (con fuente) y qué es supuesto tuyo. Lo nuevo que descubras de la empresa va en "HECHOS:", las propuestas no decididas en "IDEAS:".';
}
