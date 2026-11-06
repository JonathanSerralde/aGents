// Identidad de la instancia: nombre comercial y logotipo del usuario.
// Todo se guarda en la carpeta local data/marca/. Solo se aceptan PNG, JPG y WebP,
// y el servidor verifica el contenido real del archivo, no solo el tipo declarado.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const LIMITE_LOGO = 2 * 1024 * 1024; // 2 MB

const EXTENSIONES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Verifica la firma binaria del archivo para confirmar el formato real.
export function formatoReal(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

export function crearMarca(dir) {
  mkdirSync(dir, { recursive: true });
  const rutaDatos = join(dir, 'marca.json');

  function buscarLogo() {
    if (!existsSync(dir)) return null;
    const archivo = readdirSync(dir).find((f) => /^logo\.(png|jpg|webp)$/.test(f));
    if (!archivo) return null;
    const ext = archivo.split('.').pop();
    const tipo = Object.keys(EXTENSIONES).find((t) => EXTENSIONES[t] === ext);
    return { ruta: join(dir, archivo), tipo };
  }

  return {
    leer() {
      const nombre = existsSync(rutaDatos) ? JSON.parse(readFileSync(rutaDatos, 'utf8')).nombre || '' : '';
      return { nombre, tieneLogo: buscarLogo() !== null };
    },

    guardarNombre(nombre) {
      const limpio = String(nombre ?? '').trim().slice(0, 120);
      mkdirSync(dir, { recursive: true });
      writeFileSync(rutaDatos, JSON.stringify({ nombre: limpio }, null, 2), 'utf8');
      return limpio;
    },

    guardarLogo(tipoDeclarado, buffer) {
      if (!EXTENSIONES[tipoDeclarado]) throw new Error('Formato no permitido: usa PNG, JPG o WebP');
      if (buffer.length === 0) throw new Error('El archivo está vacío');
      if (buffer.length > LIMITE_LOGO) throw new Error('El logotipo supera 2 MB');
      const real = formatoReal(buffer);
      if (!real) throw new Error('El archivo no es una imagen PNG, JPG o WebP válida');
      if (real !== EXTENSIONES[tipoDeclarado]) throw new Error('El contenido no coincide con el tipo del archivo');

      mkdirSync(dir, { recursive: true });
      for (const f of readdirSync(dir)) {
        if (/^logo\.(png|jpg|webp)$/.test(f)) rmSync(join(dir, f));
      }
      writeFileSync(join(dir, `logo.${real}`), buffer);
      return { tipo: tipoDeclarado };
    },

    logo() {
      return buscarLogo();
    },
  };
}
