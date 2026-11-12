import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizarPeticion, instruccionCampana, parsearCampana, contraste } from '../src/campana.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const RESPUESTA = `Claro, aquí van:

**PROPUESTA 1**
TITULAR: Material en tu obra el mismo día
APOYO: Pide antes de las 2 y llega hoy
CTA: Escríbenos por WhatsApp
TEXTO: ¿Te urge material? Lo llevamos a tu obra el mismo día.
HASHTAGS: #Ferreteria #EnvioHoy, sinhash #Obra
PÚBLICO: Contratistas de 20 a 45 años de la zona
PRESUPUESTO: $80 diarios durante 10 días
ÁNGULO: Habla del beneficio directo
COLORES: #0b1a3a, #3f2b96, #10203a, #3fd3ff

PROPUESTA 2
- TITULAR: "${'x'.repeat(90)}"
CTA: Inscríbete hoy mismo sin pagar inscripción
COLORES: azul, rojo

PROPUESTA 3
APOYO: sin titular no cuenta

ACCIONES:
- Publicar el lunes`;

test('la petición se limpia y exige decir qué se ofrece', () => {
  assert.deepEqual(sanitizarPeticion({ objetivo: 'otro', oferta: '  Curso   de Excel ', tono: 'urgente', extra: 1 }), { objetivo: 'vender', oferta: 'Curso de Excel', publico: '', tono: 'urgente' });
  assert.equal(sanitizarPeticion(null).oferta, '');
  const instruccion = instruccionCampana(sanitizarPeticion({ oferta: 'Curso de Excel', publico: 'contadores' }));
  assert.match(instruccion, /Curso de Excel/);
  assert.match(instruccion, /contadores/);
  assert.match(instruccion, /No inventes precios/);
});

test('la respuesta del agente se interpreta, se recorta y se corrige el color ilegible', () => {
  const p = parsearCampana(RESPUESTA);
  assert.equal(p.length, 2, 'la propuesta sin titular se descarta');
  assert.equal(p[0].titular, 'Material en tu obra el mismo día');
  assert.equal(p[0].cta, 'Escríbenos por WhatsApp');
  assert.equal(p[0].hashtags, '#Ferreteria #EnvioHoy #Obra');
  assert.match(p[0].publico, /20 a 45/);
  assert.match(p[0].presupuesto, /\$80/);
  assert.match(p[0].angulo, /beneficio/);
  // El texto #10203a no se lee sobre #0b1a3a: pasa a blanco.
  assert.deepEqual(p[0].colores, { fondo: '#0b1a3a', fondo2: '#3f2b96', texto: '#ffffff', acento: '#3fd3ff' });
  assert.ok(contraste(p[0].colores.fondo, p[0].colores.texto) >= 4.5);
  assert.equal(p[1].titular.length, 70);
  assert.equal(p[1].cta.length, 24);
  assert.equal(p[1].colores, null, 'colores que no son hexadecimales se ignoran');
  assert.ok(!JSON.stringify(p).includes('Publicar el lunes'));
  assert.deepEqual(parsearCampana('No puedo ayudarte con eso.'), []);
});

test('el servidor construye la campaña con el agente de Tráfico digital y la guarda', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-camp-'));
  const llamadas = [];
  const servidor = crearServidor(opcionesTemporales(dir, {
    proveedor: 'prueba',
    llamarIA: async ({ sistema, mensajes }) => { llamadas.push({ sistema, texto: mensajes.at(-1).texto }); return llamadas.length === 1 ? RESPUESTA : 'Lo siento, no entendí.'; },
  }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const generar = (cuerpo) => fetch(`${base}/api/campanas/generar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  try {
    const antes = await (await fetch(`${base}/api/campanas`)).json();
    assert.equal(antes.campana, null);
    assert.equal(antes.bloqueo, null);
    assert.ok(antes.objetivos.vender);

    assert.equal((await generar({ oferta: '   ' })).status, 422);
    assert.equal(llamadas.length, 0, 'sin oferta no se gasta una llamada');

    const res = await generar({ objetivo: 'llenar', oferta: 'Entrega de material el mismo día', publico: 'contratistas' });
    assert.equal(res.status, 200);
    const { campana } = await res.json();
    assert.equal(campana.agente, 'trafico');
    assert.equal(campana.propuestas.length, 2);
    assert.equal(llamadas.length, 1, 'una sola llamada al proveedor');
    assert.match(llamadas[0].texto, /Entrega de material el mismo día/);
    assert.match(llamadas[0].sistema, /Tráfico digital|tráfico/i);

    // Queda guardada y aparece en la conversación del agente.
    assert.equal((await (await fetch(`${base}/api/campanas`)).json()).campana.propuestas[0].titular, 'Material en tu obra el mismo día');
    const chat = await (await fetch(`${base}/api/agentes/trafico/mensajes`)).json();
    assert.ok(JSON.stringify(chat).includes('Construye una campaña'));

    // Si el agente no respeta el formato, se avisa y la campaña anterior no se pierde.
    assert.equal((await generar({ oferta: 'Otra cosa' })).status, 502);
    assert.equal((await (await fetch(`${base}/api/campanas`)).json()).campana.propuestas.length, 2);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sin IA la campaña no se genera y se dice por qué', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-camp-'));
  const servidor = crearServidor(opcionesTemporales(dir));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const res = await fetch(`${base}/api/campanas/generar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oferta: 'Curso' }) });
    assert.equal(res.status, 409);
    assert.match((await res.json()).errores[0], /Sin IA configurada.*a mano/);
    assert.match((await (await fetch(`${base}/api/campanas`)).json()).bloqueo, /Sin IA/);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
