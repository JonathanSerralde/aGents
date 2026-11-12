// Negocio de ejemplo: llena una carpeta de empresa con datos inventados para explorar la oficina sin capturar nada.
// Todo es ficticio (nombres, RFC, cifras) y se calcula con las mismas reglas que un negocio real: dos diagnósticos
// para ver avance, facturas para el flujo de caja y el semáforo, y una junta de la semana pasada ya revisada.
// No usa IA ni sale del equipo. Las fechas son relativas a hoy para que el ejemplo siempre se vea vigente.
import { rutasDe } from './config.js';
import { validar } from './formulario.js';
import { evaluar, NOMBRES_DISTRITOS } from './diagnostico.js';
import { crearStore } from './store.js';
import { crearMarca } from './marca.js';
import { crearEmpresa } from './empresa.js';
import { crearEquipo } from './equipo.js';
import { crearMemoria, fechaLocal } from './memoria.js';
import { crearJuntas, lunesDe, domingoDe } from './junta.js';
import { crearDatosReales, analizarComprobantes } from './datos-reales.js';
import { crearPresupuesto } from './presupuesto.js';

export const NOMBRE_DEMO = 'Ferretería El Roble (ejemplo)'; // como aparece en la lista de empresas
export const MARCA_DEMO = 'Ferretería El Roble'; // como se ve en la ciudad y en los reportes
const RFC_DEMO = 'DEMO010101AA1'; // no es un RFC real
const DIA = 24 * 60 * 60 * 1000;

// Respuestas del diagnóstico más reciente. El anterior es igual salvo lo que se indica en ANTES.
const RESPUESTAS = {
  contacto_nombre: 'Laura Méndez', contacto_cargo: 'Dueña', confianza: 'medio',
  giro: 'comercio', empleados: '6-10', ventas_anuales: '1m-5m', antiguedad_anios: 9, forma_juridica: 'persona_fisica', socios: 1, modalidad: 'fisica',
  acuerdos_socios: 'no', plan_escrito: 'si', dependencia_dueno: 4,
  meses_caja: 1, margen_pct: 14, deuda_vigente: 'si', intento_credito: 'no', contabilidad: 'externa', estacionalidad: 'si',
  canales: 2, clientes_recurrentes_pct: 55, concentracion_top3_pct: 38, tiempo_respuesta: 'normal',
  presupuesto_marketing: 1500, mide_marketing: 'no',
  proveedor_unico: 'si', condiciones_pago: 'Contado con el proveedor principal; 30 días con los demás',
  capacidad_pct: 70, mermas_pct: 3, quejas: 'pocas', local: 'rentado',
  vacantes: 1, rotacion_pct: 25, imss_infonavit: 'al_corriente', capacitacion: 'si', manuales_puesto: 'no', dificultad_contratar: 3,
  software: 'Punto de venta y hoja de cálculo', digitalizacion: 3, respaldos: 'si',
  cfdi: 'si', obligaciones_fiscales: 'si', contratos_escritos: 'parcial', seguros: 'no', apoyos: 'no',
  cliente_unico: 'no', conflicto_legal: 'no',
  meta_crecimiento: 'vertical', crecimiento_ventas_pct: 6, costo_adquisicion: 'no_se', proceso_venta: 'no', venta_cruzada: 'si', capacidad_doble: 'con_inversion', mercados_nuevos: 'si', capital_expansion: 'credito', sedes: 1,
  rotacion_inventario: 4, puntos_venta: 1,
  preocupacion: 'Me deben mucho los clientes de crédito y dependo de un solo proveedor', horas_semana: 4,
};
const ANTES = { plan_escrito: 'no', meses_caja: 0, respaldos: 'no', capacitacion: 'no', digitalizacion: 2, rotacion_pct: 40 };

const EQUIPO = {
  direccion: ['Laura Méndez', 'Dueña'], finanzas: ['Laura Méndez', 'Dueña'], ventas: ['Miguel Sáenz', 'Mostrador y cobranza'],
  compras: ['Rosa Ibarra', 'Compras y almacén'], operaciones: ['Rosa Ibarra', 'Compras y almacén'], marketing: ['Miguel Sáenz', 'Mostrador y cobranza'],
  rh: ['Laura Méndez', 'Dueña'], tecnologia: ['Miguel Sáenz', 'Mostrador y cobranza'], fiscal: ['Laura Méndez', 'Dueña'], riesgos: ['Laura Méndez', 'Dueña'], crecimiento: ['Laura Méndez', 'Dueña'],
};

