import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conocimientoPara, CONOCIMIENTO_MX, VIGENCIA } from '../src/mexico.js';
import { sistemaPara } from '../src/prompts.js';
import { HABILIDADES } from '../src/habilidades.js';
import { AREAS_CONVERSACION } from '../src/conversaciones.js';

test('el conocimiento de México llega a los agentes que lo necesitan, con aviso de vigencia', () => {
  const rh = sistemaPara('rh', null, null, null);
  assert.match(rh, /vacaciones dignas/);
  assert.match(rh, new RegExp(VIGENCIA));
  assert.match(rh, /confirmarse con la fuente oficial/);
  const fiscal = sistemaPara('fiscal', null, null, null);
  assert.match(fiscal, /RESICO/);
  assert.match(fiscal, /3\.5 millones/);
  const finanzas = sistemaPara('finanzas', null, null, null);
  assert.match(finanzas, /Nafin/);
  assert.doesNotMatch(sistemaPara('compras', null, null, null), /Referencias para pymes/);
  assert.equal(conocimientoPara('compras'), '');
  assert.match(sistemaPara('ciberseguridad', null, null, null), /LFPDPPP/);
});

test('cada bloque de conocimiento tiene contenido y el orquestador recibe todos', () => {
  for (const [clave, lineas] of Object.entries(CONOCIMIENTO_MX)) assert.ok(lineas.length >= 3, clave);
  const orq = sistemaPara('orquestador', null, null, null);
  for (const b of Object.values(CONOCIMIENTO_MX)) assert.ok(orq.includes(b[0]), b[0].slice(0, 40));
});

test('el agente de tráfico digital existe, recibe órdenes y conoce las plataformas', () => {
  assert.ok(AREAS_CONVERSACION.includes('trafico'));
  const h = HABILIDADES.trafico;
  for (const plataforma of ['Meta Ads', 'Google Ads', 'TikTok Ads', 'LinkedIn Ads', 'WhatsApp']) assert.match(h.especialidad, new RegExp(plataforma));
  const s = sistemaPara('trafico', null, null, null);
  assert.match(s, /CPM, CPC, CTR/);
  assert.match(s, /9:16/);
  assert.match(s, /No garantiza resultados/);
});
