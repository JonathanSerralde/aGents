import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extraerPeticiones, resolverAgente, limpiarPeticiones, componerRespuesta } from '../src/colaboracion.js';
import { textoDeDocx, textoDePdf, extraerTexto, crearDocumentos } from '../src/documentos.js';
import { generarDocx } from '../src/reporte.js';
import { evaluar } from '../src/diagnostico.js';
import { validar } from '../src/formulario.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';
import { HABILIDADES } from '../src/habilidades.js';
import { AREAS_CONVERSACION } from '../src/conversaciones.js';

const json = (m, c) => ({ method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });

function opciones(dir, extra = {}) {
  return opcionesTemporales(dir, extra);
}

async function conServidor(extra, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'colab-'));
  const servidor = crearServidor(opciones(dir, extra));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { await fn(base); } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
}

test('se extraen las líneas CONSULTAR y DELEGAR y se resuelven los agentes por nombre', () => {
  const r = 'Veo dos cosas.\nCONSULTAR: [Finanzas] — ¿cuántos días de caja hay?\nDELEGAR: Recursos humanos — revisa las altas del IMSS\nconsultar: tráfico digital - ¿qué presupuesto?';
  const p = extraerPeticiones(r);
  assert.equal(p.length, 3);
  assert.deepEqual(p[0], { tipo: 'CONSULTAR', destinoTexto: 'Finanzas', texto: '¿cuántos días de caja hay?' });
  assert.equal(resolverAgente('Finanzas'), 'finanzas');
  assert.equal(resolverAgente('recursos humanos'), 'rh');
  assert.equal(resolverAgente('Tráfico digital'), 'trafico');
  assert.equal(resolverAgente('agente de Auditoría'), 'auditoria');
  assert.equal(resolverAgente('Sucursal Norte', { 'x-sucursal-norte': { nombre: 'Sucursal Norte' } }), 'x-sucursal-norte');
  assert.equal(resolverAgente('Marte'), null);
  assert.equal(limpiarPeticiones(r), 'Veo dos cosas.');
  assert.match(componerRespuesta(r, [{ tipo: 'CONSULTAR', nombreDestino: 'Fina', texto: 'x', respuesta: '3 días' }]), /Consulta a Fina: x\n→ 3 días/);
});

test('un agente consulta a otro y el usuario recibe ambas respuestas; el destino no abre otra vuelta', async () => {
  const llamadas = [];
  const llamarIA = async ({ sistema, mensajes }) => {
    llamadas.push({ sistema, ultimo: mensajes.at(-1).texto });
    if (/Esta petición viene de otro agente/.test(sistema)) return 'Hay 2 meses de caja. CONSULTAR: [Ventas] — ¿y esto?';
    return 'Necesito un dato.\nCONSULTAR: [Finanzas] — ¿cuántos meses de caja hay?';
  };
  await conServidor({ llamarIA }, async (base) => {
    const r = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: '¿Puedo invertir en captación?' }))).json();
    assert.equal(r.intercambios.length, 1);
    assert.equal(r.intercambios[0].destino, 'finanzas');
    assert.match(r.respuesta, /Necesito un dato\./);
    assert.match(r.respuesta, /Consulta a Finanzas/);
    assert.match(r.respuesta, /2 meses de caja/);
    assert.doesNotMatch(r.respuesta, /^CONSULTAR/m);
    assert.equal(llamadas.length, 2, 'la consulta del destino no debe generar una tercera llamada');
    const fin = await (await fetch(`${base}/api/agentes/finanzas/mensajes`)).json();
    assert.match(fin.mensajes[0].texto, /Pregunta de el agente de ventas/);
  });
});

test('solo el Orquestador puede delegar, hasta cuatro encargos', async () => {
  const llamarIA = async ({ sistema }) => (/Esta petición viene de otro agente/.test(sistema) ? 'Hecho.' : 'Plan.\nDELEGAR: [Finanzas] — a\nDELEGAR: [Ventas] — b\nDELEGAR: [RH] — c\nDELEGAR: [Compras] — d\nDELEGAR: [Riesgos] — e');
  await conServidor({ llamarIA }, async (base) => {
    const orq = await (await fetch(`${base}/api/agentes/orquestador/mensajes`, json('POST', { texto: 'Reparte el trabajo' }))).json();
    assert.equal(orq.intercambios.length, 4);
    assert.deepEqual(orq.intercambios.map((i) => i.destino), ['finanzas', 'ventas', 'rh', 'compras']);
    const area = await (await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Reparte' }))).json();
    assert.equal(area.intercambios.filter((i) => i.respuesta).length, 0, 'un agente de área no delega fuera de su línea de mando');
    assert.ok(area.intercambios.every((i) => i.error), 'cada intento queda registrado con su motivo');
    assert.ok(area.intercambios.some((i) => /línea de mando/.test(i.error)));
  });
});

test('Word: el texto se extrae de un .docx generado por el propio reporte', () => {
  const datos = validar({ contacto_nombre: 'Ana', confianza: 'alto', giro: 'comercio', empleados: '1-5', ventas_anuales: 'menos_1m', antiguedad_anios: 2, meses_caja: 0.5 }).datos;
  const docx = generarDocx({ creado: '2026-11-05T00:00:00.000Z', datos, resultado: evaluar(datos) }, null, { nombre: 'Tienda & Cía' });
  const texto = textoDeDocx(docx);
  assert.match(texto, /Diagnóstico de Tienda & Cía/);
  assert.match(texto, /Plan de acción/);
  assert.doesNotMatch(texto, /<w:/);
});

test('PDF: se extrae texto incrustado simple y se reporta cuando no hay texto', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Length 60 >> stream\nBT /F1 12 Tf 72 700 Td (Factura 123) Tj T* [(Total) ( 500)] TJ ET\nendstream endobj\n%%EOF', 'latin1');
  assert.match(textoDePdf(pdf), /Factura 123/);
  assert.match(textoDePdf(pdf), /Total\s*500/);
  assert.equal(extraerTexto('pdf', Buffer.from('%PDF-1.4 sin streams')).metodo, 'pdf-sin-texto');
  assert.equal(extraerTexto('png', Buffer.alloc(10)).metodo, 'imagen');
  assert.equal(extraerTexto('txt', Buffer.from('hola')).texto, 'hola');
});