// Facturas inventadas de los últimos tres meses: ventas de mostrador de contado, tres clientes a crédito (uno atrasado),
// un proveedor que concentra las compras, renta, luz y nómina.
function comprobantesDemo(ahora) {
  const propio = { rfc: RFC_DEMO, nombre: 'Ferretería El Roble' };
  const hace = (dias) => new Date(ahora.getTime() - dias * DIA).toISOString().slice(0, 10);
  const lista = [];
  let n = 0;
  const folio = () => `DEMO-${String(++n).padStart(4, '0')}`;
  const factura = (emisor, receptor, total, dias, metodoPago = 'PUE', tipo = 'I') => {
    const c = { pagos: [], uuid: folio(), fecha: hace(dias), tipo, total, metodoPago, emisor, receptor };
    lista.push(c);
    return c;
  };
  const cobro = (f, dias) => lista.push({ pagos: [{ uuid: f.uuid, importe: f.total, fecha: hace(dias) }], uuid: folio(), fecha: hace(dias), tipo: 'P', total: 0, metodoPago: '', emisor: f.emisor, receptor: f.receptor });

  const publico = { rfc: 'XAXX010101000', nombre: 'Público en general' };
  const constructora = { rfc: 'DEMO020202BB2', nombre: 'Constructora Horizonte' };
  const mantenimiento = { rfc: 'DEMO030303CC3', nombre: 'Mantenimiento Integral Laguna' };
  const taller = { rfc: 'DEMO040404DD4', nombre: 'Taller Hermanos Vega' };
  const mayorista = { rfc: 'DEMO050505EE5', nombre: 'Distribuidora Ferretera del Centro' };
  const herrajes = { rfc: 'DEMO060606FF6', nombre: 'Tornillos y Herrajes del Bajío' };
  const renta = { rfc: 'DEMO070707GG7', nombre: 'Inmobiliaria Portales' };
  const luz = { rfc: 'DEMO080808HH8', nombre: 'Servicio de energía eléctrica' };

  for (const mes of [2, 1, 0]) {
    const base = mes * 30;
    for (const semana of [0, 1, 2, 3]) factura(propio, publico, 41000 + semana * 1500 - mes * 2000, base + 3 + semana * 7);
    const grande = factura(propio, constructora, 58000 - mes * 3000, base + 20, 'PPD');
    const media = factura(propio, mantenimiento, 22000, base + 14, 'PPD');
    const chica = factura(propio, taller, 14000, base + 9, 'PPD');
    // Lo más antiguo ya se cobró, salvo la constructora, que lleva dos facturas sin pagar.
    if (mes === 2) cobro(grande, base - 25);
    if (mes >= 1) { cobro(media, base - 18); cobro(chica, base - 12); }
    factura(mayorista, propio, 122000 - mes * 4000, base + 12);
    const porPagar = factura(herrajes, propio, 34000, base + 6, 'PPD');
    if (mes >= 1) lista.push({ pagos: [{ uuid: porPagar.uuid, importe: porPagar.total, fecha: hace(base - 24) }], uuid: folio(), fecha: hace(base - 24), tipo: 'P', total: 0, metodoPago: '', emisor: herrajes, receptor: propio });
    factura(renta, propio, 18000, base + 28);
    factura(luz, propio, 6500, base + 17);
    for (const quincena of [1, 16]) factura(propio, { rfc: 'DEMO090909JJ9', nombre: 'Nómina' }, 24000, base + quincena, 'PUE', 'N');
  }
  return lista;
}

