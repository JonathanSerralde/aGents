// Entregables del plan de acción: convierte una acción ("Documentar los procesos…") en un documento de Word
// listo para trabajar. Sin IA sale el formato con sus secciones y los datos que la oficina ya conoce;
// con IA, el agente del área redacta el contenido y aquí se pasa a bloques para reporte.js.

// Tipo de documento según lo que pide la acción. El orden importa: gana la primera coincidencia.
const TIPOS = [
  { id: 'manual', nombre: 'Manual de procedimiento', patron: /manual|procedimiento|proceso|documentar|funciones|puesto/i,
    secciones: [
      ['Objetivo', 'Qué debe lograr este procedimiento y para quién.'],
      ['Alcance', 'Dónde empieza y dónde termina; qué queda fuera.'],
      ['Responsable y suplente', 'Quién lo ejecuta y quién lo cubre si falta.'],
      ['Pasos', 'Un paso por línea, en el orden en que se hacen: quién, qué hace, con qué herramienta y en cuánto tiempo.'],
      ['Qué hacer si algo sale mal', 'Los dos o tres problemas más comunes y a quién se avisa.'],
      ['Indicador', 'Un número que diga si el procedimiento funciona (y cada cuándo se mide).'],
      ['Evidencia', 'Qué documento, foto o registro prueba que se hizo.'],
    ] },
  { id: 'politica', nombre: 'Política interna', patron: /pol[ií]tica|regla|criterio|l[ií]mite|descuento|cr[eé]dito/i,
    secciones: [
      ['Propósito', 'Qué problema evita esta política.'],
      ['A quién aplica', 'Puestos, áreas, clientes o proveedores.'],
      ['Reglas', 'Una regla por línea, con el número o el límite exacto.'],
      ['Excepciones', 'Quién puede autorizarlas y cómo queda registrado.'],
      ['Consecuencias', 'Qué pasa si no se cumple.'],
      ['Vigencia y revisión', 'Desde cuándo aplica y cada cuándo se revisa.'],
    ] },
  { id: 'control', nombre: 'Formato de control', patron: /registr|medir|medici[oó]n|control|conciliar|inventario|bit[aá]cora|respaldo|seguimiento/i,
    secciones: [
      ['Qué se registra', 'El dato exacto y su unidad (pesos, piezas, minutos, clientes).'],
      ['Quién y cada cuándo', 'Responsable del registro y frecuencia.'],
      ['Columnas del registro', 'Fecha, dato, responsable, observaciones y lo que haga falta.'],
      ['Señal de alerta', 'Con qué valor se avisa y a quién.'],
      ['Revisión', 'Quién revisa el registro y qué decide con él.'],
    ] },
  { id: 'plan', nombre: 'Plan de una página', patron: /plan|meta|objetivo|estrategia|programa|presupuest/i,
    secciones: [
      ['Meta', 'Qué se quiere lograr, con número y fecha.'],
      ['Punto de partida', 'Cómo está hoy ese número.'],
      ['Acciones', 'Tres a cinco acciones, cada una con responsable y fecha.'],
      ['Recursos', 'Dinero, tiempo y personas que se necesitan.'],
      ['Indicador de avance', 'Qué se revisa cada semana o cada mes.'],
      ['Riesgos', 'Qué puede impedirlo y cómo se previene.'],
    ] },
];
const GENERICO = { id: 'ficha', nombre: 'Ficha de acción', secciones: [
  ['Resultado esperado', 'Qué debe quedar hecho y cómo se sabrá que está terminado.'],
  ['Pasos', 'Un paso por línea, con responsable y fecha.'],
  ['Recursos', 'Qué se necesita para hacerlo.'],
  ['Evidencia', 'Qué documento o registro prueba que se hizo.'],
] };

export function tipoDeEntregable(accion) {
  return TIPOS.find((t) => t.patron.test(String(accion || ''))) || GENERICO;
}

