// Reglas de semáforo y plan de acción por distrito. Heurísticas de arranque, no un estándar oficial.
// Cada regla devuelve { color, texto, accion? } o null si no aplica.
// Un distrito toma el peor color de sus reglas.
// Si ninguna pregunta que alimenta el distrito fue respondida, queda en "sin_datos".

import { CAMPOS } from './formulario.js';

const ORDEN = { verde: 0, amarillo: 1, rojo: 2 };
const PLAZO = { rojo: '30 días', amarillo: '60 días' };

const regla = (color, texto, accion) => ({ color, texto, accion });

const DISTRITOS = {
  finanzas: [
    (d) => d.meses_caja === undefined ? null
      : d.meses_caja < 1 ? regla('rojo', 'Menos de un mes de caja: riesgo inmediato de liquidez.',
        'Proyectar el flujo de caja a 90 días y definir medidas de liquidez: cobranza acelerada y revisión de gastos fijos.')
      : d.meses_caja < 3 ? regla('amarillo', 'Entre uno y tres meses de caja: colchón bajo.',
        'Fijar una meta de tres meses de caja y registrar entradas y salidas cada semana.')
      : regla('verde', 'Colchón de caja suficiente.'),
    (d) => d.margen_pct === undefined ? null
      : d.margen_pct < 10 ? regla('rojo', 'Margen menor a 10%: poco espacio para imprevistos.',
        'Calcular costo y margen de cada producto o servicio, y revisar precios de los tres más vendidos.')
      : d.margen_pct < 20 ? regla('amarillo', 'Margen entre 10% y 20%: conviene revisar costos y precios.',
        'Revisar costos variables de los productos con menor margen.')
      : null,
    (d) => d.contabilidad === 'no_lleva' ? regla('rojo', 'No lleva contabilidad: no hay visibilidad financiera.',
      'Contratar contabilidad externa o registrar ingresos y egresos cada mes.') : null,
    (d) => d.estacionalidad === 'si' ? regla('amarillo', 'Ventas estacionales: conviene proyectar caja por temporada.',
      'Proyectar la caja por temporada y reservar recursos antes de los meses fuertes.') : null,
    (d) => d.costo_alimentos_pct === undefined ? null
      : d.costo_alimentos_pct > 40 ? regla('rojo', 'Costo de alimentos y bebidas mayor a 40% de la venta: el menú no deja margen.',
        'Calcular el costo de cada platillo con receta estándar y reordenar precios y menú (meta: 28% a 35%).')
      : d.costo_alimentos_pct > 35 ? regla('amarillo', 'Costo de alimentos y bebidas entre 35% y 40% de la venta.',
        'Revisar los diez platillos más vendidos: gramaje, proveedor y precio.')
      : null,
    (d) => d.dias_cobro_estimaciones === undefined ? null
      : d.dias_cobro_estimaciones > 90 ? regla('rojo', 'Más de 90 días para cobrar estimaciones: la constructora financia la obra del cliente.',
        'Pactar anticipo y estimaciones quincenales en cada contrato y no arrancar frentes nuevos sin cobrar la estimación anterior.')
      : d.dias_cobro_estimaciones > 45 ? regla('amarillo', 'Entre 45 y 90 días para cobrar estimaciones.',
        'Asignar un responsable de ingresar y dar seguimiento a cada estimación la misma semana en que se genera.')
      : null,
    (d) => d.combustible_pct === undefined ? null
      : d.combustible_pct > 45 ? regla('rojo', 'El combustible se lleva más de 45% del ingreso: la tarifa no cubre la ruta.',
        'Costear cada ruta (combustible, casetas, operador, mantenimiento) y renegociar o dejar las que no dejan margen.')
      : d.combustible_pct > 35 ? regla('amarillo', 'Combustible entre 35% y 45% del ingreso.',
        'Medir el rendimiento en kilómetros por litro de cada unidad y operador, y pactar ajuste de tarifa por combustible.')
      : null,
    (d) => d.renta_morosa_pct === undefined ? null
      : d.renta_morosa_pct > 15 ? regla('rojo', 'Más de 15% de las rentas o comisiones se cobra con atraso.',
        'Listar cada adeudo con su antigüedad, cobrar esta semana los más viejos y exigir garantía (fiador, póliza jurídica o depósito) en contratos nuevos.')
      : d.renta_morosa_pct > 5 ? regla('amarillo', 'Entre 5% y 15% de las rentas o comisiones se cobra con atraso.',
        'Enviar recordatorio antes del vencimiento y aplicar la pena por atraso pactada en el contrato.')
      : null,
  ],

  ventas: [
    (d) => d.clientes_recurrentes_pct === undefined ? null
      : d.clientes_recurrentes_pct < 30 ? regla('rojo', 'Menos de 30% de clientes recurrentes: demanda frágil.',
        'Diseñar un programa de retención con seguimiento y ofertas a clientes actuales, y medir la recurrencia cada mes.')
      : d.clientes_recurrentes_pct < 50 ? regla('amarillo', 'Entre 30% y 50% de clientes recurrentes.',
        'Crear recordatorios y seguimiento posventa para los clientes activos.')
      : null,
    (d) => d.concentracion_top3_pct !== undefined && d.concentracion_top3_pct > 60
      ? regla('amarillo', 'Más de 60% de ventas en tres clientes: concentración de riesgo.',
        'Buscar clientes nuevos para bajar la dependencia de los tres principales.') : null,
    (d) => d.tiempo_respuesta === 'lento' ? regla('amarillo', 'Tiempo de respuesta lento a clientes.',
      'Definir un tiempo máximo de respuesta y un responsable de atención.') : null,
    (d) => d.puntos_venta !== undefined && d.puntos_venta > 1 && d.canales !== undefined && d.canales < 2
      ? regla('amarillo', 'Varios puntos de venta con un solo canal de venta.',
        'Evaluar un canal complementario, como venta en línea o entrega a domicilio.') : null,
    (d) => d.proyectos_activos === 0 ? regla('amarillo', 'Sin proyectos o clientes activos.',
      'Priorizar la captación de clientes y registrar prospectos en seguimiento.') : null,
    (d) => d.ingreso_recurrente_pct === undefined ? null
      : d.ingreso_recurrente_pct < 30 ? regla('rojo', 'Menos de 30% de ingreso recurrente: la agencia vive de proyectos sueltos.',
        'Convertir a los mejores clientes a retainer mensual con alcance y entregables definidos.')
      : d.ingreso_recurrente_pct < 50 ? regla('amarillo', 'Ingreso recurrente entre 30% y 50%.',
        'Proponer retainer a los clientes con más de dos proyectos al año.')
      : null,
    (d) => d.retencion_alumnos_pct === undefined ? null
      : d.retencion_alumnos_pct < 70 ? regla('rojo', 'Menos de 70% de alumnos sigue al siguiente ciclo: deserción alta.',
        'Montar la alerta temprana (faltas, calificaciones, pagos) y llamar a cada alumno en riesgo antes de la reinscripción.')
      : d.retencion_alumnos_pct < 85 ? regla('amarillo', 'Retención de alumnos entre 70% y 85%.',
        'Encuestar a quienes no se reinscribieron y corregir las dos causas principales.')
      : null,
    (d) => d.ingreso_recurrente_software_pct === undefined ? null
      : d.ingreso_recurrente_software_pct < 30 ? regla('rojo', 'Menos de 30% de ingreso recurrente: cada mes se empieza a vender desde cero.',
        'Cobrar póliza de mantenimiento o suscripción mensual a los clientes actuales antes de vender proyectos nuevos.')
      : d.ingreso_recurrente_software_pct < 60 ? regla('amarillo', 'Ingreso recurrente entre 30% y 60%.',
        'Empaquetar soporte, hospedaje y mejoras en un plan mensual y ofrecerlo en cada proyecto que se entregue.')
      : null,
    (d) => d.cancelacion_anual_pct === undefined ? null
      : d.cancelacion_anual_pct > 30 ? regla('rojo', 'Más de 30% de los clientes cancela o no renueva al año.',
        'Llamar a los clientes que cancelaron en los últimos seis meses, corregir las dos causas principales y revisar el uso de cada cuenta cada mes.')
      : d.cancelacion_anual_pct > 15 ? regla('amarillo', 'Entre 15% y 30% de los clientes cancela o no renueva al año.',
        'Dar seguimiento a las cuentas con poco uso y contactar a cada cliente 60 días antes de su renovación.')
      : null,
    (d) => d.reservas_directas_pct === undefined ? null
      : d.reservas_directas_pct < 20 ? regla('rojo', 'Menos de 20% de reservas directas: el negocio depende de las plataformas y de sus comisiones.',
        'Abrir un canal de reserva directa (WhatsApp, sitio propio o teléfono) y dar un beneficio a quien reserve directo o repita.')
      : d.reservas_directas_pct < 40 ? regla('amarillo', 'Reservas directas entre 20% y 40%.',
        'Guardar el contacto de cada huésped o cliente e invitarlo a reservar directo la próxima vez.')
      : null,
    (d) => d.venta_intermediario_pct === undefined ? null
      : d.venta_intermediario_pct > 80 ? regla('rojo', 'Más de 80% de la producción se vende a intermediarios: el precio lo pone otro.',
        'Buscar al menos un comprador directo o por contrato (empacadora, tienda, restaurante, industria) para una parte de la producción.')
      : d.venta_intermediario_pct > 50 ? regla('amarillo', 'Entre 50% y 80% de la producción se vende a intermediarios.',
        'Comparar el precio del intermediario contra el de referencia del mercado y vender en grupo con otros productores.')
      : null,
    (d) => d.clientes_regresan_pct === undefined ? null
      : d.clientes_regresan_pct < 40 ? regla('rojo', 'Menos de 40% de los clientes regresa o renueva.',
        'Agendar la siguiente cita antes de que el cliente se vaya y contactar por WhatsApp a quienes no han vuelto en dos meses.')
      : d.clientes_regresan_pct < 60 ? regla('amarillo', 'Entre 40% y 60% de los clientes regresa o renueva.',
        'Ofrecer paquetes o membresías y enviar recordatorios de la siguiente visita.')
      : null,
  ],

  marketing: [
    (d) => d.presupuesto_marketing === undefined ? null
      : d.presupuesto_marketing === 0 && d.mide_marketing !== 'si'
        ? regla('rojo', 'Sin presupuesto de captación y sin medición de resultados.',
          'Definir un presupuesto mensual mínimo y una meta medible para un canal de captación.')
        : d.presupuesto_marketing === 0 ? regla('amarillo', 'Sin presupuesto de captación definido.',
          'Asignar un presupuesto pequeño para probar un canal durante tres meses.') : null,
    (d) => d.mide_marketing === 'no' ? regla('amarillo', 'No mide resultados de captación.',
      'Registrar de dónde llega cada cliente nuevo.') : null,
  ],

  compras: [
    (d) => d.proveedor_unico === 'si' ? regla('amarillo', 'Dependencia de un solo proveedor para insumos clave.',
      'Identificar y calificar un proveedor alterno para los insumos clave.') : null,
  ],

  operaciones: [
    (d) => d.mermas_pct === undefined ? null
      : d.mermas_pct > 10 ? regla('rojo', 'Mermas mayores a 10%.',
        'Medir las mermas por proceso y definir un control semanal con responsable.')
      : d.mermas_pct > 5 ? regla('amarillo', 'Mermas entre 5% y 10%.',
        'Identificar las causas principales de merma y fijar una meta de reducción.')
      : null,
    (d) => d.horas_facturables_agencia_pct === undefined ? null
      : d.horas_facturables_agencia_pct < 50 ? regla('rojo', 'Menos de 50% de horas facturables: la mitad del tiempo no se cobra.',
        'Registrar horas por cuenta dos semanas y recortar cambios fuera de alcance.')
      : d.horas_facturables_agencia_pct < 65 ? regla('amarillo', 'Horas facturables entre 50% y 65%.',
        'Fijar rondas de cambios por contrato y revisar la rentabilidad por cuenta.')
      : null,
    (d) => d.citas_no_asistidas_pct === undefined ? null
      : d.citas_no_asistidas_pct > 25 ? regla('rojo', 'Más de 25% de citas no se presentan.',
        'Confirmar cada cita por WhatsApp 24 horas antes y usar lista de espera para los huecos.')
      : d.citas_no_asistidas_pct > 15 ? regla('amarillo', 'Entre 15% y 25% de citas no se presentan.',
        'Recordatorio automático y política de reagenda.')
      : null,
    (d) => d.merma_alimentos_pct === undefined ? null
      : d.merma_alimentos_pct > 8 ? regla('rojo', 'Merma de insumos mayor a 8% al mes.',
        'Registrar la merma diaria por causa (caducidad, sobreproducción, porciones) y aplicar PEPS en almacén.')
      : d.merma_alimentos_pct > 4 ? regla('amarillo', 'Merma de insumos entre 4% y 8% al mes.',
        'Ajustar compras a la venta por día de la semana y revisar porciones.')
      : null,
    (d) => d.quejas === 'frecuentes' ? regla('rojo', 'Quejas o devoluciones frecuentes.',
      'Documentar las quejas más comunes y definir un procedimiento de corrección.')
      : d.quejas === 'pocas' ? regla('amarillo', 'Algunas quejas o devoluciones.',
        'Registrar cada queja con su causa.') : null,
    (d) => d.capacidad_pct !== undefined && d.capacidad_pct > 90
      ? regla('amarillo', 'Capacidad instalada por encima de 90%: riesgo de cuello de botella.',
        'Evaluar turnos adicionales o tercerizar parte de la producción.') : null,
    (d) => d.rotacion_inventario === undefined ? null
      : d.rotacion_inventario < 2 ? regla('rojo', 'Rotación de inventario muy baja (menos de 2 veces al año).',
        'Liquidar el inventario lento y ajustar las compras a la demanda real.')
      : d.rotacion_inventario < 4 ? regla('amarillo', 'Rotación de inventario baja.',
        'Ajustar los pedidos por categoría según la demanda real.')
      : null,
    (d) => d.horas_facturables_pct === undefined ? null
      : d.horas_facturables_pct < 50 ? regla('rojo', 'Menos de la mitad de las horas son facturables.',
        'Medir el tiempo por proyecto y reducir el tiempo no facturable.')
      : d.horas_facturables_pct < 65 ? regla('amarillo', 'Horas facturables por debajo de 65%.',
        'Revisar los procesos internos que consumen horas no facturables.')
      : null,
    (d) => d.paros_mes === undefined ? null
      : d.paros_mes >= 6 ? regla('rojo', 'Seis o más paros de producción al mes.',
        'Analizar las causas de los paros y establecer mantenimiento preventivo.')
      : d.paros_mes >= 3 ? regla('amarillo', 'Paros de producción frecuentes.',
        'Registrar cada paro y su causa.')
      : null,
    (d) => d.antiguedad_maquinaria !== undefined && d.antiguedad_maquinaria > 15
      ? regla('amarillo', 'Maquinaria con más de 15 años de antigüedad.',
        'Presupuestar el mantenimiento o reemplazo de los equipos más críticos.') : null,
    (d) => d.viajes_vacios_pct === undefined ? null
      : d.viajes_vacios_pct > 40 ? regla('rojo', 'Más de 40% de los viajes regresa sin carga.',
        'Pactar carga de retorno en las rutas principales (clientes de destino, bolsas de carga o alianzas con otros transportistas) antes de aceptar más viajes de ida.')
      : d.viajes_vacios_pct > 25 ? regla('amarillo', 'Entre 25% y 40% de los viajes regresa sin carga.',
        'Registrar los kilómetros en vacío por ruta y cotizar el viaje redondo en las que no tienen retorno.')
      : null,
    (d) => d.ocupacion_pct === undefined ? null
      : d.ocupacion_pct < 40 ? regla('rojo', 'Ocupación promedio menor a 40%.',
        'Revisar tarifas por temporada, fotos y reseñas en los canales de venta, y armar una oferta para entre semana y temporada baja.')
      : d.ocupacion_pct < 55 ? regla('amarillo', 'Ocupación promedio entre 40% y 55%.',
        'Identificar los días y meses más flojos y buscar grupos, eventos o convenios con empresas para llenarlos.')
      : null,
    (d) => d.perdida_produccion_pct === undefined ? null
      : d.perdida_produccion_pct > 20 ? regla('rojo', 'Se pierde más de 20% de la producción.',
        'Medir en qué etapa se pierde (campo, cosecha, almacén, transporte o sanidad) y atacar primero la causa mayor.')
      : d.perdida_produccion_pct > 10 ? regla('amarillo', 'Se pierde entre 10% y 20% de la producción.',
        'Registrar la pérdida por causa en cada ciclo y fijar una meta de reducción.')
      : null,
    (d) => d.ocupacion_agenda_pct === undefined ? null
      : d.ocupacion_agenda_pct < 40 ? regla('rojo', 'Menos de 40% de la agenda o del cupo ocupado.',
        'Concentrar horarios y personal en las horas con demanda y lanzar una promoción solo para las horas vacías.')
      : d.ocupacion_agenda_pct < 60 ? regla('amarillo', 'Agenda o cupo ocupado entre 40% y 60%.',
        'Confirmar citas un día antes y usar lista de espera para llenar los huecos.')
      : null,
    (d) => d.retrabajos_pct === undefined ? null
      : d.retrabajos_pct > 10 ? regla('rojo', 'Más de 10% de los trabajos regresa por garantía o reclamo.',
        'Registrar cada retrabajo con su causa y técnico, y revisar cada vehículo con lista de verificación antes de entregarlo.')
      : d.retrabajos_pct > 5 ? regla('amarillo', 'Entre 5% y 10% de los trabajos regresa por garantía o reclamo.',
        'Revisar las causas más repetidas y capacitar o cambiar de proveedor de refacciones según el caso.')
      : null,
    (d) => d.entregas_tarde_pct === undefined ? null
      : d.entregas_tarde_pct > 30 ? regla('rojo', 'Más de 30% de las entregas sale después de la fecha prometida.',
        'Prometer fecha solo con diagnóstico y refacciones confirmadas, y avisar al cliente el mismo día en que cambie.')
      : d.entregas_tarde_pct > 15 ? regla('amarillo', 'Entre 15% y 30% de las entregas sale después de la fecha prometida.',
        'Llevar un tablero diario de órdenes abiertas con fecha prometida y responsable.')
      : null,
    (d) => d.desocupacion_pct === undefined ? null
      : d.desocupacion_pct > 20 ? regla('rojo', 'Más de 20% de los inmuebles lleva más de tres meses sin ocuparse o sin cerrarse.',
        'Revisar precio contra el mercado de la zona, mejorar fotos y anuncio, y depurar la cartera de las propiedades fuera de precio.')
      : d.desocupacion_pct > 10 ? regla('amarillo', 'Entre 10% y 20% de los inmuebles lleva más de tres meses sin ocuparse o sin cerrarse.',
        'Dar a cada propietario un reporte mensual de visitas y ofertas con una recomendación de precio.')
      : null,
  ],

  rh: [
    (d) => d.imss_infonavit === 'adeudo' ? regla('rojo', 'Adeudo con IMSS o INFONAVIT.',
      'Regularizar los adeudos con asesoría fiscal o laboral.')
      : d.imss_infonavit === 'no_se' ? regla('amarillo', 'No sabe si está al corriente con IMSS e INFONAVIT.',
        'Solicitar el estado de cuenta patronal y verificar el cumplimiento.') : null,
    (d) => d.capacitacion === 'no' ? regla('amarillo', 'No capacitó personal en el último año.',
      'Diseñar un plan de capacitación mínimo para el personal clave.') : null,
    (d) => d.manuales_puesto === 'no' ? regla('amarillo', 'Sin manuales de puesto: el conocimiento depende de personas.',
      'Documentar los procesos principales en manuales de puesto sencillos.') : null,
    (d) => d.rotacion_pct !== undefined && d.rotacion_pct > 40 ? regla('amarillo', 'Rotación mayor a 40% anual.',
      'Revisar las causas de salida y ajustar sueldos o condiciones de trabajo.') : null,
  ],

  tecnologia: [
    (d) => d.digitalizacion === undefined ? null
      : d.digitalizacion <= 2 ? regla('rojo', 'Digitalización baja: procesos casi manuales.',
        'Elegir una herramienta para el proceso más costoso: contabilidad, punto de venta o inventario.')
      : d.digitalizacion === 3 ? regla('amarillo', 'Digitalización media: hay oportunidades claras.',
        'Automatizar un proceso repetitivo al mes.')
      : null,
    (d) => d.respaldos === 'no' ? regla('rojo', 'No respalda su información.',
      'Configurar un respaldo automático periódico en una cuenta de su propiedad.')
      : d.respaldos === 'no_se' ? regla('amarillo', 'No sabe si respalda su información.',
        'Verificar dónde se guarda la información y si se puede restaurar.') : null,
  ],

  fiscal: [
    (d) => d.cfdi === 'no' ? regla('rojo', 'No emite CFDI: revisar cumplimiento fiscal.',
      'Revisar con un contador la obligación de emitir CFDI y regularizarla.') : null,
    (d) => d.validez_oficial === 'no' ? regla('rojo', 'Imparte estudios sin validez oficial (RVOE o registro).',
      'Decidir si se tramita el RVOE o registro ante la SEP/STPS, y mientras tanto no anunciar validez oficial.')
      : d.validez_oficial === 'en_tramite' ? regla('amarillo', 'Validez oficial en trámite.',
        'Dar seguimiento al trámite y guardar la evidencia; no prometer validez hasta tenerla.') : null,
    (d) => d.aviso_cofepris === 'no' ? regla('rojo', 'Sin aviso de funcionamiento ni responsable sanitario ante COFEPRIS.',
      'Presentar el aviso de funcionamiento y designar responsable sanitario antes de cualquier verificación.')
      : d.aviso_cofepris === 'en_tramite' ? regla('amarillo', 'Aviso de funcionamiento ante COFEPRIS en trámite.',
        'Conservar el acuse y completar los requisitos pendientes.') : null,
    (d) => d.obligaciones_fiscales === 'no' ? regla('rojo', 'Obligaciones fiscales no al corriente.',
      'Revisar con un contador las declaraciones y pagos pendientes.')
      : d.obligaciones_fiscales === 'no_se' ? regla('amarillo', 'No sabe si sus obligaciones fiscales están al corriente.',
        'Consultar su situación fiscal en el SAT con un contador.') : null,
    (d) => d.contratos_escritos === 'no' ? regla('amarillo', 'Sin contratos escritos con clientes y proveedores.',
      'Formalizar contratos con los clientes y proveedores principales.')
      : d.contratos_escritos === 'parcial' ? regla('amarillo', 'Contratos escritos solo parcialmente.',
        'Completar los contratos pendientes.') : null,
    (d) => d.seguros === 'no' ? regla('amarillo', 'Sin seguros contratados.',
      'Evaluar un seguro básico de responsabilidad civil y daños.') : null,
  ],

  direccion: [
    (d) => d.dependencia_dueno === undefined ? null
      : d.dependencia_dueno >= 4 ? regla('rojo', 'La operación depende mucho del dueño.',
        'Documentar las funciones del dueño y delegar al menos una decisión operativa cada mes.')
      : d.dependencia_dueno === 3 ? regla('amarillo', 'Dependencia media del dueño.',
        'Identificar tareas que pueden delegarse.')
      : null,
    (d) => d.acuerdos_socios === 'no' ? regla('amarillo', 'Sin acuerdos escritos entre socios.',
      'Redactar un acuerdo de socios con responsabilidades, aportaciones y reglas de salida.') : null,
    (d) => d.plan_escrito === 'no' ? regla('amarillo', 'Sin plan escrito de negocio.',
      'Escribir un plan de una página con metas a 12 meses.') : null,
  ],

  riesgos: [
    (d) => d.conflicto_legal === 'si' ? regla('rojo', 'Conflicto legal o contractual reciente.',
      'Revisar el conflicto con un abogado y documentar lo ocurrido.') : null,
    (d) => d.cliente_unico === 'si' ? regla('amarillo', 'Dependencia de un solo cliente.',
      'Diseñar un plan para ampliar la cartera de clientes.') : null,
  ],
};

