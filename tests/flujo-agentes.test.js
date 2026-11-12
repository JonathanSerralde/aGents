// Flujo de trabajo entre agentes: los encargos corren en paralelo y la respuesta se revisa antes de entregarse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { colaborar, MAX_SIMULTANEAS } from '../src/colaboracion.js';
import { observacionesDe } from '../src/calidad.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function conServidor(extra, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'agents-flujo-'));
  const servidor = crearServidor(opcionesTemporales(dir, extra));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const pedir = async (ruta, metodo = 'GET', cuerpo) => (await fetch(base + ruta, metodo === 'GET' ? undefined : json(metodo, cuerpo || {}))).json();
  try { await fn(pedir); } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
}

test('los encargos se atienden a la vez, con tope de simultáneos, y la lista conserva el orden pedido', async () => {
  let activos = 0;
  let maximo = 0;
  const responder = async (destino) => {
    activos++;
    maximo = Math.max(maximo, activos);
    await espera(destino === 'finanzas' ? 60 : 20); // el primero es el más lento
    activos--;
    if (destino === 'compras') throw new Error('sin respuesta');
    return `respuesta de ${destino}`;
  };
  const respuesta = 'Plan.\nDELEGAR: [Finanzas] — a\nDELEGAR: [Ventas] — b\nDELEGAR: [Marketing] — c\nDELEGAR: [Compras] — d\nINFORMAR: [Riesgos] — dato';
  const intercambios = await colaborar({ areaOrigen: 'orquestador', nombreOrigen: 'el Coordinador', respuesta, propios: {}, equipo: null, responder, informar: async () => {} });
  assert.equal(maximo, MAX_SIMULTANEAS, 'corren tres a la vez, no cuatro');
  assert.deepEqual(intercambios.map((i) => i.destino), ['finanzas', 'ventas', 'marketing', 'compras', 'riesgos']);
  assert.equal(intercambios[0].respuesta, 'respuesta de finanzas');
  assert.equal(intercambios[3].error, 'sin respuesta', 'un encargo que falla no tumba a los demás');
  assert.equal(intercambios[4].nota, true);

  // Con un solo simultáneo vuelve a ser en serie.
  maximo = 0;
  await colaborar({ areaOrigen: 'orquestador', nombreOrigen: 'el Coordinador', respuesta, propios: {}, equipo: null, responder, simultaneas: 1 });
  assert.equal(maximo, 1);
});

test('en el servidor los encargos corren en paralelo y el consumo se anota al agente que respondió', async () => {
  let activos = 0;
  let maximo = 0;
  const llamarIA = async ({ sistema }) => {
    if (/otro agente del sistema/.test(sistema)) {
      activos++;
      maximo = Math.max(maximo, activos);
      await espera(40);
      activos--;
      return 'Hecho con los datos de mi área.';
    }
    if (/Ya recibiste lo que contestaron/.test(sistema)) return 'Plan final.\nESTADO: entregado — plan';
    return 'Plan.\nDELEGAR: [Finanzas] — revisa la caja\nDELEGAR: [Ventas] — propón la oferta\nDELEGAR: [Marketing] — define el mensaje';
  };
  await conServidor({ llamarIA }, async (pedir) => {
    const r = await pedir('/api/agentes/orquestador/mensajes', 'POST', { texto: 'Organiza la semana' });
    assert.ok(maximo >= 2, `solo ${maximo} a la vez`);
    assert.deepEqual(r.intercambios.map((i) => i.destino), ['finanzas', 'ventas', 'marketing']);
    assert.ok(r.intercambios.every((i) => i.respuesta));
    const uso = (await pedir('/api/uso')).actual.porAgente;
    for (const id of ['orquestador', 'finanzas', 'ventas', 'marketing']) assert.ok(uso[id] > 0, `sin consumo anotado para ${id}`);
    // Cada agente guardó su parte en su propia conversación.
    assert.equal((await pedir('/api/agentes/ventas/mensajes')).mensajes.at(-1).texto, 'Hecho con los datos de mi área.');
  });
});

test('las reglas de la revisión solo marcan lo que estorba al dueño', () => {
  assert.deepEqual(observacionesDe('Propuesta clara.\nACCIONES:\n- [Ventas] Llamar — Rosa — 3 días\nESTADO: entregado — listo'), []);
  assert.deepEqual(observacionesDe('Respuesta sin línea de estado.'), [], 'un detalle de formato no paga otra llamada');
  assert.match(observacionesDe('ACCIONES:\n- [Ventas] Llamar a los clientes')[0], /sin responsable o sin plazo/);
  assert.match(observacionesDe('¿Uno? ¿Dos? ¿Tres? ¿Cuatro?')[0], /demasiadas preguntas/);
});

