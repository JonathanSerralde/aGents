// Adaptador del proveedor de IA con clave propia del usuario.
// Ahorro: caché de prompt (sistema e historial), modelo económico para lo automático (modeloPara) y lotes al 50%.
import { modeloPara } from './configuracion.js';
import { bloquesDeSistema, sistemaPlano } from './prompts.js';
// Sin clave configurada no se llama a nadie: el diagnóstico funciona solo con reglas y las órdenes quedan pendientes.
// Lo que se envía al proveedor es el contexto del área y la conversación, nunca el formulario completo.

// Las respuestas llevan estructura (entendí, análisis, propuesta) más secciones ACCIONES/HECHOS/IDEAS/CONCEPTOS.
// Los modelos Claude 4.5+ "piensan" antes de responder y ese pensamiento se descuenta de max_tokens: con 1100, hasta
// 900 se iban en pensar y el texto visible llegaba cortado a media frase (stop_reason max_tokens). Se apaga el
// pensamiento (los prompts ya dan la estructura), sube el tope y, si aun así se corta, se pide UNA continuación.
const MAX_TOKENS = 2500;
const MAX_TOKENS_DOCUMENTO = 3000;
const MAX_CONTINUACIONES_TEXTO = 1;
const CONTINUAR = 'Tu respuesta anterior se cortó. Continúa exactamente donde te quedaste, sin repetir nada de lo ya escrito.';
// Claude 3.x no acepta el parámetro thinking; de Claude 3.7 en adelante sí.
const sinPensamiento = (modelo) => (/claude-3-(5|haiku|opus|sonnet)/.test(modelo) ? {} : { thinking: { type: 'disabled' } });

export function proveedorActivo(config) {
  if (typeof config.llamarIA === 'function') return 'prueba'; // inyección para pruebas automáticas
  if (config.proveedor === 'anthropic' && config.anthropicKey) return 'anthropic';
  if (config.proveedor === 'openai' && config.openaiKey && config.openaiModelo) return 'openai';
  return null;
}

// Un mensaje puede traer una imagen: { rol, texto, imagen: { tipo, base64 } }. Se envía como bloque de visión.
function contenidoAnthropic(m) {
  if (!m.imagen) return m.texto;
  return [
    { type: 'image', source: { type: 'base64', media_type: m.imagen.tipo, data: m.imagen.base64 } },
    { type: 'text', text: m.texto },
  ];
}

function contenidoOpenAI(m) {
  if (!m.imagen) return m.texto;
  return [
    { type: 'image_url', image_url: { url: `data:${m.imagen.tipo};base64,${m.imagen.base64}` } },
    { type: 'text', text: m.texto },
  ];
}

// El prompt del sistema va en dos bloques con caché: el estable (rol, reglas, skill, ficha, diagnóstico) es idéntico
// entre órdenes y se lee de caché a una fracción del precio; el dinámico (memoria, situación, agenda) cambia y, si
// no cambia en 5 minutos (consultas de la misma orden), también se lee de caché. Antes iba todo en un bloque y
// cualquier cambio en la situación invalidaba la caché del prompt completo.
function sistemaConCache(sistema) {
  const { estable, dinamico } = bloquesDeSistema(sistema);
  const bloques = [{ type: 'text', text: estable, cache_control: { type: 'ephemeral' } }];
  if (dinamico) bloques.push({ type: 'text', text: dinamico, cache_control: { type: 'ephemeral' } });
  return bloques;
}

// Tokens de entrada reales de una respuesta de Anthropic: directos + creación de caché + lectura de caché.
function usoAnthropic(config, modelo, data) {
  const u = data.usage || {};
  const cacheLeido = u.cache_read_input_tokens || 0;
  const cacheCreado = u.cache_creation_input_tokens || 0;
  registrarUso(config, { proveedor: 'anthropic', modelo, entrada: (u.input_tokens || 0) + cacheCreado + cacheLeido, salida: u.output_tokens, cacheLeido, busquedas: u.server_tool_use?.web_search_requests });
}

