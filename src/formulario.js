// Esquema del bloque A del diagnóstico. Fuente de verdad para la interfaz y las reglas.
// Tipos: texto | numero | seleccion | si_no | escala (1 a 5)

export const SECCIONES = [
  { id: 'contacto', titulo: 'Contacto' },
  { id: 'identificacion', titulo: 'Identificación' },
  { id: 'direccion', titulo: 'Dirección' },
  { id: 'finanzas', titulo: 'Finanzas' },
  { id: 'ventas', titulo: 'Ventas y clientes' },
  { id: 'marketing', titulo: 'Marketing' },
  { id: 'compras', titulo: 'Compras' },
  { id: 'operaciones', titulo: 'Operaciones' },
  { id: 'rh', titulo: 'Recursos humanos' },
  { id: 'tecnologia', titulo: 'Tecnología' },
  { id: 'fiscal', titulo: 'Fiscal y legal' },
  { id: 'riesgos', titulo: 'Riesgos' },
  { id: 'crecimiento', titulo: 'Motor de crecimiento' },
  { id: 'profundo', titulo: 'Bloque B · Profundidad por giro' },
  { id: 'cualitativo', titulo: 'Diagnóstico cualitativo' },
];

const NO_SE = ['si', 'no', 'no_se'];
const ETIQUETA_NO_SE = { si: 'Sí', no: 'No', no_se: 'No sé' };

