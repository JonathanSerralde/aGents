// Herramientas de los agentes: funciones que corren en este equipo y que el modelo puede pedir durante una orden,
// en lugar de adivinar. Sirven para dos cosas: cifras exactas (calculadora laboral, flujo de caja, presupuesto) y
// búsqueda bajo demanda en la memoria y en los documentos del negocio. El proveedor solo recibe el resultado.
// Cada uso es otra ida y vuelta con la IA, así que hay un tope por orden.
import { TIPOS_CALCULO, CAMPOS_CALCULO, calcular, resumenCalculo } from './laboral.js';

export const MAX_USOS_HERRAMIENTA = 3;
const dinero = (n) => `$${Math.round(n || 0).toLocaleString('es-MX')}`;

export const DEFINICIONES = [
  {
    name: 'buscar_en_memoria',
    description: 'Busca en el archivo de memoria de la oficina (hechos del negocio, decisiones del dueño, conclusiones anteriores y acciones cumplidas). Úsala cuando necesites un dato de la empresa que no está en tu contexto, antes de pedírselo al dueño.',
    input_schema: { type: 'object', properties: { consulta: { type: 'string', description: 'Palabras clave de lo que buscas, por ejemplo "política de crédito a clientes".' } }, required: ['consulta'] },
  },
  {
    name: 'buscar_en_documentos',
    description: 'Busca en los documentos que el dueño subió y en sus carpetas de notas (manuales, listas de precios, contratos, políticas). Devuelve los fragmentos relacionados con su fuente. Úsala cuando la respuesta deba salir de un documento del negocio.',
    input_schema: { type: 'object', properties: { consulta: { type: 'string', description: 'Palabras clave del tema o del documento.' } }, required: ['consulta'] },
  },
  {
    name: 'calcular_laboral',
    description: `Calcula con las reglas de la Ley Federal del Trabajo: ${Object.entries(TIPOS_CALCULO).map(([id, n]) => `${id} (${n})`).join(', ')}. Úsala siempre que haga falta una cifra laboral; no la calcules tú. Si falta un dato obligatorio, pídelo al dueño.`,
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: Object.keys(TIPOS_CALCULO) },
        parametros: { type: 'object', description: `Datos del cálculo. Campos por tipo: ${Object.entries(CAMPOS_CALCULO).map(([id, campos]) => `${id}: ${campos.map((c) => c[0]).join(', ')}`).join('; ')}. Fechas como AAAA-MM-DD; dinero en pesos.` },
      },
      required: ['tipo', 'parametros'],
    },
  },
  {
    name: 'leer_flujo_de_caja',
    description: 'Devuelve las cifras del flujo de caja a 13 semanas y de la cobranza, calculadas con las facturas del negocio. Úsala para hablar de dinero disponible, faltantes o cuentas por cobrar con cifras reales.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'leer_presupuesto',
    description: 'Devuelve el presupuesto del mes por área: asignado, aprobado, disponible y gastos por aprobar. Úsala antes de proponer un gasto.',
    input_schema: { type: 'object', properties: {} },
  },
];

// deps: lo que el servidor presta a las herramientas. Devuelve { definiciones, ejecutar(nombre, entrada) -> texto }.
// Cada herramienta devuelve texto corto: es lo que viaja de regreso al modelo.
export function crearHerramientas({ buscarMemoria, buscarDocumentos, flujo, presupuesto, compartirCifras, permiteDocumentos }) {
  const ejecutores = {
    buscar_en_memoria: ({ consulta }) => {
      const r = buscarMemoria(String(consulta || '').slice(0, 200));
      return r.length ? r.map((e) => `- ${e.texto} [${e.tipo}${e.fuente ? `, ${e.fuente}` : ''}, ${String(e.momento || '').slice(0, 10)}]`).join('\n') : 'No hay nada en la memoria sobre eso. Pídele el dato al dueño.';
    },
    buscar_en_documentos: ({ consulta }) => {
      if (!permiteDocumentos()) return 'El dueño tiene desactivado el uso de documentos con IA.';
      const r = buscarDocumentos(String(consulta || '').slice(0, 200));
      return r.length ? r.map((f) => `[${f.fuente}] ${f.fragmento}`).join('\n\n') : 'Ningún documento ni nota habla de eso.';
    },
    calcular_laboral: ({ tipo, parametros }) => {
      try {
        return `${resumenCalculo(calcular(String(tipo || ''), parametros && typeof parametros === 'object' ? parametros : {}))} (fuente: calculadora laboral de la oficina)`;
      } catch (err) {
        return `No se pudo calcular: ${err.message}. Pide al dueño el dato que falta.`;
      }
    },
    leer_flujo_de_caja: () => {
      if (!compartirCifras()) return 'El dueño no ha compartido con los agentes las cifras de sus facturas (Configuración › Datos reales). Pídele el dato o sugiérele encenderlo.';
      const f = flujo();
      if (!f) return 'No hay facturas analizadas: no existe flujo de caja todavía.';
      const semanas = f.semanas.slice(0, 6).map((s) => `semana ${s.numero} (${s.desde}): entra ${dinero(s.totalEntradas)}, sale ${dinero(s.totalSalidas)}${f.tieneSaldo ? `, saldo ${dinero(s.saldo)}` : ''}`);
      return [f.alerta?.texto || '', `Por cobrar ${dinero(f.totales.porCobrar)} (${dinero(f.totales.porCobrarVencido)} vencido); por pagar ${dinero(f.totales.porPagar)}.`, ...semanas].filter(Boolean).join('\n');
    },
    leer_presupuesto: () => {
      const filas = presupuesto();
      const con = filas.filter((r) => r.asignado || r.aprobado || r.pendiente);
      return con.length ? con.map((r) => `- ${r.nombre}: asignado ${dinero(r.asignado)}, aprobado este mes ${dinero(r.aprobado)}, disponible ${dinero(r.disponible)}${r.pendiente ? `, por aprobar ${dinero(r.pendiente)}` : ''}`).join('\n') : 'El dueño no ha capturado presupuesto por área.';
    },
  };
  return {
    definiciones: DEFINICIONES,
    ejecutar(nombre, entrada) {
      const fn = ejecutores[nombre];
      if (!fn) return 'Esa herramienta no existe.';
      try { return String(fn(entrada && typeof entrada === 'object' ? entrada : {})).slice(0, 2500); } catch (err) { return `La herramienta falló: ${err.message}`; }
    },
  };
}