test('un gasto que no cabe en el presupuesto se corrige antes de entregar la respuesta', async () => {
  const llamadas = [];
  const llamarIA = async ({ sistema, mensajes }) => {
    if (/una revisión encontró esto/.test(sistema)) {
      llamadas.push('correccion');
      assert.match(sistema, /El gasto "Campaña grande" por \$9,000 no cabe: a Marketing le quedan \$3,000/);
      assert.equal(mensajes.at(-1).texto, 'Entrega la respuesta corregida.');
      return 'Ajusté la campaña a lo que hay.\nGASTO: [Marketing] — Campaña chica — $2,800\nESTADO: entregado — campaña ajustada';
    }
    llamadas.push('orden');
    return 'Propongo una campaña.\nGASTO: [Marketing] — Campaña grande — $9,000\nESTADO: entregado — campaña';
  };
  await conServidor({ llamarIA }, async (pedir) => {
    await pedir('/api/presupuesto', 'PUT', { areas: { marketing: 3000 } });
    const r = await pedir('/api/agentes/marketing/mensajes', 'POST', { texto: 'Arma una campaña' });
    assert.deepEqual(llamadas, ['orden', 'correccion']);
    assert.deepEqual([r.revision.por, r.revision.corregida], ['reglas', true]);
    assert.match(r.respuesta, /^Ajusté la campaña a lo que hay/);
    assert.deepEqual(r.gastos.map((g) => g.monto), [2800], 'solo queda por aprobar el gasto ya corregido');

    // Una respuesta sin nada que corregir no paga revisión.
    llamadas.length = 0;
    await pedir('/api/presupuesto', 'PUT', { areas: { marketing: 50000 } });
    const limpia = await pedir('/api/agentes/marketing/mensajes', 'POST', { texto: 'Otra campaña' });
    assert.deepEqual(llamadas, ['orden']);
    assert.equal(limpia.revision, null);

    // Con la revisión apagada, el gasto que no cabe pasa tal cual (y el dueño lo verá marcado al aprobar).
    llamadas.length = 0;
    await pedir('/api/presupuesto', 'PUT', { areas: { marketing: 100 } });
    await pedir('/api/configuracion', 'PUT', { revisionIA: 'nunca' });
    const sinRevision = await pedir('/api/agentes/marketing/mensajes', 'POST', { texto: 'Una más' });
    assert.deepEqual(llamadas, ['orden']);
    assert.equal(sinRevision.revision, null);
  });
});

test('el agente con modelo mayor pasa por un revisor: si aprueba no se toca; si pide cambios, se corrige', async () => {
  const llamadas = [];
  let veredicto = 'APROBADA';
  const llamarIA = async ({ sistema, mensajes, nivel }) => {
    if (/revisor de calidad de la oficina/.test(sistema)) {
      llamadas.push(`revisor:${nivel}`);
      assert.match(mensajes.at(-1).texto, /Orden del dueño: ¿Qué meta pongo\?/);
      assert.match(sistema, /Contexto que tenía el agente/);
      return veredicto;
    }
    if (/una revisión encontró esto/.test(sistema)) {
      llamadas.push(`correccion:${nivel}`);
      assert.match(sistema, /Usa una cifra de ventas que no está en el contexto/);
      return 'Meta sin cifras inventadas.\nESTADO: entregado — meta';
    }
    llamadas.push(`orden:${nivel}`);
    return 'La meta es vender $2,000,000.\nESTADO: entregado — meta';
  };
  await conServidor({ llamarIA }, async (pedir) => {
    await pedir('/api/configuracion', 'PUT', { anthropicModeloExperto: 'modelo-mayor', agentesExpertos: ['direccion'] });
    const aprobada = await pedir('/api/agentes/direccion/mensajes', 'POST', { texto: '¿Qué meta pongo?' });
    assert.deepEqual(llamadas, ['orden:experto', 'revisor:automatico']);
    assert.deepEqual([aprobada.revision.por, aprobada.revision.corregida], ['aprobada', false]);
    assert.match(aprobada.respuesta, /^La meta es vender/);

    llamadas.length = 0;
    veredicto = 'CORREGIR:\n- Usa una cifra de ventas que no está en el contexto';
    const corregida = await pedir('/api/agentes/direccion/mensajes', 'POST', { texto: '¿Qué meta pongo?' });
    assert.deepEqual(llamadas, ['orden:experto', 'revisor:automatico', 'correccion:experto']);
    assert.deepEqual([corregida.revision.por, corregida.revision.corregida], ['ia', true]);
    assert.match(corregida.respuesta, /^Meta sin cifras inventadas/);
    assert.equal((await pedir('/api/agentes/direccion/mensajes')).mensajes.at(-1).texto.startsWith('Meta sin cifras inventadas'), true, 'en la conversación queda la versión corregida');

    // Un agente sin modelo mayor no pasa por el revisor.
    llamadas.length = 0;
    const normal = await pedir('/api/agentes/ventas/mensajes', 'POST', { texto: 'Una idea' });
    assert.deepEqual(llamadas, ['orden:principal']);
    assert.equal(normal.revision, null);
  });
});