// Llena la carpeta `dir` con el negocio de ejemplo. Devuelve un resumen de lo creado.
export function sembrarDemo(dir, { ahora = new Date() } = {}) {
  const rutas = rutasDe(dir);
  const hace = (dias) => new Date(ahora.getTime() - dias * DIA);

  crearMarca(rutas.dirMarca).guardarNombre(MARCA_DEMO);
  crearEmpresa(rutas.archivoEmpresa).guardar({
    razonSocial: 'Ferretería El Roble (negocio inventado)', rfc: RFC_DEMO, regimenFiscal: 'Persona física con actividad empresarial',
    horario: 'Lunes a sábado, 8:00 a 19:00', anioFundacion: String(ahora.getFullYear() - 9), sucursales: 'Un local con mostrador y bodega',
    productos: 'Herramienta manual y eléctrica\nTornillería y herrajes\nMaterial eléctrico y plomería\nPintura',
    clientesPrincipales: 'Vecinos y maestros de obra de contado; tres clientes a crédito (una constructora, una empresa de mantenimiento y un taller)',
    proveedoresPrincipales: 'Un mayorista concentra la mayor parte de las compras',
    notas: 'Negocio de ejemplo con datos inventados para conocer la aplicación.',
  });
  const equipo = crearEquipo(rutas.archivoEquipo);
  equipo.guardar({ areas: Object.fromEntries(Object.entries(EQUIPO).map(([id, [responsable, puesto]]) => [id, { responsable, puesto }])) });

  // Dos diagnósticos: el de hace cinco semanas y el de esta semana, para que "Tu avance" tenga con qué comparar.
  const store = crearStore(rutas.dirDatos);
  const diagnosticos = [[{ ...RESPUESTAS, ...ANTES }, hace(37)], [RESPUESTAS, hace(2)]].map(([respuestas, fecha]) => {
    const { ok, errores, datos } = validar(respuestas);
    if (!ok) throw new Error(`El negocio de ejemplo no pasa la validación: ${errores.join('; ')}`);
    return store.guardar({ creado: fecha.toISOString(), contacto_nombre: datos.contacto_nombre, datos, resultado: evaluar(datos), resumenIA: null, equipo: equipo.leer() });
  });

  // Facturas: solo se guarda el resumen, igual que con una carpeta real. Sin carpeta que vigilar.
  const analisis = analizarComprobantes(comprobantesDemo(ahora), RFC_DEMO);
  crearDatosReales(rutas.archivoDatosReales).guardar({
    ...analisis, carpeta: '', archivos: { cfdi: analisis.comprobantes, csv: 0 }, firma: '', momento: hace(1).toISOString(),
    saldoInicial: 64000, saldoFecha: fechaLocal(ahora), vigilar: false, semaforo: true,
  });

  // Presupuesto del mes y un gasto que espera la decisión del dueño.
  const presupuesto = crearPresupuesto(rutas.archivoPresupuesto);
  presupuesto.guardar({ areas: { marketing: 3000, compras: 130000, operaciones: 8000, tecnologia: 1500, rh: 2000 }, nota: 'Nada a crédito mientras la constructora no pague' });
  presupuesto.solicitar('marketing', { concepto: 'Volantes y anuncio en redes para la temporada de lluvias', monto: 2400, origen: 'Marketing' }, hace(1));

  // La junta de la semana pasada: tres compromisos, dos cumplidos. El pendiente llega vencido a la de esta semana.
  const memoria = crearMemoria(rutas.archivoMemoria);
  const lunesPasado = lunesDe(hace(7));
  const vence = domingoDe(lunesPasado);
  const pasados = [
    ['finanzas', 'Llamar a Constructora Horizonte y acordar fecha de pago de sus dos facturas', 'Laura Méndez', false],
    ['tecnologia', 'Programar el respaldo semanal del punto de venta en un disco externo', 'Miguel Sáenz', true],
    ['direccion', 'Escribir en una hoja las metas del trimestre y pegarla en la bodega', 'Laura Méndez', true],
  ].map(([area, texto, responsable, hecho]) => {
    const accion = memoria.agregarAccion(area, { texto, responsable, vence, origen: 'junta' });
    if (hecho) memoria.marcar(accion.id, 'hecha');
    return { id: accion.id, area, nombreArea: NOMBRES_DISTRITOS[area], texto, responsable, vence };
  });
  crearJuntas(rutas.archivoJuntas).guardar(lunesPasado, { creada: hace(7).toISOString(), compromisos: pasados });

  return { nombre: MARCA_DEMO, diagnosticos: diagnosticos.length, comprobantes: analisis.comprobantes };
}