test('los documentos se guardan con su texto, se listan sin el texto y se borran', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docs-'));
  try {
    const d = crearDocumentos(dir);
    const doc = d.guardar('notas: ventas/2026.txt', 'text/plain', Buffer.from('Ventas de noviembre: 120 mil'));
    assert.equal(doc.nombre, 'notas_ ventas_2026.txt');
    assert.equal(doc.caracteres, 28);
    assert.equal(d.listar().length, 1);
    assert.equal('texto' in d.listar()[0], false);
    assert.match(d.obtener(doc.id).texto, /120 mil/);
    assert.throws(() => d.guardar('x.exe', 'application/octet-stream', Buffer.from('x')), /Formato no permitido/);
    assert.equal(d.borrar(doc.id), true);
    assert.equal(d.listar().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el Orquestador analiza un documento subido y reparte encargos a los agentes', async () => {
  const llamadas = [];
  const llamarIA = async ({ sistema, mensajes }) => {
    llamadas.push({ sistema, texto: mensajes.at(-1).texto, imagen: Boolean(mensajes.at(-1).imagen) });
    if (/Esta petición viene de otro agente/.test(sistema)) return 'Encargo recibido.';
    return 'Es un contrato de arrendamiento con renta de 20 mil.\nDELEGAR: [Fiscal y legal] — revisa las cláusulas de renta\nDELEGAR: [Finanzas] — incluye la renta en el flujo';
  };
  await conServidor({ llamarIA }, async (base) => {
    const subida = await fetch(`${base}/api/documentos`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-nombre': encodeURIComponent('contrato.txt') }, body: 'CONTRATO DE ARRENDAMIENTO. Renta mensual: $20,000.' });
    assert.equal(subida.status, 201);
    const doc = await subida.json();
    assert.equal(doc.nombre, 'contrato.txt');
    const analisis = await (await fetch(`${base}/api/documentos/${doc.id}/analizar`, { method: 'POST' })).json();
    assert.equal(analisis.ok, true);
    assert.equal(analisis.analisis.delegaciones.length, 2);
    assert.deepEqual(analisis.analisis.delegaciones.map((d) => d.destino), ['fiscal', 'finanzas']);
    assert.match(analisis.analisis.resumen, /Encargo a Fiscal y legal/);
    assert.match(llamadas[0].texto, /Renta mensual/);
    assert.match(llamadas[0].sistema, /Orquestador/);
    const orq = await (await fetch(`${base}/api/agentes/orquestador/mensajes`)).json();
    assert.match(orq.mensajes.at(-1).texto, /contrato de arrendamiento/i);
    const lista = await (await fetch(`${base}/api/documentos`)).json();
    assert.equal(lista.documentos[0].analisis.delegaciones.length, 2);

    // Imagen: se envía como bloque de visión
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
    const img = await (await fetch(`${base}/api/documentos`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-nombre': 'ticket.png' }, body: png })).json();
    await fetch(`${base}/api/documentos/${img.id}/analizar`, { method: 'POST' });
    assert.equal(llamadas.at(-1).imagen || llamadas.some((l) => l.imagen), true);
    assert.equal((await fetch(`${base}/api/documentos/${doc.id}`, { method: 'DELETE' })).status, 200);
  });
  await conServidor({}, async (base) => {
    const doc = await (await fetch(`${base}/api/documentos`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-nombre': 'n.txt' }, body: 'hola' })).json();
    const a = await (await fetch(`${base}/api/documentos/${doc.id}/analizar`, { method: 'POST' })).json();
    assert.equal(a.pendiente, true);
  });
});

test('el agente de Auditoría existe y revisa también el trabajo de los agentes', () => {
  assert.ok(AREAS_CONVERSACION.includes('auditoria'));
  assert.match(HABILIDADES.auditoria.especialidad, /trabajo de los demás agentes/);
  assert.match(HABILIDADES.auditoria.limites.join(' '), /contador público/);
});
