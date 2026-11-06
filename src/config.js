// Carga la configuración desde .env (si existe) y variables de entorno. Sin dependencias.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function leerEnv(ruta) {
  if (!existsSync(ruta)) return {};
  const valores = {};
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const i = limpia.indexOf('=');
    if (i === -1) continue;
    valores[limpia.slice(0, i).trim()] = limpia.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return valores;
}

const archivo = leerEnv(join(RAIZ, '.env'));
const env = { ...archivo, ...process.env };

export const config = {
  raiz: RAIZ,
  host: '127.0.0.1', // nunca escuchar fuera de la máquina local
  puerto: Number(env.PORT) || 4791,
  dirDatos: join(RAIZ, 'data', 'diagnosticos'),
  dirMarca: join(RAIZ, 'data', 'marca'),
  archivoBorrador: join(RAIZ, 'data', 'borrador.json'),
  archivoPid: join(RAIZ, 'data', 'servidor.pid'),
  archivoEquipo: join(RAIZ, 'data', 'equipo.json'),
  dirConversaciones: join(RAIZ, 'data', 'conversaciones'),
  archivoConfig: join(RAIZ, 'data', 'config.json'), // lo que el usuario guarda desde la pantalla Configuración
  archivoAgentes: join(RAIZ, 'data', 'agentes.json'), // agentes creados por el usuario
  archivoEmpresa: join(RAIZ, 'data', 'empresa.json'), // ficha de la empresa que ven todos los agentes
  archivoFuentes: join(RAIZ, 'data', 'fuentes.json'), // carpetas de notas (bóvedas de Obsidian) que consultan los agentes
  dirDocumentos: join(RAIZ, 'data', 'documentos'), // documentos subidos para que los agentes los analicen
  archivoUso: join(RAIZ, 'data', 'uso.json'), // tokens consumidos por mes
  archivoAjustes: join(RAIZ, 'data', 'ajustes.json'), // ajustes por negocio de cada agente
  dirInvestigaciones: join(RAIZ, 'data', 'investigaciones'), // investigaciones semanales de mercado y competencia
  dirSitio: join(RAIZ, 'data', 'sitio'), // análisis del sitio web propio
  archivoProgramacion: join(RAIZ, 'data', 'programacion.json'), // cuándo corren las tareas semanales
  archivoMemoria: join(RAIZ, 'data', 'memoria.json'), // memoria compartida: acciones abiertas, conclusiones y notas entre agentes
  archivoCalendario: join(RAIZ, 'data', 'calendario.json'), // agenda importada desde un .ics del usuario
  archivoRutinas: join(RAIZ, 'data', 'rutinas.json'), // órdenes repetidas detectadas y rutinas automáticas
  archivoActividad: join(RAIZ, 'data', 'actividad.json'), // registro de lo que hacen los agentes (búsquedas, consultas, encargos)
  archivoPiloto: join(RAIZ, 'data', 'piloto.json'), // piloto automático: revisión periódica por agente
  archivoLotes: join(RAIZ, 'data', 'lotes.json'), // lotes del piloto enviados al proveedor y aún sin resultado
  abrirNavegador: env.ABRIR_NAVEGADOR === '1', // lo usa el lanzador de doble clic
  proveedor: (env.PROVEEDOR_IA || 'ninguno').toLowerCase(), // anthropic | openai | ninguno
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  anthropicModelo: env.MODELO_ANTHROPIC || 'claude-haiku-5-5',
  openaiKey: env.OPENAI_API_KEY || '',
  openaiModelo: env.MODELO_OPENAI || '',
};
