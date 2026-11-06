// Análisis del sitio web del propio negocio. Se descarga la página principal desde esta máquina y se revisa con
// reglas (sin IA): seguridad (HTTPS, encabezados), presencia móvil, contacto, aviso de privacidad, medición y peso.
// Con IA, el Orquestador reparte los hallazgos a Tecnología, Ciberseguridad, Marketing, Ventas y quien corresponda.
import { crearRegistros } from './registros.js';

const TIEMPO_MAXIMO_MS = 12000;
const BYTES_MAXIMOS = 1500 * 1024;
const AGENTE_HTTP = 'OficinaMultiagente/0.1 (revision del sitio propio)';

export function normalizarUrl(texto) {
  let t = String(texto || '').trim().split(/\s+/)[0] || '';
  if (!t) throw new Error('Escribe la dirección del sitio (por ejemplo, https://miempresa.mx)');
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  let url;
  try {
    url = new URL(t);
  } catch {
    throw new Error('La dirección del sitio no es válida');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) throw new Error('La dirección del sitio no es válida');
  if (esDireccionInterna(url.hostname)) throw new Error('Solo se analizan sitios públicos en internet, no direcciones internas de la red');
  url.hash = '';
  return url.toString();
}

// Direcciones privadas o locales: el análisis es para el sitio público del negocio, no para equipos de la red.
function esDireccionInterna(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd');
}

async function leerConTope(res) {
  const partes = [];
  let total = 0;
  const lector = res.body?.getReader?.();
  if (!lector) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { html: buf.subarray(0, BYTES_MAXIMOS).toString('utf8'), bytes: buf.length, truncado: buf.length > BYTES_MAXIMOS };
  }
  while (total < BYTES_MAXIMOS) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(Buffer.from(value));
    total += value.length;
  }
  const truncado = total >= BYTES_MAXIMOS;
  if (truncado) await lector.cancel().catch(() => {});
  return { html: Buffer.concat(partes).subarray(0, BYTES_MAXIMOS).toString('utf8'), bytes: total, truncado };
}

async function pedir(url, fetchImpl) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  const inicio = Date.now();
  try {
    const res = await fetchImpl(url, { redirect: 'follow', signal: control.signal, headers: { 'user-agent': AGENTE_HTTP, accept: 'text/html,*/*;q=0.5' } });
    const cuerpo = await leerConTope(res);
    const encabezados = {};
    for (const clave of ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'server', 'x-powered-by', 'content-type']) {
      const v = res.headers.get(clave);
      if (v) encabezados[clave] = v.slice(0, 200);
    }
    return { urlFinal: res.url || url, status: res.status, encabezados, ...cuerpo, ms: Date.now() - inicio };
  } finally {
    clearTimeout(temporizador);
  }
}

// Descarga la página principal y, si es https, comprueba también que http:// redirija a https.
export async function descargarSitio(urlTexto, { fetchImpl = fetch } = {}) {
  const url = normalizarUrl(urlTexto);
  const pagina = await pedir(url, fetchImpl);
  let redirigeHttp = null;
  if (pagina.urlFinal.startsWith('https://')) {
    try {
      const http = await pedir(url.replace(/^https:/, 'http:'), fetchImpl);
      redirigeHttp = http.urlFinal.startsWith('https://');
    } catch {
      redirigeHttp = null; // el puerto 80 puede estar cerrado: no es un error del sitio
    }
  }
  return { url, ...pagina, redirigeHttp };
}

