import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validar, CAMPOS } from '../src/formulario.js';
import { evaluar } from '../src/diagnostico.js';

const base = {
  contacto_nombre: 'Ana Pérez',
  confianza: 'medio',
  giro: 'comercio',
  empleados: '6-10',
  ventas_anuales: '1m-5m',
  antiguedad_anios: 4,
};

test('validar acepta un bloque A mínimo', () => {
  const r = validar(base);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

test('validar exige los campos obligatorios', () => {
  const r = validar({ giro: 'comercio' });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.includes('Nombre del responsable')));
});

test('validar rechaza opciones fuera de catálogo y escalas inválidas', () => {
  const r = validar({ ...base, giro: 'minería_ilegal', dependencia_dueno: 9 });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.includes('opción no válida')));
  assert.ok(r.errores.some((e) => e.includes('entre 1 y 5')));
});

test('validar convierte números y recorta texto', () => {
  const r = validar({ ...base, meses_caja: '2.5', preocupacion: '  ' + 'x'.repeat(600) + '  ' });
  assert.equal(r.datos.meses_caja, 2.5);
  assert.equal(r.datos.preocupacion.length, 500);
});

test('validar rechaza números fuera de rango', () => {
  const r = validar({ ...base, clientes_recurrentes_pct: 140 });
  assert.equal(r.ok, false);
});

test('el esquema tiene ids únicos', () => {
  const ids = CAMPOS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('el bloque B ignora campos de otro giro', () => {
  const r = validar({ ...base, giro: 'comercio', horas_facturables_pct: 30, rotacion_inventario: 5 });
  assert.equal(r.ok, true);
  assert.equal(r.datos.horas_facturables_pct, undefined);
  assert.equal(r.datos.rotacion_inventario, 5);
});

test('el bloque B acepta sus campos cuando el giro coincide', () => {
  const r = validar({ ...base, giro: 'servicios', horas_facturables_pct: 40 });
  assert.equal(r.datos.horas_facturables_pct, 40);
  const { distritos } = evaluar(r.datos);
  assert.equal(distritos.operaciones.color, 'rojo');
});

test('evaluar marca sin_datos en distritos sin respuestas', () => {
  const { distritos } = evaluar(validar({ ...base }).datos);
  assert.equal(distritos.finanzas.color, 'sin_datos');
  assert.equal(distritos.rh.color, 'sin_datos');
});

test('evaluar detecta riesgo de liquidez y lo pone primero', () => {
  const datos = validar({ ...base, meses_caja: 0.5, margen_pct: 5 }).datos;
  const { distritos, prioridad } = evaluar(datos);
  assert.equal(distritos.finanzas.color, 'rojo');
  assert.ok(distritos.finanzas.hallazgos.some((h) => h.includes('liquidez')));
  assert.equal(prioridad[0], 'finanzas');
});

test('evaluar toma el peor color de un distrito', () => {
  const datos = validar({ ...base, meses_caja: 2, rotacion_pct: 45, imss_infonavit: 'adeudo' }).datos;
  const { distritos } = evaluar(datos);
  assert.equal(distritos.rh.color, 'rojo');
});

test('evaluar deja en verde un distrito respondido sin alertas', () => {
  const datos = validar({ ...base, meses_caja: 6, margen_pct: 30 }).datos;
  const { distritos } = evaluar(datos);
  assert.equal(distritos.finanzas.color, 'verde');
});

test('el plan incluye una acción por alerta, con plazo y orden de prioridad', () => {
  const datos = validar({ ...base, meses_caja: 0.5, margen_pct: 15, cfdi: 'no' }).datos;
  const { plan } = evaluar(datos);
  assert.ok(plan.length >= 3);
  for (const paso of plan) {
    assert.ok(paso.accion.length > 10);
    assert.equal(paso.plazo, paso.color === 'rojo' ? '30 días' : '60 días');
  }
  assert.equal(plan[0].color, 'rojo');
  const colores = plan.map((p) => p.color);
  assert.deepEqual(colores, [...colores].sort((a, b) => (a === 'rojo' ? -1 : 1) - (b === 'rojo' ? -1 : 1)));
});

test('sin alertas el plan queda vacío', () => {
  const datos = validar({ ...base, meses_caja: 6, margen_pct: 30, cfdi: 'si' }).datos;
  assert.deepEqual(evaluar(datos).plan, []);
});

test('crecimiento queda bloqueado cuando finanzas está en rojo', () => {
  const datos = validar({ ...base, meses_caja: 0.5, meta_crecimiento: 'vertical', proceso_venta: 'si' }).datos;
  const { distritos, crecimiento, plan } = evaluar(datos);
  assert.equal(crecimiento.preparado, false);
  assert.deepEqual(crecimiento.bloqueos, ['Finanzas']);
  assert.equal(distritos.crecimiento.color, 'rojo');
  assert.ok(plan.some((p) => p.distrito === 'crecimiento' && p.plazo === '30 días'));
});

test('los ejes vertical y horizontal suman señales cumplidas y listan faltantes', () => {
  const datos = validar({
    ...base, meses_caja: 6, margen_pct: 25, dependencia_dueno: 1, manuales_puesto: 'si',
    meta_crecimiento: 'ambos', proceso_venta: 'si', costo_adquisicion: 'lo_conozco', venta_cruzada: 'no',
    mercados_nuevos: 'no', capital_expansion: 'ninguno',
  }).datos;
  const { crecimiento, distritos } = evaluar(datos);
  assert.equal(crecimiento.preparado, true);
  assert.equal(crecimiento.vertical.nivel, 3);
  assert.equal(crecimiento.vertical.faltantes.length, 1);
  assert.equal(crecimiento.horizontal.nivel, 2);
  assert.equal(crecimiento.horizontal.faltantes.length, 2);
  assert.equal(distritos.crecimiento.color, 'verde');
});

test('una meta con motor débil genera una acción con el primer faltante', () => {
  const datos = validar({ ...base, meses_caja: 6, meta_crecimiento: 'horizontal', mercados_nuevos: 'no' }).datos;
  const { distritos, plan } = evaluar(datos);
  assert.equal(distritos.crecimiento.color, 'amarillo');
  const accion = plan.find((p) => p.distrito === 'crecimiento');
  assert.ok(accion);
  assert.match(accion.accion, /Delegar|Documentar|Identificar|Definir/);
});

test('sin respuestas de crecimiento el distrito queda sin datos', () => {
  const { distritos, crecimiento } = evaluar(validar({ ...base, meses_caja: 6 }).datos);
  assert.equal(distritos.crecimiento.color, 'sin_datos');
  assert.equal(crecimiento.preparado, false);
  assert.equal(crecimiento.meta, null);
});

test('evaluar devuelve distritos con nombre y color para todos los distritos', () => {
  const { distritos } = evaluar(validar(base).datos);
  assert.equal(Object.keys(distritos).length, 11);
  for (const d of Object.values(distritos)) {
    assert.ok(d.nombre);
    assert.ok(['verde', 'amarillo', 'rojo', 'sin_datos'].includes(d.color));
  }
});