const limpiar = (t) => String(t).replace(/\*\*/g, '').replace(/^#+\s*/, '').trim();

// Pasa la respuesta del agente a bloques. Corta el protocolo interno (ACCIONES:, ESTADO:, etc.).
export function bloquesDesdeTexto(texto) {
  const cuerpo = String(texto || '').split(/^[ \t]*\**(?:ACCIONES|ESTADO|HECHOS|IDEAS|CONCEPTOS|CONSULTAR|DELEGAR|INFORMAR)\**[ \t]*:/im)[0];
  const bloques = [];
  for (const cruda of cuerpo.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea || /^[-=_*]{3,}$/.test(linea)) continue;
    if (/^#+\s/.test(linea) || /^\*\*[^*]+\*\*:?$/.test(linea)) bloques.push({ tipo: 'subtitulo', texto: limpiar(linea).replace(/:$/, '') });
    else if (/^([-*•]|\d+[.)])\s+/.test(linea)) bloques.push({ tipo: 'vineta', texto: limpiar(linea.replace(/^([-*•]|\d+[.)])\s+/, '')) });
    else bloques.push({ tipo: 'parrafo', texto: limpiar(linea) });
  }
  return bloques;
}

// Instrucción para el agente del área cuando el usuario pide redactar con IA.
export function instruccionEntregable({ accion, tipo }) {
  return [
    `Redacta el documento "${tipo.nombre}" para cumplir esta acción del plan: "${accion}".`,
    'Usa los datos reales de la empresa que tienes en tu contexto; donde falte un dato, deja "[por definir: qué dato]" en vez de inventarlo.',
    `Estructura obligatoria, con estos encabezados en líneas que empiecen con "## ": ${tipo.secciones.map((s) => s[0]).join(', ')}.`,
    'Escribe el contenido completo y concreto, en español de México, con viñetas cuando sean pasos o reglas. Máximo 600 palabras.',
    'Entrega solo el documento: sin saludo, sin preguntas, sin secciones ACCIONES ni ESTADO, y sin consultar ni delegar a otros agentes.',
  ].join('\n');
}

// Bloques del documento. Con `textoIA` va el contenido redactado; sin él, el formato con guías para llenarlo.
export function bloquesEntregable({ accion, nombreArea, responsable, plazo, empresa, hallazgos = [], textoIA = '', fecha = new Date() }) {
  const tipo = tipoDeEntregable(accion);
  const b = [];
  const push = (t, texto) => b.push({ tipo: t, texto });
  push('titulo', `${tipo.nombre}: ${accion}`);
  push('parrafo', `${empresa || 'Tu negocio'} · Área: ${nombreArea} · Responsable: ${responsable || 'por asignar'}${plazo ? ` · Plazo del plan: ${plazo}` : ''} · ${fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`);
  if (hallazgos.length) {
    push('subtitulo', 'Por qué se necesita');
    for (const h of hallazgos.slice(0, 5)) push('vineta', h);
  }
  const contenido = textoIA ? bloquesDesdeTexto(textoIA) : [];
  if (contenido.length) {
    b.push(...contenido);
    push('nota', 'Borrador redactado por el agente del área con IA a partir de los datos de la empresa. Revísalo y ajústalo antes de aplicarlo; no sustituye la revisión de un profesional.');
  } else {
    for (const [titulo, guia] of tipo.secciones) {
      push('subtitulo', titulo);
      push('parrafo', `${guia}`);
      push('parrafo', '______________________________________________');
    }
    push('subtitulo', 'Aprobación');
    push('parrafo', 'Elaboró: ____________________   Autorizó: ____________________   Fecha: ____________');
    push('nota', 'Formato generado con reglas, sin IA. Llénalo con tu equipo; si activas la IA, el agente del área puede redactarlo con los datos de tu empresa.');
  }
  return { tipo: tipo.id, nombreTipo: tipo.nombre, bloques: b };
}
