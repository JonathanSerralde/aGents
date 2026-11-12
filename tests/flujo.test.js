// Flujo de caja a 13 semanas y carpeta vigilada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerCfdi, analizarComprobantes, firmaCarpeta } from '../src/datos-reales.js';
import { proyectarFlujo, SEMANAS } from '../src/flujo.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const PROPIO = 'AAA010101AAA';
let folio = 0;
const uuidDe = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
function cfdi({ emisor = PROPIO, receptor = 'CLI010101AA1', nombre = 'Cliente Uno', total = 1000, fecha = '2030-01-10T10:00:00', tipo = 'I', metodo = 'PUE', paga = null } = {}) {
  folio += 1;
  const pago = paga ? `<pago20:Pagos><pago20:Pago FechaPago="${paga.fecha}T12:00:00" Monto="${paga.importe}"><pago20:DoctoRelacionado IdDocumento="${paga.uuid}" ImpPagado="${paga.importe}" ImpSaldoInsoluto="0"/></pago20:Pago></pago20:Pagos>` : '';
  return { uuid: uuidDe(folio), xml: `<cfdi:Comprobante Version="4.0" Fecha="${fecha}" Moneda="${tipo === 'P' ? 'XXX' : 'MXN'}" Total="${tipo === 'P' ? 0 : total}" TipoDeComprobante="${tipo}" ${tipo === 'P' ? '' : `MetodoPago="${metodo}"`}>
  <cfdi:Emisor Rfc="${emisor}" Nombre="Emisor ${emisor}"/><cfdi:Receptor Rfc="${receptor}" Nombre="${nombre}"/>
  <cfdi:Complemento>${pago}<tfd:TimbreFiscalDigital UUID="${uuidDe(folio)}"/></cfdi:Complemento></cfdi:Comprobante>` };
}

test('el complemento de pago dice qué factura cubre y la base del flujo deja solo lo que sigue abierto', () => {
  const pagada = cfdi({ total: 5000, fecha: '2030-01-02T10:00:00', metodo: 'PPD' });
  const abierta = cfdi({ total: 8000, fecha: '2030-02-20T10:00:00', metodo: 'PPD', receptor: 'CLI020202BB2', nombre: 'Cliente Dos' });
  const pago = cfdi({ tipo: 'P', paga: { uuid: pagada.uuid, importe: 5000, fecha: '2030-01-22' } }); // pagó a los 20 días
  const parcial = cfdi({ total: 3000, fecha: '2030-02-25T10:00:00', metodo: 'PPD', receptor: 'CLI030303CC3', nombre: 'Cliente Tres' });
  const abono = cfdi({ tipo: 'P', receptor: 'CLI030303CC3', paga: { uuid: parcial.uuid, importe: 1000, fecha: '2030-03-01' } });
  const contado = [cfdi({ total: 4345, fecha: '2030-02-05T10:00:00' }), cfdi({ total: 4345, fecha: '2030-03-05T10:00:00' })];
  const compra = cfdi({ emisor: 'PRO010101CC3', receptor: PROPIO, total: 6000, fecha: '2030-02-28T10:00:00', metodo: 'PPD' });
  const gasto = cfdi({ emisor: 'PRO020202DD4', receptor: PROPIO, total: 869, fecha: '2030-03-02T10:00:00' });
  const nomina = cfdi({ emisor: PROPIO, receptor: 'EMP010101DD4', total: 1738, fecha: '2030-03-03T10:00:00', tipo: 'N' });

  const leido = leerCfdi(pago.xml);
  assert.deepEqual(leido.pagos, [{ uuid: pagada.uuid.toUpperCase(), importe: 5000, fecha: '2030-01-22' }]);

  const r = analizarComprobantes([pagada, abierta, pago, parcial, abono, ...contado, compra, gasto, nomina].map((c) => leerCfdi(c.xml)), PROPIO);
  const b = r.flujoBase;
  assert.deepEqual(b.abiertas.map((a) => [a.lado, a.nombre, a.saldo]).sort(), [['cobrar', 'Cliente Dos', 8000], ['cobrar', 'Cliente Tres', 2000], ['pagar', 'Emisor PRO010101CC3', 6000]]);
  assert.equal(b.diasCobro, 12); // (20 + 4) / 2: promedio de los pagos registrados
  assert.equal(b.diasPago, null); // sin pagos a proveedores registrados
  assert.equal(b.contadoMensual, 4345); // promedio de los dos meses con venta de contado
  assert.ok(b.nominaMensual > 0 && b.gastosMensual > 0);
});