export const CAMPOS = [
  // 0. Contacto
  { id: 'contacto_nombre', seccion: 'contacto', etiqueta: 'Nombre del responsable', tipo: 'texto', obligatorio: true },
  { id: 'contacto_cargo', seccion: 'contacto', etiqueta: 'Cargo', tipo: 'texto' },
  { id: 'confianza', seccion: 'contacto', etiqueta: '¿Qué tan seguro está de sus respuestas?', tipo: 'seleccion', opciones: ['alto', 'medio', 'bajo'], obligatorio: true },

  // 1. Identificación
  { id: 'giro', seccion: 'identificacion', etiqueta: 'Giro principal', tipo: 'seleccion', opciones: ['comercio', 'servicios', 'manufactura', 'construccion', 'alimentos', 'agencia', 'educacion', 'salud', 'otro'], obligatorio: true },
  { id: 'empleados', seccion: 'identificacion', etiqueta: 'Número de empleados', tipo: 'seleccion', opciones: ['1-5', '6-10', '11-30', '31-50', '51-250', 'mas_250'], obligatorio: true },
  { id: 'ventas_anuales', seccion: 'identificacion', etiqueta: 'Ventas anuales aproximadas', tipo: 'seleccion', opciones: ['menos_1m', '1m-5m', '5m-20m', 'mas_20m', 'no_se'], obligatorio: true },
  { id: 'antiguedad_anios', seccion: 'identificacion', etiqueta: 'Antigüedad (años)', tipo: 'numero', min: 0, max: 200, obligatorio: true },
  { id: 'forma_juridica', seccion: 'identificacion', etiqueta: 'Forma jurídica', tipo: 'seleccion', opciones: ['persona_fisica', 'srl', 'sa', 'otra'] },
  { id: 'socios', seccion: 'identificacion', etiqueta: 'Número de socios', tipo: 'numero', min: 1, max: 1000 },
  { id: 'modalidad', seccion: 'identificacion', etiqueta: 'Modalidad', tipo: 'seleccion', opciones: ['fisica', 'linea', 'mixta'] },

  // 2. Dirección
  { id: 'acuerdos_socios', seccion: 'direccion', etiqueta: '¿Existen acuerdos escritos entre socios?', tipo: 'si_no', opciones: NO_SE },
  { id: 'plan_escrito', seccion: 'direccion', etiqueta: '¿Tiene un plan escrito de negocio?', tipo: 'si_no', opciones: NO_SE },
  { id: 'dependencia_dueno', seccion: 'direccion', etiqueta: '¿Qué tanto depende la operación del dueño? (1 nada, 5 totalmente)', tipo: 'escala' },

  // 3. Finanzas
  { id: 'meses_caja', seccion: 'finanzas', etiqueta: 'Meses que podría operar sin ingresos', tipo: 'numero', min: 0, max: 120 },
  { id: 'margen_pct', seccion: 'finanzas', etiqueta: 'Margen de utilidad aproximado (%)', tipo: 'numero', min: -100, max: 100 },
  { id: 'deuda_vigente', seccion: 'finanzas', etiqueta: '¿Tiene deuda vigente?', tipo: 'si_no', opciones: NO_SE },
  { id: 'intento_credito', seccion: 'finanzas', etiqueta: '¿Ha solicitado crédito en los últimos dos años?', tipo: 'si_no', opciones: NO_SE },
  { id: 'contabilidad', seccion: 'finanzas', etiqueta: '¿Quién lleva la contabilidad?', tipo: 'seleccion', opciones: ['propia', 'externa', 'no_lleva'] },
  { id: 'estacionalidad', seccion: 'finanzas', etiqueta: '¿Sus ventas tienen temporadas fuertes y débiles?', tipo: 'si_no', opciones: NO_SE },

  // 4. Ventas y clientes
  { id: 'canales', seccion: 'ventas', etiqueta: 'Número de canales de venta', tipo: 'numero', min: 1, max: 50 },
  { id: 'clientes_recurrentes_pct', seccion: 'ventas', etiqueta: 'Porcentaje de clientes recurrentes (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'concentracion_top3_pct', seccion: 'ventas', etiqueta: 'Porcentaje de ventas de sus tres clientes principales (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'tiempo_respuesta', seccion: 'ventas', etiqueta: 'Tiempo de respuesta a clientes', tipo: 'seleccion', opciones: ['rapido', 'normal', 'lento', 'no_se'] },

  // 5. Marketing
  { id: 'presupuesto_marketing', seccion: 'marketing', etiqueta: 'Presupuesto mensual de marketing (MXN aprox.)', tipo: 'numero', min: 0, max: 100000000 },
  { id: 'mide_marketing', seccion: 'marketing', etiqueta: '¿Mide los resultados de su captación de clientes?', tipo: 'si_no', opciones: NO_SE },

  // 6. Compras
  { id: 'proveedor_unico', seccion: 'compras', etiqueta: '¿Depende de un solo proveedor para insumos clave?', tipo: 'si_no', opciones: NO_SE },
  { id: 'condiciones_pago', seccion: 'compras', etiqueta: 'Condiciones de pago con proveedores', tipo: 'texto' },

  // 7. Operaciones
  { id: 'capacidad_pct', seccion: 'operaciones', etiqueta: 'Capacidad instalada en uso (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'mermas_pct', seccion: 'operaciones', etiqueta: 'Mermas o desperdicio (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'quejas', seccion: 'operaciones', etiqueta: 'Quejas o devoluciones del último trimestre', tipo: 'seleccion', opciones: ['ninguna', 'pocas', 'frecuentes'] },
  { id: 'local', seccion: 'operaciones', etiqueta: 'Local de operación', tipo: 'seleccion', opciones: ['rentado', 'propio', 'no_aplica'] },

  // 8. Recursos humanos
  { id: 'vacantes', seccion: 'rh', etiqueta: 'Vacantes abiertas', tipo: 'numero', min: 0, max: 1000 },
  { id: 'rotacion_pct', seccion: 'rh', etiqueta: 'Rotación anual de personal (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'imss_infonavit', seccion: 'rh', etiqueta: 'Cumplimiento con IMSS e INFONAVIT', tipo: 'seleccion', opciones: ['al_corriente', 'adeudo', 'no_se'] },
  { id: 'capacitacion', seccion: 'rh', etiqueta: '¿Capacitó personal en el último año?', tipo: 'si_no', opciones: NO_SE },
  { id: 'manuales_puesto', seccion: 'rh', etiqueta: '¿Tiene manuales de puesto o procesos escritos?', tipo: 'si_no', opciones: NO_SE },
  { id: 'dificultad_contratar', seccion: 'rh', etiqueta: 'Dificultad para contratar (1 fácil, 5 muy difícil)', tipo: 'escala' },

  // 9. Tecnología
  { id: 'software', seccion: 'tecnologia', etiqueta: 'Software que usa (contable, punto de venta, CRM, nómina)', tipo: 'texto' },
  { id: 'digitalizacion', seccion: 'tecnologia', etiqueta: 'Nivel de digitalización (1 nulo, 5 avanzado)', tipo: 'escala' },
  { id: 'respaldos', seccion: 'tecnologia', etiqueta: '¿Respalda su información?', tipo: 'si_no', opciones: NO_SE },

  // 10. Fiscal y legal
  { id: 'cfdi', seccion: 'fiscal', etiqueta: '¿Emite CFDI (facturas electrónicas)?', tipo: 'si_no', opciones: NO_SE },
  { id: 'obligaciones_fiscales', seccion: 'fiscal', etiqueta: '¿Sus obligaciones fiscales están al corriente?', tipo: 'si_no', opciones: NO_SE },
  { id: 'contratos_escritos', seccion: 'fiscal', etiqueta: '¿Tiene contratos escritos con clientes y proveedores?', tipo: 'seleccion', opciones: ['si', 'parcial', 'no'] },
  { id: 'seguros', seccion: 'fiscal', etiqueta: '¿Tiene seguros contratados para su negocio?', tipo: 'si_no', opciones: NO_SE },
  { id: 'apoyos', seccion: 'fiscal', etiqueta: '¿Conoce programas de apoyo para pymes?', tipo: 'si_no', opciones: NO_SE },

  // 11. Riesgos
  { id: 'cliente_unico', seccion: 'riesgos', etiqueta: '¿Depende de un solo cliente para una parte importante de sus ingresos?', tipo: 'si_no', opciones: NO_SE },
  { id: 'conflicto_legal', seccion: 'riesgos', etiqueta: '¿Ha tenido un conflicto legal o contractual en los últimos dos años?', tipo: 'si_no', opciones: NO_SE },

  // Motor de crecimiento: eje vertical (más profundo en el mercado actual) y horizontal (nuevos mercados).
  { id: 'meta_crecimiento', seccion: 'crecimiento', etiqueta: '¿Cómo quiere crecer en los próximos 12 meses?', tipo: 'seleccion', opciones: ['vertical', 'horizontal', 'ambos', 'no_se'] },
  { id: 'crecimiento_ventas_pct', seccion: 'crecimiento', etiqueta: 'Crecimiento de ventas del último año (%)', tipo: 'numero', min: -100, max: 1000 },
  { id: 'costo_adquisicion', seccion: 'crecimiento', etiqueta: '¿Sabe cuánto le cuesta conseguir un cliente nuevo?', tipo: 'seleccion', opciones: ['lo_conozco', 'aproximado', 'no_se'] },
  { id: 'proceso_venta', seccion: 'crecimiento', etiqueta: '¿Tiene un proceso de venta escrito que cualquiera del equipo pueda seguir?', tipo: 'si_no', opciones: NO_SE },
  { id: 'venta_cruzada', seccion: 'crecimiento', etiqueta: '¿Ofrece productos o servicios adicionales a sus clientes actuales?', tipo: 'si_no', opciones: NO_SE },
  { id: 'capacidad_doble', seccion: 'crecimiento', etiqueta: '¿Podría atender el doble de demanda con lo que tiene hoy?', tipo: 'seleccion', opciones: ['si', 'con_inversion', 'no', 'no_se'] },
  { id: 'mercados_nuevos', seccion: 'crecimiento', etiqueta: '¿Ha identificado otro segmento, zona o canal donde su oferta funcione?', tipo: 'si_no', opciones: NO_SE },
  { id: 'capital_expansion', seccion: 'crecimiento', etiqueta: '¿Con qué capital financiaría una expansión?', tipo: 'seleccion', opciones: ['propio', 'credito', 'ninguno', 'no_se'] },
  { id: 'sedes', seccion: 'crecimiento', etiqueta: 'Puntos de operación actuales (sucursales, plantas u oficinas)', tipo: 'numero', min: 1, max: 1000 },

  // Bloque B: solo aplica al giro indicado. Cada campo indica el distrito que alimenta.
  { id: 'rotacion_inventario', seccion: 'profundo', distrito: 'operaciones', giros: ['comercio'], etiqueta: 'Rotación de inventario al año (veces)', tipo: 'numero', min: 0, max: 365 },
  { id: 'puntos_venta', seccion: 'profundo', distrito: 'ventas', giros: ['comercio'], etiqueta: 'Número de puntos de venta', tipo: 'numero', min: 1, max: 1000 },
  { id: 'horas_facturables_pct', seccion: 'profundo', distrito: 'operaciones', giros: ['servicios'], etiqueta: 'Porcentaje de horas facturables (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'proyectos_activos', seccion: 'profundo', distrito: 'ventas', giros: ['servicios'], etiqueta: 'Proyectos o clientes activos', tipo: 'numero', min: 0, max: 10000 },
  { id: 'paros_mes', seccion: 'profundo', distrito: 'operaciones', giros: ['manufactura'], etiqueta: 'Paros de producción al mes', tipo: 'numero', min: 0, max: 1000 },
  { id: 'antiguedad_maquinaria', seccion: 'profundo', distrito: 'operaciones', giros: ['manufactura'], etiqueta: 'Antigüedad promedio de la maquinaria (años)', tipo: 'numero', min: 0, max: 100 },
  { id: 'costo_alimentos_pct', seccion: 'profundo', distrito: 'finanzas', giros: ['alimentos'], etiqueta: 'Costo de alimentos y bebidas sobre la venta (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'merma_alimentos_pct', seccion: 'profundo', distrito: 'operaciones', giros: ['alimentos'], etiqueta: 'Merma de insumos al mes (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'ingreso_recurrente_pct', seccion: 'profundo', distrito: 'ventas', giros: ['agencia'], etiqueta: 'Ingreso recurrente (retainers) sobre el total (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'horas_facturables_agencia_pct', seccion: 'profundo', distrito: 'operaciones', giros: ['agencia'], etiqueta: 'Horas facturables por persona (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'retencion_alumnos_pct', seccion: 'profundo', distrito: 'ventas', giros: ['educacion'], etiqueta: 'Alumnos que siguen al siguiente ciclo (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'validez_oficial', seccion: 'profundo', distrito: 'fiscal', giros: ['educacion'], etiqueta: 'Validez oficial (RVOE o registro) de lo que impartes', tipo: 'seleccion', opciones: ['si', 'en_tramite', 'no', 'no_aplica'] },
  { id: 'citas_no_asistidas_pct', seccion: 'profundo', distrito: 'operaciones', giros: ['salud'], etiqueta: 'Citas que no se presentan (%)', tipo: 'numero', min: 0, max: 100 },
  { id: 'aviso_cofepris', seccion: 'profundo', distrito: 'fiscal', giros: ['salud'], etiqueta: 'Aviso de funcionamiento y responsable sanitario ante COFEPRIS', tipo: 'seleccion', opciones: ['si', 'en_tramite', 'no'] },
  { id: 'obras_activas', seccion: 'profundo', distrito: 'finanzas', giros: ['construccion'], etiqueta: 'Obras activas', tipo: 'numero', min: 0, max: 1000 },
  { id: 'dias_cobro_estimaciones', seccion: 'profundo', distrito: 'finanzas', giros: ['construccion'], etiqueta: 'Días promedio para cobrar estimaciones', tipo: 'numero', min: 0, max: 1000 },

  // 12. Cualitativo
  { id: 'preocupacion', seccion: 'cualitativo', etiqueta: 'Su principal preocupación hoy', tipo: 'texto' },
  { id: 'horas_semana', seccion: 'cualitativo', etiqueta: 'Horas semanales disponibles para mejorar el negocio', tipo: 'numero', min: 0, max: 168 },
];

export const ETIQUETAS_NO_SE = ETIQUETA_NO_SE;

// Valida y normaliza las respuestas. Devuelve { ok, errores, datos }.
export function validar(entrada) {
  const errores = [];
  const datos = {};
  if (!entrada || typeof entrada !== 'object') {
    return { ok: false, errores: ['La solicitud debe ser un objeto'], datos };
  }

  for (const campo of CAMPOS) {
    // Los campos del bloque B solo aplican a su giro; los demás se ignoran.
    if (campo.giros && !campo.giros.includes(entrada.giro)) continue;
    const valor = entrada[campo.id];
    const vacio = valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');

    if (vacio) {
      if (campo.obligatorio) errores.push(`Falta: ${campo.etiqueta}`);
      continue;
    }

    switch (campo.tipo) {
      case 'texto':
        datos[campo.id] = String(valor).trim().slice(0, 500);
        break;
      case 'numero': {
        const n = Number(valor);
        if (!Number.isFinite(n)) {
          errores.push(`${campo.etiqueta} debe ser un número`);
          break;
        }
        if ((campo.min !== undefined && n < campo.min) || (campo.max !== undefined && n > campo.max)) {
          errores.push(`${campo.etiqueta} fuera de rango`);
          break;
        }
        datos[campo.id] = n;
        break;
      }
      case 'seleccion':
        if (!campo.opciones.includes(valor)) errores.push(`${campo.etiqueta}: opción no válida`);
        else datos[campo.id] = valor;
        break;
      case 'si_no':
        if (!campo.opciones.includes(valor)) errores.push(`${campo.etiqueta}: opción no válida`);
        else datos[campo.id] = valor;
        break;
      case 'escala': {
        const n = Number(valor);
        if (!Number.isInteger(n) || n < 1 || n > 5) errores.push(`${campo.etiqueta} debe estar entre 1 y 5`);
        else datos[campo.id] = n;
        break;
      }
    }
  }

  return { ok: errores.length === 0, errores, datos };
}
