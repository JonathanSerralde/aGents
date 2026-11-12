// Trabajo en equipo: cadena de dos pasos entre agentes, segunda vuelta con propuesta ajustada,
// presupuesto mensual por área y gastos que esperan la aprobación del dueño.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearServidor } from '../src/server.js';
import { crearPresupuesto, extraerGastos } from '../src/presupuesto.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

async function conServidor(extra, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'agents-equipo-'));
  const servidor = crearServidor(opcionesTemporales(dir, extra));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  try { await fn(`http://127.0.0.1:${servidor.address().port}`); } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
}

test('extraerGastos reconoce el formato y descarta lo que no trae monto', () => {
  const texto = 'Plan.\nGASTO: [Marketing] — Anuncios en redes — $4,000\nGASTO: Compras - Estantería nueva - 12500.50 pesos\nGASTO: [Ventas] — algo sin monto — pronto\nESTADO: entregado — listo';
  assert.deepEqual(extraerGastos(texto), [
    { areaTexto: 'Marketing', concepto: 'Anuncios en redes', monto: 4000 },
    { areaTexto: 'Compras', concepto: 'Estantería nueva', monto: 12500.5 },
  ]);
  assert.deepEqual(extraerGastos('Sin gastos.'), []);
});

test('el presupuesto lleva lo aprobado del mes y lo que queda por área', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-equipo-'));
  try {
    const p = crearPresupuesto(join(dir, 'presupuesto.json'));
    assert.equal(p.paraPrompt(), '', 'sin presupuesto ni gastos no se añade nada al contexto');
    p.guardar({ areas: { marketing: '5,000', compras: 20000, inventada: 9 }, nota: 'No endeudarse' });
    const octubre = new Date(2026, 9, 10);
    const uno = p.solicitar('marketing', { concepto: 'Anuncios en redes', monto: 4000, origen: 'Marketing' }, octubre);
    assert.equal(p.solicitar('marketing', { concepto: 'anuncios en redes', monto: 4000 }, octubre).id, uno.id, 'no se duplica el mismo gasto pendiente');
    const grande = p.solicitar('marketing', { concepto: 'Espectacular', monto: 9000 }, octubre);
    assert.equal(p.solicitar('no-existe', { concepto: 'x y z', monto: 5 }), null);
    assert.equal(p.gastos(octubre).find((g) => g.id === grande.id).excede, 4000);

    p.decidir(uno.id, 'aprobado', octubre);
    p.decidir(grande.id, 'rechazado', octubre);
    const mkt = p.resumen(octubre).find((r) => r.area === 'marketing');
    assert.deepEqual([mkt.asignado, mkt.aprobado, mkt.pendiente, mkt.disponible], [5000, 4000, 0, 1000]);
    assert.match(p.paraPrompt(octubre), /Marketing: \$5,000 al mes; ya aprobado este mes \$4,000; disponible \$1,000/);
    assert.match(p.paraPrompt(octubre), /Sin presupuesto asignado: .*Ventas/);
    assert.match(p.paraPrompt(octubre), /No endeudarse/);
    // Al cambiar de mes, lo aprobado vuelve a cero.
    assert.equal(p.resumen(new Date(2026, 10, 2)).find((r) => r.area === 'marketing').disponible, 5000);
    assert.equal(p.decidir('zzzzzzzz', 'aprobado'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Dirección encarga a Marketing, Marketing consulta a Finanzas y Dirección entrega una propuesta ajustada con el gasto por aprobar', async () => {
  const llamadas = [];
  let sistemaDireccion = '';
  const llamarIA = async ({ sistema }) => {
    if (/Ya recibiste lo que contestaron los otros agentes/.test(sistema)) {
      llamadas.push('cierre');
      return 'Plan final: campaña de $4,000, porque Finanzas confirma que hay $5,000.\nGASTO: [Marketing] — Anuncios en redes de noviembre — $4,000\nCONSULTAR: [Ventas] — esto ya no debe ejecutarse\nESTADO: entregado — plan ajustado al presupuesto';
    }
    if (/otro agente del sistema/.test(sistema)) {
      if (/el agente del área de Marketing/.test(sistema)) {
        llamadas.push('marketing');
        return 'Armo la campaña, pero necesito el presupuesto.\nCONSULTAR: [Finanzas] — ¿cuánto puede gastar Marketing este mes?';
      }
      llamadas.push('finanzas');
      return 'Marketing tiene $5,000 disponibles este mes.';
    }
    llamadas.push('direccion');
    sistemaDireccion = sistema;
    return 'Borrador: campaña de $9,000.\nDELEGAR: [Marketing] — arma la campaña de noviembre\nGASTO: [Marketing] — Campaña grande — $9,000';
  };
  await conServidor({ llamarIA }, async (base) => {
    const guardado = await (await fetch(`${base}/api/presupuesto`, json('PUT', { areas: { marketing: 5000 }, nota: 'Solo publicidad digital' }))).json();
    assert.equal(guardado.areas.marketing, 5000);

    const r = await (await fetch(`${base}/api/agentes/direccion/mensajes`, json('POST', { texto: 'Lanza la campaña de noviembre' }))).json();
    assert.deepEqual(llamadas, ['direccion', 'marketing', 'finanzas', 'cierre'], 'la cadena llega a dos pasos y cierra con una segunda vuelta');
    assert.match(sistemaDireccion, /Marketing: \$5,000 al mes/, 'el agente conoce el presupuesto');
    assert.match(sistemaDireccion, /GASTO: \[área que paga\]/);
    assert.equal(r.consolidada, true);
    assert.match(r.respuesta, /^Plan final: campaña de \$4,000/);
    assert.match(r.respuesta, /Respuestas de otros agentes/);
    assert.match(r.respuesta, /Marketing tiene \$5,000 disponibles/, 'la respuesta de Finanzas queda a la vista');
    assert.doesNotMatch(r.respuesta.split('— Respuestas')[0], /CONSULTAR|Borrador/);
    // Solo cuenta el gasto de la versión final, no el del borrador.
    assert.deepEqual(r.gastos.map((g) => [g.area, g.monto]), [['marketing', 4000]]);

    const estado = await (await fetch(`${base}/api/presupuesto`)).json();
    const gasto = estado.gastos[0];
    assert.deepEqual([gasto.estado, gasto.monto, gasto.disponible, gasto.excede, gasto.origen], ['pendiente', 4000, 5000, 0, 'Dirección']);
    assert.equal(estado.resumen.find((x) => x.area === 'marketing').pendiente, 4000);

    // El dueño aprueba: baja lo disponible y queda como hecho del área.
    const aprobado = await (await fetch(`${base}/api/presupuesto/gastos/${gasto.id}`, json('PUT', { estado: 'aprobado' }))).json();
    assert.equal(aprobado.gasto.estado, 'aprobado');
    const mkt = aprobado.resumen.find((x) => x.area === 'marketing');
    assert.deepEqual([mkt.aprobado, mkt.disponible], [4000, 1000]);
    const decisiones = await (await fetch(`${base}/api/archivo?tipo=decision`)).json();
    assert.ok(decisiones.entradas.some((e) => /aprobó el gasto "Anuncios en redes de noviembre" por \$4,000/.test(e.texto)), 'la decisión queda en el archivo de memoria');
    assert.equal((await fetch(`${base}/api/presupuesto/gastos/00000000`, json('PUT', { estado: 'aprobado' }))).status, 404);
    assert.equal((await fetch(`${base}/api/presupuesto/gastos/${gasto.id}`, json('PUT', { estado: 'pagado' }))).status, 404);
  });
});

test('sin consultas a otros agentes no hay segunda vuelta ni costo extra', async () => {
  let llamadas = 0;
  const llamarIA = async () => { llamadas++; return 'Respuesta directa.\nESTADO: entregado — listo'; };
  await conServidor({ llamarIA }, async (base) => {
    const r = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Dame una idea' }))).json();
    assert.equal(llamadas, 1);
    assert.equal(r.consolidada, false);
    assert.deepEqual(r.gastos, []);
  });
});
