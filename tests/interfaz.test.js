// Revisiones estáticas de la interfaz: errores que solo aparecen en el navegador y que la batería no ejecuta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const publico = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const fuente = (nombre) => readFileSync(join(publico, nombre), 'utf8');

test('las negritas de las respuestas de los agentes se separan con una expresión regular válida', () => {
  // Una vez se perdieron las barras invertidas y "/**(" se volvió un comentario: el chat dejaba de pintar respuestas.
  const m = fuente('app.js').match(/function conNegritas\(texto\) \{\s*return String\(texto \?\? ''\)\.split\((\/.+\/g)\)\.map/);
  assert.ok(m, 'no se encontró la expresión regular de conNegritas');
  const [, cuerpo, banderas] = m[1].match(/^\/(.+)\/(\w*)$/);
  assert.deepEqual('Hola **mundo** y **otra** cosa'.split(new RegExp(cuerpo, banderas)), ['Hola ', 'mundo', ' y ', 'otra', ' cosa']);
});

test('ningún archivo de la interfaz trae una expresión regular que empiece como comentario', () => {
  for (const nombre of readdirSync(publico).filter((n) => n.endsWith('.js'))) {
    const malas = fuente(nombre).split(/\r?\n/).filter((linea) => /\((\s*)\/\*\*\(/.test(linea));
    assert.deepEqual(malas, [], `${nombre}: "/**(" dentro de una llamada se interpreta como comentario`);
  }
});