export const NOMBRES_DISTRITOS = {
  finanzas: 'Finanzas',
  ventas: 'Ventas',
  marketing: 'Marketing',
  compras: 'Compras',
  operaciones: 'Operaciones',
  rh: 'Recursos humanos',
  tecnologia: 'Tecnología',
  fiscal: 'Fiscal y legal',
  direccion: 'Dirección',
  riesgos: 'Riesgos',
  crecimiento: 'Crecimiento',
};

// Áreas que deben estar fuera de rojo antes de invertir en crecer.
const BASE_PARA_CRECER = ['finanzas', 'direccion', 'operaciones'];

// Nivel 0 a 4 por eje. Cada señal cumplida suma un punto; lo que falta se vuelve recomendación.
function evaluarEjes(d) {
  const vertical = { nivel: 0, max: 4, logros: [], faltantes: [] };
  const horizontal = { nivel: 0, max: 4, logros: [], faltantes: [] };
  const marca = (eje, ok, logro, faltante) => {
    if (ok) { eje.nivel += 1; eje.logros.push(logro); } else eje.faltantes.push(faltante);
  };

  // Vertical: vender más y mejor al mercado que ya tiene.
  marca(vertical, d.proceso_venta === 'si', 'Proceso de venta repetible', 'Documentar un proceso de venta que cualquiera del equipo pueda seguir.');
  marca(vertical, d.costo_adquisicion === 'lo_conozco', 'Conoce su costo de adquisición', 'Medir cuánto cuesta conseguir un cliente nuevo.');
  marca(vertical, d.venta_cruzada === 'si', 'Vende más a sus clientes actuales', 'Diseñar una oferta adicional para los clientes que ya tiene.');
  marca(vertical, d.margen_pct !== undefined && d.margen_pct >= 20, 'Margen que aguanta invertir en captación', 'Llevar el margen por arriba de 20% antes de gastar en captación.');

  // Horizontal: replicar la operación en nuevos mercados, zonas o líneas.
  marca(horizontal, d.dependencia_dueno !== undefined && d.dependencia_dueno <= 2, 'La operación no depende del dueño', 'Delegar la operación diaria para poder abrir otro frente.');
  marca(horizontal, d.manuales_puesto === 'si', 'Procesos documentados', 'Documentar los procesos clave antes de replicarlos.');
  marca(horizontal, d.mercados_nuevos === 'si', 'Mercado nuevo identificado', 'Identificar un segmento, zona o canal concreto para expandirse.');
  marca(horizontal, d.capital_expansion === 'propio' || d.capital_expansion === 'credito', 'Capital para expandir', 'Definir con qué capital financiaría la expansión.');

  return { vertical, horizontal };
}