test('la proyección reparte cobranza y pagos por semana, avisa cuándo falta dinero y el escenario conservador es más duro', () => {
  const base = {
    abiertas: [
      { lado: 'cobrar', nombre: 'A', saldo: 10000, fecha: '2030-03-01' }, // vence el 31 de marzo: semana 3
      { lado: 'cobrar', nombre: 'B', saldo: 4000, fecha: '2029-12-01' }, // debió pagarse el 31 de diciembre: vencida hace más de 60 días
      { lado: 'pagar', nombre: 'P', saldo: 9000, fecha: '2030-02-01' }, // vencida: se paga esta semana
      { lado: 'cobrar', nombre: 'Lejos', saldo: 7000, fecha: '2030-08-01' }, // fuera de las 13 semanas
    ],
    mesesBase: ['2030-01', '2030-02', '2030-03'], contadoMensual: 8690, gastosMensual: 4345, nominaMensual: 4345, diasCobro: 30, diasPago: null,
  };
  const hoy = new Date('2030-03-15T12:00:00.000Z');
  const p = proyectarFlujo(base, { hoy, saldoInicial: 5000 });
  assert.equal(p.semanas.length, SEMANAS);
  assert.equal(p.semanas[0].entradas.contado, 2000);
  assert.equal(p.semanas[0].salidas.gastos, 1000);
  assert.equal(p.semanas[0].salidas.proveedores, 9000);
  assert.equal(p.semanas[0].saldo, -4000); // 5000 + 2000 − (1000 + 1000 + 9000)
  assert.equal(p.semanas[1].entradas.cobranza, 4000); // lo vencido se supone cobrado la semana 2
  assert.equal(p.semanas[2].entradas.cobranza, 10000);
  assert.equal(p.totales.porCobrar, 21000);
  assert.equal(p.totales.porCobrarVencido, 4000);
  assert.equal(p.totales.cobranzaFuera, 7000);
  assert.equal(p.alerta.nivel, 'rojo');
  assert.equal(p.alerta.semana, 1);
  assert.match(p.alerta.texto, /te faltarían \$4,000/);
  assert.equal(p.diasPago, 30); // supuesto por defecto
  assert.ok(p.supuestos.some((s) => /supuesto/.test(s)));
  assert.equal(p.deudores[0].nombre, 'A');

  const c = proyectarFlujo(base, { hoy, saldoInicial: 5000, escenario: 'conservador' });
  assert.equal(c.semanas[0].entradas.contado, 1600);
  assert.equal(c.totales.incobrable, 4000);
  assert.equal(c.semanas[1].entradas.cobranza, 0);
  assert.ok(c.semanas.at(-1).saldo < p.semanas.at(-1).saldo);

  // Sin saldo capturado no se afirma que falte dinero: se pide el dato.
  const sin = proyectarFlujo(base, { hoy });
  assert.equal(sin.tieneSaldo, false);
  assert.equal(sin.alerta.nivel, 'amarillo');
  assert.match(sin.alerta.texto, /Captura tu saldo/);
  assert.equal(proyectarFlujo(null), null);
});

test('el servidor entrega el flujo, guarda el saldo de hoy y vuelve a analizar cuando la carpeta cambia', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-flujo-'));
  const facturas = join(dir, '_facturas');
  mkdirSync(facturas);
  writeFileSync(join(facturas, 'a.xml'), cfdi({ total: 12000, fecha: '2030-03-01T10:00:00', metodo: 'PPD' }).xml);
  writeFileSync(join(facturas, 'b.xml'), cfdi({ total: 4345, fecha: '2030-03-05T10:00:00' }).xml);
  const servidor = crearServidor(opcionesTemporales(dir, { ahora: () => new Date('2030-03-15T12:00:00.000Z') }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  try {
    assert.equal((await (await fetch(`${base}/api/flujo`)).json()).flujo, null);
    assert.equal((await fetch(`${base}/api/flujo`, json('PUT', { saldoInicial: 100 }))).status, 404);
    assert.equal(servidor.revisarDatosReales(), false, 'sin carpeta no hay nada que vigilar');

    await fetch(`${base}/api/datos-reales/analizar`, json('POST', { carpeta: facturas }));
    const f1 = await (await fetch(`${base}/api/flujo`)).json();
    assert.equal(f1.flujo.semanas.length, 13);
    assert.equal(f1.flujo.totales.porCobrar, 12000);
    assert.equal(f1.flujo.tieneSaldo, false);
    assert.equal(f1.vigilar, true);

    assert.equal((await fetch(`${base}/api/flujo`, json('PUT', { saldoInicial: 'mucho' }))).status, 422);
    const conSaldo = await (await fetch(`${base}/api/flujo`, json('PUT', { saldoInicial: 2500 }))).json();
    assert.equal(conSaldo.flujo.saldoInicial, 2500);
    assert.equal(conSaldo.flujo.semanas[0].saldo, 2500 + conSaldo.flujo.semanas[0].neto);
    const conservador = await (await fetch(`${base}/api/flujo?escenario=conservador`)).json();
    assert.equal(conservador.flujo.escenario, 'conservador');
    assert.match((await (await fetch(`${base}/api/informe`)).json()).resumen.flujo, /semana/);

    // La carpeta no cambió: no se vuelve a leer. Llega una factura nueva: se actualiza sola y conserva el saldo.
    assert.equal(servidor.revisarDatosReales(), false);
    const nueva = join(facturas, 'c.xml');
    writeFileSync(nueva, cfdi({ total: 3000, fecha: '2030-03-10T10:00:00', metodo: 'PPD', receptor: 'CLI020202BB2', nombre: 'Cliente Dos' }).xml);
    utimesSync(nueva, new Date(), new Date(Date.now() + 5000));
    assert.notEqual(firmaCarpeta(facturas), (await (await fetch(`${base}/api/datos-reales`)).json()).analisis.firma);
    assert.equal(servidor.revisarDatosReales(), true);
    const f2 = await (await fetch(`${base}/api/flujo`)).json();
    assert.equal(f2.flujo.totales.porCobrar, 15000);
    assert.equal(f2.flujo.saldoInicial, 2500);

    // Con la vigilancia apagada ya no se actualiza sola.
    await fetch(`${base}/api/flujo`, json('PUT', { vigilar: false }));
    writeFileSync(join(facturas, 'd.xml'), cfdi({ total: 999, fecha: '2030-03-11T10:00:00' }).xml);
    assert.equal(servidor.revisarDatosReales(), false);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
