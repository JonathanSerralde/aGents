import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calcular, diasVacaciones, antiguedad, salarioIntegrado, TIPOS_CALCULO, CAMPOS_CALCULO, PARAMETROS } from '../src/laboral.js';
import { HABILIDADES } from '../src/habilidades.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('la tabla de vacaciones sigue la LFT reformada y la antigüedad se cuenta bien', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10, 11, 16, 21, 26, 31].map(diasVacaciones), [12, 14, 16, 18, 20, 22, 22, 24, 26, 28, 30, 32]);
  const a = antiguedad('2023-03-15', '2026-11-06');
  assert.equal(a.anios, 3);
  assert.equal(a.diasDelAnioEnCurso, 236);
  assert.throws(() => antiguedad('2026-12-01', '2026-11-06'), /anterior al ingreso/);
  assert.throws(() => antiguedad('x', '2026-11-06'), /fecha válida/);
  const sdi = salarioIntegrado(500, 2);
  assert.equal(sdi.factor, 1.0507); // 1 + 15/365 + (14 × 0.25)/365
  assert.equal(sdi.salarioIntegrado, 525.34);
});

test('aguinaldo, vacaciones y prima con cifras verificables', () => {
  const ag = calcular('aguinaldo', { salarioDiario: 400, diasTrabajadosAnio: 365 });
  assert.equal(ag.total, 6000);
  const prop = calcular('aguinaldo', { salarioDiario: 400, diasTrabajadosAnio: 73 });
  assert.equal(prop.total, 1200);
  assert.match(prop.notas[0], /20 de diciembre/);
  const vac = calcular('vacaciones', { salarioDiario: 400, fechaIngreso: '2024-11-06', fechaCalculo: '2026-11-06' });
  assert.equal(vac.lineas.find((l) => l[0] === 'Años cumplidos')[1], 2);
  assert.equal(vac.lineas.find((l) => /Días de vacaciones del año/.test(l[0]))[1], 16);
  assert.equal(vac.total, 0); // justo en el aniversario no hay días proporcionales del nuevo año
  const medio = calcular('vacaciones', { salarioDiario: 400, fechaIngreso: '2026-05-06', fechaCalculo: '2026-11-06' });
  assert.equal(medio.lineas.find((l) => /Días proporcionales/.test(l[0]))[1], 6.05);
  assert.throws(() => calcular('aguinaldo', { salarioDiario: 0 }), /no es válido/);
  assert.throws(() => calcular('vacaciones', { salarioDiario: 400 }), /fecha/);
});

