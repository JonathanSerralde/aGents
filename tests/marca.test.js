import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearMarca, formatoReal, LIMITE_LOGO } from '../src/marca.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(16)]);

function conDirectorio(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'marca-test-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('formatoReal reconoce PNG, JPG y WebP por su firma', () => {
  assert.equal(formatoReal(PNG), 'png');
  assert.equal(formatoReal(JPG), 'jpg');
  assert.equal(formatoReal(WEBP), 'webp');
});

test('formatoReal rechaza contenido que no es imagen', () => {
  assert.equal(formatoReal(Buffer.from('<svg onload="x()"></svg>')), null);
  assert.equal(formatoReal(Buffer.from('GIF89a')), null);
});

test('guardarLogo acepta un PNG válido y lo deja disponible', () => {
  conDirectorio((dir) => {
    const marca = crearMarca(dir);
    marca.guardarLogo('image/png', PNG);
    assert.equal(marca.leer().tieneLogo, true);
    assert.equal(marca.logo().tipo, 'image/png');
    assert.ok(existsSync(join(dir, 'logo.png')));
  });
});

test('guardarLogo rechaza un archivo que declara PNG pero no lo es', () => {
  conDirectorio((dir) => {
    const marca = crearMarca(dir);
    assert.throws(() => marca.guardarLogo('image/png', Buffer.from('<script>alert(1)</script>')), /no es una imagen/);
    assert.equal(marca.leer().tieneLogo, false);
  });
});

test('guardarLogo rechaza un tipo declarado no permitido aunque el contenido sea válido', () => {
  conDirectorio((dir) => {
    const marca = crearMarca(dir);
    assert.throws(() => marca.guardarLogo('image/svg+xml', PNG), /Formato no permitido/);
  });
});

test('guardarLogo rechaza contenido que no coincide con el tipo declarado', () => {
  conDirectorio((dir) => {
    const marca = crearMarca(dir);
    assert.throws(() => marca.guardarLogo('image/jpeg', PNG), /no coincide/);
  });
});

test('guardarLogo rechaza archivos mayores al límite', () => {
  conDirectorio((dir) => {
    const marca = crearMarca(dir);
    const grande = Buffer.concat([PNG, Buffer.alloc(LIMITE_LOGO)]);
    assert.throws(() => marca.guardarLogo('image/png', grande), /supera 2 MB/);
  });
});

test('un nuevo logotipo reemplaza al anterior', () => {
  conDirectorio((dir) => {
    const marca = crearMarca(dir);
    marca.guardarLogo('image/png', PNG);
    marca.guardarLogo('image/jpeg', JPG);
    assert.equal(existsSync(join(dir, 'logo.png')), false);
    assert.equal(marca.logo().tipo, 'image/jpeg');
  });
});

test('guardarNombre recorta el nombre y lo persiste', () => {
  conDirectorio((dir) => {
    const marca = crearMarca(dir);
    marca.guardarNombre('  Ferretería Ejemplo  ');
    assert.equal(marca.leer().nombre, 'Ferretería Ejemplo');
  });
});