// Historial con punto de caché en el penúltimo mensaje: lo ya hablado se lee de la caché en la siguiente orden
// y solo el mensaje nuevo se cobra completo (caché incremental).
function mensajesAnthropic(mensajes) {
  const lista = mensajes.map((m) => ({ role: m.rol === 'agente' ? 'assistant' : 'user', content: contenidoAnthropic(m) }));
  if (lista.length >= 2) {
    const previo = lista[lista.length - 2];
    const bloques = typeof previo.content === 'string' ? [{ type: 'text', text: previo.content }] : previo.content;
    previo.content = bloques.map((b, i) => (i === bloques.length - 1 ? { ...b, cache_control: { type: 'ephemeral' } } : b));
  }
  return lista;
}

// Cuerpo de una petición a Messages (lo usan las llamadas directas y los lotes).
export function cuerpoAnthropic(config, sistema, mensajes, nivel = 'principal') {
  const model = modeloPara(config, nivel);
  return {
    model,
    max_tokens: mensajes.some((m) => m.imagen) ? MAX_TOKENS_DOCUMENTO : MAX_TOKENS,
    ...sinPensamiento(model),
    system: sistemaConCache(sistema),
    messages: mensajesAnthropic(mensajes),
  };
}

const CABECERAS = (config) => ({ 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' });

async function llamarAnthropic(config, sistema, mensajes, nivel) {
  const cuerpo = cuerpoAnthropic(config, sistema, mensajes, nivel);
  let messages = cuerpo.messages;
  let texto = '';
  let cortada = false;
  for (let vuelta = 0; vuelta <= MAX_CONTINUACIONES_TEXTO; vuelta++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: CABECERAS(config), body: JSON.stringify({ ...cuerpo, messages }) });
    if (!res.ok) throw new Error(`Anthropic respondió ${res.status}`);
    const data = await res.json();
    usoAnthropic(config, cuerpo.model, data);
    const parte = textoDeBloques(data.content);
    texto += (texto && parte && !texto.endsWith('\n') && !parte.startsWith('\n') ? '\n' : '') + parte;
    cortada = data.stop_reason === 'max_tokens';
    if (!cortada || !parte) break;
    // Se cortó por el tope: se le enseña lo que lleva y sigue (el sistema y el historial ya están en caché).
    messages = [...cuerpo.messages, { role: 'assistant', content: texto.trimEnd() }, { role: 'user', content: CONTINUAR }];
  }
  return texto ? (cortada ? `${texto}${AVISO_CORTE}` : texto) : null;
}
// Si ni con la continuación alcanzó, el historial lo dice: así ningún agente cita después una respuesta a medias como completa.
const AVISO_CORTE = '\n\n(La respuesta se cortó por el tope de tokens; no la cites como completa.)';

// ---- Lotes (Message Batches): trabajo que no urge (piloto automático) al 50% del precio ----
// items: [{ id, sistema, mensajes, nivel }]. Devuelve el id del lote. Los resultados se recogen después con resultadosLote.
const lotesPrueba = new Map(); // proveedor "prueba": resultados inmediatos para las pruebas automáticas

