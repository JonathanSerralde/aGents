// Construye el paquete portátil de Oficina Multiagente para macOS desde cualquier sistema (Windows o Mac).
// Resultado: dist/OficinaMultiagente-mac/ y dist/OficinaMultiagente-<versión>-macos.tar.gz
//
// Uso:  node instalador/construir-mac.mjs [--arq arm64,x64] [--solo-cache]
//   --arq         chips a incluir: arm64 (Apple Silicon), x64 (Intel) o ambos. Por defecto, arm64.
//   --solo-cache  descarga los Node de macOS a instalador/cache/ y termina (sin empaquetar).
//
// Por qué .tar.gz y no .zip: el archivo guarda permisos de ejecución (0755) para los lanzadores y el
// motor; un ZIP hecho en Windows los pierde y macOS no podría abrirlos con doble clic.
// El tar se escribe con código propio (formato ustar) para fijar esos permisos sin depender del sistema.

import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, createWriteStream } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_NODE = 'v24.22.2';
const argArq = process.argv[process.argv.indexOf('--arq') + 1];
const ARQUITECTURAS = process.argv.includes('--arq') && argArq
  ? argArq.split(',').filter((a) => ['arm64', 'x64'].includes(a))
  : ['arm64'];
if (!ARQUITECTURAS.length) throw new Error('--arq debe ser arm64, x64 o arm64,x64');
const CACHE = join(RAIZ, 'instalador', 'cache');
const DIST = join(RAIZ, 'dist');
const SALIDA = join(DIST, 'OficinaMultiagente-mac');
const soloCache = process.argv.includes('--solo-cache');

const paquete = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
const archivoFinal = join(DIST, `OficinaMultiagente-${paquete.version}-macos.tar.gz`);

async function descargar(url, destino) {
  if (existsSync(destino)) return;
  console.log(`Descargando ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url}: ${res.status}`);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
}

// Verifica cada descarga contra SHASUMS256.txt de nodejs.org.
async function verificar(nombre, ruta, sumas) {
  const esperada = sumas.split('\n').find((l) => l.endsWith(`  ${nombre}`))?.split(' ')[0];
  if (!esperada) throw new Error(`No hay suma publicada para ${nombre}`);
  const real = createHash('sha256').update(readFileSync(ruta)).digest('hex');
  if (real !== esperada) throw new Error(`La suma de ${nombre} no coincide: descarga corrupta o alterada`);
}

async function obtenerNode() {
  const base = `https://nodejs.org/dist/${VERSION_NODE}`;
  const rutaSumas = join(CACHE, `SHASUMS256-${VERSION_NODE}.txt`);
  await descargar(`${base}/SHASUMS256.txt`, rutaSumas);
  const sumas = readFileSync(rutaSumas, 'utf8');
  const binarios = {};
  for (const arq of ARQUITECTURAS) {
    const nombre = `node-${VERSION_NODE}-darwin-${arq}.tar.gz`;
    const ruta = join(CACHE, nombre);
    await descargar(`${base}/${nombre}`, ruta);
    await verificar(nombre, ruta, sumas);
    const carpeta = join(CACHE, `node-${VERSION_NODE}-darwin-${arq}`);
    if (!existsSync(join(carpeta, 'bin', 'node'))) {
      // Rutas relativas con cwd en la caché: GNU tar toma "B:\..." como un host remoto por los dos puntos.
      execFileSync('tar', ['-xzf', nombre, `node-${VERSION_NODE}-darwin-${arq}/bin/node`, `node-${VERSION_NODE}-darwin-${arq}/LICENSE`], { cwd: CACHE, stdio: 'pipe' });
    }
    binarios[arq] = { node: join(carpeta, 'bin', 'node'), licencia: join(carpeta, 'LICENSE') };
    console.log(`Node ${VERSION_NODE} darwin-${arq} listo (suma verificada)`);
  }
  return binarios;
}

// Solo las imágenes que assets.js usa.
function limpiarAssets(dirPublic) {
  const usadas = new Set([...readFileSync(join(dirPublic, 'assets.js'), 'utf8').matchAll(/assets\/[a-z]+\/[a-z]+-\d+\.png/g)].map((m) => m[0]));
  const base = join(dirPublic, 'assets');
  const recorrer = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (f.endsWith('.png') && !usadas.has('assets/' + relative(base, p).split('\\').join('/'))) rmSync(p);
    }
  };
  recorrer(base);
}

