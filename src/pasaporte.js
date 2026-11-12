// Pasaporte de madurez: un documento que el negocio puede enseñar a una financiera, a un cliente grande o a un
// socio para mostrar, con su propio historial, que está ordenado y hacia dónde va. Se arma con reglas, sin IA,
// a partir de lo que la oficina ya guarda: diagnósticos fechados, avance entre ellos, lo que dicen las facturas
// y la bitácora de acciones. Sirve a cualquier giro.
// Es una autodeclaración ordenada, no una auditoría: el documento lo dice con claridad. La huella permite
// comprobar que no fue alterado: la misma instalación lo regenera y la huella debe coincidir.
import { createHash } from 'node:crypto';
import { madurez } from './progreso.js';

const ETIQUETA = { verde: 'Bien', amarillo: 'Por revisar', rojo: 'En atención', sin_datos: 'Sin datos' };
const DIA = 24 * 60 * 60 * 1000;
const fechaLarga = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const dinero = (n) => `$${Math.round(n).toLocaleString('es-MX')}`;

export function nivelDeMadurez(valor) {
  if (valor >= 4) return 'Sólida';
  if (valor >= 2.5) return 'En desarrollo';
  return 'Frágil';
}

// Tendencia con los últimos diagnósticos: compara el más reciente con el primero de la serie.
export function tendenciaDe(serie) {
  if (serie.length < 2) return { clave: 'sin_historial', texto: 'Un solo diagnóstico: todavía no hay tendencia' };
  const delta = Math.round((serie.at(-1).madurez - serie[0].madurez) * 10) / 10;
  if (delta >= 0.3) return { clave: 'mejora', texto: `Mejora (+${delta} desde el primer diagnóstico)` };
  if (delta <= -0.3) return { clave: 'baja', texto: `A la baja (${delta} desde el primer diagnóstico)` };
  return { clave: 'estable', texto: 'Estable' };
}

// Datos del pasaporte. `cifras` decide si se incluyen montos en pesos (ventas y gastos) o solo proporciones.
// acciones: { hechas, abiertas, vencidas } de la bitácora.
export function armarPasaporte({ diagnostico, serie = [], comparacion = null, datosReales = null, acciones = null, marca = {}, ficha = {}, cifras = false, ahora = new Date() }) {
  if (!diagnostico?.resultado?.distritos) return null;
  const distritos = diagnostico.resultado.distritos;
  const valor = madurez(distritos);
  const areas = Object.entries(distritos).map(([id, d]) => ({ id, nombre: d.nombre, color: d.color, estado: ETIQUETA[d.color] || d.color }));
  const cuenta = (color) => areas.filter((a) => a.color === color).length;
  const diasHistorial = serie.length > 1 ? Math.round((new Date(serie.at(-1).creado) - new Date(serie[0].creado)) / DIA) : 0;
  const diasDesdeUltimo = Math.max(0, Math.round((ahora - new Date(diagnostico.creado)) / DIA));

  const p = {
    emitido: ahora.toISOString(),
    negocio: { nombre: marca.nombre || ficha.razonSocial || 'Negocio sin nombre', razonSocial: ficha.razonSocial || '', rfc: ficha.rfc || '', giro: diagnostico.datos?.giro || '' },
    madurez: { valor, nivel: nivelDeMadurez(valor), tendencia: tendenciaDe(serie) },
    historial: { diagnosticos: serie.length || 1, dias: diasHistorial, ultimo: diagnostico.creado, diasDesdeUltimo, serie: serie.map((s) => ({ creado: s.creado, madurez: s.madurez })) },
    areas,
    resumenAreas: { bien: cuenta('verde'), revisar: cuenta('amarillo'), atencion: cuenta('rojo'), sinDatos: cuenta('sin_datos') },
    avance: comparacion ? { desde: comparacion.anterior.creado, delta: comparacion.madurez.delta, mejoraron: comparacion.conteo.mejoraron, empeoraron: comparacion.conteo.empeoraron, resueltas: comparacion.acciones.resueltas.length, texto: comparacion.resumen } : null,
    facturas: datosReales ? {
      desde: datosReales.periodo.desde, hasta: datosReales.periodo.hasta, comprobantes: datosReales.comprobantes,
      clientes: datosReales.ventas.clientes, top1Pct: datosReales.ventas.top1Pct, top3Pct: datosReales.ventas.top3Pct,
      recurrenciaPct: datosReales.ventas.recurrenciaPct, creditoPct: datosReales.ventas.creditoPct,
      cubreGastos: datosReales.ventas.total > 0 && datosReales.gastos.total > 0 ? datosReales.diferencia >= 0 : null,
      ...(cifras ? { ventas: datosReales.ventas.total, gastos: datosReales.gastos.total, nomina: datosReales.nomina } : {}),
    } : null,
    acciones: acciones || null,
    conCifras: Boolean(cifras),
  };
  // La huella cubre todo el contenido salvo la fecha de emisión: el mismo estado da la misma huella.
  const { emitido, ...contenido } = p;
  p.huella = createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
  p.folio = `${p.huella.slice(0, 4)}-${p.huella.slice(4, 8)}-${p.huella.slice(8, 12)}`.toUpperCase();
  return p;
}

