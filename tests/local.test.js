import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PUBLICO = new URL('../public/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Garantiza la promesa "todo se queda en tu equipo": la interfaz no carga código de internet.
test('el frontend no importa ni carga scripts o estilos desde internet', () => {
  const archivos = readdirSync(PUBLICO).filter((f) => /\.(js|html|css)$/.test(f));
  const patrones = [/from\s+['"]https?:\/\//, /import\(\s*['"]https?:\/\//, /<script[^>]+src=["']https?:\/\//i, /<link[^>]+href=["']https?:\/\//i, /@import\s+url\(\s*['"]?https?:\/\//i];
  for (const archivo of archivos) {
    const contenido = readFileSync(join(PUBLICO, archivo), 'utf8');
    for (const patron of patrones) {
      assert.ok(!patron.test(contenido), `${archivo} carga algo desde internet: ${patron}`);
    }
  }
});

test('Three.js está guardado en el repositorio', () => {
  const ruta = join(PUBLICO, 'vendor', 'three.module.js');
  assert.ok(existsSync(ruta), 'falta public/vendor/three.module.js');
  assert.match(readFileSync(ruta, 'utf8').slice(0, 20000), /REVISION\s*=\s*'160'/);
});