export async function enviarLote(config, items) {
  const proveedor = proveedorActivo(config);
  if (!proveedor) throw new Error('Sin proveedor de IA configurado');
  if (proveedor === 'prueba') {
    const id = `lote-prueba-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const resultados = [];
    for (const it of items) {
      try {
        const r = await config.llamarIA({ sistema: sistemaPlano(it.sistema), mensajes: it.mensajes, nivel: it.nivel, lote: true });
        const texto = r && typeof r === 'object' ? r.texto : r;
        registrarUso(config, { proveedor: 'prueba', modelo: 'prueba-lote', entrada: Math.ceil(it.sistema.length / 8), salida: Math.ceil(String(texto || '').length / 8), agente: it.id });
        resultados.push({ id: it.id, ok: true, texto });
      } catch (err) {
        resultados.push({ id: it.id, ok: false, error: err.message });
      }
    }
    lotesPrueba.set(id, resultados);
    return id;
  }
  if (proveedor !== 'anthropic') throw new Error('Los lotes solo están disponibles con Anthropic');
  const requests = items.map((it) => ({ custom_id: it.id, params: cuerpoAnthropic(config, it.sistema, it.mensajes, it.nivel) }));
  const res = await fetch('https://api.anthropic.com/v1/messages/batches', { method: 'POST', headers: CABECERAS(config), body: JSON.stringify({ requests }) });
  if (!res.ok) throw new Error(`Anthropic respondió ${res.status} al crear el lote`);
  const data = await res.json();
  return data.id;
}

// Devuelve null si el lote sigue en proceso, o [{ id, ok, texto | error }] cuando terminó.
export async function resultadosLote(config, loteId, agentePorId = () => '') {
  if (loteId.startsWith('lote-prueba-')) {
    const r = lotesPrueba.get(loteId) || [];
    lotesPrueba.delete(loteId);
    return r;
  }
  const estado = await fetch(`https://api.anthropic.com/v1/messages/batches/${loteId}`, { headers: CABECERAS(config) });
  if (!estado.ok) throw new Error(`Anthropic respondió ${estado.status} al consultar el lote`);
  const info = await estado.json();
  if (info.processing_status !== 'ended' || !info.results_url) return null;
  const res = await fetch(info.results_url, { headers: CABECERAS(config) });
  if (!res.ok) throw new Error(`Anthropic respondió ${res.status} al leer el lote`);
  const lineas = (await res.text()).split('\n').filter(Boolean);
  const salida = [];
  for (const linea of lineas) {
    let r;
    try { r = JSON.parse(linea); } catch { continue; }
    const id = r.custom_id;
    if (r.result?.type === 'succeeded') {
      const msg = r.result.message;
      const u = msg.usage || {};
      const cacheLeido = u.cache_read_input_tokens || 0;
      registrarUso(config, { proveedor: 'anthropic', modelo: `${msg.model || ''} (lote)`, entrada: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + cacheLeido, salida: u.output_tokens, cacheLeido, agente: agentePorId(id) });
      const texto = textoDeBloques(msg.content);
      // En un lote no hay segunda vuelta: si se cortó, que el agente lo sepa en vez de quedarse a media frase.
      salida.push({ id, ok: true, texto: texto ? (msg.stop_reason === 'max_tokens' ? `${texto}${AVISO_CORTE}` : texto) : null });
    } else {
      salida.push({ id, ok: false, error: r.result?.error?.message || r.result?.type || 'error en el lote' });
    }
  }
  return salida;
}

// Anota tokens consumidos si el servidor pasó un registrador en la configuración.
function registrarUso(config, uso) {
  try { config.registrarUso?.(uso); } catch { /* el monitor nunca debe interrumpir una respuesta */ }
}

async function llamarOpenAI(config, sistema, mensajes, nivel) {
  const modelo = modeloPara(config, nivel);
  const base = [
    { role: 'system', content: sistemaPlano(sistema) },
    ...mensajes.map((m) => ({ role: m.rol === 'agente' ? 'assistant' : 'user', content: contenidoOpenAI(m) })),
  ];
  let messages = base;
  let texto = '';
  let cortada = false;
  for (let vuelta = 0; vuelta <= MAX_CONTINUACIONES_TEXTO; vuelta++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.openaiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        // max_completion_tokens cubre también el razonamiento de los modelos o-series y GPT-5 (max_tokens ya no se acepta ahí).
        max_completion_tokens: mensajes.some((m) => m.imagen) ? MAX_TOKENS_DOCUMENTO : MAX_TOKENS,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI respondió ${res.status}`);
    const data = await res.json();
    registrarUso(config, { proveedor: 'openai', modelo, entrada: data.usage?.prompt_tokens, salida: data.usage?.completion_tokens, cacheLeido: data.usage?.prompt_tokens_details?.cached_tokens });
    const eleccion = data.choices?.[0];
    const parte = eleccion?.message?.content || '';
    texto += (texto && parte && !texto.endsWith('\n') && !parte.startsWith('\n') ? '\n' : '') + parte;
    cortada = eleccion?.finish_reason === 'length';
    if (!cortada || !parte) break;
    messages = [...base, { role: 'assistant', content: texto.trimEnd() }, { role: 'user', content: CONTINUAR }];
  }
  return texto ? (cortada ? `${texto}${AVISO_CORTE}` : texto) : null;
}

// Conversación con el proveedor activo. mensajes: [{ rol: 'usuario' | 'agente', texto }]. Lanza si falla.
// nivel: 'principal' (lo que pide la persona) o 'automatico' (piloto, rutinas, consultas entre agentes) → modelo económico.
export async function conversar(config, sistema, mensajes, { nivel = 'principal' } = {}) {
  const proveedor = proveedorActivo(config);
  if (!proveedor) throw new Error('Sin proveedor de IA configurado');
  if (proveedor === 'prueba') {
    const r = await config.llamarIA({ sistema: sistemaPlano(sistema), mensajes, nivel, modelo: modeloPara({ proveedor: 'anthropic', anthropicModelo: 'principal-prueba', modoAhorro: config.modoAhorro }, nivel) });
    // Las pruebas pueden devolver { texto, uso } para ejercitar el monitor de consumo.
    if (r && typeof r === 'object') {
      registrarUso(config, { proveedor: 'prueba', modelo: 'prueba', entrada: r.uso?.entrada, salida: r.uso?.salida });
      return r.texto;
    }
    registrarUso(config, { proveedor: 'prueba', modelo: 'prueba', entrada: Math.ceil(sistema.length / 4), salida: Math.ceil(String(r || '').length / 4) });
    return r;
  }
  if (proveedor === 'anthropic') return llamarAnthropic(config, sistema, mensajes, nivel);
  return llamarOpenAI(config, sistema, mensajes, nivel);
}

// ---- Conversación con búsqueda web (investigación de mercado) ----
// Usa la búsqueda web del propio proveedor con la clave del usuario: no hay servicios ni cuentas adicionales.
// Cada búsqueda se cobra aparte en la cuenta del proveedor; por eso se limita el número por llamada.
const MAX_TOKENS_INVESTIGACION = 4096;
// Cada búsqueda devuelve resultados que viajan como tokens de entrada en todas las vueltas siguientes: 15 búsquedas
// con 4 vueltas costaron cientos de miles de tokens en una prueba real. Tope más bajo y menos continuaciones.
const MAX_BUSQUEDAS = 8;
const MAX_CONTINUACIONES = 1;

function textoDeBloques(contenido) {
  return (contenido || []).filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n');
}

// Qué buscó el modelo y qué fuentes encontró, para enseñárselo al usuario: [{ consulta, fuentes: [{ titulo, url }] }].
function busquedasDeBloques(contenido) {
  const lista = [];
  const porId = new Map();
  for (const b of contenido || []) {
    if (b.type === 'server_tool_use' && b.name === 'web_search') {
      const item = { consulta: String(b.input?.query || '').slice(0, 200), fuentes: [] };
      lista.push(item);
      porId.set(b.id, item);
    } else if (b.type === 'web_search_tool_result') {
      const item = porId.get(b.tool_use_id);
      if (!item || !Array.isArray(b.content)) continue;
      item.fuentes = b.content.filter((r) => r.type === 'web_search_result').slice(0, 5).map((r) => ({ titulo: String(r.title || '').slice(0, 120), url: String(r.url || '').slice(0, 300) }));
    }
  }
  return lista;
}

// Modelo para tareas con búsqueda web: el económico salvo que el usuario elija otro (configuracion.modeloPara).
const modeloBusqueda = (config) => modeloPara(config, 'busqueda');

async function buscarAnthropic(config, sistema, mensajes, maxBusquedas) {
  let historial = mensajes.map((m) => ({ role: m.rol === 'agente' ? 'assistant' : 'user', content: contenidoAnthropic(m) }));
  let texto = '';
  const busquedas = [];
  const modelo = modeloBusqueda(config);
  for (let vuelta = 0; vuelta <= MAX_CONTINUACIONES; vuelta++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelo,
        max_tokens: MAX_TOKENS_INVESTIGACION,
        ...sinPensamiento(modelo),
        system: sistemaConCache(sistema),
        messages: historial,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxBusquedas }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic respondió ${res.status}`);
    const data = await res.json();
    usoAnthropic(config, modelo, data);
    texto += textoDeBloques(data.content);
    busquedas.push(...busquedasDeBloques(data.content));
    // Si el proveedor pausó un turno largo de búsquedas, se continúa una vez con el mismo contexto (ya en caché).
    if (data.stop_reason !== 'pause_turn') break;
    historial = [...historial, { role: 'assistant', content: data.content }];
  }
  return { texto: texto || null, busquedas };
}