// Reglas del distrito Crecimiento. Reciben además los colores de los otros distritos.
function reglasCrecimiento(d, colores, ejes) {
  const hallazgos = [];
  const bloqueos = BASE_PARA_CRECER.filter((id) => colores[id] === 'rojo').map((id) => NOMBRES_DISTRITOS[id]);
  const meta = d.meta_crecimiento;

  if (bloqueos.length) {
    hallazgos.push(regla('rojo', `Crecer ahora sería arriesgado: ${bloqueos.join(', ')} en atención.`,
      `Resolver primero las acciones a 30 días de ${bloqueos.join(', ')} antes de invertir en crecimiento.`));
  }
  if (d.crecimiento_ventas_pct !== undefined && d.crecimiento_ventas_pct < 0) {
    hallazgos.push(regla('rojo', 'Las ventas cayeron el último año.', 'Revisar demanda y precios antes de expandirse.'));
  }
  if (meta === 'no_se') {
    hallazgos.push(regla('amarillo', 'Sin meta de crecimiento definida.', 'Elegir un eje: vender más al mercado actual o abrir uno nuevo.'));
  }
  if ((meta === 'vertical' || meta === 'ambos') && ejes.vertical.nivel <= 1) {
    hallazgos.push(regla('amarillo', `Motor vertical débil (${ejes.vertical.nivel} de ${ejes.vertical.max}).`, ejes.vertical.faltantes[0]));
  }
  if ((meta === 'horizontal' || meta === 'ambos') && ejes.horizontal.nivel <= 1) {
    hallazgos.push(regla('amarillo', `Motor horizontal débil (${ejes.horizontal.nivel} de ${ejes.horizontal.max}).`, ejes.horizontal.faltantes[0]));
  }
  if (d.capacidad_doble === 'no') {
    hallazgos.push(regla('amarillo', 'Sin capacidad para atender el doble de demanda.', 'Planear la ampliación de capacidad antes de impulsar las ventas.'));
  }
  return { hallazgos, bloqueos };
}

