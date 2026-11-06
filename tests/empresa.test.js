import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizarEmpresa, fichaParaPrompt, crearEmpresa, CAMPOS_EMPRESA } from '../src/empresa.js';
import { sistemaPara } from '../src/prompts.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

test('sanitizarEmpresa devuelve todos los campos, recorta y normaliza el RFC', () => {
  const f = sanitizarEmpresa({ rfc: ' xaxx-010101 000 ', razonSocial: 'x'.repeat(300), notas: 'hola', inventado: 'no' });
  assert.equal(Object.keys(f).length, CAMPOS_EMPRESA.length);
  assert.equal(f.rfc, 'XAXX010101000');
  assert.equal(f.razonSocial.length, 150);
  assert.equal(f.notas, 'hola');
  assert.equal('inventado' in f, false);
});

test('la ficha para el prompt solo lleva campos con contenido', () => {
  assert.equal(fichaParaPrompt(sanitizarEmpresa(null)), '');
  const texto = fichaParaPrompt(sanitizarEmpresa({ razonSocial: 'Tienda SA de CV', productos: 'Pan\nLeche', regimenFiscal: 'RESICO' }));
  assert.match(texto, /^Ficha de la empresa:/);
  assert.match(texto, /Razón social: Tienda SA de CV/);
  assert.match(texto, /Productos o servicios principales: Pan; Leche/);
  assert.match(texto, /Régimen fiscal: RESICO/);
  assert.doesNotMatch(texto, /RFC/);
});

test('todos los agentes reciben la ficha en su contexto', () => {
  const ficha = sanitizarEmpresa({ domicilio: 'Av. Siempre Viva 123', municipio: 'Puebla', notas: 'No vendemos a crédito' });
  for (const area of ['finanzas', 'orquestador', 'analista']) {
    const s = sistemaPara(area, null, null, { nombre: 'Tienda' }, null, ficha);
    assert.match(s, /Av\. Siempre Viva 123/, area);
    assert.match(s, /No vendemos a crédito/, area);
  }
});

test('la ficha se guarda y se lee por API', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'empresa-test-'));
  const servidor = crearServidor(opcionesTemporales(dir));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const vacia = await (await fetch(`${base}/api/empresa`)).json();
    assert.equal(vacia.ficha.rfc, '');
    assert.equal(vacia.campos.length, CAMPOS_EMPRESA.length);
    const res = await fetch(`${base}/api/empresa`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rfc: 'abc123456t12', estado: 'Puebla' }) });
    assert.equal(res.status, 200);
    const leida = await (await fetch(`${base}/api/empresa`)).json();
    assert.equal(leida.ficha.rfc, 'ABC123456T12');
    assert.equal(leida.ficha.estado, 'Puebla');
    assert.equal(crearEmpresa(join(dir, 'empresa.json')).leer().estado, 'Puebla');
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