// Bloques para Word o PDF (reporte.js).
export function bloquesPasaporte(p) {
  const b = [];
  const push = (tipo, texto) => b.push({ tipo, texto });
  push('titulo', `Pasaporte de madurez — ${p.negocio.nombre}`);
  push('parrafo', `Emitido el ${fechaLarga(p.emitido)} · Folio ${p.folio}${p.negocio.razonSocial ? ` · ${p.negocio.razonSocial}` : ''}${p.negocio.rfc ? ` · RFC ${p.negocio.rfc}` : ''}`);

  push('subtitulo', 'Resumen');
  push('parrafo', `Madurez del negocio: ${p.madurez.valor} de 5 (${p.madurez.nivel}). Tendencia: ${p.madurez.tendencia.texto}.`);
  push('parrafo', `Áreas evaluadas: ${p.resumenAreas.bien} bien, ${p.resumenAreas.revisar} por revisar y ${p.resumenAreas.atencion} en atención${p.resumenAreas.sinDatos ? `; ${p.resumenAreas.sinDatos} sin datos` : ''}.`);
  push('parrafo', p.historial.diagnosticos > 1
    ? `Historial: ${p.historial.diagnosticos} diagnósticos en ${p.historial.dias === 1 ? '1 día' : `${p.historial.dias} días`}; el más reciente es del ${fechaLarga(p.historial.ultimo)}.`
    : `Historial: un diagnóstico, del ${fechaLarga(p.historial.ultimo)}.`);
  if (p.historial.diasDesdeUltimo > 120) push('parrafo', `Aviso: el último diagnóstico tiene ${p.historial.diasDesdeUltimo} días. Conviene actualizarlo antes de presentar este documento.`);

  push('subtitulo', 'Estado por área');
  for (const a of p.areas) push('vineta', `${a.nombre}: ${a.estado}`);

  if (p.historial.serie.length > 1) {
    push('subtitulo', 'Evolución de la madurez');
    for (const s of p.historial.serie) push('vineta', `${fechaLarga(s.creado)}: ${s.madurez} de 5`);
  }
  if (p.avance) {
    push('subtitulo', 'Avance desde el diagnóstico anterior');
    push('parrafo', `Comparado con el del ${fechaLarga(p.avance.desde)}. ${p.avance.texto}`);
  }

  push('subtitulo', 'Lo que dicen sus facturas');
  if (p.facturas) {
    const f = p.facturas;
    push('parrafo', `Analizadas ${f.comprobantes} facturas y registros de venta del ${f.desde} al ${f.hasta}, leídos en la computadora del negocio.`);
    if (p.conCifras) push('vineta', `Ventas facturadas: ${dinero(f.ventas)}. Gastos con factura: ${dinero(f.gastos)}${f.nomina ? `. Nómina timbrada: ${dinero(f.nomina)}` : ''}.`);
    if (f.clientes) push('vineta', `Clientes identificados: ${f.clientes}. El principal representa ${f.top1Pct}% de lo facturado y los tres principales ${f.top3Pct}%.`);
    if (f.clientes) push('vineta', `${f.recurrenciaPct}% de los clientes compró en más de un mes del periodo.`);
    push('vineta', `${f.creditoPct}% de la venta se facturó a crédito o en parcialidades.`);
    if (f.cubreGastos !== null) push('vineta', f.cubreGastos ? 'Lo facturado cubre los gastos y la nómina con comprobante del periodo.' : 'En el periodo, los gastos y la nómina con comprobante superan a lo facturado.');
  } else {
    push('parrafo', 'Sin análisis de facturas: este pasaporte se basa solo en las respuestas del diagnóstico.');
  }

  if (p.acciones) {
    push('subtitulo', 'Seguimiento de acciones');
    push('parrafo', `Acciones registradas en la bitácora: ${p.acciones.hechas} terminadas, ${p.acciones.abiertas} abiertas${p.acciones.vencidas ? ` (${p.acciones.vencidas} vencidas)` : ''}.`);
  }

  push('subtitulo', 'Cómo leer este documento');
  push('vineta', 'Es una autodeclaración ordenada del negocio, generada con reglas por la aplicación aGents en su propia computadora. No es una auditoría ni una calificación crediticia.');
  push('vineta', 'El estado por área sale de las respuestas del dueño al diagnóstico; los datos de facturas salen de los comprobantes que el negocio tiene, y no incluyen operaciones sin factura.');
  push('vineta', `Huella de integridad: ${p.huella}. Para comprobar que el documento no fue alterado, pida al negocio abrir Reportes › Pasaporte de madurez y verificar el folio ${p.folio}: si los datos no han cambiado, la huella coincide.`);
  push('nota', `${p.conCifras ? 'Incluye montos en pesos por decisión del negocio.' : 'No incluye montos en pesos; el negocio puede emitir una versión con cifras.'} Folio ${p.folio}.`);
  return b;
}
