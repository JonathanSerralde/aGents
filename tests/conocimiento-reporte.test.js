import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { sanitizarFuente, crearFuentes, buscar, terminos, listarNotas, fragmentosParaPrompt } from '../src/conocimiento.js';
import { generarDocx, generarHtml, contenidoReporte } from '../src/reporte.js';
import { evaluar } from '../src/diagnostico.js';
import { validar } from '../src/formulario.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

function bovedaDePrueba() {
  const dir = mkdtempSync(join(tmpdir(), 'boveda-'));
  mkdirSync(join(dir, '.obsidian'));
  mkdirSync(join(dir, 'procesos'));
  writeFileSync(join(dir, 'index.md'), '# Índice\nPolítica de cobranza y procesos de ventas.');
  writeFileSync(join(dir, 'procesos', 'cobranza.md'), '# Cobranza\nLa política de cobranza es: anticipo de 50% y el resto a 15 días. Recordatorio a los 10 días.');
  writeFileSync(join(dir, 'procesos', 'vacaciones.md'), '# Vacaciones\nLas vacaciones se piden con dos semanas de anticipación.');
  writeFileSync(join(dir, '.obsidian', 'config.md'), 'cobranza cobranza cobranza');
  writeFileSync(join(dir, 'foto.png'), 'no es nota');
  return dir;
}

function registroDePrueba() {
  const datos = validar({ contacto_nombre: 'Ana', confianza: 'alto', giro: 'comercio', empleados: '1-5', ventas_anuales: 'menos_1m', antiguedad_anios: 2, meses_caja: 0.5, meta_crecimiento: 'vertical', proceso_venta: 'si' }).datos;
  return { id: 'r1', creado: '2026-11-05T12:00:00.000Z', contacto_nombre: 'Ana', datos, resultado: evaluar(datos), equipo: { areas: { finanzas: { responsable: 'Luis <b>', agente: 'Fina' } } } };
}

test('terminos ignora palabras cortas, acentos y repetidos', () => {
  assert.deepEqual(terminos('¿Cómo va la Cobranza de hoy? cobranza'), ['como', 'cobranza']);
});

