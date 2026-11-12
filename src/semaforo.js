// Evidencia de las facturas para mover el semáforo del diagnóstico.
// El diagnóstico dice lo que el dueño respondió; las facturas dicen lo que pasó. Aquí se juntan las dos cosas:
// cada regla sobre los datos reales (src/datos-reales.js) y sobre el flujo de caja (src/flujo.js) se vuelve una
// pieza de evidencia con área, color y acción. `aplicarEvidencia` (src/diagnostico.js) decide cómo mueve el color.
// Todo es local y con reglas. Estas piezas no viajan a la IA: los agentes siguen recibiendo el diagnóstico declarado.
import { hallazgosDe } from './datos-reales.js';

const dinero = (n) => `$${Math.round(n).toLocaleString('es-MX')}`;
const DIFERENCIA_NOTABLE = 20; // puntos porcentuales entre lo declarado y lo facturado para señalarlo

// Devuelve [{ area, color, texto, accion }]. Las piezas sin color son contrastes: informan, no mueven el semáforo.
// `datos` son las respuestas del diagnóstico; `flujo` es la proyección de src/flujo.js (o null).
export function evidenciaDe({ datosReales = null, flujo = null, datos = {} } = {}) {
  if (!datosReales?.ventas || datosReales.semaforo === false) return [];
  const ev = hallazgosDe(datosReales).map((h) => ({ area: h.area, color: h.color, texto: h.texto, accion: h.accion || '' }));

  if (flujo) {
    if (flujo.tieneSaldo && flujo.alerta?.nivel === 'rojo') {
      ev.push({ area: 'finanzas', color: 'rojo', texto: `${flujo.alerta.texto} Sale de tu flujo de caja a 13 semanas.`, accion: 'Decidir esta semana cómo cubrir el faltante de caja: cobrar antes, aplazar un pago o conseguir financiamiento.' });
    }
    if (flujo.totales?.porCobrarVencido > 0) {
      ev.push({ area: 'finanzas', color: 'amarillo', texto: `Hay ${dinero(flujo.totales.porCobrarVencido)} de cobranza vencida de ${dinero(flujo.totales.porCobrar)} que te deben.`, accion: 'Cobrar esta semana lo vencido, empezando por el adeudo más grande.' });
    }
  }

  // Contrastes entre lo que se respondió y lo que muestran las facturas. Solo cuando la factura identifica al cliente.
  const v = datosReales.ventas;
  const identifica = v.total > 0 && v.clientes >= 3 && (v.publicoGeneralPct || 0) < 50;
  const declarado = (campo) => (typeof datos?.[campo] === 'number' ? datos[campo] : null);
  const top3 = declarado('concentracion_top3_pct');
  if (identifica && top3 !== null && Math.abs(top3 - v.top3Pct) >= DIFERENCIA_NOTABLE) {
    ev.push({ area: 'ventas', color: null, texto: `Respondiste que tus tres clientes principales pesan ${top3}% de la venta; en tus facturas pesan ${v.top3Pct}%.`, accion: '' });
  }
  const recurrentes = declarado('clientes_recurrentes_pct');
  if (identifica && recurrentes !== null && datosReales.periodo?.meses >= 3 && v.clientes >= 5 && Math.abs(recurrentes - v.recurrenciaPct) >= DIFERENCIA_NOTABLE) {
    ev.push({ area: 'ventas', color: null, texto: `Respondiste que ${recurrentes}% de tus clientes vuelve a comprar; en tus facturas volvió ${v.recurrenciaPct}%.`, accion: '' });
  }
  return ev;
}
