// Respaldo con un clic: un .zip con los datos de todas las empresas, sin la clave de IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { crearServidor } from '../src/server.js';
import { archivosDeRespaldo } from '../src/respaldo.js';
import { opcionesTemporales } from './_servidor.js';

// Lee un zip por su directorio central: { nombre: contenido }.
function leerZip(buffer) {
  const archivos = {};
  let c = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  while (c !== -1 && c + 46 <= buffer.length && buffer.readUInt32LE(c) === 0x02014b50) {
    const tamComp = buffer.readUInt32LE(c + 20);
    const n = buffer.readUInt16LE(c + 28);
    const nombre = buffer.toString('utf8', c + 46, c + 46 + n);
    const local = buffer.readUInt32LE(c + 42);
    const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    archivos[nombre] = inflateRawSync(buffer.subarray(inicio, inicio + tamComp)).toString('utf8');
    c += 46 + n + buffer.readUInt16LE(c + 30) + buffer.readUInt16LE(c + 32);
  }
  return archivos;
}

test('el respaldo trae los datos de todas las empresas y deja fuera la clave de IA', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-respaldo-'));
  let ahora = new Date(2026, 4, 4, 10);
  const servidor = crearServidor(opcionesTemporales(dir, { ahora: () => ahora }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const estado = async () => (await fetch(`${base}/api/respaldo/estado`)).json();
  try {
    // Sin datos no hay nada que respaldar ni que recordar.
    assert.equal((await estado()).recordar, false);
    assert.equal((await fetch(`${base}/api/respaldo`)).status, 422);

    await fetch(`${base}/api/diagnosticos`, json('POST', { contacto_nombre: 'Prueba', confianza: 'medio', giro: 'comercio', empleados: '1-5', ventas_anuales: 'menos_1m', antiguedad_anios: 2 }));
    await fetch(`${base}/api/marca`, json('PUT', { nombre: 'Negocio de prueba' }));
    // Otra empresa de la instalación y la configuración con una clave inventada.
    mkdirSync(join(dir, 'empresas', 'cliente-uno'), { recursive: true });
    writeFileSync(join(dir, 'empresas', 'cliente-uno', 'empresa.json'), JSON.stringify({ razonSocial: 'Cliente Uno' }));
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ anthropicKey: 'clave-secreta-de-prueba' }));
    writeFileSync(join(dir, 'servidor.pid'), '123');

    const antes = await estado();
    assert.equal(antes.ultimo, null);
    assert.equal(antes.recordar, true, 'con datos y sin respaldo, se recuerda');

    const res = await fetch(`${base}/api/respaldo`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /respaldo-agents-2026-05-04\.zip/);
    const archivos = leerZip(Buffer.from(await res.arrayBuffer()));
    const nombres = Object.keys(archivos);
    assert.ok(nombres.includes('LEEME.txt'));
    assert.ok(nombres.some((n) => /^diagnosticos\/[0-9a-f-]+\.json$/.test(n)));
    assert.ok(nombres.includes('marca/marca.json'));
    assert.ok(nombres.includes('empresas/cliente-uno/empresa.json'), 'incluye las demás empresas');
    assert.equal(nombres.includes('config.json'), false);
    assert.equal(nombres.includes('servidor.pid'), false);
    assert.doesNotMatch(Object.values(archivos).join('\n'), /clave-secreta-de-prueba/);
    assert.match(archivos['marca/marca.json'], /Negocio de prueba/);
    assert.match(archivos['LEEME.txt'], /Para restaurar/);

    // Recién respaldado no se recuerda; pasado un mes, sí.
    const despues = await estado();
    assert.equal(despues.dias, 0);
    assert.equal(despues.recordar, false);
    ahora = new Date(2026, 5, 5, 10);
    const alMes = await estado();
    assert.equal(alMes.dias, 32);
    assert.equal(alMes.recordar, true);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un config.json dentro de una empresa sí se respalda: solo se excluye el de la instalación', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agents-respaldo-'));
  try {
    mkdirSync(join(dir, 'empresas', 'a'), { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{}');
    writeFileSync(join(dir, 'respaldo.json'), '{}');
    writeFileSync(join(dir, 'empresas', 'a', 'config.json'), '{}');
    assert.deepEqual(archivosDeRespaldo(dir).lista.map((a) => a.nombre), ['empresas/a/config.json']);
    assert.deepEqual(archivosDeRespaldo(join(dir, 'no-existe')).lista, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