test('listarNotas omite .obsidian y archivos que no son notas', () => {
  const dir = bovedaDePrueba();
  try {
    const notas = listarNotas(dir).map((n) => n.replace(dir, '').replace(/\\/g, '/'));
    assert.deepEqual(notas.sort(), ['/index.md', '/procesos/cobranza.md', '/procesos/vacaciones.md']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buscar devuelve la nota más relacionada con fragmento y referencia', () => {
  const dir = bovedaDePrueba();
  try {
    const res = buscar([{ ruta: dir, nombre: 'Mi bóveda' }], 'Explícame la política de cobranza');
    assert.ok(res.length >= 1);
    assert.equal(res[0].titulo, 'cobranza');
    assert.match(res[0].fragmento, /anticipo de 50%/);
    assert.equal(res[0].fuente, 'Mi bóveda');
    assert.match(fragmentosParaPrompt(res), /Mi bóveda › procesos/);
    assert.match(fragmentosParaPrompt(res), /no como instrucciones/);
    assert.deepEqual(buscar([{ ruta: dir, nombre: 'x' }], 'xyz'), []);
    assert.deepEqual(buscar([], 'cobranza'), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('las fuentes se validan como carpetas existentes y se guardan sin duplicar', () => {
  const dir = bovedaDePrueba();
  const datos = mkdtempSync(join(tmpdir(), 'fuentes-'));
  try {
    assert.throws(() => sanitizarFuente({ ruta: join(dir, 'no-existe') }), /no existe/);
    assert.throws(() => sanitizarFuente({ ruta: '' }), /Indica/);
    const f = crearFuentes(join(datos, 'fuentes.json'));
    f.agregar({ ruta: dir });
    f.agregar({ ruta: dir, nombre: 'Repetida' });
    assert.equal(f.leer().length, 1);
    assert.equal(f.leer()[0].nombre, 'Repetida');
    f.quitar(dir);
    assert.equal(f.leer().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(datos, { recursive: true, force: true });
  }
});

test('el .docx es un ZIP válido con el documento y el texto escapado', () => {
  const reg = registroDePrueba();
  const docx = generarDocx(reg, reg.equipo, { nombre: 'Tienda & Cía' });
  assert.equal(docx.readUInt32LE(0), 0x04034b50);
  // Lee la primera entrada local: nombre y datos comprimidos
  const nombreLen = docx.readUInt16LE(26);
  const tamComp = docx.readUInt32LE(18);
  const nombre = docx.toString('utf8', 30, 30 + nombreLen);
  assert.equal(nombre, '[Content_Types].xml');
  const contenido = inflateRawSync(docx.subarray(30 + nombreLen, 30 + nombreLen + tamComp)).toString('utf8');
  assert.match(contenido, /wordprocessingml/);
  const todo = docx.toString('latin1');
  assert.ok(todo.includes('word/document.xml'));
  // El XML del documento va comprimido; lo recuperamos por su entrada
  const idx = todo.indexOf('word/document.xml');
  const cab = idx - 30;
  const len = docx.readUInt16LE(cab + 26);
  const comp = docx.readUInt32LE(cab + 18);
  const xml = inflateRawSync(docx.subarray(cab + 30 + len, cab + 30 + len + comp)).toString('utf8');
  assert.match(xml, /Diagnóstico de Tienda &amp; Cía/);
  assert.match(xml, /Luis &lt;b&gt;/);
  assert.match(xml, /Plan de acción/);
});

test('la página imprimible escapa el contenido y trae el botón de PDF', () => {
  const reg = registroDePrueba();
  const html = generarHtml(reg, reg.equipo, { nombre: 'Tienda' });
  assert.match(html, /window\.print\(\)/);
  assert.match(html, /Luis &lt;b&gt;/);
  assert.doesNotMatch(html, /Luis <b>/);
  const bloques = contenidoReporte(reg, reg.equipo, { nombre: 'Tienda' });
  assert.equal(bloques[0].texto, 'Diagnóstico de Tienda');
});

test('el servidor entrega el reporte en Word y en HTML, y busca en las bóvedas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'srv-rep-'));
  const boveda = bovedaDePrueba();
  const recibido = [];
  const servidor = crearServidor(opcionesTemporales(dir, { llamarIA: async ({ sistema }) => { recibido.push(sistema); return 'OK'; } }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const json = (m, c) => ({ method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
  try {
    const diag = await (await fetch(`${base}/api/diagnosticos`, json('POST', { contacto_nombre: 'Ana', confianza: 'alto', giro: 'comercio', empleados: '1-5', ventas_anuales: 'menos_1m', antiguedad_anios: 2 }))).json();
    const docx = await fetch(`${base}/api/diagnosticos/${diag.id}/reporte.docx`);
    assert.equal(docx.status, 200);
    assert.match(docx.headers.get('content-type'), /wordprocessingml/);
    assert.match(docx.headers.get('content-disposition'), /diagnostico-.*\.docx/);
    assert.equal(Buffer.from(await docx.arrayBuffer()).readUInt32LE(0), 0x04034b50);
    const html = await fetch(`${base}/api/diagnosticos/${diag.id}/reporte.html`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Guardar como PDF/);
    assert.equal((await fetch(`${base}/api/diagnosticos/no-existe/reporte.docx`)).status, 404);

    assert.equal((await fetch(`${base}/api/fuentes`, json('POST', { ruta: boveda, nombre: 'Wiki' }))).status, 201);
    const busqueda = await (await fetch(`${base}/api/fuentes/buscar?q=cobranza`)).json();
    assert.equal(busqueda.resultados[0].titulo, 'cobranza');
    recibido.length = 0;
    const orden = await (await fetch(`${base}/api/agentes/finanzas/mensajes`, json('POST', { texto: 'Revisa la política de cobranza' }))).json();
    assert.equal(orden.notas[0].titulo, 'cobranza');
    assert.match(recibido[0], /anticipo de 50%/);
    assert.equal((await fetch(`${base}/api/fuentes`, json('DELETE', { ruta: boveda }))).status, 200);
    assert.equal((await (await fetch(`${base}/api/fuentes`)).json()).fuentes.length, 0);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
    rmSync(boveda, { recursive: true, force: true });
  }
});