// Peso de cada área al ordenar prioridades: primero lo que cierra el negocio (caja, SAT, dirección), luego lo que lo frena.
const PESO_AREA = { finanzas: 5, fiscal: 4, direccion: 4, rh: 3, operaciones: 3, ventas: 3, riesgos: 2, compras: 2, marketing: 2, tecnologia: 2, crecimiento: 1 };
const PESO_COLOR = { rojo: 10, amarillo: 4 };

// Reglas cruzadas: contradicciones entre áreas que ninguna regla de un solo distrito ve.
// Son las que el Orquestador debe señalar primero ("invertir en captación con la caja en rojo").
export function hallazgosCruzados(d) {
  const lista = [];
  const cruce = (cond, color, texto, accion, areas) => { if (cond) lista.push({ color, texto, accion, areas }); };
  const quiere = (ejes) => ejes.includes(d.meta_crecimiento);
  cruce(d.presupuesto_marketing > 0 && d.meses_caja !== undefined && d.meses_caja < 1, 'rojo',
    'Gasta en captación con menos de un mes de caja.', 'Pausar la pauta pagada hasta tener un mes de caja; mientras, canales gratuitos (reseñas, WhatsApp, referidos).', ['finanzas', 'marketing']);
  cruce(d.presupuesto_marketing > 0 && d.clientes_recurrentes_pct !== undefined && d.clientes_recurrentes_pct < 30, 'amarillo',
    'Invierte en clientes nuevos mientras pierde a los actuales (menos de 30% recurrentes).', 'Destinar la mitad del presupuesto de captación a retención y reactivación antes de seguir captando.', ['marketing', 'ventas']);
  cruce((d.presupuesto_marketing > 0 || quiere(['vertical', 'ambos'])) && d.capacidad_pct !== undefined && d.capacidad_pct > 90, 'amarillo',
    'Quiere vender más con la capacidad al tope (más de 90%).', 'Ampliar capacidad o subir precios antes de impulsar la demanda.', ['operaciones', 'ventas']);
  cruce(quiere(['horizontal', 'ambos']) && d.dependencia_dueno !== undefined && d.dependencia_dueno >= 4, 'rojo',
    'Quiere abrir un frente nuevo pero la operación depende del dueño.', 'Delegar la operación diaria (manuales y un encargado) antes de abrir otro frente.', ['direccion', 'crecimiento']);
  cruce(d.concentracion_top3_pct !== undefined && d.concentracion_top3_pct > 60 && d.contratos_escritos !== undefined && d.contratos_escritos !== 'si', 'rojo',
    'Más de 60% de la venta en tres clientes y sin contratos escritos con todos.', 'Firmar contrato con los tres clientes principales (plazo, precio, condiciones de salida).', ['ventas', 'fiscal']);
  cruce(d.cliente_unico === 'si' && d.meses_caja !== undefined && d.meses_caja < 3, 'rojo',
    'Depende de un cliente y tiene menos de tres meses de caja: si ese cliente se va, el negocio cierra.', 'Reservar caja, negociar anticipos con el cliente principal y abrir dos clientes nuevos este trimestre.', ['riesgos', 'finanzas']);
  cruce(d.contabilidad === 'propia' && d.respaldos === 'no', 'amarillo',
    'Lleva la contabilidad en casa sin respaldos.', 'Activar hoy el respaldo automático de contabilidad y facturas.', ['tecnologia', 'finanzas']);
  cruce(d.imss_infonavit === 'adeudo' && quiere(['horizontal', 'ambos']), 'amarillo',
    'Planea expandirse con adeudos ante IMSS e INFONAVIT.', 'Regularizar las cuotas antes de abrir: ningún banco ni socio entra con adeudos patronales.', ['rh', 'crecimiento']);
  return lista.map((c) => ({ ...c, nombre: `Entre áreas: ${c.areas.map((a) => NOMBRES_DISTRITOS[a]).join(' y ')}` }));
}