test('finiquito y liquidación: renuncia sin prima de antigüedad, despido con 3 meses, 20 días y prima topada', () => {
  const base = { salarioDiario: 500, fechaIngreso: '2022-01-01', fechaSalida: '2026-07-01', diasSalarioPendientes: 10 };
  const f = calcular('finiquito', base);
  assert.equal(f.lineas.find((l) => l[0] === 'Salarios pendientes')[1], 5000);
  assert.equal(f.lineas.find((l) => l[0] === 'Aguinaldo proporcional')[1], 3739.73); // 182 días de 365 × 7500
  assert.ok(!f.lineas.some((l) => /Prima de antigüedad/.test(l[0])));
  assert.match(f.notas.join(' '), /menos de 15 años no hay prima/);
  const l = calcular('liquidacion', base);
  const sdi = l.lineas.find((x) => /Salario diario integrado/.test(x[0]))[1];
  assert.equal(l.lineas.find((x) => /3 meses/.test(x[0]))[1], Math.round(sdi * 90 * 100) / 100);
  const veinte = l.lineas.find((x) => /20 días por año/.test(x[0]))[1];
  assert.ok(veinte > sdi * 20 * 4.4 && veinte < sdi * 20 * 4.6);
  const prima = l.lineas.find((x) => /Prima de antigüedad/.test(x[0]))[1];
  assert.ok(prima > 0 && prima <= 12 * 4.6 * PARAMETROS.salarioMinimoGeneral * 2);
  assert.ok(l.total > f.total + sdi * 90);
  assert.match(l.notas.join(' '), /arts\. 48, 50 y 162/);
  const veterano = calcular('finiquito', { salarioDiario: 300, fechaIngreso: '2010-01-01', fechaSalida: '2026-07-01' });
  assert.ok(veterano.lineas.some((x) => /Prima de antigüedad \(renuncia con 15 años/.test(x[0])));
});

test('PTU con tope, fondo de ahorro con avisos, vales e INFONAVIT', () => {
  const ptu = calcular('ptu', { utilidadRepartible: 100000, salarioDiario: 400, diasTrabajados: 365, totalDiasEmpleados: 3650, totalSalariosDevengados: 1460000 });
  assert.equal(ptu.lineas.find((l) => /por días/.test(l[0]))[1], 5000);
  assert.equal(ptu.lineas.find((l) => /por salario/.test(l[0]))[1], 5000);
  assert.equal(ptu.total, 10000);
  const topado = calcular('ptu', { utilidadRepartible: 5000000, salarioDiario: 400, diasTrabajados: 365, totalDiasEmpleados: 730, totalSalariosDevengados: 292000 });
  assert.equal(topado.total, 36000); // tope de 3 meses de salario
  const conPromedio = calcular('ptu', { utilidadRepartible: 5000000, salarioDiario: 400, diasTrabajados: 365, totalDiasEmpleados: 730, totalSalariosDevengados: 292000, promedioPtuTresAnios: 50000 });
  assert.equal(conPromedio.total, 50000);
  const fondo = calcular('fondo_ahorro', { salarioDiario: 1000, porcentajeTrabajador: 10, porcentajePatron: 13 });
  assert.match(fondo.notas.join(' '), /supera la del trabajador/);
  assert.equal(fondo.lineas[0][1], 3040);
  assert.throws(() => calcular('fondo_ahorro', { salarioDiario: 500, porcentajeTrabajador: 20 }), /no es válido/);
  const vales = calcular('vales', { salarioDiario: 300, porcentaje: 10 });
  assert.equal(vales.lineas[0][1], 912);
  const inf = calcular('infonavit', { salarioDiario: 400, aniosAntiguedad: 3, tipoDescuento: 'porcentaje', valorDescuento: 20 });
  assert.ok(inf.total > 2400 && inf.total < 2700);
  const vsm = calcular('infonavit', { salarioDiario: 400, tipoDescuento: 'vsm', valorDescuento: 2 });
  assert.equal(vsm.total, Math.round(PARAMETROS.salarioMinimoGeneral * 30.4 * 2 * 100) / 100);
  const alta = calcular('altas_bajas', { movimiento: 'alta' });
  assert.equal(alta.lineas.length, 5);
  assert.match(alta.lineas[2][1], /Alta en el IMSS/);
  assert.equal(calcular('altas_bajas', { movimiento: 'baja' }).total, null);
  assert.throws(() => calcular('otro', {}), /desconocido/);
  assert.equal(Object.keys(TIPOS_CALCULO).length, 9);
  for (const tipo of Object.keys(TIPOS_CALCULO)) assert.ok(CAMPOS_CALCULO[tipo]?.length, tipo);
});

test('RH y Nómina conocen la calculadora, y el servidor calcula y registra el resultado como hecho', async () => {
  assert.match(HABILIDADES.rh.marcos.join(' '), /Calculadora laboral/);
  assert.match(HABILIDADES.rh.marcos.join(' '), /20 días por año/);
  assert.match(HABILIDADES.nomina.acciones.join(' '), /calculadora laboral/i);
  const dir = mkdtempSync(join(tmpdir(), 'lab-srv-'));
  const servidor = crearServidor(opcionesTemporales(dir));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const esquema = await (await fetch(`${base}/api/laboral`)).json();
    assert.equal(Object.keys(esquema.tipos).length, 9);
    const res = await fetch(`${base}/api/laboral/calcular`, json('POST', { tipo: 'aguinaldo', parametros: { salarioDiario: 400, diasTrabajadosAnio: 365 }, registrar: true, trabajador: 'Juan Pérez' }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).resultado.total, 6000);
    const mem = await (await fetch(`${base}/api/memoria`)).json();
    assert.equal(mem.hechos.length, 1);
    assert.match(mem.hechos[0].texto, /Juan Pérez: Aguinaldo calculado/);
    assert.equal(mem.hechos[0].fuente, 'calculadora laboral');
    assert.equal(mem.hechos[0].area, 'rh');
    const malo = await fetch(`${base}/api/laboral/calcular`, json('POST', { tipo: 'finiquito', parametros: { salarioDiario: 400 } }));
    assert.equal(malo.status, 422);
    assert.equal((await fetch(`${base}/api/laboral/calcular`, json('POST', { tipo: 'nada' }))).status, 422);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
