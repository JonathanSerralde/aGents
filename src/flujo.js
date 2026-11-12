// Flujo de caja a 13 semanas, con reglas y sin IA, a partir de las facturas que el negocio ya tiene.
// Responde la pregunta que más le duele a cualquier pyme: ¿en qué semana me va a faltar dinero?
// Entradas: ventas de contado (promedio reciente) y cobranza de lo facturado a crédito que sigue abierto.
// Salidas: gastos de contado, nómina timbrada y pagos a proveedores de lo comprado a crédito.
// Es una proyección con supuestos declarados, no un estado de cuenta: solo ve lo que tiene comprobante.

export const SEMANAS = 13;
const DIA = 24 * 60 * 60 * 1000;
const SEMANAS_POR_MES = 4.345;
const PLAZO_POR_DEFECTO = 30; // días, cuando no hay pagos registrados para medir el plazo real
const pesos = (n) => Math.round(n * 100) / 100;
const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / DIA);

// Resume los comprobantes en lo mínimo para proyectar: lo que sigue abierto y los promedios mensuales.
// `lista` son los comprobantes ya sin duplicados; `esPropio(rfc)` dice si un RFC es el del negocio.
export function baseDeFlujo(lista, esPropio) {
  // Pagos recibidos o hechos (complementos de pago): cuánto se ha cubierto de cada factura y cuándo.
  const pagado = new Map();
  for (const c of lista) for (const p of c.pagos || []) {
    const previo = pagado.get(p.uuid) || { importe: 0, fecha: '' };
    pagado.set(p.uuid, { importe: previo.importe + p.importe, fecha: p.fecha > previo.fecha ? p.fecha : previo.fecha });
  }

  const abiertas = [];
  const plazos = { cobrar: [], pagar: [] };
  const mensual = {}; // mes -> { contado, gastos, nomina }
  const delMes = (fecha) => (mensual[fecha.slice(0, 7)] ||= { contado: 0, gastos: 0, nomina: 0 });

  for (const c of lista) {
    const emitido = esPropio(c.emisor.rfc);
    const recibido = !emitido && esPropio(c.receptor.rfc);
    if (c.tipo === 'N' && emitido) { delMes(c.fecha).nomina += c.total; continue; }
    if (c.tipo !== 'I' && c.tipo !== 'E') continue;
    if (!emitido && !recibido) continue;
    const signo = c.tipo === 'E' ? -1 : 1;
    const lado = emitido ? 'cobrar' : 'pagar';
    if (c.metodoPago === 'PPD' && signo > 0) {
      const pago = c.uuid ? pagado.get(c.uuid) : null;
      const saldo = pesos(c.total - (pago?.importe || 0));
      if (pago?.fecha) plazos[lado].push(Math.max(0, dias(c.fecha, pago.fecha)));
      if (saldo > 0.5) abiertas.push({ lado, nombre: (emitido ? c.receptor.nombre : c.emisor.nombre) || 'Sin nombre', saldo, fecha: c.fecha });
    } else {
      // De contado (o sin método declarado, como las ventas de un CSV): cuenta en el mes en que ocurrió.
      delMes(c.fecha)[emitido ? 'contado' : 'gastos'] += signo * c.total;
    }
  }

  // Promedio de los tres meses más recientes con movimiento.
  const meses = Object.keys(mensual).sort().slice(-3);
  const promedio = (clave) => (meses.length ? pesos(meses.reduce((s, m) => s + mensual[m][clave], 0) / meses.length) : 0);
  const media = (l) => (l.length ? Math.round(l.reduce((s, n) => s + n, 0) / l.length) : null);
  return {
    abiertas,
    mesesBase: meses,
    contadoMensual: Math.max(0, promedio('contado')),
    gastosMensual: Math.max(0, promedio('gastos')),
    nominaMensual: Math.max(0, promedio('nomina')),
    diasCobro: media(plazos.cobrar),
    diasPago: media(plazos.pagar),
  };
}

const sumarDias = (iso, n) => new Date(new Date(`${iso}T12:00:00`).getTime() + n * DIA).toISOString().slice(0, 10);