// Mueve el semáforo de un resultado ya calculado con evidencia externa (facturas y flujo de caja; src/semaforo.js).
// La evidencia solo empeora un color o le da color a un área sin datos: nunca mejora lo que el dueño respondió,
// porque las facturas no ven todo el negocio. El resultado guardado no se toca; se devuelve una copia.
// Cada área movida conserva su color declarado en `declarado` y la lista queda en `evidencia.movidas`.
export function aplicarEvidencia(resultado, evidencia = []) {
  if (!resultado?.distritos || !evidencia.length) return resultado;
  const distritos = {};
  let plan = (resultado.plan || []).map((p) => ({ ...p }));
  const movidas = [];
  const peor = (a, b) => (ORDEN[b] > ORDEN[a] ? b : a);

  for (const [id, d] of Object.entries(resultado.distritos)) {
    const propia = id === 'crecimiento' ? [] : evidencia.filter((e) => e.area === id);
    if (!propia.length) { distritos[id] = { ...d }; continue; }
    const conColor = propia.filter((e) => e.color);
    const deFacturas = conColor.reduce((p, e) => peor(p, e.color), 'verde');
    const color = !conColor.length ? d.color : d.color === 'sin_datos' ? deFacturas : peor(d.color, deFacturas);
    distritos[id] = {
      ...d, color, declarado: d.color,
      hallazgos: [...d.hallazgos, ...propia.filter((e) => e.color !== 'verde').map((e) => (e.color ? `Según tus facturas: ${e.texto}` : e.texto))],
      evidencia: propia.map((e) => ({ color: e.color || null, texto: e.texto })),
    };
    if (color !== d.color) movidas.push({ id, nombre: d.nombre, de: d.color, a: color });
    for (const e of conColor) {
      if (e.accion && e.color !== 'verde' && !plan.some((p) => p.distrito === id && p.accion === e.accion)) {
        plan.push({ distrito: id, nombre: d.nombre, color: e.color, accion: e.accion, plazo: PLAZO[e.color], origen: 'facturas' });
      }
    }
  }

  // Si la evidencia puso en rojo un área base, crecer queda bloqueado igual que en `evaluar`.
  let crecimiento = resultado.crecimiento;
  const bloqueos = BASE_PARA_CRECER.filter((id) => distritos[id]?.color === 'rojo').map((id) => NOMBRES_DISTRITOS[id]);
  if (distritos.crecimiento && bloqueos.length > (resultado.crecimiento?.bloqueos?.length || 0)) {
    const c = distritos.crecimiento;
    distritos.crecimiento = {
      ...c, color: 'rojo', declarado: c.color,
      hallazgos: [`Crecer ahora sería arriesgado: ${bloqueos.join(', ')} en atención.`, ...c.hallazgos.filter((h) => !h.startsWith('Crecer ahora sería arriesgado'))],
    };
    if (c.color !== 'rojo') movidas.push({ id: 'crecimiento', nombre: c.nombre, de: c.color, a: 'rojo' });
    plan = plan.filter((p) => !(p.distrito === 'crecimiento' && p.accion.startsWith('Resolver primero las acciones a 30 días de')));
    plan.push({ distrito: 'crecimiento', nombre: c.nombre, color: 'rojo', accion: `Resolver primero las acciones a 30 días de ${bloqueos.join(', ')} antes de invertir en crecimiento.`, plazo: PLAZO.rojo, origen: 'facturas' });
    crecimiento = { ...resultado.crecimiento, preparado: false, bloqueos };
  }

  const cruzados = resultado.cruzados || [];
  const puntaje = (id, d) => PESO_COLOR[d.color] * (PESO_AREA[id] || 1) + d.hallazgos.length + cruzados.filter((c) => c.areas.includes(id)).length * 2;
  const prioridad = Object.entries(distritos)
    .filter(([, d]) => d.color === 'rojo' || d.color === 'amarillo')
    .sort(([ida, a], [idb, b]) => puntaje(idb, b) - puntaje(ida, a))
    .map(([id]) => id);
  plan.sort((a, b) => ORDEN[b.color] - ORDEN[a.color]);

  return { ...resultado, distritos, prioridad, plan, crecimiento, evidencia: { movidas, piezas: evidencia.length } };
}

