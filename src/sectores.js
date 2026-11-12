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

  // ---- Sectores solo de contexto: no agregan agentes; los agentes permanentes reciben estas líneas en su prompt. ----
  manufactura: {
    nombre: 'Manufactura o fabricación',
    giros: ['manufactura'],
    palabras: /manufactur|f[aá]bric(?!a de software)|maquila|planta de producci[oó]n|inyecci[oó]n de pl[aá]stico|troquelad|fundici[oó]n de/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: entregas a tiempo (meta mayor a 95%), desperdicio o scrap de 1% a 3% del material, eficiencia global del equipo (OEE) de 60% a 85% según madurez, paros no programados, costo unitario por producto y días de inventario de materia prima.',
      'Cumplimiento: normas de seguridad e higiene de la STPS (comisión de seguridad, equipo de protección, capacitación con constancias), prima de riesgo de trabajo ante el IMSS, residuos y emisiones ante SEMARNAT o la autoridad ambiental estatal, protección civil, uso de suelo y licencia de funcionamiento; el producto debe cumplir la norma de etiquetado o de producto que le toque.',
      'Lo que hunde a una fábrica: cotizar sin conocer el costo real por pieza, depender de un cliente o de una máquina, mantenimiento solo correctivo y financiar al cliente con plazos largos. Lo que la hace crecer: costeo por producto, mantenimiento preventivo, calidad medida y un segundo y tercer cliente ancla.',
    ],
  },
  construccion: {
    nombre: 'Construcción, obra y remodelación',
    giros: ['construccion'],
    palabras: /constructora|construcci[oó]n|obra civil|contratista|remodelaci[oó]n|alba[ñn]iler|edificaci[oó]n/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: margen bruto por obra de 10% a 20%, días para cobrar estimaciones (meta menor a 45), desviación contra presupuesto y contra programa, anticipo recibido contra avance, obras simultáneas por residente.',
      'Cumplimiento: registro de cada obra ante el IMSS (SIROC) y cuotas obrero-patronales de los trabajadores de obra, seguridad en obra conforme a la NOM-031-STPS, licencia o permiso de construcción municipal y director responsable de obra, REPSE si se prestan servicios especializados a otro patrón, fianzas de anticipo, cumplimiento y vicios ocultos.',
      'Lo que hunde a una constructora: financiar la obra con caja propia por cobrar tarde, cotizar sin explosión de insumos, cambios de alcance sin orden de cambio firmada y arrancar obras sin anticipo. Lo que la hace crecer: control de costo por obra cada semana, estimaciones puntuales y contratos con ajuste de precios.',
    ],
  },
  // Servicios profesionales: mientras tests/departamentos.test.js exija que el giro "servicios" no active ningún
  // sector por sí solo, este paquete se activa solo por lo que dice la ficha. Para activarlo también por giro,
  // cambiar giros a ['servicios'] y ajustar esa prueba.
  servicios: {
    nombre: 'Servicios profesionales (despachos y consultoría)',
    giros: ['servicios'],
    palabras: /despacho (?:contable|jur[ií]dico|fiscal|legal|de (?:abogados|contadores|arquitectos))|consultor[ií]a|consultores|bufete|notar[ií]a|asesor[ií]a (?:legal|fiscal|contable|jur[ií]dica)|firma de (?:abogados|contadores|arquitectos)|servicios profesionales/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: horas facturables por persona de 60% a 75%, ingreso por profesional, clientes en iguala o contrato recurrente sobre el total, días de cobranza (meta menor a 45), concentración en los tres clientes principales.',
      'Cumplimiento: contrato de prestación de servicios con alcance y honorarios, CFDI y complemento de pago, cédula profesional cuando la actividad la exige, aviso de privacidad y confidencialidad de la información del cliente, REPSE ante la STPS si se pone personal a disposición de un cliente; algunos servicios son actividad vulnerable en la ley antilavado y obligan a identificar al cliente y dar avisos.',
      'Lo que hunde a un despacho: vender horas del dueño sin delegar, alcance abierto, cobrar tarde y depender de dos clientes. Lo que lo hace crecer: igualas, servicios empaquetados con precio fijo, método documentado para que lo ejecute el equipo y referidos de clientes satisfechos.',
    ],
  },
  transporte: {
    nombre: 'Transporte y logística',
    giros: ['transporte'],
    palabras: /autotransporte|\btransportes\b|transportista|transportadora|transporte de (?:carga|pasajeros|personal|mercanc)|fletes?\b|fletera|paqueter[ií]a|mensajer[ií]a|mudanzas?\b|tractocami|operador log[ií]stico|empresa de log[ií]stica/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: costo por kilómetro, kilómetros en vacío (meta menor a 20%), combustible de 30% a 40% del ingreso, rendimiento en kilómetros por litro por unidad, días de unidad parada por mantenimiento, días de cobranza del flete.',
      'Cumplimiento: permiso de la SICT para autotransporte federal (o concesión estatal en rutas locales), CFDI con complemento Carta Porte en cada traslado, pesos y dimensiones conforme a la NOM-012-SCT-2, licencia federal y examen médico vigentes de cada operador, seguro de responsabilidad civil y de carga, verificación físico-mecánica y de emisiones.',
      'Lo que hunde a un transportista: regresar vacío, tarifa que no cubre combustible y casetas, un solo cliente que paga a 60 o 90 días, robo en carretera sin seguro ni rastreo y rotación de operadores. Lo que lo hace crecer: carga de retorno pactada, costeo por ruta, mantenimiento preventivo, rastreo satelital y contratos con ajuste por combustible.',
    ],
  },
  software: {
    nombre: 'Tecnología y software',
    giros: ['software'],
    palabras: /desarrollo de software|f[aá]brica de software|software a la medida|empresa de software|\bsaas\b|desarrollo (?:web|de apps|de aplicaciones|de sistemas)|aplicaciones m[oó]viles|servicios de ti\b|soporte de ti\b/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: ingreso recurrente mensual sobre el total, cancelación anual de clientes (referencia sana menor a 10% a 15% en empresas), costo de adquisición recuperado en menos de 12 meses, margen bruto de 60% a 80% en producto y de 30% a 50% en desarrollo a la medida, meses de caja disponibles.',
      'Cumplimiento: aviso de privacidad y medidas de seguridad conforme a la ley federal de protección de datos personales, contratos con propiedad intelectual y licenciamiento claros (registro de la obra ante INDAUTOR y de la marca ante el IMPI), niveles de servicio por escrito, cesión de derechos firmada por empleados y freelancers, CFDI también a clientes del extranjero.',
      'Lo que hunde a una empresa de software: proyectos a precio fijo con alcance abierto, depender de un cliente o de un programador, no cobrar mantenimiento y quedarse sin caja antes de vender. Lo que la hace crecer: ingreso recurrente, un nicho bien definido, retención de clientes y de talento, y un producto que se entrega igual a todos.',
    ],
  },
  turismo: {
    nombre: 'Hospedaje, turismo y eventos',
    giros: ['turismo'],
    palabras: /hotel|hostal|hospedaje|airbnb|caba[ñn]as|turis|agencia de viajes|tours?\b|sal[oó]n de eventos|organizaci[oó]n de eventos/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: ocupación promedio (60% a 70% anual es sano en hotelería), tarifa promedio por noche, ingreso por habitación disponible, reservas directas contra plataformas (las comisiones de plataformas rondan 15% a 25%), calificación en reseñas y estacionalidad por temporada.',
      'Cumplimiento: inscripción en el Registro Nacional de Turismo (SECTUR), impuesto estatal sobre hospedaje, licencia de funcionamiento y protección civil con aforo, registro de huéspedes, tarifas y políticas de cancelación a la vista (Profeco), higiene de alimentos y albercas ante salubridad, licencia de alcohol si aplica y contrato por escrito en cada evento.',
      'Lo que hunde a un negocio turístico: depender de una sola plataforma, tarifa fija todo el año, malas reseñas sin respuesta y temporada baja sin plan. Lo que lo hace crecer: reserva directa (WhatsApp, sitio propio, clientes que repiten), tarifas por temporada, alianzas locales y eventos o grupos entre semana.',
    ],
  },
  agro: {
    nombre: 'Agropecuario y agroindustria',
    giros: ['agro'],
    palabras: /agr[ií]col|agropecuari|agroindustri|ganader|ganado|cosecha|cultivo|invernadero|rancho|huerta|av[ií]col|porc[ií]col|ap[ií]col|acu[ií]col|granja|vivero/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: rendimiento por hectárea o por animal, costo por unidad producida (tonelada, litro, kilo), pérdida en cosecha y poscosecha o mortandad, precio de venta contra el precio de referencia del mercado, parte de la producción vendida a intermediarios y capital de trabajo por ciclo.',
      'Cumplimiento: sanidad e inocuidad ante SENASICA (certificaciones, guías de movilización, identificación del ganado), concesión de agua ante CONAGUA, uso autorizado de agroquímicos, régimen fiscal del sector primario con sus facilidades (confirmar con contador), jornaleros registrados ante el IMSS y, para exportar, los requisitos del país destino.',
      'Lo que hunde a un productor: vender todo a un intermediario al precio que él ponga, un ciclo malo sin seguro ni reserva, financiar el ciclo con crédito caro y no llevar costos. Lo que lo hace crecer: venta directa o por contrato, valor agregado (empaque, selección, proceso), compras y ventas en grupo con otros productores y riego o tecnología que suba el rendimiento.',
    ],
  },
  servicios_personales: {
    nombre: 'Belleza, bienestar y gimnasios',
    giros: ['servicios_personales'],
    palabras: /est[eé]tica|sal[oó]n de belleza|barber|peluquer|\bspa\b|u[ñn]as\b|manicur|gimnasio|\bgym\b|crossfit|\byoga\b|pilates|masajes|tatuaj|depilaci/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: clientes que regresan (meta mayor a 60%), ocupación de la agenda o de las sillas, ticket promedio, venta de producto sobre el ingreso (10% a 20%), citas que no se presentan; en gimnasios, socios activos, bajas mensuales (3% a 5% es habitual) y asistencia.',
      'Cumplimiento: licencia de funcionamiento municipal y protección civil, precios a la vista y contratos de membresía claros (Profeco), higiene y esterilización de instrumental; los procedimientos invasivos o con aparatología médica y los tatuajes requieren aviso o licencia sanitaria (COFEPRIS o salubridad estatal) y personal con cédula cuando es acto médico; quien trabaja por comisión o renta de silla necesita contrato claro para evitar riesgo laboral.',
      'Lo que hunde a estos negocios: el personal que se va y se lleva a la clientela, agenda vacía entre semana, descuentos permanentes y no cobrar las inasistencias. Lo que los hace crecer: recordatorios y reagenda por WhatsApp, paquetes y membresías, venta de producto, reseñas en Google Maps y un estándar de servicio que no dependa de una sola persona.',
    ],
  },
  automotriz: {
    nombre: 'Talleres automotrices y refacciones',
    giros: ['automotriz'],
    palabras: /taller (?:mec[aá]nico|automotriz|de hojalater|de motos)|mec[aá]nica automotriz|automotriz|refaccion|autopartes|hojalater[ií]a|llantera|vulcanizadora|autolavado|lavado de autos|seminuevos/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: órdenes de servicio por día y ticket promedio, horas vendidas contra horas disponibles por técnico (60% a 85%), trabajos que regresan por garantía (meta menor a 3% a 5%), entregas en la fecha prometida, margen en refacciones (25% a 40%) y rotación del inventario de refacciones.',
      'Cumplimiento: presupuesto previo por escrito, autorización del cliente antes de trabajos adicionales y garantía del servicio (Profeco), registro como generador y entrega a recolector autorizado del aceite usado, filtros y baterías (SEMARNAT o autoridad ambiental estatal), licencia de funcionamiento y protección civil, seguridad del personal (STPS) y seguro por los vehículos en resguardo.',
      'Lo que hunde a un taller: retrabajos, entregar tarde, diagnósticos sin cobrar, refacciones fiadas y depender del mecánico estrella. Lo que lo hace crecer: orden de servicio con fotos y presupuesto firmado, recordatorios de mantenimiento, convenios con flotillas y aseguradoras, garantía por escrito y reseñas.',
    ],
  },
  inmobiliario: {
    nombre: 'Inmobiliaria y administración de inmuebles',
    giros: ['inmobiliario'],
    palabras: /inmobiliari|bienes ra[ií]ces|administraci[oó]n de (?:inmuebles|condominios|propiedades)|corretaje|arrendamiento de (?:locales|oficinas|departamentos|inmuebles|bodegas)|desarrollador(?:a)? de vivienda|fraccionamiento/i,
    agentes: [],
    contexto: [
      'Indicadores del sector: propiedades en cartera y con exclusiva, días promedio para cerrar una venta o renta, prospectos por cierre, comisión promedio (en venta suele ir de 3% a 6%; en renta, alrededor de un mes), desocupación y renta morosa de los inmuebles administrados.',
      'Cumplimiento: la compraventa y el arrendamiento de inmuebles son actividad vulnerable en la ley antilavado (identificar al cliente y dar avisos al SAT según el monto), contratos de exclusiva y de arrendamiento por escrito, publicidad e información de vivienda conforme a las reglas de Profeco, licencia o registro estatal de agente inmobiliario donde exista, aviso de privacidad y CFDI de comisiones y rentas.',
      'Lo que hunde a una inmobiliaria: cartera sin exclusiva, propiedades fuera de precio, ingresos solo por comisión sin colchón de caja y asesores que se van con los clientes. Lo que la hace crecer: ingreso recurrente por administración de rentas, exclusivas bien valuadas, seguimiento de prospectos y alianzas con notarías, bancos y brókers hipotecarios.',
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