// ---- Escritor tar (ustar) mínimo con permisos explícitos ----
function encabezadoTar(nombre, tam, modo, esDir) {
  const b = Buffer.alloc(512, 0);
  const campo = (valor, inicio, largo) => b.write(valor, inicio, largo, 'utf8');
  const partes = nombre.length > 100 ? [nombre.slice(0, nombre.lastIndexOf('/', 154)), nombre.slice(nombre.lastIndexOf('/', 154) + 1)] : ['', nombre];
  campo(partes[1], 0, 100);
  campo(modo.toString(8).padStart(7, '0'), 100, 8);
  campo('0000000', 108, 8);
  campo('0000000', 116, 8);
  campo(tam.toString(8).padStart(11, '0'), 124, 12);
  campo(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0'), 136, 12);
  campo('        ', 148, 8);
  campo(esDir ? '5' : '0', 156, 1);
  campo('ustar', 257, 6);
  campo('00', 263, 2);
  campo('usuario', 265, 32);
  campo('staff', 297, 32);
  if (partes[0]) campo(partes[0], 345, 155);
  let suma = 0;
  for (const byte of b) suma += byte;
  campo(suma.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return b;
}

function empaquetarTar(dirRaiz, prefijo, ejecutables) {
  const bloques = [];
  const recorrer = (dir) => {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      const nombre = posix.join(prefijo, relative(dirRaiz, p).split('\\').join('/'));
      const st = statSync(p);
      if (st.isDirectory()) {
        bloques.push(encabezadoTar(`${nombre}/`, 0, 0o755, true));
        recorrer(p);
      } else {
        const datos = readFileSync(p);
        const modo = ejecutables.some((e) => nombre.endsWith(e)) ? 0o755 : 0o644;
        bloques.push(encabezadoTar(nombre, datos.length, modo, false), datos);
        const resto = datos.length % 512;
        if (resto) bloques.push(Buffer.alloc(512 - resto, 0));
      }
    }
  };
  bloques.push(encabezadoTar(`${prefijo}/`, 0, 0o755, true));
  recorrer(dirRaiz);
  bloques.push(Buffer.alloc(1024, 0));
  return gzipSync(Buffer.concat(bloques), { level: 9 });
}

async function main() {
  const binarios = await obtenerNode();
  if (soloCache) return console.log('Node de macOS en caché. Sin empaquetar (--solo-cache).');

  console.log(`Construyendo Oficina Multiagente ${paquete.version} para macOS (${ARQUITECTURAS.join(' y ')})`);
  rmSync(SALIDA, { recursive: true, force: true });
  rmSync(archivoFinal, { force: true });
  mkdirSync(join(SALIDA, 'node'), { recursive: true });
  mkdirSync(join(SALIDA, 'data'), { recursive: true });

  for (const carpeta of ['src', 'public', 'docs']) cpSync(join(RAIZ, carpeta), join(SALIDA, carpeta), { recursive: true });
  for (const archivo of ['package.json', 'README.md', '.env.example']) cpSync(join(RAIZ, archivo), join(SALIDA, archivo));
  limpiarAssets(join(SALIDA, 'public'));
  for (const arq of ARQUITECTURAS) cpSync(binarios[arq].node, join(SALIDA, 'node', `node-${arq}`));
  cpSync(binarios[ARQUITECTURAS[0]].licencia, join(SALIDA, 'node', 'LICENSE-node.txt'));
  cpSync(join(RAIZ, 'instalador', 'plantilla-mac'), SALIDA, { recursive: true });
  writeFileSync(join(SALIDA, 'data', 'LEEME-data.txt'), 'Aquí se guardan tus diagnósticos, tu borrador, tu marca, tu equipo y tus conversaciones. Copia esta carpeta para respaldarla.\n');

  const tar = empaquetarTar(SALIDA, 'OficinaMultiagente', ['Iniciar.command', 'Detener.command', 'node/node-arm64', 'node/node-x64']);
  await new Promise((resolver, rechazar) => {
    const w = createWriteStream(archivoFinal);
    w.on('finish', resolver);
    w.on('error', rechazar);
    w.end(tar);
  });
  const mb = (n) => (n / 1048576).toFixed(1);
  console.log('Listo.');
  console.log(`  Carpeta: ${SALIDA}`);
  console.log(`  Archivo: ${archivoFinal} (${mb(statSync(archivoFinal).size)} MB)`);
  console.log('  Pendiente de probar en un Mac real: este constructor no puede ejecutar macOS.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