// Un campo alimenta un distrito según su propiedad "distrito" o, si no la tiene, su sección.
const camposDeDistrito = (id) => CAMPOS.filter((c) => (c.distrito ?? c.seccion) === id).map((c) => c.id);

// Calcula el semáforo de cada distrito y el plan de acción ordenado por prioridad.
export function evaluar(datos) {
  const distritos = {};
  const plan = [];

  for (const [id, reglas] of Object.entries(DISTRITOS)) {
    const hallazgos = reglas.map((r) => r(datos)).filter(Boolean);
    const respondidas = camposDeDistrito(id).some((c) => c in datos);

    let color = 'sin_datos';
    if (hallazgos.length > 0) {
      color = hallazgos.reduce((peor, h) => (ORDEN[h.color] > ORDEN[peor] ? h.color : peor), 'verde');
    } else if (respondidas) {
      color = 'verde';
    }

    distritos[id] = {
      nombre: NOMBRES_DISTRITOS[id],
      color,
      hallazgos: hallazgos.map((h) => h.texto),
    };

    for (const h of hallazgos) {
      if (h.accion && (h.color === 'rojo' || h.color === 'amarillo')) {
        plan.push({ distrito: id, nombre: NOMBRES_DISTRITOS[id], color: h.color, accion: h.accion, plazo: PLAZO[h.color] });
      }
    }
  }

  // Crecimiento se evalúa al final porque depende del estado de los demás distritos.
  const colores = Object.fromEntries(Object.entries(distritos).map(([id, d]) => [id, d.color]));
  const ejes = evaluarEjes(datos);
  const { hallazgos: hallazgosCrecimiento, bloqueos } = reglasCrecimiento(datos, colores, ejes);
  const respondioCrecimiento = camposDeDistrito('crecimiento').some((c) => c in datos);
  let colorCrecimiento = 'sin_datos';
  if (hallazgosCrecimiento.length) {
    colorCrecimiento = hallazgosCrecimiento.reduce((peor, h) => (ORDEN[h.color] > ORDEN[peor] ? h.color : peor), 'verde');
  } else if (respondioCrecimiento) {
    colorCrecimiento = 'verde';
  }
  distritos.crecimiento = {
    nombre: NOMBRES_DISTRITOS.crecimiento,
    color: colorCrecimiento,
    hallazgos: hallazgosCrecimiento.map((h) => h.texto),
  };
  for (const h of hallazgosCrecimiento) {
    if (h.accion) plan.push({ distrito: 'crecimiento', nombre: NOMBRES_DISTRITOS.crecimiento, color: h.color, accion: h.accion, plazo: PLAZO[h.color] });
  }

  const crecimiento = {
    meta: datos.meta_crecimiento ?? null,
    preparado: respondioCrecimiento && bloqueos.length === 0,
    bloqueos,
    vertical: ejes.vertical,
    horizontal: ejes.horizontal,
  };

  // Contradicciones entre áreas: entran al plan como acciones "Entre áreas" a cargo de la primera área implicada.
  const cruzados = hallazgosCruzados(datos);
  for (const c of cruzados) {
    plan.push({ distrito: c.areas[0], nombre: c.nombre, color: c.color, accion: c.accion, plazo: PLAZO[c.color], cruzado: true, areas: c.areas });
  }

  // Prioridad ponderada: color × peso del área + hallazgos + contradicciones en las que participa.
  const puntaje = (id, d) => PESO_COLOR[d.color] * (PESO_AREA[id] || 1) + d.hallazgos.length + cruzados.filter((c) => c.areas.includes(id)).length * 2;
  const prioridad = Object.entries(distritos)
    .filter(([, d]) => d.color === 'rojo' || d.color === 'amarillo')
    .sort(([ida, a], [idb, b]) => puntaje(idb, b) - puntaje(ida, a))
    .map(([id]) => id);

  plan.sort((a, b) => ORDEN[b.color] - ORDEN[a.color]);

  return { distritos, prioridad, plan, crecimiento, cruzados };
}
