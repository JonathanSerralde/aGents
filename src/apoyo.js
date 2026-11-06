// Agentes de apoyo transversal: no son un área del negocio (sin semáforo ni edificio),
// pero ven todas las áreas y ayudan a interpretar, planear, capacitar y operar departamentos específicos.
// La lista nace del organigrama típico de una empresa comercial mexicana (docs/00-principios.md, "Departamentos").
import { SECTORES, AGENTES_OPCIONALES, sectoresActivos } from './sectores.js';

export const NOMBRES_APOYO = {
  analista: 'Analista',
  planificador: 'Planificador',
  brainstorm: 'Brainstorm y creatividad',
  descubrimiento: 'Descubrimiento de ideas',
  proyectos: 'Gestión ágil de proyectos',
  inversiones: 'Análisis de inversiones',
  capacitacion: 'Capacitación',
  trafico: 'Tráfico digital',
  auditoria: 'Auditoría',
  contraloria: 'Contraloría',
  mejora: 'Mejora continua',
  transformacion: 'Transformación digital',
  mercado: 'Investigación de mercado',
  ciberseguridad: 'Ciberseguridad',
  tienda: 'Operación de tienda',
  imagen: 'Imagen y exhibición',
  alimentos: 'Alimentos y bebidas',
  produccion: 'Producción y calidad',
  expansion: 'Expansión y aperturas',
  juridico: 'Jurídico',
  mantenimiento: 'Mantenimiento',
  reclutamiento: 'Reclutamiento y selección',
  nomina: 'Nómina y seguridad social',
  perdidas: 'Prevención de pérdidas',
  inventarios: 'Inventarios y almacén',
  contabilidad: 'Contabilidad',
  logistica: 'Logística e importaciones',
  ecommerce: 'Venta en línea',
  atencion: 'Atención a clientes',
  credito: 'Crédito y cobranza',
  administracion: 'Administración de oficina',
  // Opcionales por sector (src/sectores.js)
  cuentas: 'Cuentas y proyectos de agencia',
  escolar: 'Control escolar y académico',
  admisiones: 'Admisiones y retención de alumnos',
  clinico: 'Operación clínica y sanitaria',
};

export const AGENTES_APOYO = Object.keys(NOMBRES_APOYO);

// Agentes opcionales: solo se activan cuando el sector del negocio los necesita. El usuario puede forzarlos desde el
// equipo (opcionales: { [id]: 'auto' | 'si' | 'no' }).
export const OPCIONALES = AGENTES_OPCIONALES;
export const MODOS_OPCIONAL = ['auto', 'si', 'no'];

// Devuelve { activos, inactivos: { id: motivo }, sectores, opcionales } según diagnóstico, ficha y elección del usuario.
export function estadoApoyo({ giro = '', ficha = null, opcionales = {} } = {}) {
  const sectores = sectoresActivos({ giro, ficha });
  const inactivos = {};
  const detalle = {};
  for (const [id, regla] of Object.entries(OPCIONALES)) {
    const modo = MODOS_OPCIONAL.includes(opcionales?.[id]) ? opcionales[id] : 'auto';
    const activo = modo === 'si' ? true : modo === 'no' ? false : sectores.includes(regla.sector);
    if (!activo) inactivos[id] = modo === 'no' ? 'desactivado por el usuario en el equipo' : `inactivo: ${regla.condicion}`;
    detalle[id] = { sector: regla.sector, sectorNombre: SECTORES[regla.sector].nombre, condicion: regla.condicion, modo, activo };
  }
  return { activos: AGENTES_APOYO.filter((id) => !inactivos[id]), inactivos, sectores, opcionales: detalle };
}
