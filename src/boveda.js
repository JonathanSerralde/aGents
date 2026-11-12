// Protección de la clave de API en disco. En Windows se cifra con DPAPI (ligada al usuario de Windows que la guardó):
// otro usuario u otra computadora no pueden leerla aunque copien data/config.json. Sin dependencias: se llama a
// PowerShell, que viene con Windows. El secreto viaja por variable de entorno del proceso hijo, nunca por la línea
// de comandos. En otros sistemas la clave queda como estaba (texto plano) y se avisa en pantalla.
import { execFileSync } from 'node:child_process';

export const PREFIJO = 'dpapi:';
export const disponible = () => process.platform === 'win32';
const cache = new Map(); // protegido -> texto, para no llamar a PowerShell en cada lectura

function powershell(script, entorno) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, ...entorno }, encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

const CIFRAR = "Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Convert]::FromBase64String($env:AGENTS_SECRETO), $null, 'CurrentUser'))";
const DESCIFRAR = "Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($env:AGENTS_SECRETO), $null, 'CurrentUser'))";
// Todo cruza en base64: así ni la consola ni su página de códigos alteran el secreto.
const aBase64 = (t) => Buffer.from(t, 'utf8').toString('base64');
const deBase64 = (t) => Buffer.from(t, 'base64').toString('utf8');

export const estaProtegida = (valor) => typeof valor === 'string' && valor.startsWith(PREFIJO);

// Devuelve la clave en claro. Si no se puede descifrar (otro usuario u otro equipo), devuelve '' y habrá que escribirla de nuevo.
export function revelar(valor) {
  if (!estaProtegida(valor)) return valor || '';
  if (cache.has(valor)) return cache.get(valor);
  let texto = '';
  try { texto = deBase64(powershell(DESCIFRAR, { AGENTS_SECRETO: valor.slice(PREFIJO.length) })); } catch { texto = ''; }
  if (texto) cache.set(valor, texto); // un fallo no se recuerda: puede ser pasajero
  return texto;
}

// Cifra la clave. Si no hay DPAPI o algo falla, devuelve el texto tal cual: nunca se pierde una clave por protegerla.
export function proteger(texto) {
  if (!texto || estaProtegida(texto) || !disponible()) return texto || '';
  try {
    const protegido = PREFIJO + powershell(CIFRAR, { AGENTS_SECRETO: aBase64(texto) });
    cache.delete(protegido);
    if (revelar(protegido) !== texto) return texto; // se comprueba antes de confiar en el cifrado
    return protegido;
  } catch {
    return texto;
  }
}