const existe = (html, re) => re.test(html);
const atributo = (etiqueta, nombre) => etiqueta.match(new RegExp(`${nombre}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '';

// Reglas sobre la página descargada. Cada hallazgo lleva el área a la que le toca y una acción concreta.
export function evaluarSitio(d) {
  const html = String(d.html || '');
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] || html.slice(0, 20000);
  const h = {};
  const push = (id, categoria, color, titulo, detalle, accion, area) => { h[id] = { id, categoria, color, titulo, detalle, accion, area }; };
  const https = d.urlFinal.startsWith('https://');
  const enc = d.encabezados || {};

  // Seguridad
  push('https', 'seguridad', https ? 'verde' : 'rojo', 'Conexión segura (HTTPS)',
    https ? 'El sitio se sirve con certificado.' : 'El sitio se sirve sin cifrar: el navegador lo marca como "No seguro" y los datos de los formularios viajan en claro.',
    https ? '' : 'Activar HTTPS (la mayoría de los hospedajes lo incluyen gratis con Let\'s Encrypt) y redirigir todo el tráfico a https.', 'ciberseguridad');
  if (https) {
    push('redirige', 'seguridad', d.redirigeHttp === null ? 'sin_datos' : d.redirigeHttp ? 'verde' : 'amarillo', 'Redirección de http a https',
      d.redirigeHttp === null ? 'No se pudo comprobar.' : d.redirigeHttp ? 'Quien escribe la dirección sin https llega a la versión segura.' : 'La versión http sigue abierta sin redirigir.',
      d.redirigeHttp === false ? 'Configurar la redirección permanente (301) de http a https en el hospedaje.' : '', 'ciberseguridad');
  }
  const faltantes = ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options'].filter((k) => !enc[k] && !(k === 'x-frame-options' && /frame-ancestors/i.test(enc['content-security-policy'] || '')));
  push('encabezados', 'seguridad', faltantes.length === 0 ? 'verde' : faltantes.length >= 3 ? 'rojo' : 'amarillo', 'Encabezados de seguridad',
    faltantes.length ? `Faltan: ${faltantes.join(', ')}. Sin ellos el sitio puede incrustarse en páginas falsas o quedar expuesto a inyección de scripts.` : 'Los encabezados básicos están presentes.',
    faltantes.length ? 'Pedir al proveedor de hospedaje o a quien administra el sitio que agregue los encabezados faltantes.' : '', 'ciberseguridad');
  const expone = [enc.server, enc['x-powered-by']].filter((v) => v && /\d/.test(v));
  push('versiones', 'seguridad', expone.length ? 'amarillo' : 'verde', 'Versiones del servidor expuestas',
    expone.length ? `El servidor publica su versión (${expone.join('; ')}), lo que facilita buscar vulnerabilidades conocidas.` : 'No se publican versiones del servidor.',
    expone.length ? 'Ocultar las cabeceras Server y X-Powered-By en la configuración del hospedaje.' : '', 'ciberseguridad');
  const generador = atributo(head.match(/<meta[^>]+name=["']generator["'][^>]*>/i)?.[0] || '', 'content');
  if (generador) {
    push('cms', 'seguridad', /\d/.test(generador) ? 'amarillo' : 'verde', 'Plataforma del sitio', `El sitio declara "${generador.slice(0, 60)}".`,
      /\d/.test(generador) ? 'Mantener actualizada la plataforma y sus complementos; quitar la etiqueta "generator" para no anunciar la versión.' : '', 'ciberseguridad');
  }
  if (/\/wp-login\.php|\/wp-admin\b/i.test(html)) {
    push('admin', 'seguridad', 'amarillo', 'Acceso de administración visible', 'La página enlaza al panel de administración (wp-admin o wp-login).',
      'Quitar el enlace público, activar verificación en dos pasos y limitar intentos de acceso.', 'ciberseguridad');
  }
  const mixto = https && /(src|href)\s*=\s*["']http:\/\//i.test(html);
  push('mixto', 'seguridad', mixto ? 'rojo' : 'verde', 'Contenido mixto', mixto ? 'La página segura carga recursos por http: el navegador los bloquea o marca la página como insegura.' : 'Todos los recursos detectados se cargan de forma segura.',
    mixto ? 'Cambiar las direcciones http:// de imágenes, estilos y scripts a https://.' : '', 'tecnologia');

  // Presencia móvil y contenido
  const viewport = existe(head, /<meta[^>]+name=["']viewport["']/i);
  push('movil', 'movil', viewport ? 'verde' : 'rojo', 'Adaptación a celular', viewport ? 'La página declara diseño adaptable.' : 'La página no declara diseño adaptable: en celular se ve diminuta. La mayoría de los clientes de pyme en México navega desde el teléfono.',
    viewport ? '' : 'Pedir una versión adaptable (responsive) del sitio o migrar a una plantilla moderna.', 'tecnologia');
  const titulo = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  push('titulo', 'contenido', titulo.length >= 10 && titulo.length <= 70 ? 'verde' : 'amarillo', 'Título de la página',
    titulo ? `"${titulo.slice(0, 80)}" (${titulo.length} caracteres).` : 'La página no tiene título: en Google aparece la dirección en vez del nombre.',
    titulo.length >= 10 && titulo.length <= 70 ? '' : 'Escribir un título de 10 a 70 caracteres con el nombre del negocio, lo que vende y la ciudad.', 'marketing');
  const descripcion = atributo(head.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0] || '', 'content');
  push('descripcion', 'contenido', descripcion.length >= 50 ? 'verde' : 'amarillo', 'Descripción para buscadores',
    descripcion ? `${descripcion.length} caracteres.` : 'Sin meta descripción: Google elige cualquier fragmento de la página.',
    descripcion.length >= 50 ? '' : 'Agregar una descripción de 50 a 160 caracteres con la oferta y una razón para entrar.', 'marketing');
  push('h1', 'contenido', /<h1[\s>]/i.test(html) ? 'verde' : 'amarillo', 'Encabezado principal', /<h1[\s>]/i.test(html) ? 'Hay un encabezado principal.' : 'No hay un encabezado principal (h1) que diga en una frase qué ofrece el negocio.',
    /<h1[\s>]/i.test(html) ? '' : 'Poner arriba un encabezado con la promesa principal: qué, para quién y dónde.', 'marketing');
  push('idioma', 'contenido', /<html[^>]+lang=/i.test(html) ? 'verde' : 'amarillo', 'Idioma declarado', /<html[^>]+lang=/i.test(html) ? 'La página declara su idioma.' : 'La página no declara idioma (lang="es-MX").', /<html[^>]+lang=/i.test(html) ? '' : 'Agregar lang="es-MX" a la etiqueta html.', 'tecnologia');
  const og = existe(head, /property=["']og:(title|image)["']/i);
  push('og', 'contenido', og ? 'verde' : 'amarillo', 'Vista previa al compartir', og ? 'Al compartir el enlace en WhatsApp o redes aparece título e imagen.' : 'Sin etiquetas Open Graph: al compartir el enlace en WhatsApp no sale imagen ni título.',
    og ? '' : 'Agregar og:title, og:description y og:image (1200×630).', 'marketing');
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const sinAlt = imgs.filter((i) => !/\balt\s*=/i.test(i)).length;
  if (imgs.length) {
    push('alt', 'contenido', sinAlt / imgs.length > 0.5 ? 'amarillo' : 'verde', 'Texto alternativo en imágenes', `${sinAlt} de ${imgs.length} imágenes sin texto alternativo.`,
      sinAlt / imgs.length > 0.5 ? 'Describir las imágenes (alt): ayuda a Google y a personas con lector de pantalla.' : '', 'marketing');
  }

  // Conversión y confianza
  const whatsapp = /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\/|whatsapp\.com\/send/i.test(html);
  const telefono = /href=["']tel:/i.test(html);
  push('contacto', 'conversion', whatsapp ? 'verde' : telefono ? 'amarillo' : 'rojo', 'Botón de contacto directo',
    whatsapp ? 'Hay enlace a WhatsApp.' : telefono ? 'Hay teléfono con enlace, pero no WhatsApp.' : 'No hay enlace a WhatsApp ni teléfono con un toque: el cliente tiene que copiar el número.',
    whatsapp ? '' : 'Poner un botón de WhatsApp visible en toda la página (wa.me/52 + número) con un mensaje inicial.', 'ventas');
  const formularios = (html.match(/<form\b[^>]*>/gi) || []);
  const formInseguro = formularios.some((f) => /action\s*=\s*["']http:\/\//i.test(f));
  if (formularios.length) {
    push('formularios', 'seguridad', formInseguro || !https ? 'rojo' : 'verde', 'Formularios', formInseguro || !https ? 'Los formularios envían datos sin cifrar.' : `${formularios.length} formulario(s) con envío seguro.`,
      formInseguro || !https ? 'Enviar los formularios solo por https.' : '', 'ciberseguridad');
  }
  const privacidad = /aviso\s+de\s+privacidad|pol[ií]tica\s+de\s+privacidad|privacidad/i.test(html);
  push('privacidad', 'confianza', privacidad ? 'verde' : formularios.length ? 'rojo' : 'amarillo', 'Aviso de privacidad',
    privacidad ? 'La página menciona el aviso de privacidad.' : formularios.length ? 'Se piden datos en formularios sin aviso de privacidad: la LFPDPPP lo exige y el INAI sanciona su ausencia.' : 'No se encontró aviso de privacidad.',
    privacidad ? '' : 'Publicar el aviso de privacidad (simplificado en el formulario, integral en una página) conforme a la LFPDPPP.', 'fiscal');
  const redes = ['facebook.com', 'instagram.com', 'tiktok.com', 'linkedin.com', 'youtube.com', 'x.com', 'twitter.com'].filter((r) => html.toLowerCase().includes(r));
  push('redes', 'conversion', redes.length ? 'verde' : 'amarillo', 'Enlaces a redes sociales', redes.length ? `Enlaza a: ${redes.join(', ')}.` : 'No enlaza a ninguna red social.',
    redes.length ? '' : 'Enlazar las redes donde el negocio sí publica (no abrir cuentas que no se atenderán).', 'marketing');
  const medicion = /googletagmanager\.com|gtag\(|google-analytics\.com|fbq\(|connect\.facebook\.net|analytics\.tiktok\.com|clarity\.ms|hotjar/i.test(html);
  push('medicion', 'conversion', medicion ? 'verde' : 'amarillo', 'Medición de visitas', medicion ? 'Hay herramienta de medición instalada.' : 'Sin medición: no se sabe cuánta gente entra ni de dónde viene, y la pauta pagada no se puede optimizar.',
    medicion ? '' : 'Instalar Google Analytics 4 (gratuito) y, si hay pauta, el píxel de Meta o TikTok; informarlo en el aviso de privacidad.', 'trafico');

  // Rendimiento
  const bytes = d.bytes || 0;
  push('peso', 'rendimiento', bytes > 3 * 1024 * 1024 ? 'rojo' : bytes > BYTES_MAXIMOS ? 'amarillo' : 'verde', 'Peso de la página',
    `${(bytes / 1024).toFixed(0)} KB de HTML${d.truncado ? ' (o más; se dejó de descargar)' : ''}.`, bytes > BYTES_MAXIMOS ? 'Comprimir imágenes y quitar scripts que no se usan.' : '', 'tecnologia');
  push('tiempo', 'rendimiento', d.ms > 4000 ? 'rojo' : d.ms > 2000 ? 'amarillo' : 'verde', 'Tiempo de respuesta', `${d.ms} ms en responder desde esta computadora.`,
    d.ms > 2000 ? 'Revisar el hospedaje y la caché; un sitio lento pierde clientes en celular.' : '', 'tecnologia');
  if (d.status >= 400) push('estado', 'seguridad', 'rojo', 'Respuesta del servidor', `El sitio respondió con código ${d.status}.`, 'Revisar que la página principal esté publicada y responda 200.', 'tecnologia');

  const hallazgos = Object.values(h);
  const peso = { verde: 1, amarillo: 0.5, rojo: 0 };
  const evaluados = hallazgos.filter((x) => x.color !== 'sin_datos');
  const puntaje = evaluados.length ? Math.round((evaluados.reduce((s, x) => s + peso[x.color], 0) / evaluados.length) * 100) : 0;
  const categorias = {};
  for (const x of hallazgos) {
    const orden = { rojo: 3, amarillo: 2, verde: 1, sin_datos: 0 };
    if (!categorias[x.categoria] || orden[x.color] > orden[categorias[x.categoria]]) categorias[x.categoria] = x.color;
  }
  const areas = [...new Set(hallazgos.filter((x) => x.color === 'rojo').map((x) => x.area).concat(hallazgos.filter((x) => x.color === 'amarillo').map((x) => x.area)))];
  return { url: d.url, urlFinal: d.urlFinal, status: d.status, ms: d.ms, bytes, titulo, hallazgos, categorias, puntaje, areas };
}

export const NOMBRES_CATEGORIAS = { seguridad: 'Seguridad', movil: 'Celular', contenido: 'Contenido', conversion: 'Conversión', confianza: 'Confianza', rendimiento: 'Velocidad' };
const fecha = (iso) => new Date(iso || Date.now()).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

export function informeSitioParaOrquestador(a) {
  const pendientes = a.hallazgos.filter((x) => x.color === 'rojo' || x.color === 'amarillo');
  return [
    `Informe del análisis del sitio ${a.urlFinal} (${fecha(a.momento)}): calificación ${a.puntaje}/100. Hallazgos por atender (área sugerida entre corchetes):`,
    ...pendientes.map((x) => `- [${x.area}] ${x.titulo} (${x.color}): ${x.detalle} Acción: ${x.accion}`),
    pendientes.length ? '' : 'Sin hallazgos pendientes.',
  ].filter(Boolean).join('\n').slice(0, 6000);
}

export function resumenSitioParaPrompt(a) {
  if (!a) return '';
  const rojos = a.hallazgos.filter((x) => x.color === 'rojo').map((x) => x.titulo);
  const amarillos = a.hallazgos.filter((x) => x.color === 'amarillo').map((x) => x.titulo);
  return [`Último análisis del sitio web (${fecha(a.momento)}, ${a.urlFinal}): ${a.puntaje}/100.`, rojos.length ? `En rojo: ${rojos.join('; ')}.` : '', amarillos.length ? `Por revisar: ${amarillos.slice(0, 6).join('; ')}.` : ''].filter(Boolean).join(' ').slice(0, 700);
}

export function contenidoSitio(a, marca) {
  const b = [];
  const push = (tipo, texto) => b.push({ tipo, texto });
  const etiqueta = { verde: 'Bien', amarillo: 'Revisar', rojo: 'Atención', sin_datos: 'Sin datos' };
  push('titulo', `Análisis del sitio web — ${marca?.nombre || 'Tu negocio'}`);
  push('parrafo', `${a.urlFinal} revisado el ${fecha(a.momento)}. Calificación: ${a.puntaje} de 100. ${a.titulo ? `Título actual: "${a.titulo}".` : ''}`);
  push('subtitulo', 'Resumen por categoría');
  for (const [cat, color] of Object.entries(a.categorias)) push('vineta', `${NOMBRES_CATEGORIAS[cat] || cat}: ${etiqueta[color]}`);
  for (const color of ['rojo', 'amarillo', 'verde', 'sin_datos']) {
    const lista = a.hallazgos.filter((x) => x.color === color);
    if (!lista.length) continue;
    push('subtitulo', { rojo: 'Atender primero', amarillo: 'Por revisar', verde: 'Lo que está bien', sin_datos: 'Sin datos' }[color]);
    for (const x of lista) push('vineta', `${x.titulo}: ${x.detalle}${x.accion ? ` Acción: ${x.accion}` : ''}`);
  }
  if (a.encargos?.length) {
    push('subtitulo', 'Trabajo repartido por el Orquestador');
    for (const e of a.encargos) push('vineta', `${e.nombreDestino || e.destinoTexto}: ${e.texto}${e.respuesta ? ` → ${e.respuesta.slice(0, 400)}` : e.error ? ` (sin respuesta: ${e.error})` : ' (pendiente para la persona responsable)'}`);
  }
  push('subtitulo', 'Sobre este reporte');
  push('nota', 'Revisión automática de la página principal desde el equipo del usuario, con reglas generales. No sustituye una auditoría de seguridad ni una prueba de penetración; si el sitio maneja pagos o datos sensibles, conviene una revisión profesional.');
  return b;
}

export function crearAnalisisSitio(dir) {
  const registros = crearRegistros(dir, (r) => ({
    id: r.id, momento: r.momento, url: r.urlFinal || r.url, puntaje: r.puntaje, categorias: r.categorias,
    rojos: (r.hallazgos || []).filter((x) => x.color === 'rojo').length, encargos: (r.encargos || []).length, pendienteReparto: Boolean(r.pendienteReparto),
  }));
  return registros;
}
