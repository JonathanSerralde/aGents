// Las 47 habilidades tienen la misma forma, y el contexto que viaja a la IA se ajusta a lo que hace falta:
// reglas y habilidad cortas cuando quien pregunta es otro agente, y referencias solo del tema de la orden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HABILIDADES, describirHabilidad } from '../src/habilidades.js';
import { EXTRA } from '../src/habilidades-extra.js';
import { AGENTES_OPCIONALES } from '../src/sectores.js';
import { conocimientoPara } from '../src/mexico.js';
import { sistemaPara, sistemaPlano } from '../src/prompts.js';

const tokens = (texto) => Math.ceil(texto.length / 3.2);

test('todas las habilidades tienen la misma forma: cuándo usarla, qué entrega, en quién se apoya y qué vigila', () => {
  const ids = Object.keys(HABILIDADES);
  assert.equal(ids.length, 47);
  assert.deepEqual(Object.keys(EXTRA).sort(), [...ids].sort(), 'cada agente tiene su segunda capa');
  for (const id of ids) {
    const h = HABILIDADES[id];
    assert.ok(h.cuando.length > 30 && h.cuando.length < 190, `${id}.cuando`);
    assert.ok(h.entrega.length > 30 && h.entrega.length < 200, `${id}.entrega`);
    assert.ok(h.indicadores.length >= 3, `${id}.indicadores`);
    assert.ok(h.marcos.length >= 3 && h.acciones.length >= 3 && h.limites.length >= 1, `${id} incompleta`);
    assert.ok(h.pregunta_primero.length >= 2, `${id}.pregunta_primero`);
    // El apoyo son agentes que existen, distintos de él y que siempre están activos (no los opcionales por sector).
    assert.ok(h.apoyo.length >= 2 && h.apoyo.length <= 3, `${id}.apoyo`);
    for (const otro of h.apoyo) {
      assert.ok(HABILIDADES[otro] && otro !== id, `${id} se apoya en ${otro}, que no existe`);
      assert.equal(AGENTES_OPCIONALES[otro], undefined, `${id} se apoya en ${otro}, que puede estar apagado`);
    }
  }
});

test('la habilidad dice al agente qué forma dar a su respuesta y a quién consultar', () => {
  const finanzas = describirHabilidad('finanzas');
  assert.match(finanzas, /Lo que entregas al terminar/);
  assert.match(finanzas, /Te apoyas en Crédito y cobranza, Contabilidad, Análisis de inversiones/);
  // Las que estaban más cortas se reforzaron sin perder lo que tenían.
  assert.match(describirHabilidad('analista'), /Síntoma, causa probable/);
  assert.match(describirHabilidad('analista'), /usar el diagnóstico anterior/);
  assert.ok(HABILIDADES.planificador.marcos.length >= 7);
  assert.ok(HABILIDADES.capacitacion.acciones.length >= 5);
});

test('cuando pregunta otro agente viajan reglas cortas y la habilidad resumida', () => {
  for (const id of ['finanzas', 'descubrimiento', 'orquestador', 'credito']) {
    const completo = sistemaPlano(sistemaPara(id, null, null, null));
    const compacto = sistemaPlano(sistemaPara(id, null, null, null, null, null, { compacto: true }));
    assert.ok(tokens(compacto) < tokens(completo) * 0.62, `${id}: ${tokens(compacto)} de ${tokens(completo)}`);
    assert.match(compacto, /150 palabras o menos/);
    assert.doesNotMatch(compacto, /GASTO: \[área que paga\]|ESTADO: en curso|Lo que entregas al terminar|DELEGAR: \[nombre/);
    assert.match(compacto, /Límites:/, 'los límites del agente nunca se omiten');
    assert.match(completo, /ESTADO: en curso \| entregado \| bloqueado/);
  }
  assert.match(describirHabilidad('descubrimiento', { compacto: true }), /Mom Test/);
});

test('las referencias de México viajan solo cuando la orden toca el tema', () => {
  // El Coordinador carga cinco bloques: con una orden concreta recibe solo el que corresponde.
  const todas = conocimientoPara('orquestador');
  const laboral = conocimientoPara('orquestador', '¿Puedo despedir a un empleado sin liquidación?');
  assert.ok(laboral.length > 100 && laboral.length < todas.length / 2);
  assert.equal(conocimientoPara('orquestador', '¿Qué atiendo primero esta semana?'), '');
  // Quien tiene un solo bloque lo recibe siempre: es su materia.
  assert.equal(conocimientoPara('rh', 'Escribe un saludo'), conocimientoPara('rh'));
  assert.equal(conocimientoPara('compras', 'lo que sea'), '');

  const sinTema = sistemaPara('orquestador', null, null, null, null, null, { consulta: '¿Qué atiendo primero esta semana?' });
  const conTema = sistemaPara('orquestador', null, null, null, null, null, { consulta: 'Quiero pedir un crédito al banco' });
  assert.doesNotMatch(sinTema, /Referencias para pymes en México/);
  assert.match(conTema, /Referencias para pymes en México/);
  // Van con lo que cambia en cada orden, para no romper la caché de la parte estable.
  assert.ok(conTema.indexOf('Referencias para pymes en México') > conTema.indexOf('<<dinamico>>'));
  assert.equal(sinTema.split('<<dinamico>>')[0], conTema.split('<<dinamico>>')[0], 'la parte estable es idéntica entre órdenes');
});

test('el contexto base de cada agente tiene un tope razonable', () => {
  // Sin datos del negocio: rol, habilidad, reglas y referencias. Si alguien alarga una habilidad, aquí se nota.
  for (const id of Object.keys(HABILIDADES)) {
    const t = tokens(sistemaPlano(sistemaPara(id, null, null, null, null, null, { consulta: 'Dame un resumen' })));
    assert.ok(t < 3300, `${id} carga ${t} tokens antes de conocer el negocio`);
  }
});
