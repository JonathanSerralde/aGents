import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HABILIDADES, describirHabilidad } from '../src/habilidades.js';
import { AREAS_CONVERSACION } from '../src/conversaciones.js';
import { sistemaPara } from '../src/prompts.js';

test('cada agente (áreas y orquestador) tiene una habilidad completa', () => {
  for (const area of AREAS_CONVERSACION) {
    const h = HABILIDADES[area];
    assert.ok(h, `falta habilidad de ${area}`);
    for (const campo of ['rol', 'especialidad']) assert.ok(typeof h[campo] === 'string' && h[campo].length > 10, `${area}.${campo}`);
    for (const campo of ['pregunta_primero', 'marcos', 'acciones', 'limites']) {
      assert.ok(Array.isArray(h[campo]) && h[campo].length >= 1, `${area}.${campo}`);
    }
  }
});

test('la habilidad entra al prompt y cada agente es distinto', () => {
  const sFin = sistemaPara('finanzas', null, null, null);
  const sFis = sistemaPara('fiscal', null, null, null);
  assert.match(sFin, /13 semanas/);
  assert.match(sFis, /Contrato mínimo/);
  assert.doesNotMatch(sFin, /Contrato mínimo/);
  assert.match(sistemaPara('orquestador', null, null, null), /Coordinador general/);
  assert.match(sFin, /ACCIONES:/);
});

test('los agentes de apoyo ven todas las áreas y el equipo los admite', async () => {
  const { AREAS_EQUIPO, sanitizarEquipo } = await import('../src/equipo.js');
  for (const id of ['analista', 'planificador', 'capacitacion']) {
    assert.ok(AREAS_EQUIPO.includes(id), `${id} no está en el equipo`);
    assert.ok(AREAS_CONVERSACION.includes(id), `${id} no puede recibir órdenes`);
  }
  const e = sanitizarEquipo({ areas: { analista: { agente: 'Ada', responsable: 'Luis' } } });
  assert.equal(e.areas.analista.agente, 'Ada');
  const s = sistemaPara('analista', null, { areas: { analista: { agente: 'Ada' } } }, null);
  assert.match(s, /Eres Ada, agente de apoyo de Analista/);
  assert.match(s, /Finanzas: sin diagnóstico todavía/);
  assert.match(s, /Riesgos: sin diagnóstico todavía/);
  assert.match(sistemaPara('capacitacion', null, null, null), /DC-3/);
});

test('los límites legales aparecen en los agentes que los necesitan', () => {
  assert.match(describirHabilidad('fiscal'), /contador o el abogado/);
  assert.match(describirHabilidad('rh'), /abogado laboral/);
  assert.match(describirHabilidad('crecimiento'), /No promete crecimiento exponencial/);
});