// Proyecta 13 semanas a partir de hoy. `saldoInicial` es el dinero disponible hoy (null si no se capturó).
// Escenario 'conservador': 20% menos venta de contado, lo vencido se cobra más tarde y lo vencido a más de 60 días no se cobra.
export function proyectarFlujo(base, { hoy = new Date(), saldoInicial = null, escenario = 'base' } = {}) {
  if (!base) return null;
  const conservador = escenario === 'conservador';
  const hoyIso = hoy.toISOString().slice(0, 10);
  const diasCobro = base.diasCobro ?? PLAZO_POR_DEFECTO;
  const diasPago = base.diasPago ?? PLAZO_POR_DEFECTO;
  const semanas = Array.from({ length: SEMANAS }, (_, i) => ({
    numero: i + 1, desde: sumarDias(hoyIso, i * 7), hasta: sumarDias(hoyIso, i * 7 + 6),
    entradas: { contado: pesos((base.contadoMensual / SEMANAS_POR_MES) * (conservador ? 0.8 : 1)), cobranza: 0 },
    salidas: { gastos: pesos(base.gastosMensual / SEMANAS_POR_MES), nomina: pesos(base.nominaMensual / SEMANAS_POR_MES), proveedores: 0 },
  }));

  const totales = { porCobrar: 0, porCobrarVencido: 0, porPagar: 0, porPagarVencido: 0, cobranzaFuera: 0, incobrable: 0 };
  for (const a of base.abiertas) {
    const esperado = sumarDias(a.fecha, a.lado === 'cobrar' ? diasCobro : diasPago);
    const atraso = dias(esperado, hoyIso); // días de vencido (positivo) o por vencer (negativo)
    let indice = Math.floor(-atraso / 7);
    if (a.lado === 'cobrar') {
      totales.porCobrar += a.saldo;
      if (atraso > 0) {
        totales.porCobrarVencido += a.saldo;
        if (conservador && atraso > 60) { totales.incobrable += a.saldo; continue; }
        indice = conservador ? 3 : 1; // lo vencido se supone cobrado la semana 2 (base) o la 4 (conservador)
      }
      if (indice >= SEMANAS) { totales.cobranzaFuera += a.saldo; continue; }
      semanas[Math.max(0, indice)].entradas.cobranza += a.saldo;
    } else {
      totales.porPagar += a.saldo;
      if (atraso > 0) { totales.porPagarVencido += a.saldo; indice = 0; } // lo que ya venció se paga esta semana
      if (indice >= SEMANAS) continue;
      semanas[Math.max(0, indice)].salidas.proveedores += a.saldo;
    }
  }

  let saldo = saldoInicial ?? 0;
  for (const s of semanas) {
    s.entradas.cobranza = pesos(s.entradas.cobranza);
    s.salidas.proveedores = pesos(s.salidas.proveedores);
    s.totalEntradas = pesos(s.entradas.contado + s.entradas.cobranza);
    s.totalSalidas = pesos(s.salidas.gastos + s.salidas.nomina + s.salidas.proveedores);
    s.neto = pesos(s.totalEntradas - s.totalSalidas);
    saldo = pesos(saldo + s.neto);
    s.saldo = saldo;
  }
  for (const k of Object.keys(totales)) totales[k] = pesos(totales[k]);

  const tieneSaldo = saldoInicial !== null;
  const minima = semanas.reduce((m, s) => (s.saldo < m.saldo ? s : m), semanas[0]);
  const primeraNegativa = semanas.find((s) => s.saldo < 0) || null;
  let alerta;
  if (tieneSaldo && primeraNegativa) alerta = { nivel: 'rojo', semana: primeraNegativa.numero, texto: `En la semana ${primeraNegativa.numero} (del ${primeraNegativa.desde}) te faltarían $${Math.round(-primeraNegativa.saldo).toLocaleString('es-MX')}.` };
  else if (tieneSaldo) alerta = { nivel: 'verde', semana: minima.numero, texto: `No te quedas sin dinero en 13 semanas. El punto más bajo es la semana ${minima.numero}, con $${Math.round(minima.saldo).toLocaleString('es-MX')}.` };
  else if (minima.saldo < 0) alerta = { nivel: 'amarillo', semana: minima.numero, texto: `Para la semana ${minima.numero} habrías gastado $${Math.round(-minima.saldo).toLocaleString('es-MX')} más de lo que entra. Captura tu saldo de hoy para saber si alcanza.` };
  else alerta = { nivel: 'verde', semana: minima.numero, texto: 'En las 13 semanas entra más de lo que sale. Captura tu saldo de hoy para ver cuánto tendrías cada semana.' };

  const supuestos = [
    `Venta de contado: $${Math.round(base.contadoMensual).toLocaleString('es-MX')} al mes, promedio de ${base.mesesBase.length || 0} ${base.mesesBase.length === 1 ? 'mes' : 'meses'} recientes${conservador ? ', menos 20%' : ''}.`,
    `Gastos de contado: $${Math.round(base.gastosMensual).toLocaleString('es-MX')} al mes. Nómina timbrada: $${Math.round(base.nominaMensual).toLocaleString('es-MX')} al mes.`,
    `Tus clientes a crédito pagan en ${diasCobro} días${base.diasCobro === null ? ' (supuesto: no hay pagos registrados para medirlo)' : ' en promedio'}; tú pagas a proveedores en ${diasPago} días${base.diasPago === null ? ' (supuesto)' : ' en promedio'}.`,
    conservador ? 'Lo vencido se cobra hasta la semana 4 y lo vencido a más de 60 días no se cobra.' : 'Lo que ya venció se cobra en la semana 2.',
    'Solo cuenta lo que tiene factura: no ve efectivo sin comprobante, impuestos por pagar, créditos ni retiros del dueño.',
  ];

  const deudores = base.abiertas.filter((a) => a.lado === 'cobrar').map((a) => ({ nombre: a.nombre, saldo: a.saldo, fecha: a.fecha, diasVencido: Math.max(0, dias(sumarDias(a.fecha, diasCobro), hoyIso)) }))
    .sort((x, y) => y.saldo - x.saldo).slice(0, 8);

  return { hoy: hoyIso, escenario: conservador ? 'conservador' : 'base', tieneSaldo, saldoInicial: tieneSaldo ? saldoInicial : null, semanas, totales, diasCobro, diasPago, alerta, supuestos, deudores };
}
