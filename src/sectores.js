// Paquetes de sector: según el giro del diagnóstico (o lo que diga la ficha) se activan agentes opcionales y todos los
// agentes reciben contexto del sector. Retail es el caso base del organigrama de referencia: sus departamentos son
// permanentes (Operación de tienda, Inventarios, Imagen, Prevención de pérdidas, Compras) y aquí solo suma contexto.
export const SECTORES = {
  alimentos: {
    nombre: 'Restaurante, cafetería o venta de alimentos',
    giros: ['alimentos'],
    palabras: /restauran|cafeter|caf[eé]\b|fonda|taquer|tacos?\b|tortas?\b|pizz|sushi|hamburgues|cocina|comida|comedor|alimento|panader|pasteler|reposter|bar\b|cantina|bebida|jugos?\b|catering|banquete|antojit|tortill|carnicer|pescader|fruter|abarrote|desayun|lonch|food/i,
    agentes: ['alimentos'],
    contexto: [
      'Indicadores del sector: costo de alimentos y bebidas de 28% a 35% de la venta, ticket promedio, rotación de mesas o tickets por hora, merma de insumos menor a 4%.',
      'Cumplimiento: NOM-251-SSA1 de higiene, verificación de COFEPRIS o salubridad local, licencia de funcionamiento y, si hay alcohol, licencia específica; Distintivo H como referencia voluntaria.',
      'Canales típicos: plataformas de entrega (Uber Eats, Rappi, DiDi Food) con comisiones de 20% a 30% que exigen precio o menú propio; WhatsApp y Google Maps con reseñas pesan más que la publicidad.',
    ],
  },
  agencia: {
    nombre: 'Agencia de marketing, publicidad o diseño',
    giros: ['agencia'],
    palabras: /agencia|marketing digital|publicidad|branding|dise[ñn]o gr[aá]fico|community|social media|producci[oó]n audiovisual|estudio creativo|campa[ñn]as para clientes/i,
    agentes: ['cuentas'],
    contexto: [
      'Indicadores del sector: ingreso recurrente (retainers) sobre ingreso total, horas facturables por persona (meta 65% a 75%), margen por cuenta, concentración de ingresos en pocas cuentas, costo de adquisición de un cliente nuevo.',
      'Lo que mata a una agencia: alcance sin límite ("una cosita más"), cobrar tarde, depender de dos cuentas, no documentar resultados para renovar. Contratos con alcance, entregables, rondas de cambios y plazo de pago.',
      'Fiscal y legal: contratos de prestación de servicios con cesión de derechos de autor sobre lo entregado; CFDI con complemento de pago; freelancers con contrato y CFDI propio (cuidado con la subordinación laboral).',
    ],
  },
  educacion: {
    nombre: 'Escuela, academia o centro de capacitación',
    giros: ['educacion'],
    palabras: /escuela|colegio|academia|instituto|universidad|capacitaci[oó]n|cursos?\b|diplomado|preparatoria|primaria|secundaria|kinder|guarder[ií]a|alumnos?\b|docentes?\b|educaci[oó]n|formaci[oó]n/i,
    agentes: ['escolar', 'admisiones'],
    contexto: [
      'Indicadores del sector: alumnos activos, inscripciones por ciclo, retención de un ciclo al siguiente (meta mayor a 85%), cartera vencida de colegiaturas, alumnos por docente, costo por alumno captado.',
      'Cumplimiento: RVOE de la SEP (federal o estatal) para estudios con validez oficial; capacitación para el trabajo con registro ante la STPS o CONOCER cuando se certifique; protección civil y aviso de privacidad para datos de menores con consentimiento de padres.',
      'Ciclo del negocio: la venta ocurre en temporadas de inscripción (verano y enero); el resto del año se trabaja retención, cobranza y reputación (recomendación de padres y egresados).',
    ],
  },
  salud: {
    nombre: 'Clínica, consultorio, laboratorio o farmacia',
    giros: ['salud'],
    palabras: /cl[ií]nica|consultorio|m[eé]dic|dental|odont|laboratorio|farmacia|fisioterap|psic[oó]log|nutri[oó]log|veterinari|hospital|salud|pacientes?\b/i,
    agentes: ['clinico'],
    contexto: [
      'Indicadores del sector: pacientes activos, consultas por día, porcentaje de citas no asistidas (meta menor a 15%), ingreso por paciente, mezcla particular contra aseguradoras.',
      'Cumplimiento: aviso de funcionamiento y responsable sanitario ante COFEPRIS, NOM-004-SSA3 de expediente clínico, NOM-024 si el expediente es electrónico, recetas y manejo de medicamentos controlados, residuos biológico-infecciosos (NOM-087), cédulas profesionales a la vista, aviso de privacidad con datos sensibles.',
      'Publicidad en salud está regulada (Ley General de Salud y COFEPRIS): nada de promesas de curación ni antes-y-después sin permiso; la reputación se construye con reseñas y recomendación.',
    ],
  },
  retail: {
    nombre: 'Comercio minorista (retail)',
    giros: ['comercio'],
    palabras: /retail|tienda|minorista|boutique|sucursal|punto de venta|autoservicio|departamental|franquicia/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: venta por metro cuadrado, ticket promedio y artículos por ticket, conversión de visitas, rotación de inventario por categoría, merma total menor a 1% de la venta, margen por categoría.',
      'Calendario comercial de México: Día de Reyes, 14 de febrero, Día de las Madres, regreso a clases, Buen Fin (noviembre), Navidad; planear compras e inventario con tres meses de anticipación.',
      'Cumplimiento: precios exhibidos en pesos con IVA (Profeco), términos de promociones y garantías visibles, facturación en el punto de venta; en varias sucursales, control de caja e inventario por tienda.',
      'Los departamentos de retail ya están cubiertos por agentes permanentes: Operación de tienda, Inventarios y almacén, Imagen y exhibición, Prevención de pérdidas, Compras, Logística y Venta en línea.',
    ],
  },
};

export const AGENTES_OPCIONALES = Object.fromEntries(
  Object.entries(SECTORES).flatMap(([sector, s]) => s.agentes.map((id) => [id, { sector, condicion: `se activa cuando el giro es "${s.nombre}" (por el giro del diagnóstico o por lo que dice la ficha)` }])),
);

const textoFicha = (ficha) => [ficha?.productos, ficha?.notas, ficha?.razonSocial, ficha?.clientesPrincipales].filter(Boolean).join(' ');

// Sectores que aplican al negocio según el giro del último diagnóstico y la ficha.
export function sectoresActivos({ giro = '', ficha = null } = {}) {
  const texto = textoFicha(ficha);
  return Object.keys(SECTORES).filter((id) => SECTORES[id].giros.includes(giro) || (texto && SECTORES[id].palabras.test(texto)));
}

// Texto para el prompt de todos los agentes con el contexto de los sectores activos.
export function contextoSectores(sectores) {
  const lineas = [];
  for (const id of sectores || []) {
    const s = SECTORES[id];
    if (!s) continue;
    lineas.push(`Sector: ${s.nombre}.`, ...s.contexto.map((l) => `- ${l}`));
  }
  return lineas.length ? `Contexto del sector (referencia general; confirma cifras y normas con la fuente oficial):\n${lineas.join('\n')}` : '';
}