async function buscarOpenAI(config, sistema, mensajes) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.openaiKey}` },
    body: JSON.stringify({
      model: modeloPara(config, 'busqueda'),
      instructions: sistemaPlano(sistema),
      input: mensajes.map((m) => ({ role: m.rol === 'agente' ? 'assistant' : 'user', content: m.texto })),
      tools: [{ type: 'web_search' }],
      max_output_tokens: MAX_TOKENS_INVESTIGACION,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI respondió ${res.status}`);
  const data = await res.json();
  const salida = data.output || [];
  registrarUso(config, { proveedor: 'openai', modelo: config.openaiModelo, entrada: data.usage?.input_tokens, salida: data.usage?.output_tokens, busquedas: salida.filter((o) => o.type === 'web_search_call').length });
  const textos = salida.filter((o) => o.type === 'message').flatMap((o) => (o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text));
  const busquedas = salida.filter((o) => o.type === 'web_search_call').map((o) => ({ consulta: String(o.action?.query || '').slice(0, 200), fuentes: [] }));
  return { texto: textos.join('\n') || null, busquedas };
}

// Igual que conversar, pero el modelo puede buscar en internet. Devuelve { texto, busquedas } para que el usuario vea
// qué se buscó y qué fuentes salieron. Lanza si falla o no hay proveedor.
export async function conversarConBusqueda(config, sistema, mensajes, { maxBusquedas = MAX_BUSQUEDAS } = {}) {
  const proveedor = proveedorActivo(config);
  if (!proveedor) throw new Error('Sin proveedor de IA configurado');
  if (proveedor === 'prueba') {
    const r = await config.llamarIA({ sistema: sistemaPlano(sistema), mensajes, busqueda: true });
    const texto = r && typeof r === 'object' ? r.texto : r;
    const busquedas = (r && typeof r === 'object' && Array.isArray(r.busquedas)) ? r.busquedas : [];
    registrarUso(config, { proveedor: 'prueba', modelo: 'prueba', entrada: Math.ceil(sistema.length / 4), salida: Math.ceil(String(texto || '').length / 4), busquedas: r?.uso?.busquedas ?? busquedas.length });
    return { texto, busquedas };
  }
  if (proveedor === 'anthropic') return buscarAnthropic(config, sistema, mensajes, maxBusquedas);
  return buscarOpenAI(config, sistema, mensajes);
}

function promptResumen(resultado) {
  const lineas = Object.entries(resultado.distritos)
    .filter(([, d]) => d.color !== 'sin_datos')
    .map(([, d]) => `- ${d.nombre} (${d.color}): ${d.hallazgos.join(' ') || 'sin hallazgos'}`);
  return [
    'Con base en los hallazgos siguientes, escribe un plan breve de tres pasos priorizados.',
    'No inventes cifras. Si falta información, dilo.',
    '',
    ...lineas,
  ].join('\n');
}

// Resumen del diagnóstico. Devuelve { proveedor, texto } o { proveedor, error }, o null sin proveedor. Nunca lanza.
export async function resumirConIA(config, resultado) {
  const proveedor = proveedorActivo(config);
  if (!proveedor) return null;
  try {
    const sistema = 'Eres un consultor de pymes mexicanas. Responde en español de México, breve y concreto.';
    const texto = await conversar(config, sistema, [{ rol: 'usuario', texto: promptResumen(resultado) }]);
    return { proveedor, texto };
  } catch (err) {
    return { proveedor, error: err.message };
  }
}
