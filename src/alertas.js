// Avisos de la oficina: lo que conviene atender, detectado con reglas sobre los datos locales, sin gastar IA.
// Cada aviso trae el agente que puede ayudar y la orden ya redactada; la IA solo se usa si el dueño la envía.
const dinero = (n) => `$${Math.round(n).toLocaleString('es-MX')}`;

// Recibe lo que la oficina ya sabe. Devuelve [{ id, nivel: 'rojo' | 'amarillo', texto, area, orden }], lo más grave primero.
export function alertasDe({ flujo = null, presupuesto = [], gastos = [], vencidas = [], agenda = null, respaldo = null, ahora = new Date() } = {}) {
  const avisos = [];
  const push = (id, nivel, texto, area, orden) => avisos.push({ id, nivel, texto, area, orden });

  if (flujo?.tieneSaldo && flujo.alerta?.nivel === 'rojo') {
    push('caja', 'rojo', flujo.alerta.texto, 'finanzas', 'Mi flujo de caja marca un faltante en las próximas semanas. Dime qué cobrar primero, qué pago puedo aplazar y qué decisión debo tomar esta semana.');
  }
  if (flujo?.totales?.porCobrarVencido > 0) {
    push('cobranza', 'amarillo', `Tienes ${dinero(flujo.totales.porCobrarVencido)} de cobranza vencida.`, 'credito', 'Tengo cobranza vencida. Arma el plan para cobrarla esta semana, con el orden de las llamadas y el mensaje para cada etapa.');
  }
  // Presupuesto: un área que ya gastó casi todo, o un gasto propuesto que no cabe.
  for (const r of presupuesto) {
    if (r.asignado > 0 && r.aprobado >= r.asignado * 0.9) {
      push(`presupuesto-${r.area}`, r.aprobado >= r.asignado ? 'rojo' : 'amarillo', `${r.nombre} ya usó ${dinero(r.aprobado)} de su presupuesto de ${dinero(r.asignado)} este mes.`, r.area, 'Ya casi no queda presupuesto en tu área este mes. Dime qué de lo pendiente es indispensable y qué puede esperar al mes siguiente.');
    }
  }
  const esperando = gastos.filter((g) => g.estado === 'pendiente');
  const viejos = esperando.filter((g) => (ahora - new Date(g.momento)) / 86400000 >= 3);
  if (viejos.length) {
    push('gastos-esperando', 'amarillo', `${viejos.length === 1 ? 'Un gasto lleva' : `${viejos.length} gastos llevan`} más de tres días esperando tu aprobación (${dinero(viejos.reduce((s, g) => s + g.monto, 0))}).`, 'finanzas', 'Tengo gastos propuestos sin decidir. Con el presupuesto y la caja de este mes, dime cuáles conviene aprobar y cuáles no, y por qué.');
  }
  if (vencidas.length) {
    const area = vencidas[0].area;
    push('acciones-vencidas', vencidas.length >= 3 ? 'rojo' : 'amarillo', `${vencidas.length === 1 ? 'Una acción venció' : `${vencidas.length} acciones vencieron`} sin cumplirse. La más atrasada: ${vencidas[0].texto}`, 'proyectos', `Hay ${vencidas.length} ${vencidas.length === 1 ? 'acción vencida' : 'acciones vencidas'} en la bitácora, empezando por ${area}. Dime cuáles cerrar, cuáles reasignar y cuáles ya no tienen sentido.`);
  }
  if (agenda?.activa) {
    const i = agenda.indicadores;
    if (i.noAsistieronPct !== null && i.noAsistieronPct > 15 && i.asistieron + i.noAsistieron >= 8) {
      push('inasistencias', i.noAsistieronPct > 30 ? 'rojo' : 'amarillo', `${i.noAsistieronPct}% de las citas de los últimos ${i.dias} días no se presentó.`, 'operaciones', 'Muchas citas no se presentan. Propón cómo bajarlas: confirmación, recordatorios, anticipo o política de cancelación.');
    }
    if (i.sinConfirmar7 >= 3) {
      push('sin-confirmar', 'amarillo', `Hay ${i.sinConfirmar7} citas de los próximos siete días sin confirmar.`, 'atencion', 'Tengo citas próximas sin confirmar. Redacta el mensaje de confirmación y dime a qué hora conviene enviarlo.');
    }
    if (i.porCobrar > 0 && i.cobrado > 0 && i.porCobrar >= i.cobrado * 0.2) {
      push('visitas-por-cobrar', 'amarillo', `Hay ${dinero(i.porCobrar)} de visitas ya atendidas sin cobrar.`, 'credito', 'Tengo visitas ya atendidas que no se han cobrado. Propón cómo cobrarlas y cómo evitar que se repita.');
    }
  }
  if (respaldo?.recordar && respaldo.archivos > 0) {
    push('respaldo', 'amarillo', respaldo.ultimo ? `Tu último respaldo fue hace ${respaldo.dias} días.` : 'Aún no has guardado ningún respaldo de tus datos.', '', '');
  }
  return avisos.sort((a, b) => (a.nivel === 'rojo' ? 0 : 1) - (b.nivel === 'rojo' ? 0 : 1));
}
