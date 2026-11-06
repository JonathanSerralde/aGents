// Calculadora laboral para pymes mexicanas (Ley Federal del Trabajo): aguinaldo, vacaciones y prima, finiquito,
// liquidación, PTU, fondo de ahorro, vales de despensa, descuento INFONAVIT y lista de altas y bajas.
// Reglas de la LFT con parámetros a la vista. Lo fiscal (ISR, exenciones, deducibilidad) se marca para el contador.
// Sin IA: todo se calcula aquí; el agente de RH y el de Nómina usan el resultado como hecho.
export const VIGENCIA_LABORAL = 'noviembre de 2026';
export const PARAMETROS = {
  salarioMinimoGeneral: 315.04, // diario, zona general 2026; confirmar en CONASAMI cada enero
  salarioMinimoFrontera: 440.87, // Zona Libre de la Frontera Norte 2026
  uma: 113.14, // UMA diaria vigente; el INEGI la actualiza cada febrero (confirmar)
  diasAguinaldo: 15, // mínimo de ley; la empresa puede dar más
  primaVacacional: 0.25,
  diasPrimaAntiguedad: 12, // por año de servicio
  diasIndemnizacionPorAnio: 20,
  mesesIndemnizacion: 3,
};

const redondear = (n) => Math.round(n * 100) / 100;
const numero = (v, nombre, { min = 0, max = 1e9, requerido = true } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (requerido) throw new Error(`Falta ${nombre}`);
    return undefined;
  }
  const n = Number(String(v).replace(/[,$\s]/g, ''));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${nombre} no es válido`);
  return n;
};
const fecha = (v, nombre) => {
  const d = new Date(String(v || '').slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) throw new Error(`${nombre} no es una fecha válida (AAAA-MM-DD)`);
  return d;
};
const diasEntre = (a, b) => Math.max(0, Math.round((b - a) / 86400000));

// Días de vacaciones por año de servicio cumplido (LFT art. 76, reforma "vacaciones dignas" 2023).
export function diasVacaciones(aniosCumplidos) {
  const a = Math.floor(Number(aniosCumplidos) || 0);
  if (a < 1) return 12; // durante el primer año se devengan 12 en proporción
  if (a <= 5) return 12 + 2 * (a - 1); // 12, 14, 16, 18, 20
  return Math.min(20 + 2 * Math.ceil((a - 5) / 5), 32); // 22 del 6 al 10, 24 del 11 al 15, …
}

// Antigüedad en años completos y días del año de servicio en curso.
export function antiguedad(ingreso, hasta) {
  const d1 = fecha(ingreso, 'la fecha de ingreso');
  const d2 = fecha(hasta, 'la fecha de cálculo');
  if (d2 < d1) throw new Error('La fecha de salida es anterior al ingreso');
  let anios = d2.getFullYear() - d1.getFullYear();
  const aniversario = new Date(d1); aniversario.setFullYear(d1.getFullYear() + anios);
  if (aniversario > d2) { anios -= 1; aniversario.setFullYear(aniversario.getFullYear() - 1); }
  return { anios, diasDelAnioEnCurso: diasEntre(aniversario, d2), diasTotales: diasEntre(d1, d2) };
}

// Salario diario integrado (para indemnizaciones e IMSS): salario + proporción diaria de aguinaldo y prima vacacional.
export function salarioIntegrado(salarioDiario, aniosCumplidos, { diasAguinaldo = PARAMETROS.diasAguinaldo, primaVacacional = PARAMETROS.primaVacacional } = {}) {
  const factor = 1 + diasAguinaldo / 365 + (diasVacaciones(aniosCumplidos) * primaVacacional) / 365;
  return { factor: Math.round(factor * 10000) / 10000, salarioIntegrado: redondear(salarioDiario * factor) };
}

const CALCULOS = {
  aguinaldo(p) {
    const salario = numero(p.salarioDiario, 'el salario diario', { min: 1 });
    const dias = numero(p.diasAguinaldo, 'los días de aguinaldo', { min: 15, requerido: false }) ?? PARAMETROS.diasAguinaldo;
    const trabajados = p.fechaIngreso ? Math.min(365, antiguedad(p.fechaIngreso, p.fechaCalculo || `${new Date().getFullYear()}-12-31`).diasTotales + 1) : (numero(p.diasTrabajadosAnio, 'los días trabajados en el año', { max: 366, requerido: false }) ?? 365);
    const completo = redondear(salario * dias);
    const proporcional = redondear((completo * Math.min(trabajados, 365)) / 365);
    return {
      titulo: 'Aguinaldo',
      lineas: [['Salario diario', salario], ['Días de aguinaldo', dias], ['Días trabajados en el año', Math.min(trabajados, 365)], ['Aguinaldo completo (año entero)', completo], ['Aguinaldo proporcional a pagar', proporcional]],
      total: proporcional,
      notas: ['Se paga antes del 20 de diciembre (LFT art. 87); quien no trabajó el año completo recibe la parte proporcional.', 'Exento de ISR hasta 30 UMA; el excedente se retiene: lo calcula el contador o el sistema de nómina.'],
    };
  },

  vacaciones(p) {
    const salario = numero(p.salarioDiario, 'el salario diario', { min: 1 });
    const { anios, diasDelAnioEnCurso } = antiguedad(p.fechaIngreso, p.fechaCalculo || new Date().toISOString());
    const diasAnio = diasVacaciones(anios + 1); // los que corresponden al año que se está cumpliendo
    const proporcional = Math.round(((diasAnio * diasDelAnioEnCurso) / 365) * 100) / 100;
    const pagoVacaciones = redondear(proporcional * salario);
    const prima = redondear(pagoVacaciones * PARAMETROS.primaVacacional);
    return {
      titulo: 'Vacaciones y prima vacacional',
      lineas: [['Años cumplidos', anios], ['Días de vacaciones del año en curso (LFT art. 76)', diasAnio], ['Días del año de servicio transcurridos', diasDelAnioEnCurso], ['Días proporcionales devengados', proporcional], ['Pago de vacaciones (si se liquidan)', pagoVacaciones], ['Prima vacacional 25%', prima]],
      total: redondear(pagoVacaciones + prima),
      notas: ['Tabla 2023: 12 días el primer año, +2 por año hasta 20 en el quinto; después +2 cada cinco años.', 'Las vacaciones se disfrutan, no se pagan en lugar de descansar, salvo al terminar la relación laboral; la prima vacacional sí se paga siempre (25% mínimo).', 'Deben disfrutarse dentro de los seis meses siguientes a cumplir el año (art. 81).'],
    };
  },

  finiquito(p) {
    return finiquitoBase(p, false);
  },

  liquidacion(p) {
    return finiquitoBase(p, true);
  },

  ptu(p) {
    const monto = numero(p.utilidadRepartible, 'la utilidad a repartir (10% de la utilidad fiscal)', { min: 0 });
    const diasTrab = numero(p.diasTrabajados, 'los días trabajados del trabajador', { min: 1, max: 366 });
    const salario = numero(p.salarioDiario, 'el salario diario del trabajador', { min: 1 });
    const totalDias = numero(p.totalDiasEmpleados, 'la suma de días trabajados de todos los empleados', { min: diasTrab });
    const totalSalarios = numero(p.totalSalariosDevengados, 'la suma de salarios devengados de todos los empleados en el año', { min: salario * diasTrab });
    const salarioAnual = salario * diasTrab;
    const porDias = (monto / 2) * (diasTrab / totalDias);
    const porSalario = (monto / 2) * (salarioAnual / totalSalarios);
    const sinTope = redondear(porDias + porSalario);
    const topeTresMeses = redondear(salario * 90);
    const promedioTres = numero(p.promedioPtuTresAnios, 'el promedio de PTU de los últimos tres años', { requerido: false });
    const tope = Math.max(topeTresMeses, promedioTres || 0);
    const aPagar = redondear(Math.min(sinTope, tope));
    return {
      titulo: 'PTU (reparto de utilidades) de un trabajador',
      lineas: [['Utilidad a repartir', monto], ['Parte por días trabajados', redondear(porDias)], ['Parte por salario', redondear(porSalario)], ['PTU sin tope', sinTope], ['Tope: 3 meses de salario', topeTresMeses], ...(promedioTres ? [['Tope alterno: promedio de 3 años', promedioTres]] : []), ['PTU a pagar', aPagar]],
      total: aPagar,
      notas: ['Mitad por días trabajados y mitad por salario (LFT art. 123); el salario base es la cuota diaria, sin tiempo extra ni prestaciones.', 'Desde 2021 el tope es 3 meses de salario o el promedio de la PTU de los últimos 3 años, lo que sea mayor.', 'Se paga dentro de los 60 días siguientes a la declaración anual (a más tardar el 30 de mayo en personas morales). Dirección, gerentes generales y administradores no participan; trabajadores eventuales con menos de 60 días tampoco.', 'Exento de ISR hasta 15 UMA; el resto se retiene.'],
    };
  },

  fondo_ahorro(p) {
    const salario = numero(p.salarioDiario, 'el salario diario', { min: 1 });
    const pct = numero(p.porcentajeTrabajador, 'el porcentaje de aportación del trabajador', { min: 0, max: 13 });
    const pctPatron = numero(p.porcentajePatron, 'el porcentaje de aportación del patrón', { min: 0, max: 13, requerido: false }) ?? pct;
    const mensualTrab = redondear(salario * 30.4 * pct / 100);
    const mensualPatron = redondear(salario * 30.4 * pctPatron / 100);
    const anual = redondear((mensualTrab + mensualPatron) * 12);
    const topeAnualPatron = redondear(PARAMETROS.uma * 365 * 1.3);
    const avisos = [];
    if (pctPatron > pct) avisos.push('La aportación del patrón supera la del trabajador: deja de ser deducible en esa parte.');
    if (mensualPatron * 12 > topeAnualPatron) avisos.push(`La aportación patronal anual (${mensualPatron * 12}) supera 1.3 UMA anual (${topeAnualPatron}): el excedente no es deducible.`);
    return {
      titulo: 'Fondo de ahorro',
      lineas: [['Aportación mensual del trabajador', mensualTrab], ['Aportación mensual del patrón', mensualPatron], ['Ahorro anual acumulado (sin rendimientos)', anual], ['Tope deducible de la aportación patronal (1.3 UMA anual)', topeAnualPatron]],
      total: anual,
      notas: ['Para ser deducible (LISR art. 27 XI y reglamento): aportación patronal igual o menor a la del trabajador, máximo 13% del salario, tope de 1.3 UMA anual, retiro una o dos veces al año, préstamos del fondo con reglas; se formaliza con un reglamento firmado y descuento autorizado por escrito.', ...avisos],
    };
  },

  vales(p) {
    const salario = numero(p.salarioDiario, 'el salario diario', { min: 1 });
    const pct = numero(p.porcentaje, 'el porcentaje de vales sobre el salario', { min: 0, max: 100, requerido: false });
    const montoMensual = pct !== undefined ? redondear(salario * 30.4 * pct / 100) : numero(p.montoMensual, 'el monto mensual de vales', { min: 0 });
    const topeExento = redondear(PARAMETROS.uma * 30.4); // 1 UMA mensual, referencia práctica
    return {
      titulo: 'Vales de despensa',
      lineas: [['Vales por mes', montoMensual], ['Vales por año', redondear(montoMensual * 12)], ['Referencia de exención para el trabajador (1 UMA mensual)', topeExento], ['Integra al salario del IMSS lo que exceda 40% de la UMA diaria', redondear(PARAMETROS.uma * 0.4 * 30.4)]],
      total: redondear(montoMensual * 12),
      notas: ['Los vales se entregan en monedero electrónico autorizado por el SAT para ser deducibles (53% u 47% según la Ley del ISR, según si bajaron o no las prestaciones respecto al año anterior).', 'Para el IMSS, los vales no integran salario hasta el 40% de la UMA diaria; el excedente sí cotiza (LSS art. 27 VI).', 'Los porcentajes y topes fiscales los confirma el contador: aquí solo se dimensiona el costo.'],
    };
  },

  infonavit(p) {
    const salario = numero(p.salarioDiario, 'el salario diario', { min: 1 });
    const anios = numero(p.aniosAntiguedad, 'los años de antigüedad', { min: 0, max: 60, requerido: false }) ?? 1;
    const { salarioIntegrado: sdi } = salarioIntegrado(salario, anios);
    const tipo = String(p.tipoDescuento || 'porcentaje');
    const valor = numero(p.valorDescuento, 'el valor del descuento (porcentaje, veces salario mínimo, veces UMA o cuota fija)', { min: 0 });
    let mensual;
    if (tipo === 'porcentaje') mensual = sdi * 30.4 * valor / 100;
    else if (tipo === 'vsm') mensual = PARAMETROS.salarioMinimoGeneral * 30.4 * valor;
    else if (tipo === 'uma') mensual = PARAMETROS.uma * 30.4 * valor;
    else mensual = valor;
    mensual = redondear(mensual);
    return {
      titulo: 'Descuento INFONAVIT del trabajador',
      lineas: [['Salario diario integrado (aprox.)', sdi], ['Tipo de descuento', { porcentaje: 'porcentaje del salario integrado', vsm: 'veces salario mínimo', uma: 'veces UMA', fijo: 'cuota fija' }[tipo] || tipo], ['Descuento mensual', mensual], ['Descuento quincenal', redondear(mensual / 2)], ['Aportación patronal aparte (5% del SDI, bimestral)', redondear(sdi * 30.4 * 2 * 0.05)]],
      total: mensual,
      notas: ['El tipo y valor del descuento vienen en el aviso de retención del INFONAVIT; el descuento se aplica desde el día siguiente a recibirlo y se entera bimestralmente con las cuotas del IMSS.', 'La aportación patronal del 5% es independiente del crédito y se paga por todos los trabajadores.', 'Si el trabajador causa baja, se presenta el aviso de suspensión de descuentos.'],
    };
  },

  altas_bajas(p) {
    const movimiento = String(p.movimiento || 'alta');
    const alta = [
      'Antes del primer día: contrato individual por escrito (tipo, puesto, salario, jornada, periodo de prueba de hasta 30 días o capacitación inicial hasta 3 meses), aviso de privacidad firmado.',
      'Expediente: identificación oficial, CURP, RFC, NSS (si no tiene, se tramita en el IMSS), acta de nacimiento, comprobante de domicilio, constancia de estudios si el puesto lo exige, beneficiarios designados.',
      'Alta en el IMSS a más tardar el primer día de trabajo (o dentro de los 5 días hábiles siguientes, con el salario base de cotización correcto); con eso queda inscrito en INFONAVIT y AFORE.',
      'Alta en el sistema de nómina con salario diario, SDI, prestaciones y cuenta bancaria; CFDI de nómina desde el primer pago.',
      'Inducción documentada (reglamento interior, seguridad, puesto) y constancia DC-3 cuando capacite.',
    ];
    const baja = [
      'Definir la causa: renuncia (carta firmada), fin de contrato, mutuo acuerdo, despido justificado (aviso por escrito con causa, LFT art. 47) o injustificado (procede liquidación).',
      'Calcular finiquito o liquidación con esta calculadora y pagarlo contra recibo firmado; conservar todo cinco años.',
      'Baja en el IMSS dentro de los 5 días hábiles siguientes a la fecha de separación; aviso de suspensión al INFONAVIT si tenía crédito.',
      'Último CFDI de nómina con los conceptos del finiquito; constancia laboral si la pide; entrega de equipo, accesos y claves (coordinar con Ciberseguridad).',
      'Si hay desacuerdo, el trabajador tiene 2 meses para demandar el despido; la conciliación prejudicial es obligatoria ante el Centro de Conciliación.',
    ];
    return {
      titulo: movimiento === 'baja' ? 'Lista de verificación: baja de personal' : 'Lista de verificación: alta de personal',
      lineas: (movimiento === 'baja' ? baja : alta).map((t, i) => [`Paso ${i + 1}`, t]),
      total: null,
      notas: ['Plazos de la Ley del Seguro Social y la LFT; confirmar con el contador o el abogado laboral en casos especiales (extranjeros, menores, subcontratación REPSE).'],
    };
  },
};

function finiquitoBase(p, despido) {
  const salario = numero(p.salarioDiario, 'el salario diario', { min: 1 });
  const { anios, diasDelAnioEnCurso, diasTotales } = antiguedad(p.fechaIngreso, p.fechaSalida);
  const diasPendientes = numero(p.diasSalarioPendientes, 'los días de salario pendientes de pago', { max: 31, requerido: false }) ?? 0;
  const diasVacPendientes = numero(p.diasVacacionesPendientes, 'los días de vacaciones no disfrutados de años anteriores', { max: 200, requerido: false }) ?? 0;
  const diasAguinaldo = numero(p.diasAguinaldo, 'los días de aguinaldo', { min: 15, requerido: false }) ?? PARAMETROS.diasAguinaldo;
  const salida = fecha(p.fechaSalida, 'la fecha de salida');
  const inicioAnio = new Date(salida.getFullYear(), 0, 1, 12);
  const ingreso = fecha(p.fechaIngreso, 'la fecha de ingreso');
  const diasAnioCalendario = diasEntre(ingreso > inicioAnio ? ingreso : inicioAnio, salida) + 1;
  const aguinaldoProp = redondear((salario * diasAguinaldo * Math.min(diasAnioCalendario, 365)) / 365);
  const diasVacAnio = diasVacaciones(anios + 1);
  const vacProp = Math.round(((diasVacAnio * diasDelAnioEnCurso) / 365) * 100) / 100;
  const pagoVac = redondear((vacProp + diasVacPendientes) * salario);
  const prima = redondear(pagoVac * PARAMETROS.primaVacacional);
  const salarioPendiente = redondear(salario * diasPendientes);
  const lineas = [['Salario diario', salario], ['Antigüedad', `${anios} años y ${diasDelAnioEnCurso} días (${diasTotales} días)`], ['Salarios pendientes', salarioPendiente], ['Aguinaldo proporcional', aguinaldoProp], [`Vacaciones proporcionales (${vacProp} días) + ${diasVacPendientes} pendientes`, pagoVac], ['Prima vacacional 25%', prima]];
  let total = salarioPendiente + aguinaldoProp + pagoVac + prima;
  const notas = ['El finiquito se paga al terminar la relación laboral por cualquier causa; conviene firmarlo ante el Centro de Conciliación o con recibo detallado.'];
  const { salarioIntegrado: sdi, factor } = salarioIntegrado(salario, anios, { diasAguinaldo });
  const topePrima = Math.min(salario, PARAMETROS.salarioMinimoGeneral * 2);
  const aniosProporcionales = anios + diasDelAnioEnCurso / 365;
  const primaAntiguedad = redondear(PARAMETROS.diasPrimaAntiguedad * aniosProporcionales * topePrima);
  if (despido) {
    const tresMeses = redondear(sdi * 90);
    const veinteDias = redondear(sdi * PARAMETROS.diasIndemnizacionPorAnio * aniosProporcionales);
    lineas.push([`Salario diario integrado (factor ${factor})`, sdi], ['Indemnización constitucional: 3 meses', tresMeses], [`20 días por año de servicio (${redondear(aniosProporcionales)} años)`, veinteDias], ['Prima de antigüedad: 12 días por año (salario topado a 2 mínimos)', primaAntiguedad]);
    total += tresMeses + veinteDias + primaAntiguedad;
    notas.push('Liquidación por despido injustificado (LFT arts. 48, 50 y 162): 3 meses de salario integrado, 20 días por año cuando no hay reinstalación, prima de antigüedad y el finiquito. Si el despido fue justificado y se avisó por escrito, solo procede el finiquito y, con 15 años o más, la prima de antigüedad.', 'Los salarios caídos (hasta 12 meses) solo aplican si hay juicio; no se incluyen aquí.');
  } else if (anios >= 15) {
    lineas.push(['Prima de antigüedad (renuncia con 15 años o más)', primaAntiguedad]);
    total += primaAntiguedad;
    notas.push('Por renuncia voluntaria la prima de antigüedad solo procede con 15 años de servicio o más (LFT art. 162).');
  } else {
    notas.push('Por renuncia con menos de 15 años no hay prima de antigüedad ni indemnización.');
  }
  notas.push('Las retenciones de ISR sobre finiquito e indemnización (exención de 90 UMA por año de servicio en la indemnización) las calcula el contador.');
  return { titulo: despido ? 'Liquidación por despido injustificado' : 'Finiquito por renuncia o fin de contrato', lineas, total: redondear(total), notas };
}

export const TIPOS_CALCULO = {
  aguinaldo: 'Aguinaldo',
  vacaciones: 'Vacaciones y prima vacacional',
  finiquito: 'Finiquito (renuncia o fin de contrato)',
  liquidacion: 'Liquidación (despido injustificado)',
  ptu: 'PTU (reparto de utilidades)',
  fondo_ahorro: 'Fondo de ahorro',
  vales: 'Vales de despensa',
  infonavit: 'Descuento INFONAVIT',
  altas_bajas: 'Altas y bajas de personal (lista de verificación)',
};

// Campos que pide cada cálculo, para armar el formulario en pantalla.
export const CAMPOS_CALCULO = {
  aguinaldo: [['salarioDiario', 'Salario diario', 'numero'], ['fechaIngreso', 'Fecha de ingreso (si entró este año)', 'fecha', false], ['diasTrabajadosAnio', 'o días trabajados en el año', 'numero', false], ['diasAguinaldo', 'Días de aguinaldo (mínimo 15)', 'numero', false]],
  vacaciones: [['salarioDiario', 'Salario diario', 'numero'], ['fechaIngreso', 'Fecha de ingreso', 'fecha'], ['fechaCalculo', 'Fecha de cálculo (hoy si se deja vacío)', 'fecha', false]],
  finiquito: [['salarioDiario', 'Salario diario', 'numero'], ['fechaIngreso', 'Fecha de ingreso', 'fecha'], ['fechaSalida', 'Fecha de salida', 'fecha'], ['diasSalarioPendientes', 'Días de salario pendientes de pago', 'numero', false], ['diasVacacionesPendientes', 'Días de vacaciones no disfrutados de años anteriores', 'numero', false], ['diasAguinaldo', 'Días de aguinaldo (mínimo 15)', 'numero', false]],
  liquidacion: [['salarioDiario', 'Salario diario', 'numero'], ['fechaIngreso', 'Fecha de ingreso', 'fecha'], ['fechaSalida', 'Fecha de salida', 'fecha'], ['diasSalarioPendientes', 'Días de salario pendientes de pago', 'numero', false], ['diasVacacionesPendientes', 'Días de vacaciones no disfrutados de años anteriores', 'numero', false], ['diasAguinaldo', 'Días de aguinaldo (mínimo 15)', 'numero', false]],
  ptu: [['utilidadRepartible', 'Utilidad a repartir (10% de la utilidad fiscal)', 'numero'], ['salarioDiario', 'Salario diario del trabajador', 'numero'], ['diasTrabajados', 'Días trabajados por el trabajador en el año', 'numero'], ['totalDiasEmpleados', 'Suma de días trabajados de todos los empleados', 'numero'], ['totalSalariosDevengados', 'Suma de salarios devengados de todos en el año', 'numero'], ['promedioPtuTresAnios', 'Promedio de PTU de los últimos 3 años (si lo hay)', 'numero', false]],
  fondo_ahorro: [['salarioDiario', 'Salario diario', 'numero'], ['porcentajeTrabajador', 'Porcentaje que aporta el trabajador (máximo 13)', 'numero'], ['porcentajePatron', 'Porcentaje que aporta el patrón (igual si se deja vacío)', 'numero', false]],
  vales: [['salarioDiario', 'Salario diario', 'numero'], ['porcentaje', 'Porcentaje de vales sobre el salario', 'numero', false], ['montoMensual', 'o monto mensual de vales', 'numero', false]],
  infonavit: [['salarioDiario', 'Salario diario', 'numero'], ['aniosAntiguedad', 'Años de antigüedad', 'numero', false], ['tipoDescuento', 'Tipo de descuento (porcentaje, vsm, uma, fijo)', 'opcion', true, ['porcentaje', 'vsm', 'uma', 'fijo']], ['valorDescuento', 'Valor del descuento', 'numero']],
  altas_bajas: [['movimiento', 'Movimiento', 'opcion', true, ['alta', 'baja']]],
};

export function calcular(tipo, parametros = {}) {
  const fn = CALCULOS[tipo];
  if (!fn) throw new Error('Tipo de cálculo desconocido');
  const r = fn(parametros || {});
  return { tipo, ...r, vigencia: VIGENCIA_LABORAL, parametros: { salarioMinimoGeneral: PARAMETROS.salarioMinimoGeneral, uma: PARAMETROS.uma } };
}

// Texto corto para registrar el resultado como hecho en la memoria compartida.
export function resumenCalculo(r) {
  const total = r.total === null ? '' : ` Total: $${Number(r.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}.`;
  return `${r.titulo} calculado con la calculadora laboral (LFT, ${r.vigencia}).${total}`;
}
