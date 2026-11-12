// Interfaz de aGents: ocho vistas (ciudad, diagnóstico, reportes, red de agentes, agentes, actividad, campañas y configuración).
// Todo el contenido del usuario se inserta con textContent, nunca como HTML.
import { renderOficina, seleccionarArea, vistaCamara, orbita, rayosX, acercar, marcarTrabajando } from './oficina.js';
import { pintarRed } from './red.js';
import { AREAS_ASSETS, NOMBRES_APOYO, AGENTES_APOYO, OPCIONALES } from './assets.js';
import { PLATAFORMAS, dibujarPieza, descargarCanvas } from './campanas.js';

const $ = (sel) => document.querySelector(sel);
const NS_SVG = 'http://www.w3.org/2000/svg';

const ORDEN_COLOR = { rojo: 0, amarillo: 1, verde: 2, sin_datos: 3 };
const ETIQUETA_COLOR = { rojo: 'Atención', amarillo: 'Revisar', verde: 'Bien', sin_datos: 'Sin datos' };
const PUNTAJE = { verde: 5, amarillo: 3, rojo: 1.5, sin_datos: null };
const ORDEN_AREAS = ['direccion', 'finanzas', 'ventas', 'marketing', 'compras', 'operaciones', 'rh', 'tecnologia', 'fiscal', 'riesgos', 'crecimiento'];
const TEXTO_META = { vertical: 'Meta: vertical', horizontal: 'Meta: horizontal', ambos: 'Meta: ambos ejes', no_se: 'Meta sin definir' };
const NOMBRE_PROVEEDOR = { anthropic: 'Anthropic', openai: 'OpenAI', prueba: 'el proveedor de prueba' };
const LIMITE_LOGO = 2 * 1024 * 1024;
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
const VISTAS = ['dashboard', 'asistente', 'red', 'agentes', 'campanas', 'actividad', 'reportes', 'configuracion'];
// Título y bajada de la barra superior en cada vista.
const TITULO_VISTA = {
  dashboard: ['Ciudad de agentes', 'El estado de tu negocio, área por área.'],
  asistente: ['Diagnóstico', 'Unos 15 minutos de preguntas; tus respuestas se guardan solas.'],
  red: ['Red de agentes', 'Quién reporta a quién y qué está haciendo cada agente.'],
  agentes: ['Agentes', 'Habla con tu equipo, reparte trabajo y revisa lo que acordaron.'],
  campanas: ['Campañas', 'La IA arma la campaña; tú eliges y descargas las piezas.'],
  actividad: ['Actividad', 'Todo lo que hacen los agentes, en vivo y guardado en tu equipo.'],
  reportes: ['Reportes', 'Tus diagnósticos guardados, para volver a verlos o descargarlos.'],
  configuracion: ['Configuración', 'Identidad, ficha de la empresa, IA y tus datos.'],
};

const DESCRIPCIONES = {
  contacto: 'Para dar seguimiento al diagnóstico.',
  identificacion: 'Lo básico para ubicar tu negocio.',
  direccion: 'Cómo se toman las decisiones y hacia dónde vas.',
  finanzas: 'Estimaciones aproximadas están bien. Si no sabes un dato, elige «No sé».',
  ventas: 'Cómo vendes y a quién.',
  marketing: 'Cómo consigues clientes nuevos.',
  compras: 'Tus proveedores y sus condiciones.',
  operaciones: 'Cómo produces o entregas tu servicio.',
  rh: 'Tu equipo y sus obligaciones.',
  tecnologia: 'Herramientas que usas y cómo respaldas tu información.',
  fiscal: 'Obligaciones, contratos y protección.',
  riesgos: 'Lo que podría frenar tu negocio.',
  crecimiento: 'Vertical es vender más a tu mercado actual; horizontal es abrir nuevos mercados, zonas o líneas.',
  profundo: 'Preguntas específicas de tu giro.',
  cualitativo: 'Tu visión, en tus palabras.',
};

const TEXTO_OPCION = {
  si: 'Sí', no: 'No', no_se: 'No sé',
  alto: 'Alto', medio: 'Medio', bajo: 'Bajo',
  comercio: 'Comercio (retail)', servicios: 'Servicios profesionales', manufactura: 'Manufactura', construccion: 'Construcción', alimentos: 'Restaurante, cafetería o venta de alimentos',
  agencia: 'Agencia de marketing, publicidad o diseño', educacion: 'Escuela, academia o capacitación', salud: 'Clínica, consultorio, laboratorio o farmacia', otro: 'Otro',
  transporte: 'Transporte y logística', software: 'Tecnología y software', turismo: 'Hospedaje, turismo y eventos', agro: 'Agropecuario y agroindustria',
  servicios_personales: 'Belleza, bienestar y gimnasios', automotriz: 'Talleres automotrices y refacciones', inmobiliario: 'Inmobiliaria y administración de inmuebles',
  en_tramite: 'En trámite',
  persona_fisica: 'Persona física', srl: 'S. de R.L.', sa: 'S.A.', otra: 'Otra',
  fisica: 'Física', linea: 'En línea', mixta: 'Mixta',
  propia: 'Propia', externa: 'Externa', no_lleva: 'No lleva',
  rapido: 'Rápido', normal: 'Normal', lento: 'Lento',
  ninguna: 'Ninguna', pocas: 'Pocas', frecuentes: 'Frecuentes',
  rentado: 'Rentado', propio: 'Propio', no_aplica: 'No aplica',
  al_corriente: 'Al corriente', adeudo: 'Con adeudo',
  parcial: 'Parcial',
  menos_1m: 'Menos de 1 mdp', '1m-5m': '1 a 5 mdp', '5m-20m': '5 a 20 mdp', mas_20m: 'Más de 20 mdp',
  mas_250: 'Más de 250',
  vertical: 'Vertical: vender más a mi mercado actual', horizontal: 'Horizontal: nuevos mercados, zonas o líneas', ambos: 'Ambos',
  lo_conozco: 'Lo conozco', aproximado: 'Aproximado',
  con_inversion: 'Sí, con inversión',
  credito: 'Crédito', ninguno: 'Ninguno',
};

const estado = {
  esquema: null,
  marca: { nombre: '', tieneLogo: false },
  equipo: { areas: {} },
  respuestas: {},
  paso: 0,
  enviando: false,
  inicio: new Date(),
  ultimo: null,
  proveedorIA: 'ninguno',
  vista: 'dashboard',
  personalizados: { agentes: {}, avatares: [] },
  fuentes: [],
  empresa: { ficha: {}, campos: [] },
  modo: modoInicialDiagnostico(), // 'expres' | 'completo'
};

// El primer diagnóstico empieza en exprés, salvo que la persona haya elegido antes el completo.
function modoInicialDiagnostico() {
  try { return localStorage.getItem('modo-diagnostico') === 'completo' ? 'completo' : 'expres'; } catch { return 'expres'; }
}

function textoOpcion(valor) {
  return TEXTO_OPCION[valor] || String(valor).replace(/_/g, ' ');
}

// Iconos de trazo (viewBox 24). El contenido es fijo del proyecto, nunca datos del usuario.
const ICONOS = {
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-3h4v3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  megaphone: '<path d="M4 10v4h3l8 4V6L7 10z"/><path d="M18 9a4 4 0 010 6"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5 6.5-5s5.7 1.5 6.5 5M16 4.5a3.5 3.5 0 010 7M18 15c2 .6 3.3 2.2 3.5 5"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  signal: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.5 5.5a9 9 0 000 13M18.5 5.5a9 9 0 010 13"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  rocket: '<path d="M12 3c3 2 4.5 6 4.5 10l-1.5 3h-6L7.5 13C7.5 9 9 5 12 3z"/><path d="M7.5 13l-3 3 2 1 2-2M16.5 13l3 3-2 1-2-2M10 19l2 2 2-2"/><circle cx="12" cy="10" r="1.5"/>',
};

const ICONO_SECCION = {
  identidad: 'user', contacto: 'user', identificacion: 'building', direccion: 'compass',
  finanzas: 'wallet', ventas: 'tag', marketing: 'megaphone', compras: 'box', operaciones: 'gear',
  rh: 'users', tecnologia: 'cpu', fiscal: 'shield', riesgos: 'alert', crecimiento: 'rocket', profundo: 'layers', cualitativo: 'message',
};

const ICONO_CAMPO = { texto: 'doc', numero: 'chart', seleccion: 'list', si_no: 'list', escala: 'chart' };

function icono(nombre) {
  const svg = document.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONOS[nombre] || ICONOS.layers;
  return svg;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS_SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function crearElemento(tag, attrs = {}, texto) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function filaConIcono(nombre, contenido) {
  const fila = crearElemento('div', { class: 'fila-campo' });
  const caja = crearElemento('div', { class: 'icono-campo' });
  caja.append(icono(nombre));
  fila.append(caja, contenido);
  return fila;
}

function mensaje(el, texto, tipo = '') {
  el.textContent = texto;
  el.className = `mensaje-estado ${tipo}`.trim();
  if (texto && (tipo === 'ok' || tipo === 'error')) aviso(texto, tipo);
}

// Convierte **texto** en negritas con nodos del DOM (nunca innerHTML): los agentes responden con ese formato.
function conNegritas(texto) {
  return String(texto ?? '').split(/**([^*
]+)**/g).map((parte, i) => (i % 2 ? crearElemento('strong', {}, parte) : document.createTextNode(parte)));
}

// Aviso flotante breve: confirma acciones sin obligar a buscar el mensaje en la página.
function aviso(texto, tipo = '') {
  const caja = $('#avisos');
  if (!caja) return;
  const el = crearElemento('div', { class: `aviso ${tipo}`.trim(), role: 'status' }, texto);
  caja.append(el);
  setTimeout(() => el.remove(), 4200);
}

function fechaLarga(iso) {
  return new Date(iso || Date.now()).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function hora(fecha) {
  return fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// ---------- Nombres de áreas, agentes y responsables ----------

function nombreArea(id) {
  return estado.ultimo?.resultado?.distritos[id]?.nombre
    || NOMBRES_APOYO[id]
    || estado.personalizados?.agentes?.[id]?.nombre
    || estado.esquema?.secciones.find((s) => s.id === id)?.titulo
    || id;
}

const esApoyo = (id) => AGENTES_APOYO.includes(id);
// Agentes de apoyo activos: los opcionales (p. ej. Alimentos y bebidas) solo si el servidor los activó.
const apoyoActivos = () => AGENTES_APOYO.filter((id) => !estado.apoyo?.inactivos?.[id]);
const esPropio = (id) => typeof id === 'string' && id.startsWith('x-') && Boolean(estado.personalizados.agentes[id]);
const idsPropios = () => Object.keys(estado.personalizados.agentes);

function iniciales(texto) {
  return String(texto || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

// Imagen del agente: la del área, la elegida para un agente propio o sus iniciales.
function avatarDe(id, clase = 'agente-foto') {
  const src = AREAS_ASSETS[id]?.avatar || estado.personalizados.agentes[id]?.avatar || '';
  if (src) return crearElemento('img', { class: clase, alt: '', src });
  return crearElemento('div', { class: 'avatar-iniciales', 'aria-hidden': 'true' }, iniciales(nombreArea(id)));
}

function nombreAgente(id) {
  if (estado.equipo.areas[id]?.agente) return estado.equipo.areas[id].agente;
  return esPropio(id) ? estado.personalizados.agentes[id].nombre : `Agente de ${nombreArea(id)}`;
}

function responsableDe(id) {
  return estado.equipo.areas[id]?.responsable || 'Tú';
}

// ---------- Vistas ----------

function marcarMenu(vista) {
  for (const boton of document.querySelectorAll('.menu-item')) {
    const activo = boton.dataset.vista === vista;
    boton.classList.toggle('activo', activo);
    if (activo) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  }
  const [titulo, bajada] = TITULO_VISTA[vista] || TITULO_VISTA.dashboard;
  $('#titulo-vista').textContent = titulo;
  $('#subtitulo-vista').textContent = bajada;
  document.body.dataset.vista = vista;
}

// Muestra una de las vistas. El dashboard enseña el último diagnóstico o, si no hay, cómo empezar.
function mostrarVista(vista, { scroll = true } = {}) {
  if (!VISTAS.includes(vista)) vista = 'dashboard';
  estado.vista = vista;
  for (const v of VISTAS) $(`#vista-${v}`).hidden = v !== vista;
  if (vista === 'dashboard') {
    const hay = estado.ultimo !== null;
    $('#dashboard-vacio').hidden = hay;
    $('#vista-resultados').hidden = !hay;
    renderPrimerosPasos();
    renderInforme();
    renderPermisos();
  }
  marcarMenu(vista);
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Pestañas de la vista Agentes ----------

const PESTANA_INICIAL = 'hablar';
const PESTANA_DE_SECCION = { 'equipo-editor-card': 'equipo', hablar: 'hablar', orquestador: 'hablar', 'chat-agentes': 'hablar', 'chat-orquestador': 'hablar', documentos: 'documentos', bitacora: 'bitacora', calendario: 'bitacora', piloto: 'piloto', rutinas: 'rutinas', laboral: 'laboral', investigacion: 'mercado', sitio: 'mercado', propios: 'propios', jerarquia: 'jerarquia', 'ajustes-card': 'ajustes' };

function pestanaActual() {
  try { return localStorage.getItem('pestana-agentes') || PESTANA_INICIAL; } catch { return PESTANA_INICIAL; }
}

// Muestra solo las tarjetas de una pestaña; la última elegida se recuerda en este navegador.
function mostrarPestana(nombre) {
  const valida = document.querySelector(`.pestana[data-pestana="${nombre}"]`) ? nombre : PESTANA_INICIAL;
  for (const seccion of document.querySelectorAll('#vista-agentes [data-pestana]')) {
    if (seccion.classList.contains('pestana')) {
      const activa = seccion.dataset.pestana === valida;
      seccion.classList.toggle('activa', activa);
      seccion.setAttribute('aria-selected', String(activa));
    } else {
      seccion.hidden = seccion.dataset.pestana !== valida;
    }
  }
  try { localStorage.setItem('pestana-agentes', valida); } catch { /* sin almacenamiento */ }
}

function irASeccionAgentes(id) {
  prepararAgentes();
  mostrarPestana(PESTANA_DE_SECCION[id] || PESTANA_INICIAL);
  mostrarVista('agentes', { scroll: false });
  setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
}

function manejarMenu(evento) {
  const vista = evento.currentTarget.dataset.vista;
  if (vista === 'asistente') renderPaso();
  if (vista === 'agentes') prepararAgentes();
  if (vista === 'reportes') cargarReportes();
  if (vista === 'configuracion') cargarConfiguracion();
  if (vista === 'campanas') prepararCampanas();
  if (vista === 'actividad') cargarActividad();
  if (vista === 'red') cargarRed();
  mostrarVista(vista);
}

// ---------- Actividad de los agentes (en vivo y guardada) ----------

const NOMBRE_TIPO_ACTIVIDAD = {
  orden: 'Orden', busqueda: 'Búsqueda en internet', consulta: 'Consulta de otro agente', encargo: 'Encargo del Orquestador', reparto: 'Reparto del Orquestador', investigacion: 'Investigación de mercado',
};
const trabajosEnCurso = new Map();

function nombreDeAgente(id) {
  return id === 'orquestador' ? 'Orquestador' : nombreArea(id);
}

// Texto legible de un evento del registro.
function describirEvento(e) {
  const d = e.datos || {};
  switch (e.tipo) {
    case 'trabajo_inicio': return `${nombreDeAgente(d.area)} empezó: ${NOMBRE_TIPO_ACTIVIDAD[d.tipo] || d.tipo}${d.detalle ? ` — ${d.detalle}` : ''}`;
    case 'trabajo_fin': return `${nombreDeAgente(d.area)} ${d.ok ? 'terminó' : 'falló'} ${NOMBRE_TIPO_ACTIVIDAD[d.tipo] || d.tipo} en ${(d.ms / 1000).toFixed(1)} s${d.busquedas ? ` · ${d.busquedas} búsquedas` : ''}${d.error ? ` · ${d.error}` : ''}`;
    case 'busquedas_web': return `${nombreDeAgente(d.area)} buscó en internet: ${(d.consultas || []).map((c) => `"${c}"`).join(', ')}`;
    case 'orden_enviada': return `${d.origen === 'rutina' ? 'Rutina' : 'Tú'} → ${nombreDeAgente(d.area)}: ${d.tipo === 'idea' ? 'idea' : d.tipo === 'hecho' ? 'dato de la empresa' : d.tipo === 'concepto' ? 'pregunta' : 'orden'}${d.pendiente ? ' (pendiente, sin IA)' : ''}`;
    case 'respuesta_agente': return `${nombreDeAgente(d.area)} respondió${d.destinos?.length ? ` tras coordinarse con ${d.destinos.map(nombreDeAgente).join(', ')}` : ''}${d.acciones ? ` · ${d.acciones} acciones a la bitácora` : ''}${d.hechos ? ` · ${d.hechos} hechos` : ''}${d.ideas ? ` · ${d.ideas} ideas` : ''}`;
    case 'respuesta_reglas': return `${nombreDeAgente(d.area)} respondió con reglas (estado de los agentes, sin tokens)`;
    case 'intercambio_agentes': return `${nombreDeAgente(d.area)} atendió una petición de otro agente${d.profundidad ? ' (segunda vuelta)' : ''}`;
    case 'nota_agente': return `${nombreDeAgente(d.origen)} dejó una nota a ${nombreDeAgente(d.destino)}`;
    case 'investigacion_terminada': return `Investigación de mercado: ${d.competidores} competidores, ${d.busquedas || 0} búsquedas, repartida a ${(d.encargados || []).map(nombreDeAgente).join(', ') || 'nadie'}${d.pendiente ? ' (pendiente, sin IA)' : ''}`;
    case 'sitio_analizado': return `Sitio ${d.url} analizado: ${d.puntaje}/100 · ${d.encargos} encargos`;
    case 'rutina_ejecutada': return `Rutina "${d.nombre}" enviada a ${nombreDeAgente(d.area)}${d.pendiente ? ' (pendiente)' : ''}`;
    case 'piloto_ejecutado': return `Piloto automático: ${nombreDeAgente(d.area)} hizo su revisión${d.destinos?.length ? ` y se coordinó con ${d.destinos.map(nombreDeAgente).join(', ')}` : ''} · ${d.resultado || ''}`;
    case 'piloto_configurado': return `Piloto de ${nombreDeAgente(d.area)}: ${d.activo ? 'encendido' : 'apagado'} (${d.frecuencia})`;
    case 'rutina_sugerida': return `Orden repetida ${d.veces} veces a ${nombreDeAgente(d.area)}: sugerencia de rutina`;
    case 'documento_analizado': return `Documento "${d.nombre}" analizado · ${d.encargos} encargos`;
    case 'diagnostico_creado': return `Diagnóstico generado · ${d.prioridad?.length || 0} prioridades`;
    case 'propuestas_ajustes': return `Optimización: ${d.agentes} ajustes y ${d.nuevos || 0} subagentes propuestos`;
    case 'calendario_importado': return `Agenda importada: ${d.eventos} eventos`;
    default: return e.tipo.replace(/_/g, ' ');
  }
}

function pintarTrabajando() {
  const pie = $('#trabajando');
  const lista = [...trabajosEnCurso.values()];
  // La ciudad y la red encienden el enlace de cada agente que trabaja ahora.
  marcarTrabajando(lista.map((x) => x.area));
  if (estado.vista === 'red') cargarRed();
  if (!lista.length) { pie.hidden = true; pie.textContent = ''; return; }
  const t = lista[lista.length - 1];
  pie.hidden = false;
  pie.textContent = `${lista.length > 1 ? `${lista.length} agentes trabajando · ` : ''}${nombreDeAgente(t.area)}: ${NOMBRE_TIPO_ACTIVIDAD[t.tipo] || t.tipo}${t.detalle ? ` — ${t.detalle.slice(0, 70)}` : ''}…`;
  const caja = $('#act-trabajando');
  if (caja) caja.replaceChildren(...lista.map((x) => crearElemento('div', { class: 'act-ahora' }, `${nombreDeAgente(x.area)} · ${NOMBRE_TIPO_ACTIVIDAD[x.tipo] || x.tipo}${x.detalle ? ` — ${x.detalle}` : ''}`)));
}

function filaActividad(e) {
  const d = e.datos || {};
  const li = crearElemento('li', { class: `act-item ${e.tipo}${d.ok === false ? ' error' : ''}` });
  li.append(crearElemento('span', { class: 'act-hora' }, `${fechaCorta(e.momento)} ${horaCorta(e.momento)}`), crearElemento('span', { class: 'act-texto' }, describirEvento(e)));
  if (e.tipo === 'busquedas_web' || (e.tipo === 'trabajo_fin' && d.busquedas)) li.classList.add('busqueda');
  return li;
}

async function cargarActividad() {
  let r;
  try {
    r = await fetch(`/api/actividad${$('#act-filtro').value ? `?area=${encodeURIComponent($('#act-filtro').value)}` : ''}`).then((x) => x.json());
  } catch {
    return;
  }
  const sel = $('#act-filtro');
  if (sel.children.length === 1) for (const id of idsDeTodosLosAgentes()) sel.append(crearElemento('option', { value: id }, nombreDeAgente(id)));
  trabajosEnCurso.clear();
  for (const t of r.trabajando) trabajosEnCurso.set(t.id, t);
  pintarTrabajando();
  const visibles = r.eventos.filter((e) => !['permisos_cambiados'].includes(e.tipo));
  $('#act-lista').replaceChildren(...(visibles.length ? visibles.map(filaActividad) : [crearElemento('li', { class: 'act-item' }, 'Sin actividad registrada todavía. Da una orden a un agente o lanza una investigación.')]));
  cargarSituacion();
}

// Situación por agente: lo mismo que recibe el Orquestador en su contexto, para que el usuario vea que sí lo sabe.
const ESTADO_SITUACION = { trabajando: 'Trabajando ahora', bloqueado: 'Bloqueado', activo: 'Activo', inactivo: 'Sin actividad reciente', sin_actividad: 'Sin actividad' };
async function cargarSituacion() {
  let s;
  try {
    s = await fetch('/api/situacion').then((x) => x.json());
  } catch {
    return;
  }
  const r = s.resumen || {};
  $('#sit-resumen').textContent = `· ${r.trabajando || 0} trabajando · ${r.activo || 0} activos · ${r.bloqueado || 0} bloqueados · ${r.sin_actividad || 0} sin actividad`;
  const filas = (s.agentes || []).map((a) => {
    const fila = crearElemento('div', { class: `sit-fila ${a.estado}` });
    const cabeza = crearElemento('div', { class: 'sit-cabeza' });
    cabeza.append(avatarDe(a.id, 'agente-foto chica'), crearElemento('strong', {}, a.nombre), crearElemento('span', { class: `sit-estado ${a.estado}` }, ESTADO_SITUACION[a.estado] || a.estado));
    const cuerpo = crearElemento('div', { class: 'sit-cuerpo' });
    if (a.enCurso) cuerpo.append(crearElemento('span', { class: 'sit-ahora' }, `Ahora: ${NOMBRE_TIPO_ACTIVIDAD[a.enCurso.tipo] || a.enCurso.tipo}${a.enCurso.detalle ? ` — ${a.enCurso.detalle}` : ''}`));
    if (a.ultimo) cuerpo.append(crearElemento('small', {}, `Último trabajo: ${NOMBRE_TIPO_ACTIVIDAD[a.ultimo.tipo] || a.ultimo.tipo} · ${fechaCorta(a.ultimo.momento)} ${horaCorta(a.ultimo.momento)}${a.ultimo.ok ? '' : ` · falló: ${a.ultimo.error || 'error'}`}`));
    if (a.ultimaRespuesta?.resumen) cuerpo.append(crearElemento('span', {}, a.ultimaRespuesta.resumen));
    const datos = [];
    if (a.pendientes) datos.push(`${a.pendientes} orden(es) pendiente(s) sin IA`);
    if (a.acciones?.abiertas) datos.push(`${a.acciones.abiertas} acciones abiertas${a.acciones.vencidas ? ` (${a.acciones.vencidas} vencidas)` : ''}`);
    if (a.piloto?.activo) datos.push(`piloto encendido${a.piloto.ultimaEjecucion ? ` · revisó ${fechaCorta(a.piloto.ultimaEjecucion)}` : ''}`);
    if (a.notasSinLeer) datos.push(`${a.notasSinLeer} nota(s) sin leer`);
    if (datos.length) cuerpo.append(crearElemento('small', {}, datos.join(' · ')));
    if (!a.ultimo && !a.ultimaRespuesta && !datos.length) cuerpo.append(crearElemento('small', {}, 'Todavía no ha recibido órdenes ni revisiones. Dale una orden o enciende su piloto.'));
    fila.append(cabeza, cuerpo);
    return fila;
  });
  $('#sit-tabla').replaceChildren(...filas);
}

// ---------- Primeros pasos (dashboard) ----------

async function renderPrimerosPasos() {
  const lista = $('#pasos-lista');
  const tarjeta = $('#primeros-pasos');
  let ficha = {};
  let fuentes = [];
  let sitios = [];
  try {
    [ficha, fuentes, sitios] = await Promise.all([
      fetch('/api/empresa').then((r) => r.json()).then((j) => j.ficha || {}),
      fetch('/api/fuentes').then((r) => r.json()).then((j) => j.fuentes || []),
      fetch('/api/sitio').then((r) => r.json()).then((j) => j.analisis || []),
    ]);
  } catch { /* sin servidor: no se muestra la lista */ }
  const equipoLleno = Object.values(estado.equipo.areas || {}).some((a) => a.responsable || a.agente);
  const fichaLlena = Object.values(ficha).some(Boolean);
  const pasos = [
    { texto: 'Haz tu primer diagnóstico', hecho: estado.ultimo !== null, vista: 'asistente', boton: 'Empezar' },
    { texto: 'Completa la ficha de la empresa (datos fiscales, productos, clientes)', hecho: fichaLlena, vista: 'configuracion', boton: 'Ficha' },
    { texto: 'Pon nombre a tus agentes y asigna responsables', hecho: equipoLleno, vista: 'agentes', boton: 'Equipo' },
    { texto: 'Activa la IA con tu clave (opcional) para que los agentes respondan', hecho: estado.proveedorIA !== 'ninguno', vista: 'configuracion', boton: 'Configurar' },
    { texto: 'Conecta una bóveda de notas o sube un documento (opcional)', hecho: fuentes.length > 0, vista: 'configuracion', boton: 'Conectar' },
    { texto: 'Analiza tu sitio web (sin IA) para que los agentes sepan cómo está', hecho: sitios.length > 0, vista: 'agentes', boton: 'Analizar', ancla: 'sitio' },
  ];
  lista.replaceChildren();
  for (const p of pasos) {
    const li = crearElemento('li', { class: p.hecho ? 'hecho' : '' });
    li.append(crearElemento('span', { class: 'paso-check', 'aria-hidden': 'true' }, p.hecho ? '✓' : ''), crearElemento('span', { class: 'paso-texto' }, p.texto));
    if (!p.hecho) {
      const b = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, p.boton);
      b.addEventListener('click', () => {
        if (p.vista === 'asistente') renderPaso();
        if (p.vista === 'agentes') prepararAgentes();
        if (p.vista === 'configuracion') cargarConfiguracion();
        if (p.ancla) return irASeccionAgentes(p.ancla);
        mostrarVista(p.vista);
      });
      li.append(b);
    } else {
      li.append(crearElemento('span'));
    }
    lista.append(li);
  }
  tarjeta.hidden = pasos.every((p) => p.hecho);
}

// ---------- Informe del Orquestador (reglas, sin IA) ----------

async function renderInforme() {
  const tarjeta = $('#informe-card');
  const lista = $('#informe-lista');
  let r;
  try {
    r = (await fetch('/api/informe').then((x) => x.json())).resumen;
  } catch {
    return;
  }
  if (!r || (!estado.ultimo && !r.abiertas)) { tarjeta.hidden = true; return; }
  const fila = (titulo, texto, clase = '') => {
    const li = crearElemento('li', { class: clase });
    const t = crearElemento('div');
    t.append(crearElemento('strong', {}, titulo), crearElemento('span', {}, texto));
    li.append(crearElemento('span', { class: `punto-color ${clase === 'siguiente' ? '' : clase || 'verde'}` }), t);
    return li;
  };
  const filas = [];
  if (r.avance) filas.push(fila('Avance desde el diagnóstico anterior', r.avance, 'siguiente'));
  if (r.datosReales) filas.push(fila('Datos reales', r.datosReales));
  if (r.rojos.length) filas.push(fila('En atención', r.rojos.join(', '), 'rojo'));
  if (r.amarillos.length) filas.push(fila('Por revisar', r.amarillos.join(', '), 'amarillo'));
  if (r.cruzados) filas.push(fila('Contradicciones entre áreas', `${r.cruzados} detectadas por el motor; están en el plan como "Entre áreas".`, 'rojo'));
  if (r.vencidas) filas.push(fila('Acciones vencidas', `${r.vencidas} en la bitácora; revísalas en Agentes › Bitácora.`, 'rojo'));
  if (r.porVencer) filas.push(fila('Vencen esta semana', `${r.porVencer} acciones.`, 'amarillo'));
  filas.push(fila('Acciones abiertas', r.abiertas ? Object.entries(r.porArea).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([id, n]) => `${id === 'orquestador' ? 'Orquestador' : nombreArea(id)} ${n}`).join(' · ') : 'ninguna todavía'));
  if (r.sector.length) filas.push(fila('Sector', r.sector.join(', ')));
  filas.push(fila('Siguiente paso', r.siguientePaso, 'siguiente'));
  lista.replaceChildren(...filas);
  tarjeta.hidden = false;
}

// ---------- Campañas: piezas con los tamaños de cada plataforma ----------

const campana = { logo: null, logoIntentado: false };

function piezaActual() {
  const plataforma = PLATAFORMAS.find((p) => p.id === $('#camp-plataforma').value) || PLATAFORMAS[0];
  return plataforma.piezas.find((x) => x.id === $('#camp-pieza').value) || plataforma.piezas[0];
}

function disenoActual() {
  return {
    titular: $('#camp-titular').value.trim() || 'Tu titular aquí',
    subtitulo: $('#camp-subtitulo').value.trim(),
    cta: $('#camp-cta').value.trim(),
    marca: $('#camp-marca').value.trim() || estado.marca.nombre || '',
    estilo: $('#camp-estilo').value,
    colorFondo: $('#camp-fondo').value,
    colorFondo2: $('#camp-fondo2').value,
    colorTexto: $('#camp-texto').value,
    colorAcento: $('#camp-acento').value,
    logo: campana.logo,
  };
}

function nombreArchivoPieza(pieza) {
  const base = (estado.marca.nombre || 'campana').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'campana'}-${pieza.id}-${pieza.ancho}x${pieza.alto}.png`;
}

function renderPiezas() {
  const plataforma = PLATAFORMAS.find((p) => p.id === $('#camp-plataforma').value) || PLATAFORMAS[0];
  const selector = $('#camp-pieza');
  const actual = selector.value;
  selector.replaceChildren();
  for (const p of plataforma.piezas) selector.append(crearElemento('option', { value: p.id }, `${p.nombre} · ${p.ancho}×${p.alto}`));
  if (plataforma.piezas.some((p) => p.id === actual)) selector.value = actual;
  previsualizar();
}

function previsualizar() {
  const pieza = piezaActual();
  dibujarPieza($('#camp-canvas'), pieza, disenoActual());
  $('#camp-tamano').textContent = `${pieza.nombre}: ${pieza.ancho} × ${pieza.alto} px`;
}

async function cargarLogoCampana() {
  if (campana.logoIntentado) return;
  campana.logoIntentado = true;
  if (!estado.marca.tieneLogo) {
    $('#camp-logo-estado').textContent = 'Sin logotipo: se usará el nombre de marca. Puedes subir uno en Configuración.';
    return;
  }
  await new Promise((resolver) => {
    const img = new Image();
    img.onload = () => { campana.logo = img; resolver(); };
    img.onerror = () => resolver();
    img.src = `/api/marca/logo?v=${Date.now()}`;
  });
  $('#camp-logo-estado').textContent = campana.logo ? 'Se usa el logotipo de tu Configuración.' : 'No se pudo cargar el logotipo; se usará el nombre de marca.';
  previsualizar();
}

// ---------- Campaña construida por la IA ----------

const PIEZA_MUESTRA = PLATAFORMAS[0].piezas[0]; // cuadrada: la vista previa de cada propuesta
let campanaIA = null;

// Diseño de una propuesta: sus textos y colores, con la marca y el logotipo del negocio.
function disenoDePropuesta(p) {
  const c = p.colores || {};
  return {
    titular: p.titular, subtitulo: p.apoyo, cta: p.cta,
    marca: $('#camp-marca').value.trim() || estado.marca.nombre || '',
    estilo: c.fondo2 && c.fondo2 !== c.fondo ? 'degradado' : 'solido',
    colorFondo: c.fondo || $('#camp-fondo').value, colorFondo2: c.fondo2 || $('#camp-fondo2').value,
    colorTexto: c.texto || $('#camp-texto').value, colorAcento: c.acento || $('#camp-acento').value,
    logo: campana.logo,
  };
}

// Pasa la propuesta elegida al formulario de piezas: desde ahí se ajusta y se descarga en todos los tamaños.
function usarPropuesta(p, tarjeta) {
  const d = disenoDePropuesta(p);
  $('#camp-titular').value = p.titular;
  $('#camp-subtitulo').value = p.apoyo;
  $('#camp-cta').value = p.cta;
  $('#camp-estilo').value = d.estilo;
  $('#camp-fondo').value = d.colorFondo;
  $('#camp-fondo2').value = d.colorFondo2;
  $('#camp-texto').value = d.colorTexto;
  $('#camp-acento').value = d.colorAcento;
  for (const t of document.querySelectorAll('.ia-propuesta')) t.classList.toggle('elegida', t === tarjeta);
  previsualizar();
  aviso('Propuesta lista en "Piezas de la campaña". Ajústala o descarga todos los tamaños.', 'ok');
  $('#form-campana').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pintarCampanaIA() {
  const caja = $('#ia-propuestas');
  const meta = $('#ia-meta');
  if (!campanaIA) { caja.replaceChildren(); meta.hidden = true; return; }
  meta.hidden = false;
  meta.textContent = `${nombreArea(campanaIA.agente)} la construyó el ${fechaCorta(campanaIA.momento)} para: ${campanaIA.peticion.oferta}`;
  caja.replaceChildren(...campanaIA.propuestas.map((p, i) => {
    const tarjeta = crearElemento('article', { class: 'ia-propuesta' });
    const lienzo = crearElemento('canvas', { 'aria-label': `Vista previa de la propuesta ${i + 1}` });
    dibujarPieza(lienzo, PIEZA_MUESTRA, disenoDePropuesta(p));
    const datos = crearElemento('dl');
    const dato = (titulo, texto) => { if (texto) datos.append(crearElemento('dt', {}, titulo), crearElemento('dd', {}, texto)); };
    dato('Texto para publicar', [p.texto, p.hashtags].filter(Boolean).join(' '));
    dato('A quién dirigirla', p.publico);
    dato('Inversión sugerida', p.presupuesto);
    const acciones = crearElemento('div', { class: 'acciones-inline' });
    const usar = crearElemento('button', { class: 'boton compacto', type: 'button' }, 'Usar esta propuesta');
    usar.addEventListener('click', () => usarPropuesta(p, tarjeta));
    acciones.append(usar);
    if (p.texto) {
      const copiar = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Copiar texto');
      copiar.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText([p.texto, p.hashtags].filter(Boolean).join('\n\n')); aviso('Texto copiado.', 'ok'); } catch { aviso('No se pudo copiar; selecciónalo a mano.', 'error'); }
      });
      acciones.append(copiar);
    }
    tarjeta.append(lienzo, crearElemento('h4', {}, p.titular));
    if (p.angulo) tarjeta.append(crearElemento('p', { class: 'angulo' }, p.angulo));
    tarjeta.append(datos, acciones);
    return tarjeta;
  }));
}

async function cargarCampanaIA() {
  let r;
  try { r = await fetch('/api/campanas').then((x) => x.json()); } catch { return; }
  const llenar = (id, opciones) => { const s = $(id); if (!s.options.length) for (const [valor, texto] of Object.entries(opciones || {})) s.append(crearElemento('option', { value: valor }, texto)); };
  llenar('#ia-objetivo', r.objetivos);
  llenar('#ia-tono', r.tonos);
  campanaIA = r.campana || null;
  $('#ia-generar').disabled = Boolean(r.bloqueo);
  if (r.bloqueo) mensaje($('#ia-mensaje'), `${r.bloqueo}. Mientras tanto puedes llenar las piezas a mano, aquí abajo.`);
  else if (!$('#ia-mensaje').classList.contains('ok')) mensaje($('#ia-mensaje'), '');
  pintarCampanaIA();
}

async function generarCampanaIA(evento) {
  evento.preventDefault();
  const boton = $('#ia-generar');
  const oferta = $('#ia-oferta').value.trim();
  if (!oferta) return mensaje($('#ia-mensaje'), 'Escribe qué quieres anunciar.', 'error');
  boton.disabled = true;
  mensaje($('#ia-mensaje'), 'El agente está construyendo la campaña… puede tardar hasta un minuto.');
  try {
    const res = await fetch('/api/campanas/generar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oferta, objetivo: $('#ia-objetivo').value, tono: $('#ia-tono').value, publico: $('#ia-publico').value.trim() }) });
    const cuerpo = await res.json();
    if (!res.ok) return mensaje($('#ia-mensaje'), cuerpo.errores?.[0] || 'No se pudo construir la campaña.', 'error');
    campanaIA = cuerpo.campana;
    pintarCampanaIA();
    mensaje($('#ia-mensaje'), `Listo: ${campanaIA.propuestas.length} propuestas. Elige una.`, 'ok');
    refrescarEstadoIA();
  } catch {
    mensaje($('#ia-mensaje'), 'No hay conexión con el servidor local.', 'error');
  } finally {
    boton.disabled = false;
  }
}

function prepararCampanas() {
  const selector = $('#camp-plataforma');
  if (!selector.options.length) {
    for (const p of PLATAFORMAS) selector.append(crearElemento('option', { value: p.id }, p.nombre));
    renderPiezas();
  }
  if (!$('#camp-marca').value && estado.marca.nombre) $('#camp-marca').value = estado.marca.nombre;
  // Las propuestas se pintan cuando el logotipo ya cargó, para que salga en sus vistas previas.
  cargarLogoCampana().then(() => { previsualizar(); cargarCampanaIA(); });
  previsualizar();
}

async function descargarPiezaActual(evento) {
  evento.preventDefault();
  const pieza = piezaActual();
  const lienzo = document.createElement('canvas');
  dibujarPieza(lienzo, pieza, disenoActual());
  await descargarCanvas(lienzo, nombreArchivoPieza(pieza));
  mensaje($('#camp-mensaje'), `Descargada: ${pieza.nombre} (${pieza.ancho}×${pieza.alto}).`, 'ok');
}

async function descargarTodasLasPiezas() {
  const plataforma = PLATAFORMAS.find((p) => p.id === $('#camp-plataforma').value) || PLATAFORMAS[0];
  const diseno = disenoActual();
  mensaje($('#camp-mensaje'), `Generando ${plataforma.piezas.length} piezas…`);
  for (const pieza of plataforma.piezas) {
    const lienzo = document.createElement('canvas');
    dibujarPieza(lienzo, pieza, diseno);
    // Una pausa corta entre descargas evita que el navegador bloquee las siguientes.
    await descargarCanvas(lienzo, nombreArchivoPieza(pieza));
    await new Promise((r) => setTimeout(r, 350));
  }
  mensaje($('#camp-mensaje'), `Listo: ${plataforma.piezas.length} piezas de ${plataforma.nombre}.`, 'ok');
}

function irA(seccion) {
  mostrarVista('dashboard', { scroll: false });
  document.getElementById(seccion)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Asistente: pasos ----------

// Diagnóstico exprés: lo esencial de cada área en cuatro pasos, para tener un primer resultado en minutos
// en cualquier giro. Son las preguntas que más pesan en el semáforo y que un dueño contesta de memoria.
// El diagnóstico completo las incluye todas; al actualizarlo, lo ya contestado viene lleno.
const CAMPOS_EXPRES = new Set([
  'contacto_nombre', 'confianza', 'giro', 'empleados', 'ventas_anuales', 'antiguedad_anios',
  'meses_caja', 'margen_pct', 'clientes_recurrentes_pct', 'concentracion_top3_pct', 'mide_marketing',
  'proveedor_unico', 'quejas', 'imss_infonavit', 'manuales_puesto', 'respaldos',
  'plan_escrito', 'dependencia_dueno', 'obligaciones_fiscales', 'contratos_escritos', 'cliente_unico', 'meta_crecimiento',
]);
const PASOS_EXPRES = [
  { id: 'x-negocio', icono: 'building', titulo: 'Tu negocio', descripcion: 'Quién responde y de qué tamaño es el negocio.', secciones: ['contacto', 'identificacion'] },
  { id: 'x-dinero', icono: 'wallet', titulo: 'Dinero y clientes', descripcion: 'Con aproximados basta. Si no sabes un dato, déjalo vacío.', secciones: ['finanzas', 'ventas', 'marketing'] },
  { id: 'x-operacion', icono: 'gear', titulo: 'Operación y equipo', descripcion: 'Cómo se trabaja todos los días.', secciones: ['compras', 'operaciones', 'rh', 'tecnologia'] },
  { id: 'x-rumbo', icono: 'compass', titulo: 'Orden y rumbo', descripcion: 'Lo que protege al negocio y hacia dónde quiere crecer.', secciones: ['direccion', 'fiscal', 'riesgos', 'crecimiento'] },
];

function modoGuardado() {
  try { return localStorage.getItem('modo-diagnostico') === 'completo' ? 'completo' : 'expres'; } catch { return 'expres'; }
}

// Cambia entre exprés y completo sin perder lo ya contestado.
function cambiarModoDiagnostico(modo) {
  estado.modo = modo === 'completo' ? 'completo' : 'expres';
  try { localStorage.setItem('modo-diagnostico', estado.modo); } catch { /* sin almacenamiento */ }
  estado.paso = 0;
  renderPaso();
}

function pasos() {
  if (!estado.esquema) return [];
  if (estado.modo === 'expres') return PASOS_EXPRES.map((p) => ({ tipo: 'seccion', ...p }));
  const lista = [
    { tipo: 'identidad', id: 'identidad', titulo: 'Tu identidad', descripcion: 'Pon tu nombre y tu logotipo. Solo se guardan en tu equipo y son opcionales.' },
    { tipo: 'equipo', id: 'equipo', titulo: 'Tu equipo y tus agentes', descripcion: 'Quién responde por cada área y cómo se llama el agente que la acompaña. Los agentes apoyan a tu gente, no la sustituyen. Si eres solo tú, déjalo vacío.' },
  ];
  for (const s of estado.esquema.secciones) {
    if (s.id === 'profundo' && !estado.respuestas.giro) continue;
    lista.push({ tipo: 'seccion', id: s.id, titulo: s.titulo, descripcion: DESCRIPCIONES[s.id] || '' });
  }
  return lista;
}

function camposDelPaso(paso) {
  if (!estado.esquema || paso.tipo !== 'seccion') return [];
  if (paso.secciones) {
    // Paso exprés: junta varias secciones y deja solo las preguntas esenciales, en el orden de las secciones.
    return paso.secciones.flatMap((s) => estado.esquema.campos.filter((c) => c.seccion === s && CAMPOS_EXPRES.has(c.id)));
  }
  return estado.esquema.campos.filter((c) =>
    c.seccion === paso.id && (!c.giros || c.giros.includes(estado.respuestas.giro)));
}

function crearCampo(campo) {
  const wrap = crearElemento('div', { class: 'campo' });
  const id = `campo-${campo.id}`;
  wrap.append(crearElemento('label', { for: id }, campo.etiqueta + (campo.obligatorio ? ' *' : '')));

  let input;
  if (campo.tipo === 'texto') {
    input = crearElemento('input', { id, type: 'text', maxlength: '500', autocomplete: 'off' });
  } else if (campo.tipo === 'numero') {
    input = crearElemento('input', { id, type: 'number', inputmode: 'decimal', step: 'any' });
    if (campo.min !== undefined) input.min = campo.min;
    if (campo.max !== undefined) input.max = campo.max;
  } else {
    input = crearElemento('select', { id });
    input.append(crearElemento('option', { value: '' }, 'Selecciona…'));
    const opciones = campo.tipo === 'escala' ? ['1', '2', '3', '4', '5'] : campo.opciones || [];
    for (const op of opciones) {
      const texto = campo.tipo === 'escala' ? op : textoOpcion(op);
      input.append(crearElemento('option', { value: op }, texto));
    }
  }

  input.dataset.campo = campo.id;
  input.value = estado.respuestas[campo.id] ?? '';
  input.addEventListener('input', () => {
    estado.respuestas[campo.id] = input.value;
    programarGuardado();
  });
  input.addEventListener('change', () => {
    estado.respuestas[campo.id] = input.value;
    if (campo.id === 'giro') actualizarNavegacion();
    programarGuardado();
  });
  wrap.append(input);
  return filaConIcono(ICONO_CAMPO[campo.tipo] || 'doc', wrap);
}

// Campos de identidad (nombre y logotipo). Se usan en el asistente y en Configuración.
function renderIdentidad(contenedor) {
  contenedor.replaceChildren();
  const nombre = crearElemento('div', { class: 'campo' });
  const idNombre = `marca-input-${contenedor.id}`;
  nombre.append(crearElemento('label', { for: idNombre }, 'Nombre comercial'));
  const entrada = crearElemento('input', { id: idNombre, type: 'text', maxlength: '120', placeholder: 'Ej. Ferretería Ejemplo' });
  entrada.value = estado.marca.nombre || '';
  entrada.dataset.marca = 'nombre';
  nombre.append(entrada);

  const logo = crearElemento('div', { class: 'campo' });
  const idLogo = `logo-input-${contenedor.id}`;
  logo.append(crearElemento('span', { class: 'etiqueta-campo' }, 'Logotipo'));
  const zona = crearElemento('label', { class: 'zona-logo', for: idLogo });
  const vista = crearElemento('img', { class: 'logo-preview', alt: 'Vista previa del logotipo' });
  if (estado.marca.tieneLogo) vista.src = `/api/marca/logo?v=${Date.now()}`;
  else vista.hidden = true;
  zona.append(vista);
  zona.append(crearElemento('span', { class: 'zona-texto' }, estado.marca.tieneLogo ? 'Cambiar logotipo' : 'Elegir logotipo'));
  const archivo = crearElemento('input', { id: idLogo, type: 'file', accept: TIPOS_LOGO.join(',') });
  archivo.className = 'archivo';
  archivo.addEventListener('change', () => subirLogo(archivo.files[0], contenedor));
  logo.append(zona, archivo);
  logo.append(crearElemento('p', { class: 'ayuda' }, 'PNG, JPG o WebP, máximo 2 MB. Se guarda solo en tu equipo.'));

  contenedor.append(filaConIcono('user', nombre), filaConIcono('image', logo));
}

function renderPaso() {
  const lista = pasos();
  if (!lista.length) return;
  estado.paso = Math.min(estado.paso, lista.length - 1);
  const paso = lista[estado.paso];
  const contenedor = $('#paso');
  contenedor.replaceChildren();
  $('#errores').hidden = true;

  $('#barra').style.width = `${((estado.paso + 1) / lista.length) * 100}%`;
  $('#contador').textContent = `Paso ${estado.paso + 1} de ${lista.length}`;
  $('#titulo-paso').textContent = paso.titulo;
  $('#descripcion-paso').textContent = paso.descripcion;
  $('#atras').hidden = estado.paso === 0;
  $('#texto-siguiente').textContent = estado.paso === lista.length - 1 ? 'Generar diagnóstico' : 'Siguiente';
  $('#icono-paso').replaceChildren(icono(paso.icono || ICONO_SECCION[paso.id] || 'layers'));
  // El tipo de diagnóstico se elige en el primer paso.
  $('#modo-diagnostico').hidden = estado.paso !== 0;
  for (const b of document.querySelectorAll('[data-modo-diag]')) {
    const activo = b.dataset.modoDiag === estado.modo;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-pressed', String(activo));
  }
  $('#modo-ayuda').textContent = estado.modo === 'expres'
    ? 'Lo esencial de cada área en cuatro pasos. Después puedes completarlo: lo que contestes aquí ya vendrá lleno.'
    : 'Todas las preguntas, área por área, más las de tu giro. Da el diagnóstico más fino.';
  $('#aviso-precarga').hidden = !estado.precargado;
  if (estado.precargado) $('#aviso-precarga-texto').textContent = `Partes de tus respuestas del ${fechaLarga(estado.precargado)}. Revisa cada paso y cambia solo lo que cambió.`;

  if (paso.tipo === 'identidad') {
    const caja = crearElemento('div', { id: 'identidad-asistente' });
    contenedor.append(caja);
    renderIdentidad(caja);
  } else if (paso.tipo === 'equipo') {
    renderEquipoEditor(contenedor);
  } else {
    for (const campo of camposDelPaso(paso)) contenedor.append(crearCampo(campo));
  }
  renderLineaPasos();
}

// Si cambia el giro, pueden aparecer o desaparecer pasos. Ajusta el índice sin perder la posición.
function actualizarNavegacion() {
  const total = pasos().length;
  if (estado.paso >= total) estado.paso = total - 1;
  const contadorEl = $('#contador');
  if (contadorEl) contadorEl.textContent = `Paso ${estado.paso + 1} de ${total}`;
}

function validarPaso() {
  const errores = [];
  const paso = pasos()[estado.paso];
  if (paso.tipo === 'identidad' || paso.tipo === 'equipo') return errores;

  for (const campo of camposDelPaso(paso)) {
    const valor = (estado.respuestas[campo.id] ?? '').toString().trim();
    if (valor === '') {
      if (campo.obligatorio) errores.push(`Falta: ${campo.etiqueta}`);
      continue;
    }
    if (campo.tipo === 'numero') {
      const n = Number(valor);
      if (!Number.isFinite(n) || (campo.min !== undefined && n < campo.min) || (campo.max !== undefined && n > campo.max)) {
        errores.push(`${campo.etiqueta}: revisa el valor`);
      }
    }
  }
  return errores;
}

function mostrarErrores(lista) {
  const p = $('#errores');
  p.textContent = lista.join(' · ');
  p.hidden = lista.length === 0;
}

// ---------- Equipo de trabajo ----------

// Una fila del editor: icono, nombre, responsable y nombre del agente. sub = subagente (va indentado bajo su área).
function filaEquipo(contenedor, id, { sub = false } = {}) {
  const area = estado.equipo.areas[id] || (estado.equipo.areas[id] = { responsable: '', puesto: '', agente: '' });
  const fila = crearElemento('div', { class: `equipo-fila${sub ? ' sub' : ''}`, 'data-buscar': `${nombreArea(id)} ${area.responsable} ${area.agente}`.toLowerCase() });
  const caja = crearElemento('div', { class: 'icono-campo' });
  caja.append(icono(ICONO_SECCION[id] || 'layers'));
  const titulo = crearElemento('strong', { class: 'equipo-area' }, nombreArea(id));
  if (sub) titulo.append(crearElemento('small', {}, 'subagente'));
  const sufijo = contenedor.id || 'paso';

  const campoResp = crearElemento('div', { class: 'campo' });
  campoResp.append(crearElemento('label', { for: `resp-${id}-${sufijo}` }, 'Responsable'));
  const resp = crearElemento('input', { id: `resp-${id}-${sufijo}`, type: 'text', maxlength: '80', placeholder: 'Tú', autocomplete: 'off' });
  resp.value = area.responsable || '';
  resp.addEventListener('input', () => { area.responsable = resp.value; fila.dataset.buscar = `${nombreArea(id)} ${resp.value} ${area.agente}`.toLowerCase(); });
  campoResp.append(resp);

  const campoAgente = crearElemento('div', { class: 'campo' });
  campoAgente.append(crearElemento('label', { for: `agente-${id}-${sufijo}` }, 'Nombre del agente'));
  const agente = crearElemento('input', { id: `agente-${id}-${sufijo}`, type: 'text', maxlength: '80', placeholder: `Agente de ${nombreArea(id)}`, autocomplete: 'off' });
  agente.value = area.agente || '';
  agente.addEventListener('input', () => { area.agente = agente.value; fila.dataset.buscar = `${nombreArea(id)} ${area.responsable} ${agente.value}`.toLowerCase(); });
  campoAgente.append(agente);

  fila.append(caja, titulo, campoResp, campoAgente);
  return fila;
}

// Editor del equipo agrupado: cada área con sus subagentes plegados, luego el staff del Orquestador y tus agentes.
function renderEquipoEditor(contenedor) {
  contenedor.replaceChildren();
  const propios = idsPropios();
  const activos = new Set(apoyoActivos());
  const sub = estado.subagentes || {};
  const colocados = new Set();
  for (const id of ORDEN_AREAS) {
    contenedor.append(filaEquipo(contenedor, id));
    const hijos = (sub[id] || []).filter((h) => activos.has(h));
    if (!hijos.length) continue;
    const grupo = crearElemento('details', { class: 'equipo-grupo' });
    const nombres = hijos.filter((h) => estado.equipo.areas[h]?.agente || estado.equipo.areas[h]?.responsable).length;
    grupo.append(crearElemento('summary', {}, `${hijos.length} subagentes de ${nombreArea(id)}${nombres ? ` · ${nombres} con nombre` : ''}`));
    for (const h of hijos) { grupo.append(filaEquipo(contenedor, h, { sub: true })); colocados.add(h); }
    contenedor.append(grupo);
  }
  // Staff del Orquestador; si alguno tiene subagentes (Auditoría → Prevención de pérdidas), van plegados debajo.
  const staff = apoyoActivos().filter((id) => !colocados.has(id) && (sub[id]?.length || !Object.values(sub).some((l) => l.includes(id))));
  if (staff.length) {
    contenedor.append(crearElemento('p', { class: 'equipo-separador' }, 'Staff del Orquestador: ven todas las áreas y no son responsables de ninguna.'));
    for (const id of staff) {
      contenedor.append(filaEquipo(contenedor, id));
      colocados.add(id);
      const hijos = (sub[id] || []).filter((h) => activos.has(h) && !colocados.has(h));
      if (!hijos.length) continue;
      const grupo = crearElemento('details', { class: 'equipo-grupo' });
      grupo.append(crearElemento('summary', {}, `${hijos.length} subagente(s) de ${nombreArea(id)}`));
      for (const h of hijos) { grupo.append(filaEquipo(contenedor, h, { sub: true })); colocados.add(h); }
      contenedor.append(grupo);
    }
  }
  for (const id of apoyoActivos().filter((x) => !colocados.has(x))) contenedor.append(filaEquipo(contenedor, id)); // por si algo quedó fuera
  contenedor.append(controlOpcionales());
  if (propios.length) {
    contenedor.append(crearElemento('p', { class: 'equipo-separador' }, 'Mis agentes: creados por ti en la pestaña Mis agentes.'));
    for (const id of propios) contenedor.append(filaEquipo(contenedor, id));
  }
  filtrarEquipo();
}

// Filtro de texto del editor: oculta filas que no coinciden y abre los grupos donde sí hay coincidencias.
function filtrarEquipo() {
  const q = ($('#equipo-filtro')?.value || '').trim().toLowerCase();
  const editor = $('#equipo-editor');
  if (!editor) return;
  for (const fila of editor.querySelectorAll('.equipo-fila')) fila.hidden = Boolean(q) && !fila.dataset.buscar.includes(q);
  for (const grupo of editor.querySelectorAll('.equipo-grupo')) {
    const visibles = [...grupo.querySelectorAll('.equipo-fila')].some((f) => !f.hidden);
    grupo.hidden = Boolean(q) && !visibles;
    if (q && visibles) grupo.open = true;
  }
  for (const sep of editor.querySelectorAll('.equipo-separador, .equipo-opcionales')) sep.hidden = Boolean(q);
}

// Agentes opcionales: automático según giro y ficha, o forzado por el usuario.
function controlOpcionales() {
  const caja = crearElemento('div', { class: 'equipo-opcionales' });
  if (!estado.equipo.opcionales) estado.equipo.opcionales = {};
  const detalle = estado.apoyo?.opcionales || {};
  const sectores = estado.apoyo?.sectores || [];
  caja.append(crearElemento('p', { class: 'subtitulo' }, sectores.length
    ? `Sector detectado: ${sectores.map((s) => estado.apoyo?.nombresSectores?.[s] || detalle[Object.keys(detalle).find((id) => detalle[id].sector === s)]?.sectorNombre || s).join(', ')}. Los subagentes de otros sectores quedan apagados salvo que los actives aquí.`
    : 'Sin sector detectado todavía: haz el diagnóstico o llena la ficha, o activa aquí los subagentes que necesites.'));
  for (const id of OPCIONALES) {
    const fila = crearElemento('label', { class: 'opcional' });
    fila.append(crearElemento('span', {}, `${NOMBRES_APOYO[id]} · ${detalle[id]?.sectorNombre || 'opcional'}`));
    const sel = crearElemento('select', { id: `opcional-${id}`, 'aria-label': `Activar ${NOMBRES_APOYO[id]}` });
    for (const [valor, texto] of [['auto', 'Automático: según giro y ficha'], ['si', 'Activar siempre'], ['no', 'Desactivar']]) sel.append(crearElemento('option', { value: valor }, texto));
    sel.value = estado.equipo.opcionales[id] || 'auto';
    sel.addEventListener('change', () => { estado.equipo.opcionales[id] = sel.value; });
    const motivo = estado.apoyo?.inactivos?.[id];
    fila.append(sel, crearElemento('small', { class: 'subtitulo' }, motivo ? `Hoy ${motivo}.` : 'Hoy está activo.'));
    caja.append(fila);
  }
  return caja;
}

// Subagentes que el Orquestador propone crear ("Optimizar agentes"): el usuario acepta o rechaza cada uno.
async function cargarPropuestasAgentes() {
  const caja = $('#propuestas-agentes');
  let propuestas = [];
  try {
    propuestas = (await fetch('/api/agentes-personalizados').then((r) => r.json())).propuestas || [];
  } catch { /* sin servidor */ }
  const tarjetas = propuestas.map((p, i) => {
    const t = crearElemento('div', { class: 'propuesta' });
    t.append(crearElemento('strong', {}, `El Orquestador propone crear: ${p.nombre}`));
    if (p.motivo) t.append(crearElemento('span', { class: 'subtitulo' }, `Motivo: ${p.motivo}`));
    t.append(crearElemento('span', {}, `${p.rol || 'Sin rol'}. ${p.especialidad || ''} Ve: ${p.areas.map((a) => (a === 'todas' ? 'todas las áreas' : nombreArea(a))).join(', ')}.`));
    const acciones = crearElemento('div', { class: 'acciones-inline' });
    const aceptar = crearElemento('button', { class: 'boton compacto', type: 'button' }, 'Crear agente');
    const rechazar = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Rechazar');
    aceptar.addEventListener('click', async () => {
      const res = await fetch(`/api/agentes-personalizados/propuestas/${i}/aceptar`, { method: 'POST' });
      const j = await res.json();
      aviso(res.ok ? `Agente ${j.nombre} creado.` : (j.errores?.[0] || 'No se pudo crear.'), res.ok ? 'ok' : 'error');
      await cargarPersonalizados();
      prepararAgentes();
    });
    rechazar.addEventListener('click', async () => { await fetch(`/api/agentes-personalizados/propuestas/${i}/rechazar`, { method: 'POST' }); cargarPropuestasAgentes(); });
    acciones.append(aceptar, rechazar);
    t.append(acciones);
    return t;
  });
  caja.replaceChildren(...tarjetas);
}

async function guardarEquipo() {
  const res = await fetch('/api/equipo', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(estado.equipo),
  });
  if (!res.ok) throw new Error('No se pudo guardar el equipo');
  estado.equipo = await res.json();
  await refrescarEstadoIA(); // los opcionales pueden haber cambiado
  if (estado.ultimo) {
    renderEquipo(estado.ultimo.resultado.distritos);
    renderPlan(estado.ultimo.resultado.plan);
  }
}

// Vista Agentes: editor del equipo, selector de área y chats.
async function prepararAgentes() {
  mostrarPestana(pestanaActual());
  await cargarJerarquia(); // trae subagentes y tipos antes de armar el editor agrupado
  renderEquipoEditor($('#equipo-editor'));
  const selector = $('#chat-selector');
  const actual = selector.value;
  selector.replaceChildren();
  const grupoAreas = crearElemento('optgroup', { label: 'Áreas del negocio' });
  for (const id of ORDEN_AREAS) grupoAreas.append(crearElemento('option', { value: id }, nombreArea(id)));
  const grupoApoyo = crearElemento('optgroup', { label: 'Agentes de apoyo' });
  for (const id of apoyoActivos()) grupoApoyo.append(crearElemento('option', { value: id }, nombreArea(id)));
  selector.append(grupoAreas, grupoApoyo);
  const propios = idsPropios();
  if (propios.length) {
    const grupoPropios = crearElemento('optgroup', { label: 'Mis agentes' });
    for (const id of propios) grupoPropios.append(crearElemento('option', { value: id }, nombreArea(id)));
    selector.append(grupoPropios);
  }
  const validos = [...ORDEN_AREAS, ...apoyoActivos(), ...propios];
  selector.value = validos.includes(actual) ? actual : ORDEN_AREAS[0];
  chatAgentes?.cargar(selector.value);
  chatOrquestador?.cargar('orquestador');
  renderPropios();
  cargarPropuestasAgentes();
  cargarDocumentos();
  cargarAjustes();
  cargarBitacora();
  cargarCalendario();
  cargarLaboral();
  cargarRutinas();
  cargarPiloto();
  cargarInvestigacion();
  cargarSitio();
}

// ---------- Bitácora compartida (memoria común de los agentes) ----------

const ETIQUETA_TIPO = { hecho: 'hecho de la empresa', idea: 'idea por validar', concepto: 'concepto', orden: 'orden' };
const ETIQUETA_IDEA = { por_validar: 'Por validar', aprobada: 'Aprobada', descartada: 'Descartada' };

// Hechos, ideas y conceptos: lo que la empresa ES, lo que alguien PROPUSO y lo que se EXPLICÓ.
function pintarMemoriaTipos(datos) {
  const nombreDe = (id) => (id === 'orquestador' ? 'Orquestador' : nombreArea(id));
  const hechos = $('#bitacora-hechos');
  const ideas = $('#bitacora-ideas');
  const conceptos = $('#bitacora-conceptos');
  $('#hechos-contador').textContent = String(datos.hechos.length);
  $('#ideas-contador').textContent = String(datos.ideas.filter((i) => i.estado === 'por_validar').length);
  $('#conceptos-contador').textContent = String(datos.conceptos.length);
  const selectorArea = $('#hecho-area');
  if (!selectorArea.children.length) for (const id of idsDeTodosLosAgentes()) selectorArea.append(crearElemento('option', { value: id }, nombreDe(id)));

  hechos.replaceChildren(...(datos.hechos.length ? datos.hechos.slice(0, 40).map((h) => {
    const li = crearElemento('li', { class: 'memoria-item hecho' });
    const cuerpo = crearElemento('div');
    cuerpo.append(crearElemento('span', {}, h.texto), crearElemento('small', {}, `${nombreDe(h.area)} · fuente: ${h.fuente} · ${fechaCorta(h.momento)}`));
    const quitar = crearElemento('button', { class: 'boton secundario compacto', type: 'button', 'aria-label': 'Borrar hecho' }, 'No es cierto');
    quitar.addEventListener('click', async () => { await fetch(`/api/memoria/hechos/${h.id}`, { method: 'DELETE' }); cargarBitacora(); });
    li.append(cuerpo, quitar);
    return li;
  }) : [crearElemento('li', {}, 'Sin hechos registrados. Cuando le digas a un agente cómo es tu negocio, quedará aquí.')]));

  ideas.replaceChildren(...(datos.ideas.length ? datos.ideas.slice(0, 40).map((i) => {
    const li = crearElemento('li', { class: `memoria-item idea ${i.estado}` });
    const cuerpo = crearElemento('div');
    cuerpo.append(crearElemento('span', {}, i.texto), crearElemento('small', {}, `${nombreDe(i.area)}${i.veredicto ? ` · veredicto del agente: ${i.veredicto}` : ''} · propuso ${nombreDe(i.origen)} · ${fechaCorta(i.momento)}`));
    const sel = crearElemento('select', { 'aria-label': 'Estado de la idea' });
    for (const [v, t] of Object.entries(ETIQUETA_IDEA)) sel.append(crearElemento('option', { value: v }, t));
    sel.value = i.estado;
    sel.addEventListener('change', async () => {
      await fetch(`/api/memoria/ideas/${i.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estado: sel.value }) });
      aviso(sel.value === 'aprobada' ? 'Idea aprobada: los agentes la tratarán como decisión.' : 'Idea actualizada.', 'ok');
      cargarBitacora();
    });
    li.append(cuerpo, sel);
    return li;
  }) : [crearElemento('li', {}, 'Sin ideas en evaluación. Escribe a un agente "¿y si…?" o "quiero abrir…" y la evaluará.')]));

  conceptos.replaceChildren(...(datos.conceptos.length ? datos.conceptos.slice(0, 60).map((c) => {
    const li = crearElemento('li', { class: 'memoria-item concepto' });
    const cuerpo = crearElemento('div');
    cuerpo.append(crearElemento('strong', {}, c.termino), crearElemento('span', {}, c.texto));
    li.append(cuerpo);
    return li;
  }) : [crearElemento('li', {}, 'Sin conceptos todavía. Pregunta "¿qué es…?" a un agente.')]));
}

// ---------- Accesos y permisos (dashboard) ----------

async function renderPermisos() {
  const lista = $('#permisos-lista');
  let p;
  try {
    p = await fetch('/api/permisos').then((r) => r.json());
  } catch {
    return;
  }
  const filas = p.filas.map((f) => {
    const li = crearElemento('li', { class: `permiso ${f.tipo}${f.tipo === 'permiso' && !f.activo ? ' apagado' : ''}` });
    const cuerpo = crearElemento('div');
    cuerpo.append(crearElemento('strong', {}, f.nombre), crearElemento('span', {}, f.descripcion), crearElemento('small', {}, `Sale de tu equipo: ${f.sale}`));
    if (f.tipo === 'permiso') {
      const etiqueta = crearElemento('label', { class: 'interruptor' });
      const check = crearElemento('input', { type: 'checkbox', 'aria-label': `Permitir ${f.nombre}` });
      check.checked = f.activo;
      check.addEventListener('change', async () => {
        await fetch('/api/permisos', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [f.id]: check.checked }) });
        aviso(check.checked ? `${f.nombre}: permitido.` : `${f.nombre}: desactivado.`, 'ok');
        await refrescarEstadoIA();
        renderPermisos();
      });
      etiqueta.append(check, crearElemento('span', {}, check.checked ? 'Permitido' : 'Apagado'));
      li.append(cuerpo, etiqueta);
    } else {
      li.append(cuerpo, crearElemento('span', { class: 'subtitulo' }, 'Informativo'));
    }
    return li;
  });
  lista.replaceChildren(...filas);
}

// ---------- Piloto automático por agente ----------

async function cargarPiloto() {
  let d;
  try {
    d = await fetch('/api/piloto').then((r) => r.json());
  } catch {
    return;
  }
  const global = $('#piloto-global');
  global.checked = d.activo;
  $('#piloto-global-texto').textContent = d.activo ? `Encendido · ${d.encendidos} agentes en piloto` : `Apagado · ${d.encendidos} agentes listos para cuando lo enciendas`;
  $('#piloto-estado').textContent = d.activo && !d.puedeIA ? `Encendido, pero no puede correr: ${d.motivoIA}.` : '';
  const tipoTexto = { orquestador: 'Orquestador', area: 'Área', staff: 'Staff', subagente: 'Subagente', propio: 'Agente propio' };
  const filas = d.agentes.map((a) => {
    const li = crearElemento('li', { class: a.activo ? '' : 'hecha' });
    const check = crearElemento('input', { type: 'checkbox', 'aria-label': `Piloto de ${a.nombre}` });
    check.checked = a.activo;
    check.addEventListener('change', async () => { await fetch(`/api/piloto/${a.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ activo: check.checked }) }); cargarPiloto(); });
    const cuerpo = crearElemento('div');
    cuerpo.append(crearElemento('span', { class: 'bitacora-texto' }, `${a.nombre} · ${tipoTexto[a.tipo] || a.tipo}`));
    const controles = crearElemento('div', { class: 'acciones-inline piloto-controles' });
    const frec = crearElemento('select', { 'aria-label': 'Frecuencia' });
    for (const [v, t] of [['diaria', 'cada día'], ['semanal', 'cada semana'], ['mensual', 'cada mes']]) frec.append(crearElemento('option', { value: v }, t));
    frec.value = a.frecuencia;
    const dia = crearElemento('select', { 'aria-label': 'Día' });
    if (a.frecuencia === 'mensual') for (let i = 1; i <= 28; i++) dia.append(crearElemento('option', { value: String(i) }, `día ${i}`));
    else for (let i = 0; i < 7; i++) dia.append(crearElemento('option', { value: String(i) }, d.dias[i]));
    dia.value = String(a.frecuencia === 'mensual' ? a.diaMes : a.diaSemana);
    dia.hidden = a.frecuencia === 'diaria';
    const hora = crearElemento('select', { 'aria-label': 'Hora' });
    for (let h = 0; h < 24; h++) hora.append(crearElemento('option', { value: String(h) }, `${String(h).padStart(2, '0')}:00`));
    hora.value = String(a.hora);
    const guardar = async () => {
      await fetch(`/api/piloto/${a.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ frecuencia: frec.value, diaSemana: frec.value === 'semanal' ? Number(dia.value) : a.diaSemana, diaMes: frec.value === 'mensual' ? Number(dia.value) : a.diaMes, hora: Number(hora.value) }) });
      cargarPiloto();
    };
    for (const s of [frec, dia, hora]) s.addEventListener('change', guardar);
    const ahora = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Ejecutar ahora');
    ahora.addEventListener('click', async () => {
      ahora.disabled = true; ahora.textContent = 'Trabajando…';
      const res = await fetch(`/api/piloto/${a.id}/ejecutar`, { method: 'POST' });
      const j = await res.json();
      aviso(j.pendiente ? `Quedó pendiente: ${j.motivo}` : res.ok ? `${a.nombre} hizo su revisión; léela en su conversación.` : (j.errores?.[0] || 'Falló.'), res.ok ? 'ok' : 'error');
      cargarPiloto();
    });
    controles.append(frec, dia, hora, ahora);
    const detalle = crearElemento('small', {}, `${a.ultimaEjecucion ? `Última: ${fechaCorta(a.ultimaEjecucion)} (${a.ultimoResultado || ''})` : 'Nunca ha corrido'}${a.proxima ? ` · próxima: ${fechaCorta(a.proxima)} ${String(new Date(a.proxima).getHours()).padStart(2, '0')}:00` : ''}`);
    const tarea = crearElemento('details', { class: 'piloto-tarea' });
    tarea.append(crearElemento('summary', {}, a.tarea ? 'Tarea personalizada (editar)' : 'Qué revisa (editar)'));
    const area = crearElemento('textarea', { rows: '4', maxlength: '2000' });
    area.value = a.tareaEfectiva;
    const guardarTarea = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Guardar tarea');
    guardarTarea.addEventListener('click', async () => { await fetch(`/api/piloto/${a.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tarea: area.value }) }); aviso('Tarea guardada.', 'ok'); cargarPiloto(); });
    tarea.append(area, guardarTarea);
    cuerpo.append(controles, detalle, tarea);
    li.append(check, cuerpo);
    return li;
  });
  $('#piloto-lista').replaceChildren(...filas);
}

async function cambiarPilotoGlobal() {
  const activo = $('#piloto-global').checked;
  await fetch('/api/permisos', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ piloto: activo }) });
  aviso(activo ? 'Piloto automático encendido: los agentes activos harán su revisión cuando les toque.' : 'Piloto automático apagado.', 'ok');
  cargarPiloto();
}

// ---------- Rutinas automáticas ----------

async function cargarRutinas() {
  let d;
  try {
    d = await fetch('/api/rutinas').then((r) => r.json());
  } catch {
    return;
  }
  const nombreDe = (id) => (id === 'orquestador' ? 'Orquestador' : nombreArea(id));
  const selArea = $('#rut-area');
  if (!selArea.children.length) for (const id of idsDeTodosLosAgentes()) selArea.append(crearElemento('option', { value: id }, nombreDe(id)));
  const sugerencias = d.sugerencias.map((s) => {
    const caja = crearElemento('div', { class: 'propuesta' });
    caja.append(crearElemento('strong', {}, `Has pedido esto ${s.veces} veces a ${nombreDe(s.area)}`), crearElemento('span', {}, s.texto));
    const acciones = crearElemento('div', { class: 'acciones-inline' });
    const frec = crearElemento('select', { 'aria-label': 'Frecuencia' });
    for (const [v, t] of [['diaria', 'cada día'], ['semanal', 'cada semana'], ['mensual', 'cada mes']]) frec.append(crearElemento('option', { value: v }, t));
    frec.value = 'semanal';
    const crear = crearElemento('button', { class: 'boton compacto', type: 'button' }, 'Automatizar');
    const descartar = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'No, gracias');
    crear.addEventListener('click', async () => {
      const res = await fetch('/api/rutinas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ area: s.area, texto: s.texto, frecuencia: frec.value, diaSemana: new Date().getDay(), diaMes: Math.min(28, new Date().getDate()), hora: 9 }) });
      aviso(res.ok ? 'Rutina creada: se enviará sola a partir de la próxima fecha.' : 'No se pudo crear la rutina.', res.ok ? 'ok' : 'error');
      cargarRutinas();
    });
    descartar.addEventListener('click', async () => { await fetch(`/api/rutinas/sugerencias/${s.id}`, { method: 'DELETE' }); cargarRutinas(); });
    acciones.append(frec, crear, descartar);
    caja.append(acciones);
    return caja;
  });
  $('#rutinas-sugerencias').replaceChildren(...sugerencias);
  const filas = d.rutinas.length ? d.rutinas.map((r) => {
    const li = crearElemento('li', { class: r.activa ? '' : 'hecha' });
    const check = crearElemento('input', { type: 'checkbox', 'aria-label': 'Rutina activa' });
    check.checked = r.activa;
    check.addEventListener('change', async () => { await fetch(`/api/rutinas/${r.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ activa: check.checked }) }); cargarRutinas(); });
    const cuerpo = crearElemento('div');
    const detalle = `${nombreDe(r.area)} · ${r.frecuencia}${r.frecuencia === 'semanal' ? ` (${d.dias[r.diaSemana]})` : r.frecuencia === 'mensual' ? ` (día ${r.diaMes})` : ''} a las ${String(r.hora).padStart(2, '0')}:00 · ${r.ultimaEjecucion ? `última: ${fechaCorta(r.ultimaEjecucion)} (${r.ultimoResultado || ''})` : 'nunca ha corrido'}${r.proxima ? ` · próxima: ${fechaCorta(r.proxima)}` : ''}`;
    cuerpo.append(crearElemento('span', { class: 'bitacora-texto' }, r.nombre), crearElemento('small', {}, r.texto), crearElemento('small', {}, detalle));
    const acciones = crearElemento('div', { class: 'doc-acciones' });
    const ahora = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Ejecutar ahora');
    ahora.addEventListener('click', async () => { ahora.disabled = true; const res = await fetch(`/api/rutinas/${r.id}/ejecutar`, { method: 'POST' }); const j = await res.json(); aviso(j.pendiente ? `Quedó pendiente: ${j.motivo}` : res.ok ? 'Rutina ejecutada; revisa la conversación del agente.' : (j.errores?.[0] || 'Falló.'), res.ok ? 'ok' : 'error'); cargarRutinas(); });
    const borrar = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Borrar');
    borrar.addEventListener('click', async () => { await fetch(`/api/rutinas/${r.id}`, { method: 'DELETE' }); cargarRutinas(); });
    acciones.append(ahora, borrar);
    cuerpo.append(acciones);
    li.append(check, cuerpo);
    return li;
  }) : [crearElemento('li', {}, d.activas ? 'Sin rutinas. Aparecerán sugerencias cuando repitas una orden tres veces.' : 'Las rutinas están desactivadas en Accesos y permisos (dashboard).')];
  $('#rutinas-lista').replaceChildren(...filas);
}

async function crearRutinaManual() {
  const frecuencia = $('#rut-frecuencia').value;
  const dia = Number($('#rut-dia').value) || 1;
  try {
    const res = await fetch('/api/rutinas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ area: $('#rut-area').value, nombre: $('#rut-nombre').value, texto: $('#rut-texto').value, frecuencia, diaSemana: frecuencia === 'semanal' ? Math.min(6, dia) : 1, diaMes: frecuencia === 'mensual' ? Math.min(28, Math.max(1, dia)) : 1, hora: Number($('#rut-hora').value) || 9 }) });
    const j = await res.json();
    if (!res.ok) return mensaje($('#rut-mensaje'), j.errores?.[0] || 'No se pudo crear.', 'error');
    $('#rut-texto').value = ''; $('#rut-nombre').value = '';
    mensaje($('#rut-mensaje'), 'Rutina creada.', 'ok');
    cargarRutinas();
  } catch {
    mensaje($('#rut-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

// ---------- Calculadora laboral (LFT, sin IA) ----------

let laboralEsquema = null;
let laboralUltimo = null;

async function cargarLaboral() {
  if (laboralEsquema) return;
  try {
    laboralEsquema = await fetch('/api/laboral').then((r) => r.json());
  } catch {
    return;
  }
  const sel = $('#lab-tipo');
  sel.replaceChildren();
  for (const [id, nombre] of Object.entries(laboralEsquema.tipos)) sel.append(crearElemento('option', { value: id }, nombre));
  pintarCamposLaboral();
}

function pintarCamposLaboral() {
  const tipo = $('#lab-tipo').value;
  const caja = $('#lab-campos');
  caja.replaceChildren();
  $('#lab-resultado').replaceChildren();
  $('#lab-registrar').hidden = true;
  for (const [id, etiqueta, clase, requerido = true, opciones] of laboralEsquema.campos[tipo] || []) {
    const campo = crearElemento('div', { class: 'campo' });
    campo.append(crearElemento('label', { for: `lab-${id}` }, `${etiqueta}${requerido ? ' *' : ''}`));
    let input;
    if (clase === 'opcion') {
      input = crearElemento('select', { id: `lab-${id}` });
      for (const o of opciones) input.append(crearElemento('option', { value: o }, o));
    } else {
      input = crearElemento('input', { id: `lab-${id}`, type: clase === 'fecha' ? 'date' : 'number', step: 'any', min: '0' });
    }
    campo.append(input);
    caja.append(campo);
  }
}

function parametrosLaboral() {
  const tipo = $('#lab-tipo').value;
  const p = {};
  for (const [id] of laboralEsquema.campos[tipo] || []) {
    const v = $(`#lab-${id}`)?.value;
    if (v !== '' && v !== undefined) p[id] = v;
  }
  return { tipo, parametros: p };
}

async function calcularLaboral(registrar = false) {
  const { tipo, parametros } = parametrosLaboral();
  try {
    const res = await fetch('/api/laboral/calcular', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo, parametros, registrar, trabajador: $('#lab-trabajador').value }) });
    const j = await res.json();
    if (!res.ok) return mensaje($('#lab-mensaje'), j.errores?.[0] || 'No se pudo calcular.', 'error');
    laboralUltimo = j.resultado;
    const r = j.resultado;
    const caja = crearElemento('div', { class: 'detalle-registro' });
    caja.append(crearElemento('h4', {}, r.titulo));
    const tabla = crearElemento('table', { class: 'tabla-calculo' });
    for (const [concepto, valor] of r.lineas) {
      const fila = crearElemento('tr');
      fila.append(crearElemento('td', {}, concepto), crearElemento('td', { class: 'num' }, typeof valor === 'number' ? `$${valor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : String(valor)));
      tabla.append(fila);
    }
    caja.append(tabla);
    if (r.total !== null) caja.append(crearElemento('div', { class: 'puntaje' }, `Total: $${Number(r.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`));
    const ul = crearElemento('ul');
    for (const n of r.notas) ul.append(crearElemento('li', {}, n));
    caja.append(ul, crearElemento('p', { class: 'subtitulo' }, `Parámetros: salario mínimo general $${r.parametros.salarioMinimoGeneral}, UMA $${r.parametros.uma} (vigentes a ${r.vigencia}; confirmar cada año).`));
    $('#lab-resultado').replaceChildren(caja);
    $('#lab-registrar').hidden = r.total === null;
    mensaje($('#lab-mensaje'), registrar ? 'Calculado y registrado como hecho para los agentes.' : 'Calculado.', 'ok');
    if (registrar) cargarBitacora();
  } catch {
    mensaje($('#lab-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

// ---------- Calendario (.ics local, sin cuentas) ----------

async function cargarCalendario() {
  let c;
  try {
    c = await fetch('/api/calendario').then((r) => r.json());
  } catch {
    return;
  }
  $('#cal-url').textContent = `${location.origin}/api/calendario.ics`;
  $('#cal-estado').textContent = `${c.propios} fechas propias de la oficina. ${c.importado ? `Agenda importada${c.nombre ? ` (${c.nombre})` : ''}: ${c.eventosImportados} eventos, ${fechaCorta(c.importado)}.` : 'Sin agenda importada.'}`;
  const filas = c.proximos.length
    ? c.proximos.slice(0, 30).map((e) => {
      const li = crearElemento('li', { class: e.origen === 'calendario' ? 'importado' : '' });
      const cuerpo = crearElemento('div');
      cuerpo.append(crearElemento('span', {}, e.titulo), crearElemento('small', {}, `${fechaCorta(`${e.fecha}T12:00:00`)}${e.hora ? ` ${e.hora}` : ''} · ${e.origen === 'calendario' ? 'tu calendario' : 'oficina'}`));
      li.append(crearElemento('span', { class: `punto-color ${e.origen === 'calendario' ? 'amarillo' : 'verde'}` }), cuerpo);
      return li;
    })
    : [crearElemento('li', {}, 'Nada en los próximos 14 días.')];
  $('#cal-lista').replaceChildren(...filas);
}

async function importarCalendario(archivo) {
  if (!archivo) return;
  if (archivo.size > 2 * 1024 * 1024) return mensaje($('#cal-mensaje'), 'El archivo supera 2 MB.', 'error');
  try {
    const res = await fetch('/api/calendario/importar', { method: 'POST', headers: { 'content-type': 'text/calendar', 'x-nombre': encodeURIComponent(archivo.name) }, body: archivo });
    const j = await res.json();
    if (!res.ok) return mensaje($('#cal-mensaje'), j.errores?.[0] || 'No se pudo importar.', 'error');
    mensaje($('#cal-mensaje'), `${j.eventos} eventos importados; los agentes ya cuentan con tu agenda.`, 'ok');
    cargarCalendario();
  } catch {
    mensaje($('#cal-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

async function agregarHecho() {
  const texto = $('#hecho-texto').value.trim();
  if (!texto) return aviso('Escribe el dato.', 'error');
  try {
    const res = await fetch('/api/memoria/hechos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto, area: $('#hecho-area').value }) });
    if (!res.ok) return aviso('No se pudo guardar.', 'error');
    $('#hecho-texto').value = '';
    aviso('Hecho registrado: todos los agentes lo verán.', 'ok');
    cargarBitacora();
  } catch {
    aviso('No hay conexión con el servidor local.', 'error');
  }
}

async function cargarBitacora() {
  // Se arma todo aparte y se reemplaza al final: dos cargas simultáneas (feed + vista) no duplican filas.
  const lista = $('#bitacora-acciones');
  const resumen = $('#bitacora-resumen');
  const notas = $('#bitacora-notas');
  let datos;
  try {
    datos = await fetch('/api/memoria').then((r) => r.json());
  } catch {
    lista.replaceChildren(crearElemento('li', {}, 'No se pudo cargar la bitácora.'));
    return;
  }
  const nombreDe = (id) => (id === 'orquestador' ? 'Orquestador' : nombreArea(id));
  const abiertas = datos.acciones.filter((a) => a.estado === 'pendiente');
  const porArea = {};
  for (const a of abiertas) porArea[a.area] = (porArea[a.area] || 0) + 1;
  const chips = [crearElemento('span', {}, `${abiertas.length} acciones abiertas`)];
  for (const [id, n] of Object.entries(porArea).sort((x, y) => y[1] - x[1]).slice(0, 8)) chips.push(crearElemento('span', {}, `${nombreDe(id)}: ${n}`));
  resumen.replaceChildren(...chips);
  const filas = [];
  if (!datos.acciones.length) filas.push(crearElemento('li', {}, 'Todavía no hay acciones. Aparecen cuando un agente responde con una sección ACCIONES.'));
  for (const a of datos.acciones.slice(0, 40)) {
    const hoy = new Date();
    const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const vencida = a.estado === 'pendiente' && a.vence && a.vence < hoyIso;
    const li = crearElemento('li', { class: a.estado === 'hecha' ? 'hecha' : vencida ? 'vencida' : '' });
    const check = crearElemento('input', { type: 'checkbox', 'aria-label': 'Marcar como hecha' });
    check.checked = a.estado === 'hecha';
    check.addEventListener('change', async () => {
      await fetch(`/api/memoria/acciones/${a.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ estado: check.checked ? 'hecha' : 'pendiente' }) });
      cargarBitacora();
    });
    const cuerpo = crearElemento('div');
    cuerpo.append(crearElemento('span', { class: 'bitacora-texto' }, a.texto));
    const small = crearElemento('small', {}, `${nombreDe(a.area)}${a.responsable ? ` · ${a.responsable}` : ''}${a.plazo ? ` · ${a.plazo}` : ''} · propuso ${nombreDe(a.origen)} · ${fechaCorta(a.momento)}`);
    if (a.vence) small.append(' · ', crearElemento('span', { class: vencida ? 'vence' : '' }, `${vencida ? 'venció' : 'vence'} ${fechaCorta(`${a.vence}T12:00:00`)}`));
    cuerpo.append(small);
    li.append(check, cuerpo);
    filas.push(li);
  }
  lista.replaceChildren(...filas);
  const filasNotas = datos.notas.length ? datos.notas.map((n) => crearElemento('li', {}, `${nombreDe(n.origen)} → ${nombreDe(n.destino)}: ${n.texto}${n.leida ? '' : ' (sin leer)'}`)) : [crearElemento('li', {}, 'Sin notas todavía.')];
  notas.replaceChildren(...filasNotas);
  pintarMemoriaTipos({ hechos: datos.hechos || [], ideas: datos.ideas || [], conceptos: datos.conceptos || [] });
}

// ---------- Investigación semanal de mercado ----------

function llenarProgramacion(prefijo, prog, dias) {
  const dia = $(`#${prefijo}-dia`);
  const hora = $(`#${prefijo}-hora`);
  if (!dia.children.length) {
    dias.forEach((d, i) => dia.append(crearElemento('option', { value: String(i) }, d[0].toUpperCase() + d.slice(1))));
    for (let h = 0; h < 24; h++) hora.append(crearElemento('option', { value: String(h) }, `${String(h).padStart(2, '0')}:00`));
  }
  $(`#${prefijo}-activa`).value = prog.activa ? '1' : '0';
  dia.value = String(prog.diaSemana);
  hora.value = String(prog.hora);
}

function textoProgramacion(prog) {
  const partes = [];
  if (prog.ultimaEjecucion) partes.push(`Última corrida: ${fechaCorta(prog.ultimaEjecucion)}.`);
  if (prog.activa && prog.proxima) partes.push(`Próxima: ${fechaCorta(prog.proxima)} a las ${String(new Date(prog.proxima).getHours()).padStart(2, '0')}:00 (si la computadora está apagada, corre al encenderla).`);
  if (!prog.activa) partes.push('Programación pausada.');
  if (prog.ultimoIntento?.error) partes.push(`El último intento no corrió: ${prog.ultimoIntento.error}.`);
  return partes.join(' ');
}

async function guardarProgramacion(tarea, prefijo, mensajeEl) {
  try {
    const res = await fetch(`/api/${tarea}/programacion`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ activa: $(`#${prefijo}-activa`).value === '1', diaSemana: Number($(`#${prefijo}-dia`).value), hora: Number($(`#${prefijo}-hora`).value) }) });
    if (!res.ok) return mensaje(mensajeEl, 'No se pudo guardar la programación.', 'error');
    mensaje(mensajeEl, 'Programación guardada.', 'ok');
    cargarInvestigacion();
  } catch {
    mensaje(mensajeEl, 'No hay conexión con el servidor local.', 'error');
  }
}

async function cargarInvestigacion() {
  let datos;
  try {
    datos = await fetch('/api/investigacion').then((r) => r.json());
  } catch {
    return;
  }
  llenarProgramacion('inv', datos.programacion, datos.dias);
  const p = datos.programacion;
  $('#inv-estado').textContent = `${p.puedeIA ? (p.activa ? 'IA activa: la investigación corre sola.' : 'IA activa. La investigación está en pausa: elige "Activa" y guarda la programación para que corra sola.') : `${p.motivoIA}: la investigación automática no puede correr; puedes capturar reseñas a mano.`} ${textoProgramacion(p)}`;
  $('#inv-ejecutar').disabled = !p.puedeIA;
  const lista = $('#inv-lista');
  $('#inv-detalle').replaceChildren();
  const filas = [];
  if (!datos.investigaciones.length) filas.push(crearElemento('li', { class: 'subtitulo' }, 'Todavía no hay investigaciones.'));
  for (const inv of datos.investigaciones) {
    const li = crearElemento('li', { class: 'doc' });
    const cabecera = crearElemento('div', { class: 'doc-cabecera' });
    const info = crearElemento('div');
    const cobertura = inv.cumple?.competidores && inv.cumple?.resenas ? 'cobertura completa' : `cobertura parcial (mínimo ${datos.minimos.competidores} competidores y ${datos.minimos.resenas} comentarios por tipo)`;
    info.append(crearElemento('strong', {}, `${fechaCorta(inv.momento)} · ${inv.competidores} competidores · ${inv.comentarios} comentarios`));
    info.append(crearElemento('small', {}, `${inv.origen === 'manual' ? 'capturada o lanzada a mano' : 'automática'} · ${cobertura} · ${inv.encargos} encargos${inv.pendienteReparto ? ' pendientes (sin IA)' : ''}`));
    const acciones = crearElemento('div', { class: 'doc-acciones' });
    const ver = crearElemento('button', { class: 'boton compacto', type: 'button' }, 'Ver');
    ver.addEventListener('click', () => verInvestigacion(inv.id));
    const word = crearElemento('a', { class: 'boton secundario compacto', href: `/api/investigacion/${inv.id}/reporte.docx` }, 'Word');
    const pdf = crearElemento('a', { class: 'boton secundario compacto', href: `/api/investigacion/${inv.id}/reporte.html`, target: '_blank', rel: 'noopener' }, 'PDF');
    acciones.append(ver, word, pdf);
    cabecera.append(info, acciones);
    li.append(cabecera);
    filas.push(li);
  }
  lista.replaceChildren(...filas);
}

async function verInvestigacion(id) {
  const caja = $('#inv-detalle');
  caja.replaceChildren();
  let inv;
  try {
    inv = await fetch(`/api/investigacion/${id}`).then((r) => r.json());
  } catch {
    return;
  }
  const d = crearElemento('div', { class: 'detalle-registro' });
  const seccion = (titulo, items) => {
    if (!items?.length) return;
    d.append(crearElemento('h4', {}, titulo));
    const ul = crearElemento('ul');
    for (const x of items) ul.append(crearElemento('li', {}, x));
    d.append(ul);
  };
  if (inv.busquedas?.length) seccion(`Búsquedas que hizo el agente en internet (${inv.busquedas.length})`, inv.busquedas.map((b) => `"${b.consulta}"${b.fuentes?.length ? ` → ${b.fuentes.map((f) => f.titulo || f.url).join('; ')}` : ''}`));
  else if (inv.origen !== 'manual') seccion('Búsquedas en internet', ['No quedó registro de búsquedas en esta corrida.']);
  seccion('Lo que buscan los clientes', inv.buscan);
  seccion('Lo que rechazan', inv.rechazan);
  seccion('Oportunidades', inv.oportunidades);
  if (inv.encargos?.length) seccion('Trabajo repartido por el Orquestador', inv.encargos.map((e) => `${e.nombreDestino || e.destinoTexto}: ${e.texto}${e.respuesta ? ' → respondido' : e.pendiente ? ' → pendiente para la persona responsable' : e.error ? ` → ${e.error}` : ''}`));
  d.append(crearElemento('h4', {}, `Competidores (${inv.competidores.length})`));
  for (const c of inv.competidores) {
    const caja2 = crearElemento('div', { class: 'competidor' });
    caja2.append(crearElemento('strong', {}, `${c.nombre}${c.zona ? ` · ${c.zona}` : ''}${c.fuente ? ` · ${c.fuente}` : ''}`));
    const ul = crearElemento('ul');
    for (const p of c.positivos) ul.append(crearElemento('li', { class: 'pos' }, `+ ${p}`));
    for (const n of c.negativos) ul.append(crearElemento('li', { class: 'neg' }, `− ${n}`));
    for (const n of c.notas) ul.append(crearElemento('li', {}, `Nota: ${n}`));
    caja2.append(ul);
    d.append(caja2);
  }
  for (const n of inv.notas || []) d.append(crearElemento('p', { class: 'subtitulo' }, `Nota: ${n}`));
  caja.append(d);
  d.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function ejecutarInvestigacion() {
  const boton = $('#inv-ejecutar');
  boton.disabled = true;
  const original = boton.textContent;
  boton.textContent = 'Investigando (puede tardar unos minutos)…';
  try {
    const res = await fetch('/api/investigacion/ejecutar', { method: 'POST' });
    const j = await res.json();
    if (!res.ok) mensaje($('#inv-mensaje'), j.errores?.[0] || 'No se pudo investigar.', 'error');
    else mensaje($('#inv-mensaje'), `Investigación lista: ${j.investigacion.competidores.length} competidores y ${j.investigacion.encargos.length} encargos repartidos.`, 'ok');
  } catch {
    mensaje($('#inv-mensaje'), 'No hay conexión con el servidor local.', 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = original;
    cargarInvestigacion();
    cargarBitacora();
  }
}

async function importarInvestigacion() {
  const texto = $('#inv-importar').value;
  if (!texto.trim()) return mensaje($('#inv-mensaje'), 'Pega primero las reseñas.', 'error');
  try {
    const res = await fetch('/api/investigacion/importar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto }) });
    const j = await res.json();
    if (!res.ok) return mensaje($('#inv-mensaje'), j.errores?.[0] || 'No se pudo guardar.', 'error');
    $('#inv-importar').value = '';
    mensaje($('#inv-mensaje'), j.investigacion.pendienteReparto ? 'Guardada. El informe quedó pendiente para Ventas y Marketing.' : 'Guardada y repartida por el Orquestador.', 'ok');
    cargarInvestigacion();
    cargarBitacora();
  } catch {
    mensaje($('#inv-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

// ---------- Análisis del sitio web ----------

const NOMBRES_CATEGORIAS_SITIO = { seguridad: 'Seguridad', movil: 'Celular', contenido: 'Contenido', conversion: 'Conversión', confianza: 'Confianza', rendimiento: 'Velocidad' };

async function cargarSitio() {
  let datos;
  try {
    datos = await fetch('/api/sitio').then((r) => r.json());
  } catch {
    return;
  }
  const p = datos.programacion;
  if (!$('#sitio-url').value && datos.sitioFicha) $('#sitio-url').placeholder = datos.sitioFicha;
  $('#sitio-estado').textContent = `${datos.sitioFicha ? `Sitio en la ficha: ${datos.sitioFicha}.` : 'La ficha de la empresa no tiene sitio web: escríbelo arriba o en Configuración.'} ${textoProgramacion(p)}`;
  const lista = $('#sitio-lista');
  $('#sitio-detalle').replaceChildren();
  const filas = [];
  if (!datos.analisis.length) filas.push(crearElemento('li', { class: 'subtitulo' }, 'Todavía no hay análisis.'));
  for (const a of datos.analisis) {
    const li = crearElemento('li', { class: 'doc' });
    const cabecera = crearElemento('div', { class: 'doc-cabecera' });
    const info = crearElemento('div');
    info.append(crearElemento('strong', {}, `${fechaCorta(a.momento)} · ${a.url} · ${a.puntaje}/100`));
    info.append(crearElemento('small', {}, `${a.rojos} en rojo · ${a.encargos} encargos${a.pendienteReparto ? ' pendientes (sin IA)' : ''}`));
    const acciones = crearElemento('div', { class: 'doc-acciones' });
    const ver = crearElemento('button', { class: 'boton compacto', type: 'button' }, 'Ver');
    ver.addEventListener('click', () => verSitio(a.id));
    const word = crearElemento('a', { class: 'boton secundario compacto', href: `/api/sitio/${a.id}/reporte.docx` }, 'Word');
    const pdf = crearElemento('a', { class: 'boton secundario compacto', href: `/api/sitio/${a.id}/reporte.html`, target: '_blank', rel: 'noopener' }, 'PDF');
    acciones.append(ver, word, pdf);
    cabecera.append(info, acciones);
    li.append(cabecera);
    filas.push(li);
  }
  lista.replaceChildren(...filas);
}

async function verSitio(id) {
  const caja = $('#sitio-detalle');
  caja.replaceChildren();
  let a;
  try {
    a = await fetch(`/api/sitio/${id}`).then((r) => r.json());
  } catch {
    return;
  }
  const d = crearElemento('div', { class: 'detalle-registro' });
  d.append(crearElemento('div', { class: 'puntaje' }, `${a.puntaje} / 100`));
  const resumen = crearElemento('div', { class: 'bitacora-resumen' });
  for (const [cat, color] of Object.entries(a.categorias)) resumen.append(crearElemento('span', {}, `${NOMBRES_CATEGORIAS_SITIO[cat] || cat}: ${ETIQUETA_COLOR[color]}`));
  d.append(resumen);
  for (const color of ['rojo', 'amarillo', 'verde', 'sin_datos']) {
    const items = a.hallazgos.filter((x) => x.color === color);
    if (!items.length) continue;
    d.append(crearElemento('h4', {}, { rojo: 'Atender primero', amarillo: 'Por revisar', verde: 'Lo que está bien', sin_datos: 'Sin datos' }[color]));
    for (const x of items) {
      const fila = crearElemento('div', { class: 'hallazgo' });
      fila.append(crearElemento('span', { class: `punto-color ${x.color}` }));
      const texto = crearElemento('div');
      texto.append(crearElemento('strong', {}, `${x.titulo} · ${nombreArea(x.area)}`));
      texto.append(crearElemento('div', {}, x.detalle));
      if (x.accion) texto.append(crearElemento('small', { class: 'subtitulo' }, `Acción: ${x.accion}`));
      fila.append(texto);
      d.append(fila);
    }
  }
  if (a.encargos?.length) {
    d.append(crearElemento('h4', {}, 'Trabajo repartido por el Orquestador'));
    const ul = crearElemento('ul');
    for (const e of a.encargos) ul.append(crearElemento('li', {}, `${e.nombreDestino || e.destinoTexto}: ${e.texto}${e.respuesta ? ' → respondido' : e.pendiente ? ' → pendiente para la persona responsable' : e.error ? ` → ${e.error}` : ''}`));
    d.append(ul);
  }
  caja.append(d);
  d.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function analizarSitio() {
  const boton = $('#sitio-analizar');
  boton.disabled = true;
  const original = boton.textContent;
  boton.textContent = 'Analizando…';
  try {
    const res = await fetch('/api/sitio/analizar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: $('#sitio-url').value }) });
    const j = await res.json();
    if (!res.ok) mensaje($('#sitio-mensaje'), j.errores?.[0] || 'No se pudo analizar.', 'error');
    else {
      mensaje($('#sitio-mensaje'), `Análisis listo: ${j.analisis.puntaje}/100, ${j.analisis.encargos.length} encargos.`, 'ok');
      await cargarSitio();
      verSitio(j.analisis.id);
      cargarBitacora();
      return;
    }
  } catch {
    mensaje($('#sitio-mensaje'), 'No hay conexión con el servidor local.', 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = original;
  }
  cargarSitio();
}

// ---------- Jerarquía ----------

async function cargarJerarquia() {
  const contenedor = $('#organigrama');
  contenedor.replaceChildren();
  try {
    const { arbol, subagentes, tipos } = await fetch('/api/jerarquia').then((r) => r.json());
    estado.subagentes = subagentes || {};
    estado.tipos = tipos || {};
    const etiquetaTipo = { staff: 'staff', subagente: 'subagente', propio: 'agente propio' };
    const pintar = (nodo) => {
      const li = crearElemento('li');
      const caja = crearElemento('span', { class: `nodo-org nivel-${nodo.nivel} tipo-${nodo.tipo || 'area'}` });
      caja.append(crearElemento('span', {}, nombreAgente(nodo.id) === nodo.nombre || nodo.id === 'orquestador' ? nodo.nombre : `${nodo.nombre}`));
      if (nodo.id !== 'orquestador' && nombreAgente(nodo.id) !== nodo.nombre && !esPropio(nodo.id)) caja.append(crearElemento('small', {}, nombreAgente(nodo.id)));
      if (etiquetaTipo[nodo.tipo]) caja.append(crearElemento('em', { class: 'tipo-agente' }, etiquetaTipo[nodo.tipo]));
      li.append(caja);
      if (nodo.hijos?.length) {
        const ul = crearElemento('ul');
        for (const h of nodo.hijos) ul.append(pintar(h));
        li.append(ul);
      }
      return li;
    };
    const raiz = crearElemento('ul');
    raiz.append(pintar(arbol));
    // Resumen: qué subagentes dependen de cada área.
    const resumen = crearElemento('div', { class: 'subagentes-resumen' });
    resumen.append(crearElemento('strong', {}, 'Subagentes por área'));
    const ul = crearElemento('ul');
    for (const [jefe, lista] of Object.entries(subagentes || {})) ul.append(crearElemento('li', {}, `${jefe === 'orquestador' ? 'Orquestador' : nombreArea(jefe)}: ${lista.map(nombreArea).join(', ')}`));
    resumen.append(ul);
    contenedor.append(resumen, raiz);
  } catch {
    contenedor.append(crearElemento('p', { class: 'subtitulo' }, 'No se pudo cargar la jerarquía.'));
  }
}

// ---------- Ajustes por negocio ----------

let ajustesCache = {};

function idsDeTodosLosAgentes() {
  return ['orquestador', ...ORDEN_AREAS, ...apoyoActivos(), ...idsPropios()];
}

async function cargarAjustes() {
  try {
    ajustesCache = (await fetch('/api/ajustes').then((r) => r.json())).ajustes || {};
  } catch {
    ajustesCache = {};
  }
  const selector = $('#ajuste-agente');
  const actual = selector.value;
  selector.replaceChildren();
  for (const id of idsDeTodosLosAgentes()) selector.append(crearElemento('option', { value: id }, id === 'orquestador' ? 'Orquestador' : nombreArea(id)));
  selector.value = idsDeTodosLosAgentes().includes(actual) ? actual : 'orquestador';
  pintarAjuste();
  renderPropuestas();
}

function pintarAjuste() {
  const a = ajustesCache[$('#ajuste-agente').value] || {};
  $('#ajuste-notas').value = a.notas || '';
  $('#ajuste-marcos').value = (a.marcos || []).join('\n');
  $('#ajuste-acciones').value = (a.acciones || []).join('\n');
  $('#ajuste-limites').value = (a.limites || []).join('\n');
}

async function guardarAjuste() {
  const id = $('#ajuste-agente').value;
  try {
    const res = await fetch(`/api/ajustes/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notas: $('#ajuste-notas').value, marcos: $('#ajuste-marcos').value, acciones: $('#ajuste-acciones').value, limites: $('#ajuste-limites').value }) });
    const j = await res.json();
    if (!res.ok) return mensaje($('#ajuste-mensaje'), j.errores?.[0] || 'No se pudo guardar.', 'error');
    ajustesCache[id] = j;
    mensaje($('#ajuste-mensaje'), `Ajustes guardados para ${id === 'orquestador' ? 'el Orquestador' : nombreArea(id)}.`, 'ok');
  } catch {
    mensaje($('#ajuste-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

function renderPropuestas() {
  const contenedor = $('#propuestas');
  contenedor.replaceChildren();
  const pendientes = Object.entries(ajustesCache).filter(([, a]) => a.propuesta);
  if (!pendientes.length) return;
  for (const [id, a] of pendientes) {
    const p = a.propuesta;
    const caja = crearElemento('div', { class: 'propuesta' });
    caja.append(crearElemento('strong', {}, `Propuesta para ${id === 'orquestador' ? 'el Orquestador' : nombreArea(id)}`));
    if (p.motivo) caja.append(crearElemento('span', { class: 'subtitulo' }, `Motivo: ${p.motivo}`));
    if (p.notas) caja.append(crearElemento('span', {}, p.notas));
    const ul = crearElemento('ul');
    for (const m of p.marcos) ul.append(crearElemento('li', {}, `Marco: ${m}`));
    for (const m of p.acciones) ul.append(crearElemento('li', {}, `Acción: ${m}`));
    for (const m of p.limites) ul.append(crearElemento('li', {}, `Límite: ${m}`));
    if (ul.children.length) caja.append(ul);
    const acciones = crearElemento('div', { class: 'acciones-inline' });
    const aceptar = crearElemento('button', { class: 'boton compacto', type: 'button' }, 'Aceptar');
    const rechazar = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Rechazar');
    aceptar.addEventListener('click', async () => { await fetch(`/api/ajustes/${id}/aceptar`, { method: 'POST' }); aviso('Ajuste aplicado.', 'ok'); cargarAjustes(); });
    rechazar.addEventListener('click', async () => { await fetch(`/api/ajustes/${id}/rechazar`, { method: 'POST' }); cargarAjustes(); });
    acciones.append(aceptar, rechazar);
    caja.append(acciones);
    contenedor.append(caja);
  }
}

async function optimizarAgentes() {
  const boton = $('#optimizar-agentes');
  boton.disabled = true;
  const original = boton.textContent;
  boton.textContent = 'Analizando el negocio…';
  try {
    const res = await fetch('/api/ajustes/optimizar', { method: 'POST' });
    const j = await res.json();
    if (!res.ok) aviso(j.errores?.[0] || 'No se pudieron generar propuestas.', 'error');
    else aviso(j.propuestas.length || j.nuevos?.length ? `${j.propuestas.length} ajustes y ${j.nuevos?.length || 0} subagentes nuevos propuestos; revísalos en Ajustes y en Mis agentes.` : 'El Orquestador no propuso cambios.', 'ok');
    await cargarAjustes();
    cargarPropuestasAgentes();
  } catch {
    aviso('No hay conexión con el servidor local.', 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = original;
  }
}

// ---------- Consumo de IA ----------

function pintarUso(u) {
  if (!u) return;
  $('#uso-modelo').textContent = u.modelo || (u.proveedor !== 'ninguno' ? u.proveedor : 'Sin IA');
  $('#uso-total').textContent = (u.total || 0).toLocaleString('es-MX');
  $('#uso-llamadas').textContent = String(u.llamadas || 0);
  $('#uso-limite').textContent = u.limite ? u.limite.toLocaleString('es-MX') : 'Sin límite';
  const relleno = $('#uso-relleno');
  relleno.style.width = `${u.limite ? u.porcentaje : 0}%`;
  relleno.classList.toggle('alerta', Boolean(u.limite) && u.porcentaje >= 80);
  const extra = [u.cacheLeido ? `${u.cacheLeido.toLocaleString('es-MX')} de entrada vinieron de la caché del proveedor (más baratos)` : '', u.busquedas ? `${u.busquedas} búsquedas web cobradas aparte` : ''].filter(Boolean).join(' · ');
  $('#uso-aviso').textContent = [u.alcanzado ? 'Límite alcanzado: las órdenes quedan pendientes hasta que subas el límite, mañana o el próximo mes.' : (u.limite ? `${u.porcentaje}% del límite mensual usado.` : ''), u.limiteDiario ? `Hoy: ${u.porcentajeHoy}% del límite diario.` : '', extra].filter(Boolean).join(' ');
  const hoyEl = $('#uso-hoy');
  if (hoyEl) hoyEl.textContent = (u.hoy || 0).toLocaleString('es-MX');
  const ahorro = $('#uso-ahorro');
  if (ahorro) ahorro.textContent = u.proveedor !== 'ninguno' ? `Modo ${u.modoAhorro || 'equilibrado'}: tu chat usa ${u.modelo || 'el modelo principal'}; piloto, rutinas y consultas entre agentes usan ${u.modeloAutomatico || 'el mismo'}${u.usarLotes ? '; el piloto va por lotes (50% del precio)' : ''}.` : '';
  const lista = $('#uso-agentes');
  lista.replaceChildren();
  const porAgente = Object.entries(u.porAgente || {}).sort(([, a], [, b]) => b - a).slice(0, 8);
  if (!porAgente.length) lista.append(crearElemento('li', {}, 'Sin consumo este mes.'));
  for (const [id, t] of porAgente) lista.append(crearElemento('li', {}, `${id === 'orquestador' ? 'Orquestador' : nombreArea(id)}: ${t.toLocaleString('es-MX')}`));
  const chip = $('#estado');
  if (u.proveedor !== 'ninguno') chip.title = `IA: ${u.modelo || u.proveedor} · ${(u.total || 0).toLocaleString('es-MX')} tokens este mes${u.limite ? ` de ${u.limite.toLocaleString('es-MX')}` : ''}`;
}

async function cargarUso() {
  try {
    const { actual } = await fetch('/api/uso').then((r) => r.json());
    pintarUso(actual);
    $('#cfg-limite').value = actual.limite || 0;
  } catch { /* sin servidor */ }
}

async function guardarLimite() {
  try {
    const res = await fetch('/api/configuracion', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datosFormularioIA()) });
    if (!res.ok) return mensaje($('#uso-mensaje'), 'No se pudo guardar el límite.', 'error');
    await cargarUso();
    mensaje($('#uso-mensaje'), 'Límite guardado.', 'ok');
  } catch {
    mensaje($('#uso-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

// ---------- Documentos para analizar ----------

const TIPOS_DOC = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown', 'text/csv', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_DOC = 15 * 1024 * 1024;

function tipoPorNombre(nombre) {
  const ext = nombre.toLowerCase().split('.').pop();
  return { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext] || '';
}

async function cargarDocumentos() {
  const lista = $('#doc-lista');
  lista.replaceChildren();
  let documentos = [];
  try {
    documentos = (await fetch('/api/documentos').then((r) => r.json())).documentos || [];
  } catch { /* sin servidor */ }
  if (!documentos.length) {
    lista.append(crearElemento('li', { class: 'subtitulo' }, 'Todavía no has subido documentos.'));
    return;
  }
  for (const d of documentos) {
    const li = crearElemento('li', { class: 'doc' });
    const cabecera = crearElemento('div', { class: 'doc-cabecera' });
    const info = crearElemento('div');
    const metodo = { docx: 'Word, texto leído', texto: 'texto leído', pdf: 'PDF, texto leído', 'pdf-sin-texto': 'PDF sin texto (escaneado): no se puede leer', imagen: 'imagen: se analiza con IA' }[d.metodo] || d.metodo;
    info.append(crearElemento('strong', {}, d.nombre), crearElemento('small', {}, `${fechaCorta(d.creado)} · ${(d.tam / 1024).toFixed(0)} KB · ${metodo}${d.caracteres ? ` · ${d.caracteres} caracteres` : ''}`));
    const acciones = crearElemento('div', { class: 'doc-acciones' });
    const analizar = crearElemento('button', { class: 'boton compacto', type: 'button' }, d.analisis ? 'Volver a analizar' : 'Analizar con el Orquestador');
    analizar.addEventListener('click', async () => {
      analizar.disabled = true;
      analizar.textContent = 'Analizando…';
      try {
        const res = await fetch(`/api/documentos/${d.id}/analizar`, { method: 'POST' });
        const j = await res.json();
        if (!res.ok) mensaje($('#doc-mensaje'), j.errores?.[0] || 'No se pudo analizar.', 'error');
        else mensaje($('#doc-mensaje'), j.pendiente ? 'Documento guardado; se analizará cuando actives la IA.' : 'Análisis listo. Revisa los encargos y las conversaciones de los agentes.', 'ok');
      } catch {
        mensaje($('#doc-mensaje'), 'No hay conexión con el servidor local.', 'error');
      }
      cargarDocumentos();
    });
    const borrar = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Eliminar');
    borrar.addEventListener('click', async () => {
      if (borrar.dataset.confirmar !== '1') {
        borrar.dataset.confirmar = '1';
        borrar.textContent = 'Confirmar eliminación';
        setTimeout(() => { borrar.dataset.confirmar = ''; borrar.textContent = 'Eliminar'; }, 4000);
        return;
      }
      await fetch(`/api/documentos/${d.id}`, { method: 'DELETE' });
      cargarDocumentos();
    });
    acciones.append(analizar, borrar);
    cabecera.append(info, acciones);
    li.append(cabecera);
    if (d.analisis) {
      li.append(crearElemento('p', { class: `doc-analisis${d.analisis.pendiente ? ' pendiente' : ''}` }, d.analisis.resumen || ''));
      if (d.analisis.delegaciones?.length) {
        const ul = crearElemento('ul', { class: 'doc-encargos' });
        for (const e of d.analisis.delegaciones) ul.append(crearElemento('li', {}, `${e.nombreDestino || e.destinoTexto}: ${e.texto}${e.respuesta ? ' → respondido' : ' → sin respuesta'}`));
        li.append(ul);
      }
    }
    lista.append(li);
  }
}

async function subirDocumento(archivo) {
  if (!archivo) return;
  const tipo = archivo.type || tipoPorNombre(archivo.name);
  if (!TIPOS_DOC.includes(tipo)) return mensaje($('#doc-mensaje'), 'Formato no permitido: PDF, Word (.docx), texto, CSV o imagen.', 'error');
  if (archivo.size > MAX_DOC) return mensaje($('#doc-mensaje'), 'El documento supera 15 MB.', 'error');
  mensaje($('#doc-mensaje'), `Subiendo ${archivo.name}…`);
  try {
    const res = await fetch('/api/documentos', { method: 'POST', headers: { 'content-type': tipo, 'x-nombre': encodeURIComponent(archivo.name) }, body: archivo });
    const j = await res.json();
    if (!res.ok) return mensaje($('#doc-mensaje'), j.errores?.[0] || 'No se pudo subir.', 'error');
    mensaje($('#doc-mensaje'), j.metodo === 'pdf-sin-texto' ? 'Guardado, pero el PDF no tiene texto legible.' : 'Documento guardado. Pulsa "Analizar con el Orquestador".', 'ok');
    cargarDocumentos();
  } catch {
    mensaje($('#doc-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

// ---------- Mis agentes (creados por el usuario) ----------

// Rol, especialidad y preguntas de cada agente, para el perfil del chat.
async function cargarHabilidades() {
  try {
    estado.habilidades = (await fetch('/api/habilidades').then((r) => r.json())).habilidades || {};
  } catch {
    estado.habilidades = {};
  }
}

async function cargarPersonalizados() {
  try {
    estado.personalizados = await fetch('/api/agentes-personalizados').then((r) => r.json());
  } catch {
    estado.personalizados = { agentes: {}, avatares: [] };
  }
}

function renderPropios() {
  const lista = $('#propios-lista');
  lista.replaceChildren();
  const entradas = Object.entries(estado.personalizados.agentes);
  if (!entradas.length) lista.append(crearElemento('li', { class: 'subtitulo' }, 'Todavía no has creado agentes propios.'));
  for (const [id, a] of entradas) {
    const li = crearElemento('li', { class: 'propio' });
    const info = crearElemento('div', { class: 'propio-info' });
    const areas = a.areas.includes('todas') ? 've todas las áreas' : `ve: ${a.areas.map((x) => nombreArea(x)).join(', ')}`;
    info.append(crearElemento('strong', {}, a.nombre), crearElemento('small', {}, `${a.rol || 'Sin rol'} · ${areas}`));
    const acciones = crearElemento('div', { class: 'propio-acciones' });
    const hablar = crearElemento('button', { class: 'boton compacto', type: 'button' }, 'Hablar');
    hablar.addEventListener('click', () => abrirChatDe(id));
    const editar = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Editar');
    editar.addEventListener('click', () => editarPropio(id));
    const eliminar = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Eliminar');
    // Dos clics para eliminar: evita borrar por accidente sin usar diálogos del navegador.
    eliminar.addEventListener('click', async () => {
      if (eliminar.dataset.confirmar !== '1') {
        eliminar.dataset.confirmar = '1';
        eliminar.textContent = 'Confirmar eliminación';
        setTimeout(() => { eliminar.dataset.confirmar = ''; eliminar.textContent = 'Eliminar'; }, 4000);
        return;
      }
      await fetch(`/api/agentes-personalizados/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await cargarPersonalizados();
      prepararAgentes();
      if (estado.ultimo) renderEquipo(estado.ultimo.resultado.distritos);
    });
    acciones.append(hablar, editar, eliminar);
    li.append(avatarDe(id, 'agente-foto chica'), info, acciones);
    lista.append(li);
  }
  rellenarFormularioPropio();
}

function rellenarFormularioPropio(agente = null, id = '') {
  $('#propio-id').value = id;
  $('#propio-nombre').value = agente?.nombre || '';
  $('#propio-rol').value = agente?.rol || '';
  $('#propio-especialidad').value = agente?.especialidad || '';
  $('#propio-preguntas').value = (agente?.pregunta_primero || []).join('\n');
  $('#propio-marcos').value = (agente?.marcos || []).join('\n');
  $('#propio-acciones').value = (agente?.acciones || []).join('\n');
  $('#propio-limites').value = (agente?.limites || []).join('\n');

  const areas = $('#propio-areas');
  areas.replaceChildren();
  const elegidas = agente?.areas || ['todas'];
  for (const idArea of ['todas', ...ORDEN_AREAS]) {
    const etiqueta = crearElemento('label', { class: idArea === 'todas' ? 'todas' : '' });
    const caja = crearElemento('input', { type: 'checkbox', value: idArea });
    caja.checked = elegidas.includes(idArea);
    caja.addEventListener('change', () => {
      if (idArea === 'todas' && caja.checked) areas.querySelectorAll('input').forEach((c) => { if (c.value !== 'todas') c.checked = false; });
      if (idArea !== 'todas' && caja.checked) areas.querySelector('input[value="todas"]').checked = false;
    });
    etiqueta.append(caja, document.createTextNode(idArea === 'todas' ? 'Todas las áreas' : nombreArea(idArea)));
    areas.append(etiqueta);
  }

  const avatar = $('#propio-avatar');
  avatar.replaceChildren(crearElemento('option', { value: '' }, 'Sin avatar (iniciales)'));
  (estado.personalizados.avatares || []).forEach((ruta, i) => avatar.append(crearElemento('option', { value: ruta }, `Avatar ${i + 1}`)));
  avatar.value = agente?.avatar || '';
  actualizarPreviewAvatar();

  $('#propio-guardar').textContent = id ? 'Guardar cambios' : 'Crear agente';
  $('#propio-cancelar').hidden = !id;
}

function actualizarPreviewAvatar() {
  const img = $('#propio-avatar-preview');
  const ruta = $('#propio-avatar').value;
  img.hidden = !ruta;
  if (ruta) img.src = ruta;
}

function editarPropio(id) {
  rellenarFormularioPropio(estado.personalizados.agentes[id], id);
  mensaje($('#propio-mensaje'), `Editando ${estado.personalizados.agentes[id].nombre}.`);
  $('#form-propio').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function guardarPropio(evento) {
  evento.preventDefault();
  const id = $('#propio-id').value;
  const areas = [...$('#propio-areas').querySelectorAll('input:checked')].map((c) => c.value);
  const cuerpo = {
    nombre: $('#propio-nombre').value, rol: $('#propio-rol').value, especialidad: $('#propio-especialidad').value,
    pregunta_primero: $('#propio-preguntas').value, marcos: $('#propio-marcos').value, acciones: $('#propio-acciones').value,
    limites: $('#propio-limites').value, areas, avatar: $('#propio-avatar').value,
  };
  mensaje($('#propio-mensaje'), 'Guardando…');
  try {
    const res = await fetch(id ? `/api/agentes-personalizados/${encodeURIComponent(id)}` : '/api/agentes-personalizados', {
      method: id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
    const j = await res.json();
    if (!res.ok) return mensaje($('#propio-mensaje'), j.errores?.[0] || 'No se pudo guardar.', 'error');
    await cargarPersonalizados();
    prepararAgentes();
    if (estado.ultimo) renderEquipo(estado.ultimo.resultado.distritos);
    mensaje($('#propio-mensaje'), id ? 'Agente actualizado.' : `Agente "${j.nombre}" creado. Ya puedes hablar con él.`, 'ok');
  } catch {
    mensaje($('#propio-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

// ---------- Ficha de la empresa ----------

async function cargarEmpresa() {
  try {
    estado.empresa = await fetch('/api/empresa').then((r) => r.json());
  } catch {
    estado.empresa = { ficha: {}, campos: [] };
  }
  const form = $('#form-empresa');
  form.replaceChildren();
  let grupoActual = '';
  const TITULOS = { fiscal: 'Datos fiscales', contacto: 'Contacto', negocio: 'El negocio', notas: 'Conocimiento para los agentes' };
  for (const c of estado.empresa.campos) {
    if (c.grupo !== grupoActual) {
      grupoActual = c.grupo;
      form.append(crearElemento('p', { class: 'form-seccion' }, TITULOS[c.grupo] || c.grupo));
    }
    const campo = crearElemento('div', { class: `campo${c.multilinea || c.grupo === 'notas' ? ' ancho' : ''}` });
    const idCampo = `emp-${c.id}`;
    campo.append(crearElemento('label', { for: idCampo }, c.etiqueta));
    const input = c.multilinea
      ? crearElemento('textarea', { id: idCampo, rows: c.grupo === 'notas' ? '5' : '3', maxlength: String(c.max) })
      : crearElemento('input', { id: idCampo, type: 'text', maxlength: String(c.max), autocomplete: 'off' });
    input.value = estado.empresa.ficha[c.id] || '';
    input.dataset.empresa = c.id;
    campo.append(input);
    form.append(campo);
  }
}

async function guardarEmpresa() {
  const cuerpo = {};
  for (const el of document.querySelectorAll('[data-empresa]')) cuerpo[el.dataset.empresa] = el.value;
  mensaje($('#empresa-mensaje'), 'Guardando…');
  try {
    const res = await fetch('/api/empresa', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const j = await res.json();
    if (!res.ok) return mensaje($('#empresa-mensaje'), j.errores?.[0] || 'No se pudo guardar.', 'error');
    estado.empresa.ficha = j.ficha;
    for (const el of document.querySelectorAll('[data-empresa]')) el.value = j.ficha[el.dataset.empresa] || '';
    mensaje($('#empresa-mensaje'), 'Ficha guardada. Todos los agentes la verán en su próxima orden.', 'ok');
  } catch {
    mensaje($('#empresa-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

// ---------- Bóvedas de notas ----------

async function cargarFuentes() {
  try {
    estado.fuentes = (await fetch('/api/fuentes').then((r) => r.json())).fuentes || [];
  } catch {
    estado.fuentes = [];
  }
  const lista = $('#fuentes-lista');
  lista.replaceChildren();
  if (!estado.fuentes.length) lista.append(crearElemento('li', { class: 'subtitulo' }, 'Sin bóvedas conectadas.'));
  for (const f of estado.fuentes) {
    const li = crearElemento('li', { class: 'fuente' });
    const info = crearElemento('div', { class: 'fuente-info' });
    info.append(crearElemento('strong', {}, f.nombre), crearElemento('small', {}, f.ruta));
    const acciones = crearElemento('div', { class: 'fuente-acciones' });
    const quitar = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Quitar');
    quitar.addEventListener('click', async () => {
      await fetch('/api/fuentes', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ruta: f.ruta }) });
      cargarFuentes();
    });
    acciones.append(quitar);
    li.append(info, acciones);
    lista.append(li);
  }
}

async function agregarFuente() {
  mensaje($('#fuente-mensaje'), 'Verificando carpeta…');
  try {
    const res = await fetch('/api/fuentes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ruta: $('#fuente-ruta').value, nombre: $('#fuente-nombre').value }) });
    const j = await res.json();
    if (!res.ok) return mensaje($('#fuente-mensaje'), j.errores?.[0] || 'No se pudo conectar.', 'error');
    $('#fuente-ruta').value = '';
    $('#fuente-nombre').value = '';
    mensaje($('#fuente-mensaje'), 'Bóveda conectada. Los agentes consultarán sus notas.', 'ok');
    cargarFuentes();
  } catch {
    mensaje($('#fuente-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

let busquedaPendiente = null;
function probarBusqueda() {
  clearTimeout(busquedaPendiente);
  busquedaPendiente = setTimeout(async () => {
    const q = $('#fuente-prueba').value.trim();
    const lista = $('#fuente-resultados');
    lista.replaceChildren();
    if (q.length < 4) return;
    try {
      const { resultados } = await fetch(`/api/fuentes/buscar?q=${encodeURIComponent(q)}`).then((r) => r.json());
      if (!resultados.length) lista.append(crearElemento('li', {}, 'Sin notas relacionadas.'));
      for (const r of resultados) {
        const li = crearElemento('li');
        li.append(crearElemento('strong', {}, `${r.fuente} › ${r.ruta}`), document.createTextNode(r.fragmento));
        lista.append(li);
      }
    } catch { /* la búsqueda de prueba es opcional */ }
  }, 350);
}

// Abre la vista Agentes con el chat de un agente concreto (los de apoyo no tienen detalle en el dashboard).
async function abrirChatDe(id) {
  await prepararAgentes();
  mostrarPestana('hablar');
  const selector = $('#chat-selector');
  selector.value = id;
  chatAgentes?.cargar(id);
  mostrarVista('agentes');
}

async function editarEquipo() {
  await prepararAgentes();
  mostrarPestana('equipo');
  mostrarVista('agentes');
}

// ---------- Identidad ----------

async function subirLogo(file, contenedor) {
  if (!file) return;
  const avisar = (texto) => {
    if (contenedor?.id === 'config-identidad') mensaje($('#identidad-mensaje'), texto, 'error');
    else mostrarErrores([texto]);
  };
  if (!TIPOS_LOGO.includes(file.type)) return avisar('Usa un logotipo en PNG, JPG o WebP');
  if (file.size > LIMITE_LOGO) return avisar('El logotipo supera 2 MB');

  try {
    const res = await fetch('/api/marca/logo', { method: 'POST', headers: { 'content-type': file.type }, body: file });
    const cuerpo = await res.json();
    if (!res.ok) return avisar(cuerpo.error || 'No se pudo guardar el logotipo');
    estado.marca.tieneLogo = true;
    aplicarMarca();
    renderIdentidad(contenedor);
    if (contenedor?.id === 'config-identidad') mensaje($('#identidad-mensaje'), 'Logotipo guardado.', 'ok');
  } catch {
    avisar('No hay conexión con el servidor local.');
  }
}

async function guardarNombre(contenedor) {
  const entrada = contenedor?.querySelector('[data-marca="nombre"]');
  if (!entrada) return;
  const nombre = entrada.value.trim();
  if (nombre === estado.marca.nombre) return;
  const res = await fetch('/api/marca', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nombre }),
  });
  if (res.ok) {
    estado.marca.nombre = nombre;
    aplicarMarca();
  }
}

function aplicarMarca() {
  $('#marca-nombre').textContent = estado.marca.nombre || 'Tu negocio';
  $('#resultado-nombre').textContent = estado.marca.nombre || 'Tu negocio';
  const logo = $('#logo');
  if (estado.marca.tieneLogo) {
    logo.src = `/api/marca/logo?v=${Date.now()}`;
    logo.hidden = false;
  } else {
    logo.hidden = true;
  }
}

// ---------- Borrador ----------

// Guarda lo respondido en data/borrador.json, con una pausa para no escribir en cada tecla.
// Un guardado en vuelo nunca debe llegar después del borrado: antes de borrar se espera al que esté en curso,
// y tras borrar no se guarda más hasta que empiece un diagnóstico nuevo.
let guardadoPendiente = null;
let guardadoEnCurso = Promise.resolve();
let borradorActivo = true;

function programarGuardado() {
  if (!borradorActivo) return;
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(guardarBorrador, 400);
}

function guardarBorrador() {
  if (!borradorActivo) return guardadoEnCurso;
  guardadoEnCurso = fetch('/api/borrador', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ respuestas: estado.respuestas, paso: estado.paso }),
  }).catch(() => {
    // Sin conexión con el servidor local: el borrador se volverá a guardar con la siguiente respuesta.
  });
  return guardadoEnCurso;
}

async function borrarBorrador() {
  clearTimeout(guardadoPendiente);
  borradorActivo = false;
  await guardadoEnCurso;
  try {
    await fetch('/api/borrador', { method: 'DELETE' });
  } catch {
    // Si falla, el borrador queda guardado y se limpiará con el siguiente envío.
  }
}

function activarBorrador() {
  borradorActivo = true;
}

// ---------- Envío del diagnóstico ----------

function payload() {
  const datos = {};
  for (const campo of estado.esquema.campos) {
    if (campo.giros && !campo.giros.includes(estado.respuestas.giro)) continue;
    const valor = (estado.respuestas[campo.id] ?? '').toString().trim();
    if (valor === '') continue;
    datos[campo.id] = campo.tipo === 'numero' || campo.tipo === 'escala' ? Number(valor) : valor;
  }
  return datos;
}

async function enviarDiagnostico() {
  if (estado.enviando) return;
  estado.enviando = true;
  $('#siguiente').disabled = true;
  try {
    const res = await fetch('/api/diagnosticos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload()),
    });
    const cuerpo = await res.json();
    if (!res.ok) return mostrarErrores(cuerpo.errores || ['No se pudo generar el diagnóstico.']);
    await borrarBorrador();
    estado.respuestas = {};
    estado.precargado = null;
    estado.paso = 0;
    activarBorrador();
    await refrescarEstadoIA(); // el giro nuevo puede activar agentes opcionales
    renderResultados({ creado: new Date().toISOString(), ...cuerpo });
    renderLineaResultados(cuerpo.resultado, true);
  } catch {
    mostrarErrores(['No hay conexión con el servidor local.']);
  } finally {
    estado.enviando = false;
    $('#siguiente').disabled = false;
  }
}

// ---------- Resultados: cálculos ----------

function contarColores(distritos) {
  const cuenta = { rojo: 0, amarillo: 0, verde: 0, sin_datos: 0 };
  for (const d of Object.values(distritos)) cuenta[d.color]++;
  return cuenta;
}

// Madurez por área en escala 0 a 5, promedio de las áreas evaluadas.
function madurez(distritos) {
  const puntos = Object.values(distritos).map((d) => PUNTAJE[d.color]).filter((p) => p !== null);
  if (!puntos.length) return 0;
  return Math.round((puntos.reduce((a, b) => a + b, 0) / puntos.length) * 10) / 10;
}

// ---------- Resultados: render ----------

function renderKpis(resultado, cuenta) {
  const evaluadas = cuenta.rojo + cuenta.amarillo + cuenta.verde;
  $('#kpi-evaluadas').textContent = `${evaluadas} / ${Object.keys(resultado.distritos).length}`;
  $('#kpi-acciones').textContent = String(resultado.plan.length);
  const nivel = madurez(resultado.distritos);
  $('#kpi-madurez').replaceChildren(String(nivel), crearElemento('small', {}, ' / 5'));
  const nota = (id, texto) => { const el = $(id); el.textContent = texto; el.hidden = !texto; };
  nota('#kpi-evaluadas-nota', cuenta.rojo ? `${cuenta.rojo} en atención` : cuenta.amarillo ? `${cuenta.amarillo} por revisar` : evaluadas ? 'Todas bien' : '');
  const inmediatas = resultado.plan.filter((p) => p.color === 'rojo').length;
  nota('#kpi-acciones-nota', inmediatas ? `${inmediatas} urgentes` : '');
  nota('#kpi-madurez-nota', !evaluadas ? '' : nivel >= 4 ? 'Sólida' : nivel >= 2.5 ? 'En desarrollo' : 'Frágil');
  pintarDial(nivel);
}

// Dial de madurez sobre la ciudad (0 a 5).
function pintarDial(nivel) {
  $('#dial-valor').textContent = String(nivel);
  $('#dial-arco').setAttribute('stroke-dasharray', `${Math.max(0, Math.min(100, (nivel / 5) * 100)).toFixed(1)} 100`);
}

function renderEstadoArea(cuenta) {
  const bloque = $('#estado-area');
  bloque.replaceChildren(crearElemento('span', { class: 'estado-titulo' }, 'Estado por área:'));
  const items = [['verde', 'Bien'], ['amarillo', 'Revisar'], ['rojo', 'Atención'], ['sin_datos', 'Sin datos']];
  for (const [color, etiqueta] of items) {
    const item = crearElemento('span', { class: 'estado-item' });
    const punto = color === 'sin_datos' ? 'gris' : color;
    item.append(crearElemento('span', { class: `punto ${punto}` }), document.createTextNode(`${etiqueta} (${cuenta[color]})`));
    bloque.append(item);
  }
}

function renderEje(id, eje) {
  $(`#eje-${id}-nivel`).textContent = `${eje.nivel} / ${eje.max}`;
  $(`#eje-${id}-relleno`).style.width = `${(eje.nivel / eje.max) * 100}%`;
  const lista = $(`#eje-${id}-lista`);
  lista.replaceChildren();
  for (const t of eje.logros) lista.append(crearElemento('li', { class: 'logro' }, t));
  for (const t of eje.faltantes) lista.append(crearElemento('li', { class: 'faltante' }, t));
}

function renderMotor(crecimiento) {
  const vacio = { meta: null, bloqueos: [], vertical: { nivel: 0, max: 4, logros: [], faltantes: [] }, horizontal: { nivel: 0, max: 4, logros: [], faltantes: [] } };
  const c = crecimiento || vacio;
  $('#motor-meta').textContent = TEXTO_META[c.meta] || 'Sin respuestas de crecimiento';
  const p = $('#motor-preparado');
  if (!c.meta && c.vertical.nivel === 0 && c.horizontal.nivel === 0) {
    p.textContent = 'Responde la sección «Motor de crecimiento» para ver tu preparación por eje.';
    p.className = 'motor-preparado';
  } else if (c.bloqueos.length) {
    p.textContent = `Antes de crecer: ${c.bloqueos.join(', ')} en atención. Resuelve eso primero.`;
    p.className = 'motor-preparado bloqueado';
  } else {
    p.textContent = 'Base lista para crecer: finanzas, dirección y operaciones fuera de atención.';
    p.className = 'motor-preparado listo';
  }
  renderEje('vertical', c.vertical);
  renderEje('horizontal', c.horizontal);
}

function tarjetaAgente(id, color, etiqueta, alAbrir) {
  const tarjeta = crearElemento('article', { class: `agente-card ${color}`, role: 'button', tabindex: '0', 'aria-label': `Agente de ${etiqueta}` });
  const foto = avatarDe(id);
  const rol = crearElemento('span', { class: 'agente-rol' }, etiqueta);
  const nombre = crearElemento('span', { class: 'agente-nombre' }, nombreAgente(id));
  const con = crearElemento('span', { class: 'agente-con' }, `con ${responsableDe(id)}`);
  const estadoTexto = crearElemento('span', { class: 'agente-estado' }, estadoOperativo(id));
  // Si el agente se llama igual que su área, el nombre no se repite.
  if (nombre.textContent.trim().toLowerCase() === etiqueta.trim().toLowerCase()) nombre.hidden = true;
  tarjeta.append(foto, rol, nombre, con, estadoTexto);
  tarjeta.addEventListener('click', alAbrir);
  tarjeta.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alAbrir(); } });
  return tarjeta;
}

function renderEquipo(distritos) {
  const contenedor = $('#agentes');
  contenedor.replaceChildren();
  for (const id of ORDEN_AREAS) {
    const d = distritos[id];
    if (!d) continue;
    contenedor.append(tarjetaAgente(id, d.color, d.nombre, () => mostrarDetalle(id)));
  }
  for (const id of apoyoActivos()) {
    contenedor.append(tarjetaAgente(id, 'apoyo', NOMBRES_APOYO[id], () => mostrarDetalle(id)));
  }
  for (const id of idsPropios()) {
    contenedor.append(tarjetaAgente(id, 'propio', estado.personalizados.agentes[id].nombre, () => mostrarDetalle(id)));
  }
  const total = ORDEN_AREAS.length + apoyoActivos().length + idsPropios().length;
  $('#equipo-contador').textContent = `${total} agentes`;
  const cuentaMenu = $('#menu-agentes-cuenta');
  cuentaMenu.textContent = String(total);
  cuentaMenu.hidden = false;
  contenedor.append(crearElemento('p', { class: 'equipo-vacio', hidden: '' }, 'Ningún agente en este grupo.'));
  filtrarTarjetasEquipo(contenedor.dataset.filtro || 'todos');
}

// Filtro del equipo en el dashboard: todos, áreas, en atención, apoyo o propios.
function filtrarTarjetasEquipo(filtro) {
  const contenedor = $('#agentes');
  contenedor.dataset.filtro = filtro;
  for (const b of document.querySelectorAll('#equipo-filtros [data-filtro]')) {
    const activo = b.dataset.filtro === filtro;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-pressed', String(activo));
  }
  const visibles = [...contenedor.querySelectorAll('.agente-card')].some((t) => getComputedStyle(t).display !== 'none');
  const vacio = contenedor.querySelector('.equipo-vacio');
  if (vacio) vacio.hidden = visibles;
}

function renderRadar(distritos) {
  const svg = $('#radar');
  svg.replaceChildren();
  const cx = 150;
  const cy = 150;
  const R = 110;
  const angulo = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / ORDEN_AREAS.length;
  const punto = (i, valor) => {
    const r = (valor / 5) * R;
    return { x: cx + Math.cos(angulo(i)) * r, y: cy + Math.sin(angulo(i)) * r };
  };

  for (const nivel of [1, 2, 3, 4, 5]) {
    const pts = ORDEN_AREAS.map((_, i) => punto(i, nivel));
    svg.append(svgEl('polygon', {
      points: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      fill: nivel === 5 ? 'rgba(139,92,246,0.06)' : 'none', stroke: 'rgba(167,139,250,0.24)', 'stroke-width': '1',
    }));
  }

  ORDEN_AREAS.forEach((id, i) => {
    const fin = punto(i, 5);
    svg.append(svgEl('line', { x1: cx, y1: cy, x2: fin.x.toFixed(1), y2: fin.y.toFixed(1), stroke: 'rgba(167,139,250,0.2)' }));
    const etiqueta = punto(i, 5.9);
    const texto = svgEl('text', { x: etiqueta.x.toFixed(1), y: etiqueta.y.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    texto.textContent = distritos[id]?.nombre || id;
    svg.append(texto);
  });

  const datos = ORDEN_AREAS.map((id, i) => punto(i, PUNTAJE[distritos[id]?.color] ?? 0));
  const gradiente = svgEl('linearGradient', { id: 'gradiente-radar', x1: '0', y1: '0', x2: '1', y2: '1' });
  gradiente.append(svgEl('stop', { offset: '0', 'stop-color': '#25e2ff', 'stop-opacity': '0.6' }), svgEl('stop', { offset: '0.6', 'stop-color': '#8b5cf6', 'stop-opacity': '0.55' }), svgEl('stop', { offset: '1', 'stop-color': '#e24bf2', 'stop-opacity': '0.5' }));
  const defs = svgEl('defs');
  defs.append(gradiente);
  svg.append(defs);
  svg.append(svgEl('polygon', {
    points: datos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    fill: 'url(#gradiente-radar)', stroke: '#25e2ff', 'stroke-width': '2', 'stroke-linejoin': 'round',
  }));
  // Cada vértice lleva el color del semáforo de su área.
  const COLOR_PUNTO = { verde: '#2ef0b5', amarillo: '#ffb23e', rojo: '#ff3d8b' };
  ORDEN_AREAS.forEach((id, i) => {
    const color = COLOR_PUNTO[distritos[id]?.color];
    if (color) svg.append(svgEl('circle', { cx: datos[i].x.toFixed(1), cy: datos[i].y.toFixed(1), r: '4', fill: color, stroke: '#0d0930', 'stroke-width': '1.5' }));
  });
}

function renderNivel(distritos) {
  const nivel = madurez(distritos);
  $('#nivel-global').textContent = String(nivel);
  const segmentos = $('#nivel-segmentos');
  segmentos.replaceChildren();
  for (let i = 1; i <= 5; i++) segmentos.append(crearElemento('span', { class: i <= Math.round(nivel) ? 'lleno' : '' }));
}

function renderOportunidades(distritos) {
  const contenedor = $('#oportunidades');
  contenedor.replaceChildren();
  const top = Object.entries(distritos)
    .filter(([, d]) => d.color !== 'sin_datos')
    .sort(([, a], [, b]) => PUNTAJE[a.color] - PUNTAJE[b.color])
    .slice(0, 3);

  if (!top.length) {
    contenedor.append(crearElemento('p', { class: 'subtitulo' }, 'Aún no hay áreas evaluadas.'));
    return;
  }
  for (const [, d] of top) {
    const porcentaje = Math.round((PUNTAJE[d.color] / 5) * 100);
    const fila = crearElemento('div', { class: `oportunidad ${d.color}` });
    const cabecera = crearElemento('div', { class: 'oportunidad-cabecera' });
    cabecera.append(crearElemento('strong', {}, d.nombre), crearElemento('span', {}, `${porcentaje}%`));
    const barra = crearElemento('span', { class: 'oportunidad-barra' });
    const relleno = crearElemento('span', { class: 'oportunidad-relleno' });
    relleno.style.width = `${Math.max(6, porcentaje)}%`;
    barra.append(relleno);
    fila.append(cabecera, barra);
    contenedor.append(fila);
  }
}

async function listarDiagnosticos() {
  try {
    const { diagnosticos } = await fetch('/api/diagnosticos').then((r) => r.json());
    return diagnosticos;
  } catch {
    return [];
  }
}

async function renderHistorial() {
  const lista = $('#historial');
  lista.replaceChildren();
  const diagnosticos = await listarDiagnosticos();
  $('#kpi-guardados').textContent = String(diagnosticos.length);
  if (!diagnosticos.length) {
    lista.append(crearElemento('li', {}, 'Aún no hay diagnósticos guardados.'));
    return;
  }
  for (const d of diagnosticos.slice(0, 4)) {
    const li = crearElemento('li');
    li.append(
      crearElemento('strong', {}, d.nombre || 'Sin nombre'),
      crearElemento('span', { class: 'ok' }, 'Completo'),
      crearElemento('small', {}, `${textoOpcion(d.giro || 'sin_giro')} · ${fechaCorta(d.creado)}`),
    );
    lista.append(li);
  }
}

function renderLineaPasos() {
  const lista = pasos();
  const actual = lista[estado.paso];
  const siguiente = lista[estado.paso + 1];
  $('#linea').replaceChildren(
    elementoLinea({ clase: 'hecho', nombre: 'check', titulo: 'Sesión iniciada', detalle: 'Conectado al diagnóstico', marca: hora(estado.inicio) }),
    elementoLinea({ clase: 'actual', nombre: 'signal', titulo: `Paso ${estado.paso + 1} de ${lista.length}`, badge: 'En curso', detalle: `Respondiendo sección: ${actual.titulo}`, marca: 'Ahora' }),
    elementoLinea({ nombre: 'clock', titulo: 'Siguiente', detalle: siguiente ? `Sección: ${siguiente.titulo}` : 'Generar diagnóstico' }),
  );
}

function renderLineaResultados(resultado, recien = false) {
  $('#linea').replaceChildren(
    elementoLinea({ clase: 'hecho', nombre: 'check', titulo: 'Sesión iniciada', detalle: 'Conectado al diagnóstico', marca: hora(estado.inicio) }),
    elementoLinea({ clase: 'hecho', nombre: 'check', titulo: recien ? 'Diagnóstico generado' : 'Diagnóstico cargado', detalle: `${resultado.prioridad.length} áreas con prioridad`, marca: hora(new Date()) }),
    elementoLinea({ clase: 'actual', nombre: 'signal', titulo: 'Plan listo', detalle: `${resultado.plan.length} acciones con plazo`, badge: 'Revisión' }),
  );
}

function elementoLinea({ clase, nombre, titulo, detalle, marca, badge }) {
  const li = crearElemento('li', { class: clase || '' });
  const nodo = crearElemento('span', { class: 'nodo' });
  nodo.append(icono(nombre));
  const cuerpo = crearElemento('div');
  const encabezado = crearElemento('p', { class: 'linea-titulo' }, titulo);
  if (badge) encabezado.append(crearElemento('span', { class: 'etiqueta-estado' }, badge));
  cuerpo.append(encabezado, crearElemento('p', { class: 'linea-detalle' }, detalle));
  li.append(nodo, cuerpo, crearElemento('span', { class: 'linea-marca' }, marca || ''));
  return li;
}

function renderPlan(plan) {
  const contenedor = $('#plan');
  contenedor.replaceChildren();
  $('#plan-contador').textContent = `${plan.length} ${plan.length === 1 ? 'acción clave' : 'acciones clave'}`;

  if (!plan.length) {
    contenedor.append(crearElemento('p', { class: 'subtitulo' }, 'No hay acciones pendientes con las respuestas actuales.'));
    return;
  }
  const grupos = new Map();
  for (const paso of plan) {
    if (!grupos.has(paso.plazo)) grupos.set(paso.plazo, []);
    grupos.get(paso.plazo).push(paso);
  }
  for (const [plazo, lista] of grupos) {
    const grupo = crearElemento('div', { class: `plan-grupo ${lista[0].color}` });
    const etiqueta = crearElemento('div', { class: 'plan-plazo' });
    etiqueta.append(icono('calendar'), crearElemento('span', {}, plazo));
    const items = crearElemento('div', { class: 'plan-items' });
    for (const p of lista) {
      const item = crearElemento('div', { class: `plan-item${p.cruzado ? ' cruzado' : ''}` });
      const accion = crearElemento('span', { class: 'plan-accion' }, p.accion);
      accion.append(' ', crearElemento('span', { class: 'plan-responsable' }, `→ ${responsableDe(p.distrito)}`));
      const entregables = crearElemento('span', { class: 'plan-entregable' });
      const formato = crearElemento('button', { type: 'button', class: 'atajo', title: 'Descarga el formato en Word para llenarlo con tu equipo (sin IA)' }, 'Formato Word');
      formato.addEventListener('click', () => descargarEntregable(p, false, formato));
      entregables.append(formato);
      if (estado.proveedorIA !== 'ninguno') {
        const redactar = crearElemento('button', { type: 'button', class: 'atajo', title: 'El agente del área lo redacta con los datos de tu empresa. Gasta tokens de tu clave.' }, 'Redactar con IA');
        redactar.addEventListener('click', () => descargarEntregable(p, true, redactar));
        entregables.append(redactar);
      }
      accion.append(entregables);
      item.append(crearElemento('span', { class: `tag-distrito ${p.color}` }, p.nombre), accion);
      items.append(item);
    }
    grupo.append(etiqueta, items);
    contenedor.append(grupo);
  }
}

function renderAnalisis(distritos) {
  const contenedor = $('#distritos');
  contenedor.replaceChildren();
  const ordenados = Object.entries(distritos).sort(([, a], [, b]) => ORDEN_COLOR[a.color] - ORDEN_COLOR[b.color]);
  for (const [id, d] of ordenados) {
    const tarjeta = crearElemento('article', { class: `distrito ${d.color}` });
    const cabecera = crearElemento('div', { class: 'distrito-cabecera' });
    const caja = crearElemento('span', { class: 'distrito-icono icono-campo' });
    caja.append(icono(ICONO_SECCION[id] || 'layers'));
    cabecera.append(caja, crearElemento('h3', {}, d.nombre), crearElemento('span', { class: 'etiqueta-color' }, ETIQUETA_COLOR[d.color]));
    tarjeta.append(cabecera);
    if (d.hallazgos.length) {
      const lista = crearElemento('ul');
      for (const h of d.hallazgos) lista.append(crearElemento('li', {}, h));
      tarjeta.append(lista);
    } else if (d.color === 'sin_datos') {
      tarjeta.append(crearElemento('p', { class: 'sin' }, 'No se respondieron preguntas de esta área.'));
    }
    contenedor.append(tarjeta);
  }
}

function planTexto(plan) {
  if (!plan.length) return 'Sin acciones pendientes.\n';
  return plan.map((p, i) => `${i + 1}. [${p.plazo}] ${p.nombre}: ${p.accion}`).join('\n') + '\n';
}

// Archivos generados en el equipo. Se descargan desde el navegador; nada sale de tu equipo.
function descargar({ nombre, contenido, tipo }) {
  const url = URL.createObjectURL(new Blob([contenido], { type: `${tipo};charset=utf-8` }));
  const enlace = crearElemento('a', { href: url, download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Descarga el documento de Word de una acción del plan: el formato (sin IA) o el borrador que redacta el agente.
async function descargarEntregable(paso, conIA, boton) {
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = conIA ? 'Redactando…' : 'Preparando…';
  try {
    const res = await fetch('/api/plan/entregable', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ distrito: paso.distrito, accion: paso.accion, conIA }) });
    if (!res.ok) {
      const cuerpo = await res.json().catch(() => ({}));
      aviso(cuerpo.errores?.[0] || 'No se pudo generar el documento.', 'error');
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const enlace = crearElemento('a', { href: url, download: `${paso.nombre} - ${paso.accion.slice(0, 50)}.docx`.replace(/[\\/:*?"<>|]/g, '') });
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (conIA) refrescarEstadoIA();
  } catch {
    aviso('No hay conexión con el servidor local.', 'error');
  } finally {
    boton.disabled = false;
    boton.textContent = texto;
  }
}

// ---------- Datos reales: facturas CFDI y CSV de ventas ----------

const pesosMx = (n) => `$${Math.round(n || 0).toLocaleString('es-MX')}`;

function pintarDatosReales(a) {
  $('#reales-resultado').hidden = !a;
  $('#reales-hechos').hidden = !a;
  $('#reales-olvidar').hidden = !a;
  if (!a) return;
  if (a.carpeta && !$('#reales-carpeta').value) $('#reales-carpeta').value = a.carpeta;
  const arch = a.archivos || {};
  $('#reales-periodo').textContent = `Del ${a.periodo.desde} al ${a.periodo.hasta} · ${a.comprobantes} comprobantes (${arch.xml || 0} facturas, ${arch.csv || 0} archivos CSV${arch.ignorados ? `, ${arch.ignorados} archivos que no eran de este tipo` : ''})${arch.truncado ? ' · se leyó hasta el máximo de archivos' : ''} · RFC del negocio: ${a.rfc || 'no identificado'} · analizado el ${fechaCorta(a.momento)}`;
  const kpi = (etiqueta, valor) => {
    const caja = crearElemento('div', { class: 'kpi' });
    const t = crearElemento('div', { class: 'kpi-texto' });
    t.append(crearElemento('span', { class: 'kpi-etiqueta' }, etiqueta), crearElemento('span', { class: 'kpi-valor' }, valor));
    caja.append(t);
    return caja;
  };
  $('#reales-kpis').replaceChildren(
    kpi('Ventas facturadas', pesosMx(a.ventas.total)),
    kpi('Gastos y nómina', pesosMx(a.gastos.total + a.nomina)),
    kpi('Clientes identificados', String(a.ventas.clientes)),
    kpi('Tres clientes principales', `${a.ventas.top3Pct}%`),
    kpi('Venta a crédito', `${a.ventas.creditoPct}%`),
  );
  $('#reales-hallazgos').replaceChildren(...(a.hallazgos.length ? a.hallazgos.map((h) => {
    const li = crearElemento('li', { class: h.color });
    const t = crearElemento('div');
    t.append(crearElemento('strong', {}, `${nombreArea(h.area)} · ${ETIQUETA_COLOR[h.color] || h.color}`), crearElemento('span', {}, h.texto));
    li.append(crearElemento('span', { class: `punto-color ${h.color}` }), t);
    return li;
  }) : [crearElemento('li', {}, 'Con estos archivos no hay suficiente para sacar conclusiones: hacen falta facturas emitidas y recibidas de varios meses.')]));
  const tabla = (id, filas) => $(id).replaceChildren(...(filas.length ? filas.map((f) => {
    const tr = crearElemento('tr');
    tr.append(crearElemento('td', {}, f.nombre), crearElemento('td', { class: 'num' }, pesosMx(f.total)), crearElemento('td', { class: 'num' }, `${f.pct}%`));
    return tr;
  }) : [(() => { const tr = crearElemento('tr'); tr.append(crearElemento('td', {}, 'Sin datos en estos archivos.')); return tr; })()]));
  tabla('#reales-clientes', a.ventas.topClientes);
  tabla('#reales-proveedores', a.gastos.topProveedores);
}

async function cargarDatosReales() {
  try {
    pintarDatosReales((await fetch('/api/datos-reales').then((r) => r.json())).analisis);
  } catch { /* la tarjeta queda sin resultado */ }
}

async function analizarDatosReales() {
  const carpeta = $('#reales-carpeta').value.trim();
  if (!carpeta) return mensaje($('#reales-mensaje'), 'Escribe la ruta de la carpeta.', 'error');
  mensaje($('#reales-mensaje'), 'Leyendo archivos…');
  try {
    const res = await fetch('/api/datos-reales/analizar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ carpeta }) });
    const cuerpo = await res.json();
    if (!res.ok) return mensaje($('#reales-mensaje'), cuerpo.errores?.[0] || 'No se pudo analizar.', 'error');
    pintarDatosReales(cuerpo.analisis);
    mensaje($('#reales-mensaje'), `Listo: ${cuerpo.analisis.comprobantes} comprobantes analizados.`, 'ok');
    renderInforme();
  } catch {
    mensaje($('#reales-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

async function registrarHechosReales() {
  try {
    const cuerpo = await fetch('/api/datos-reales/hechos', { method: 'POST' }).then((r) => r.json());
    mensaje($('#reales-mensaje'), cuerpo.ok ? `${cuerpo.registrados} hechos registrados. Los ves en Agentes › Bitácora.` : (cuerpo.errores?.[0] || 'No se pudo registrar.'), cuerpo.ok ? 'ok' : 'error');
  } catch {
    mensaje($('#reales-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

// ---------- Varias empresas ----------

async function cargarEmpresas() {
  const tarjeta = $('#empresas-card');
  let datos;
  try {
    const res = await fetch('/api/empresas');
    if (!res.ok) { tarjeta.hidden = true; return; }
    datos = await res.json();
  } catch { tarjeta.hidden = true; return; }
  tarjeta.hidden = false;
  $('#empresas-lista').replaceChildren(...datos.lista.map((e) => {
    const li = crearElemento('li', { class: 'fuente' });
    const info = crearElemento('div', { class: 'fuente-info' });
    info.append(crearElemento('strong', {}, e.nombre), crearElemento('small', {}, e.id === 'principal' ? 'Carpeta data/' : `Carpeta data/empresas/${e.id}/`));
    const acciones = crearElemento('div', { class: 'fuente-acciones' });
    if (e.id === datos.activa) acciones.append(crearElemento('span', { class: 'empresa-activa' }, 'Abierta ahora'));
    else {
      const abrir = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Abrir');
      abrir.addEventListener('click', async () => {
        abrir.disabled = true;
        const res = await fetch('/api/empresas/activa', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: e.id }) }).catch(() => null);
        if (res?.ok) window.location.reload();
        else { abrir.disabled = false; mensaje($('#empresas-mensaje'), 'No se pudo cambiar de empresa.', 'error'); }
      });
      acciones.append(abrir);
    }
    li.append(info, acciones);
    return li;
  }));
}

async function crearEmpresaNueva() {
  const nombre = $('#empresa-nueva').value.trim();
  if (!nombre) return mensaje($('#empresas-mensaje'), 'Escribe el nombre de la empresa.', 'error');
  try {
    const res = await fetch('/api/empresas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre }) });
    const cuerpo = await res.json();
    if (!res.ok) return mensaje($('#empresas-mensaje'), cuerpo.errores?.[0] || 'No se pudo crear.', 'error');
    $('#empresa-nueva').value = '';
    mensaje($('#empresas-mensaje'), `"${cuerpo.empresa.nombre}" creada. Ábrela para hacer su diagnóstico.`, 'ok');
    cargarEmpresas();
  } catch {
    mensaje($('#empresas-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

function archivosDelResultado(resp) {
  const fecha = (resp.creado || new Date().toISOString()).slice(0, 10);
  return [
    { nombre: `datos-diagnostico-${fecha}.json`, contenido: JSON.stringify(resp.resultado, null, 2), tipo: 'application/json' },
    { nombre: `plan-de-accion-${fecha}.txt`, contenido: planTexto(resp.resultado.plan), tipo: 'text/plain' },
  ];
}

// Reportes para personas: Word se descarga; PDF abre la página imprimible (Imprimir → Guardar como PDF).
function descargarWord(id) {
  if (!id) return;
  const enlace = crearElemento('a', { href: `/api/diagnosticos/${encodeURIComponent(id)}/reporte.docx`, download: '' });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
}

function abrirPdf(id) {
  if (!id) return;
  window.open(`/api/diagnosticos/${encodeURIComponent(id)}/reporte.html`, '_blank', 'noopener');
}

function renderBandeja(resp) {
  const lista = $('#bandeja');
  lista.replaceChildren();
  $('#bandeja-card').hidden = false;
  const fecha = (resp.creado || new Date().toISOString()).slice(0, 10);
  const items = [
    { texto: `Reporte en Word: diagnostico-${fecha}.docx`, accion: () => descargarWord(resp.id) },
    { texto: 'Reporte en PDF (se abre para imprimir o guardar)', accion: () => abrirPdf(resp.id) },
    ...archivosDelResultado(resp).map((a) => ({ texto: `${a.nombre} (datos técnicos)`, accion: () => descargar(a) })),
  ];
  for (const item of items) {
    const li = crearElemento('li');
    const boton = crearElemento('button', { class: 'archivo-item', type: 'button' });
    boton.append(icono('doc'), crearElemento('span', {}, item.texto));
    boton.addEventListener('click', item.accion);
    li.append(boton);
    lista.append(li);
  }
}

// Pinta un diagnóstico (recién generado o cargado del historial) en el dashboard.
function renderResultados(resp, { scroll = true } = {}) {
  const { resultado, resumenIA } = resp;
  const cuenta = contarColores(resultado.distritos);
  estado.ultimo = resp;

  $('#resultado-fecha').textContent = `Generado el ${fechaLarga(resp.creado)}`;
  const prio = resultado.prioridad.map((id) => resultado.distritos[id].nombre);
  $('#prioridades').textContent = prio.length ? `Atender primero: ${prio.join(', ')}.` : 'Sin prioridades críticas con las respuestas actuales.';

  cerrarSimulador({ repintar: false });
  renderKpis(resultado, cuenta);
  renderOficina($('#oficina'), resultado, { onSeleccion: alElegirEnCiudad });
  renderEstadoArea(cuenta);
  cerrarDetalle();
  renderMotor(resultado.crecimiento);
  renderEquipo(resultado.distritos);
  renderRadar(resultado.distritos);
  renderNivel(resultado.distritos);
  renderOportunidades(resultado.distritos);
  renderHistorial();
  renderAvance();
  renderPlan(resultado.plan);
  renderAnalisis(resultado.distritos);
  renderBandeja(resp);

  const bloqueIA = $('#resumen-ia');
  if (resumenIA) {
    bloqueIA.hidden = false;
    bloqueIA.replaceChildren(crearElemento('h3', {}, `Plan sugerido (${NOMBRE_PROVEEDOR[resumenIA.proveedor] || resumenIA.proveedor})`), (() => { const p = crearElemento('p'); p.append(...conNegritas(resumenIA.texto || resumenIA.error || 'Sin respuesta.')); return p; })());
  } else {
    bloqueIA.hidden = true;
  }

  aplicarMarca();
  renderLineaResultados(resultado);
  mostrarVista('dashboard', { scroll });
}

// ---------- Ciudad: cámara y simulador de escenarios ----------

// Clic en la ciudad: un edificio abre su área; el núcleo de la plaza lleva al Orquestador.
function alElegirEnCiudad(id) {
  if (id === 'orquestador') return irASeccionAgentes('orquestador');
  return mostrarDetalle(id);
}

function prepararControlesCiudad() {
  const barra = $('.hud-camaras');
  barra.addEventListener('click', (e) => {
    const boton = e.target.closest('button');
    if (!boton) return;
    if (boton.dataset.camara) {
      vistaCamara(boton.dataset.camara);
      for (const b of barra.querySelectorAll('[data-camara]')) {
        const activo = b === boton;
        b.classList.toggle('activo', activo);
        b.setAttribute('aria-pressed', String(activo));
      }
    } else if (boton.dataset.modo) {
      const encender = boton.getAttribute('aria-pressed') !== 'true';
      const quedo = boton.dataset.modo === 'orbita' ? orbita(encender) : (rayosX(encender), encender);
      boton.setAttribute('aria-pressed', String(quedo));
      if (boton.dataset.modo === 'orbita' && encender && !quedo) aviso('Tu sistema pide menos movimiento: la órbita queda apagada.');
    } else if (boton.dataset.zoom) {
      acercar(Number(boton.dataset.zoom));
    }
  });
  $('#simular').addEventListener('click', () => ($('#simulador').hidden ? abrirSimulador() : cerrarSimulador()));
  $('#sim-cerrar').addEventListener('click', () => cerrarSimulador());
  $('.sim-atajos').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-escenario]');
    if (boton) aplicarEscenario(boton.dataset.escenario);
  });
  $('#equipo-filtros').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-filtro]');
    if (boton) filtrarTarjetasEquipo(boton.dataset.filtro);
  });
}

// El simulador cambia el color de las áreas solo en pantalla: recalcula la madurez con la misma
// fórmula del dashboard y vuelve a levantar la ciudad. Nunca toca el diagnóstico guardado.
const SUBE_UN_NIVEL = { rojo: 'amarillo', amarillo: 'verde', verde: 'verde', sin_datos: 'sin_datos' };
let simulacion = null; // { [idArea]: color }

function distritosSimulados() {
  const reales = estado.ultimo.resultado.distritos;
  const copia = {};
  for (const [id, d] of Object.entries(reales)) copia[id] = { ...d, color: simulacion?.[id] || d.color };
  return copia;
}

function abrirSimulador() {
  if (!estado.ultimo) return;
  simulacion = {};
  $('#simulador').hidden = false;
  $('#escenario').classList.add('simulando');
  $('#simular').setAttribute('aria-expanded', 'true');
  pintarSimulador();
  $('#sim-cerrar').focus({ preventScroll: true });
}

function cerrarSimulador({ repintar = true } = {}) {
  const habia = simulacion && Object.keys(simulacion).length > 0;
  simulacion = null;
  $('#simulador').hidden = true;
  $('#sim-aviso').hidden = true;
  $('#escenario').classList.remove('simulando');
  $('#simular').setAttribute('aria-expanded', 'false');
  if (!repintar || !estado.ultimo) return;
  const { resultado } = estado.ultimo;
  if (habia) renderOficina($('#oficina'), resultado, { onSeleccion: alElegirEnCiudad });
  renderEstadoArea(contarColores(resultado.distritos));
  pintarDial(madurez(resultado.distritos));
}

function aplicarEscenario(nombre) {
  if (!estado.ultimo) return;
  const { distritos, plan } = estado.ultimo.resultado;
  simulacion = {};
  for (const [id, d] of Object.entries(distritos)) {
    if (nombre === 'criticos' && d.color === 'rojo') simulacion[id] = 'amarillo';
    if (nombre === 'plan' && plan.some((p) => p.distrito === id)) simulacion[id] = SUBE_UN_NIVEL[d.color];
    if (nombre === 'todo' && d.color !== 'sin_datos') simulacion[id] = 'verde';
    if (simulacion[id] === d.color) delete simulacion[id];
  }
  pintarSimulador();
}

function pintarSimulador() {
  const reales = estado.ultimo.resultado.distritos;
  const simulados = distritosSimulados();
  const lista = $('#sim-areas');
  lista.replaceChildren();
  for (const id of ORDEN_AREAS) {
    const real = reales[id];
    if (!real) continue;
    const li = crearElemento('li', { class: simulados[id].color !== real.color ? 'cambio' : '' });
    const grupo = crearElemento('span', { class: 'sim-semaforo', role: 'group', 'aria-label': `Estado simulado de ${real.nombre}` });
    for (const color of ['rojo', 'amarillo', 'verde']) {
      const b = crearElemento('button', { type: 'button', 'data-color': color, 'aria-pressed': String(simulados[id].color === color), 'aria-label': ETIQUETA_COLOR[color], title: ETIQUETA_COLOR[color] });
      b.addEventListener('click', () => {
        if (color === real.color) delete simulacion[id];
        else simulacion[id] = color;
        pintarSimulador();
      });
      grupo.append(b);
    }
    li.append(crearElemento('span', {}, real.nombre), grupo);
    lista.append(li);
  }

  const antes = madurez(reales);
  const despues = madurez(simulados);
  const cambios = Object.keys(simulacion).length;
  $('#sim-antes').textContent = String(antes);
  $('#sim-despues').textContent = String(despues);
  const delta = Math.round((despues - antes) * 10) / 10;
  const p = $('#sim-delta');
  p.className = delta > 0 ? 'sube' : delta < 0 ? 'baja' : '';
  p.textContent = !cambios ? 'Elige un escenario o cambia el color de un área.'
    : `${delta > 0 ? '+' : ''}${delta} de madurez con ${cambios} ${cambios === 1 ? 'área distinta' : 'áreas distintas'}.`;
  $('#sim-aviso').hidden = !cambios;
  renderOficina($('#oficina'), { ...estado.ultimo.resultado, distritos: simulados }, { onSeleccion: alElegirEnCiudad });
  renderEstadoArea(contarColores(simulados));
  pintarDial(despues);
}

// ---------- Red de agentes ----------

const NOMBRE_ESTADO_RED = { trabajando: 'Trabajando', activo: 'Activos', bloqueado: 'Bloqueados', sin_actividad: 'Sin actividad' };

async function cargarRed() {
  let jer;
  let sit;
  try {
    [jer, sit] = await Promise.all([fetch('/api/jerarquia').then((r) => r.json()), fetch('/api/situacion').then((r) => r.json())]);
  } catch {
    $('#red-resumen').textContent = 'No se pudo leer la red de agentes.';
    return;
  }
  estado.subagentes = jer.subagentes || {};
  estado.tipos = jer.tipos || {};
  const porAgente = new Map((sit.agentes || []).map((a) => [a.id, a]));
  const enCurso = new Set([...trabajosEnCurso.values()].map((t) => t.area));
  const estadoDe = (id) => (enCurso.has(id) ? 'trabajando' : porAgente.get(id)?.estado === 'inactivo' ? 'sin_actividad' : porAgente.get(id)?.estado || 'sin_actividad');
  const distritos = estado.ultimo?.resultado?.distritos || {};

  pintarRed($('#red'), jer.arbol, {
    nombre: (id) => (id === 'orquestador' ? 'Orquestador' : nombreArea(id)),
    avatar: (id) => AREAS_ASSETS[id]?.avatar || estado.personalizados.agentes[id]?.avatar || '',
    estado: estadoDe,
    semaforo: (id) => distritos[id]?.color || null,
    alElegir: alElegirEnCiudad,
  });

  const r = sit.resumen || {};
  const cuenta = { trabajando: enCurso.size || r.trabajando || 0, activo: r.activo || 0, bloqueado: r.bloqueado || 0, sin_actividad: (r.sin_actividad || 0) + (r.inactivo || 0) };
  const total = (sit.agentes || []).length;
  $('#red-resumen').textContent = `${total} agentes coordinados por el Orquestador. Se arma con reglas, sin gastar IA.`;
  const TONO = { trabajando: 'var(--cian)', activo: 'var(--verde)', bloqueado: 'var(--rojo)', sin_actividad: 'var(--gris)' };
  $('#red-conteo').replaceChildren(...Object.keys(NOMBRE_ESTADO_RED).map((k) => {
    const caja = crearElemento('div', { style: `--tono: ${TONO[k]}` });
    caja.append(crearElemento('strong', {}, String(cuenta[k])), crearElemento('span', {}, NOMBRE_ESTADO_RED[k]));
    return caja;
  }));

  const fila = (a, detalle) => {
    const li = crearElemento('li', { class: 'pulsable', tabindex: '0', role: 'button' });
    li.append(crearElemento('strong', {}, a.nombre), crearElemento('small', {}, detalle));
    const abrir = () => alElegirEnCiudad(a.id);
    li.addEventListener('click', abrir);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } });
    return li;
  };
  const atencion = (sit.agentes || []).filter((a) => a.estado === 'bloqueado' || a.acciones?.vencidas || a.pendientes);
  $('#red-atencion').replaceChildren(...(atencion.length
    ? atencion.slice(0, 6).map((a) => fila(a, a.estado === 'bloqueado' ? (a.ultimaRespuesta?.resumen || 'Bloqueado') : a.acciones?.vencidas ? `${a.acciones.vencidas} acciones vencidas` : `${a.pendientes} órdenes pendientes sin IA`))
    : [crearElemento('li', { class: 'vacio' }, 'Nadie está bloqueado ni tiene acciones vencidas.')]));
  const recientes = (sit.agentes || []).filter((a) => a.ultimaActividad).sort((a, b) => String(b.ultimaActividad).localeCompare(String(a.ultimaActividad))).slice(0, 5);
  $('#red-reciente').replaceChildren(...(recientes.length
    ? recientes.map((a) => fila(a, `${fechaCorta(a.ultimaActividad)} ${horaCorta(a.ultimaActividad)}${a.ultimaRespuesta?.resumen ? ` · ${a.ultimaRespuesta.resumen}` : ''}`))
    : [crearElemento('li', { class: 'vacio' }, 'Todavía no hay movimiento. Dale una orden a un agente.')]));
}

// ---------- Conversación con los agentes ----------

function horaCorta(iso) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// Un chat por sección. El área se fija con cargar(area); el orquestador la trae en su data-area.
function crearChat(seccion) {
  const lista = seccion.querySelector('.chat-lista');
  const form = seccion.querySelector('.chat-form');
  const texto = seccion.querySelector('.chat-texto');
  const boton = form.querySelector('button');
  const nota = seccion.querySelector('.chat-nota');
  const titulo = seccion.querySelector('.chat-titulo');
  let area = seccion.dataset.area || '';

  const esOrquestador = () => area === 'orquestador';
  const agente = () => (esOrquestador() ? 'el Orquestador' : nombreAgente(area));
  let notasUsadas = seccion.querySelector('.chat-notas');
  if (!notasUsadas) {
    notasUsadas = crearElemento('p', { class: 'chat-notas' });
    seccion.querySelector('.chat-cabecera').append(notasUsadas);
  }
  // Perfil del agente (rol y especialidad) y atajos que llenan la caja de texto.
  const perfil = crearElemento('div', { class: 'chat-perfil' });
  const atajos = crearElemento('div', { class: 'chat-atajos' });
  seccion.querySelector('.chat-cabecera').append(perfil, atajos);

  function pintarPerfil() {
    perfil.replaceChildren();
    atajos.replaceChildren();
    const h = estado.habilidades?.[area];
    const foto = avatarDe(area, 'agente-foto chica');
    const texto = crearElemento('div');
    texto.append(crearElemento('strong', {}, h?.rol || (esOrquestador() ? 'Coordina a todos los agentes' : 'Agente')));
    if (h?.especialidad) texto.append(crearElemento('span', {}, h.especialidad));
    perfil.append(foto, texto);
    const sugerencias = esOrquestador()
      ? ['¿Qué está haciendo cada agente?', '¿Qué atiendo primero esta semana?', 'Reparte este objetivo entre los agentes: ', 'Resume cómo va el negocio']
      : ['¿Qué atiendo primero en tu área?', 'Evalúa esta idea: ', 'Explícame: ', ...(h?.pregunta_primero?.length ? [`Te respondo lo que preguntas primero: ${h.pregunta_primero[0]} `] : [])];
    for (const s of sugerencias.slice(0, 4)) {
      const b = crearElemento('button', { type: 'button', class: 'atajo' }, s.replace(/^Te respondo lo que preguntas primero: /, 'Responder: ').slice(0, 70));
      b.addEventListener('click', () => { texto_.value = s; texto_.focus(); texto_.setSelectionRange(s.length, s.length); });
      atajos.append(b);
    }
  }
  const texto_ = texto;

  // Traza de coordinación bajo la conversación: con quién habló el agente, qué le dijeron y qué buscó en internet.
  const traza = crearElemento('details', { class: 'traza' });
  seccion.append(traza);
  function pintarTraza(j) {
    traza.replaceChildren();
    const inter = (j.intercambios || []).filter((i) => i.destino || i.destinoTexto);
    const bus = j.busquedas || [];
    if (!inter.length && !bus.length) { traza.hidden = true; return; }
    traza.hidden = false;
    traza.open = true;
    traza.append(crearElemento('summary', {}, `Cómo trabajó ${agente()}: ${inter.length ? `${inter.length} intercambio(s) con otros agentes` : ''}${inter.length && bus.length ? ' · ' : ''}${bus.length ? `${bus.length} búsqueda(s) en internet` : ''}`));
    const ul = crearElemento('ul');
    for (const i of inter) {
      const li = crearElemento('li');
      const tipo = i.tipo === 'DELEGAR' ? 'Encargó a' : i.tipo === 'INFORMAR' ? 'Informó a' : 'Consultó a';
      li.append(crearElemento('strong', {}, `${tipo} ${i.nombreDestino || i.destinoTexto}: `), crearElemento('span', {}, i.texto));
      if (i.respuesta) li.append(crearElemento('small', {}, `→ ${i.respuesta.slice(0, 280)}${i.respuesta.length > 280 ? '…' : ''}`));
      else if (i.error) li.append(crearElemento('small', { class: 'error' }, `→ sin respuesta: ${i.error}`));
      ul.append(li);
    }
    for (const b of bus) {
      const li = crearElemento('li');
      li.append(crearElemento('strong', {}, 'Buscó: '), crearElemento('span', {}, `"${b.consulta}"`));
      if (b.fuentes?.length) li.append(crearElemento('small', {}, `Fuentes: ${b.fuentes.map((f) => f.titulo || f.url).join('; ')}`));
      ul.append(li);
    }
    traza.append(ul);
  }
  // Si no hay responsable asignado, el responsable es quien escribe: "para ti", no "para Tú".
  const responsable = () => {
    const r = esOrquestador() ? responsableDe('direccion') : responsableDe(area);
    return r === 'Tú' ? 'ti' : r;
  };

  function actualizarNota(error) {
    if (error) {
      nota.textContent = error;
      nota.classList.add('error');
      return;
    }
    nota.classList.remove('error');
    nota.textContent = estado.proveedorIA === 'ninguno'
      ? `Sin IA configurada: tus órdenes quedan registradas como pendientes para ${responsable()}. Para que ${agente()} responda, activa un proveedor en Configuración.`
      : `Con IA activa, lo que escribas y el contexto de esta área salen de tu equipo hacia ${NOMBRE_PROVEEDOR[estado.proveedorIA] || estado.proveedorIA}.`;
  }

  function render(mensajes) {
    lista.replaceChildren();
    if (!mensajes.length) {
      lista.append(crearElemento('li', { class: 'chat-vacio' }, `Todavía no has hablado con ${agente()}.`));
      return;
    }
    for (const m of mensajes) {
      const li = crearElemento('li', { class: `chat-msg ${m.rol}${m.pendiente ? ' pendiente' : ''}` });
      const quien = m.origen === 'rutina' ? 'Rutina automática' : m.origen === 'piloto' ? 'Piloto automático' : m.origen === 'agente' ? 'Otro agente' : m.origen === 'sistema' ? 'La oficina' : 'Tú';
      const autor = m.rol === 'agente' ? (m.reglas ? `${agente()} · por reglas, sin IA` : agente()) : (m.pendiente ? `${quien} · pendiente para ${responsable()}` : quien);
      const autorEl = crearElemento('span', { class: 'chat-autor' }, autor);
      // El clasificador marca qué dio el usuario: un hecho de la empresa, una idea o una pregunta de concepto.
      if (m.rol === 'usuario' && m.tipo && m.tipo !== 'orden') autorEl.append(' ', crearElemento('span', { class: `chip-tipo ${m.tipo}` }, ETIQUETA_TIPO[m.tipo]));
      const cuerpo = crearElemento('p', { class: 'chat-cuerpo' });
      cuerpo.append(...conNegritas(m.texto));
      li.append(autorEl, cuerpo, crearElemento('span', { class: 'chat-hora' }, horaCorta(m.momento)));
      lista.append(li);
    }
    lista.scrollTop = lista.scrollHeight;
  }

  async function cargar(nuevaArea) {
    if (nuevaArea) {
      area = nuevaArea;
      seccion.dataset.area = area;
    }
    if (!area) return;
    titulo.textContent = `Habla con ${agente()}`;
    actualizarNota();
    pintarPerfil();
    try {
      const { mensajes } = await fetch(`/api/agentes/${area}/mensajes`).then((r) => r.json());
      render(mensajes);
    } catch {
      render([]);
    }
  }

  async function enviar() {
    const orden = texto.value.trim();
    if (!orden || !area) return;
    boton.disabled = true;
    texto.disabled = true;
    actualizarNota();
    try {
      const res = await fetch(`/api/agentes/${area}/mensajes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: orden }) });
      const j = await res.json();
      if (j.mensajes) render(j.mensajes);
      const partes = [];
      if (j.notas?.length) partes.push(`Consultó notas: ${j.notas.map((n) => n.titulo).join(', ')}.`);
      if (j.intercambios?.length) partes.push(`Se coordinó con ${j.intercambios.filter((i) => i.respuesta || i.nota).map((i) => i.nombreDestino || i.destinoTexto).join(', ')}.`);
      if (j.busquedas?.length) partes.push(`Buscó en internet: ${j.busquedas.map((b) => `"${b.consulta}"`).join(', ')}.`);
      if (j.pendiente && j.motivo) partes.push(j.motivo);
      if (j.reglas) partes.push('Respondido con reglas, al instante y sin gastar tokens.');
      pintarTraza(j);
      if (j.sugerenciaRutina) {
        partes.push(`Has pedido esto ${j.sugerenciaRutina.veces} veces: puedes automatizarlo en Agentes › Rutinas.`);
        aviso(`Orden repetida ${j.sugerenciaRutina.veces} veces: te sugerí una rutina en Agentes › Rutinas.`, 'ok');
        cargarRutinas();
      }
      notasUsadas.textContent = partes.join(' ');
      if (j.uso) { estado.uso = j.uso; actualizarEncabezadoIA(); }
      if (!res.ok) actualizarNota(j.errores?.[0] || 'No se pudo enviar la orden.');
      else texto.value = '';
    } catch {
      actualizarNota('No hay conexión con el servidor local.');
    } finally {
      boton.disabled = false;
      texto.disabled = false;
      texto.focus();
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
  texto.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); }
  });

  return { cargar, refrescarNota: () => { if (area) actualizarNota(); } };
}

let chatArea = null;
let chatAgentes = null;
let chatOrquestador = null;

// ---------- Detalle de un área ----------

// Estado operativo del agente. Es independiente del estado empresarial (semáforo).
function estadoOperativo(id) {
  if (esApoyo(id) || esPropio(id)) return 'Disponible';
  const resultado = estado.ultimo?.resultado;
  if (!resultado) return 'Sin datos';
  const d = resultado.distritos[id];
  if (!d || d.color === 'sin_datos') return 'Sin datos';
  return resultado.plan.some((p) => p.distrito === id) ? 'Esperando aprobación' : 'Listo';
}

// Panel lateral del agente seleccionado (área, apoyo o propio): perfil, estado, hallazgos, acciones y chat, sin salir del dashboard.
async function mostrarDetalle(id) {
  const resultado = estado.ultimo?.resultado;
  const d = resultado?.distritos?.[id];
  if (!d) return mostrarDetalleAgente(id);
  seleccionarArea(id);

  $('#detalle-etiqueta').textContent = 'Área seleccionada';
  $('#detalle-titulo').textContent = d.nombre;
  const estadoEl = $('#detalle-estado');
  estadoEl.textContent = `Estado del área: ${ETIQUETA_COLOR[d.color]}`;
  estadoEl.className = `detalle-estado ${d.color}`;
  $('#detalle-agente').textContent = `Responsable: ${responsableDe(id)} · Agente: ${nombreAgente(id)} (${estadoOperativo(id)})`;
  const h = estado.habilidades?.[id];
  $('#detalle-rol').textContent = h ? `${h.rol}. ${h.especialidad}` : '';
  $('#detalle-foto').src = AREAS_ASSETS[id]?.avatar || '';
  $('#detalle-h-hallazgos').textContent = 'Hallazgos';
  $('#detalle-h-acciones').textContent = 'Acciones del plan';

  const hallazgos = $('#detalle-hallazgos');
  hallazgos.replaceChildren();
  if (!d.hallazgos.length) hallazgos.append(crearElemento('li', {}, 'Sin hallazgos registrados.'));
  for (const h of d.hallazgos) hallazgos.append(crearElemento('li', {}, h));

  const acciones = $('#detalle-acciones');
  acciones.replaceChildren();
  const del = resultado.plan.filter((p) => p.distrito === id);
  if (!del.length) acciones.append(crearElemento('li', {}, 'No hay acciones pendientes en esta área.'));
  for (const p of del) acciones.append(crearElemento('li', {}, `${p.plazo}: ${p.accion}`));

  abrirCajon(id);
}

// Agentes de apoyo y propios: no tienen semáforo; el panel muestra su posición, su perfil y sus acciones abiertas en la bitácora.
async function mostrarDetalleAgente(id) {
  if (!estado.tipos) await cargarJerarquia(); // en el dashboard aún no se ha visitado Agentes
  const h = estado.habilidades?.[id];
  const tipo = estado.tipos?.[id] || (esPropio(id) ? 'propio' : 'subagente');
  $('#detalle-etiqueta').textContent = { staff: 'Staff del Orquestador', subagente: 'Subagente', propio: 'Agente propio' }[tipo] || 'Agente';
  $('#detalle-titulo').textContent = nombreArea(id);
  const estadoEl = $('#detalle-estado');
  const jefe = Object.entries(estado.subagentes || {}).find(([, lista]) => lista.includes(id))?.[0];
  estadoEl.textContent = jefe ? `Depende de ${jefe === 'orquestador' ? 'el Orquestador' : nombreArea(jefe)}` : 'Reporta al Orquestador';
  estadoEl.className = 'detalle-estado apoyo';
  $('#detalle-agente').textContent = `Responsable: ${responsableDe(id)} · Agente: ${nombreAgente(id)} (${estadoOperativo(id)})`;
  $('#detalle-rol').textContent = h ? `${h.rol}. ${h.especialidad}` : '';
  const foto = $('#detalle-foto');
  foto.src = AREAS_ASSETS[id]?.avatar || estado.personalizados?.agentes?.[id]?.avatar || '';
  $('#detalle-h-hallazgos').textContent = 'Qué pregunta primero';
  const hallazgos = $('#detalle-hallazgos');
  hallazgos.replaceChildren(...((h?.pregunta_primero || []).map((p) => crearElemento('li', {}, p))));
  if (!hallazgos.children.length) hallazgos.append(crearElemento('li', {}, 'Sin preguntas definidas.'));
  $('#detalle-h-acciones').textContent = 'Acciones abiertas en la bitácora';
  const acciones = $('#detalle-acciones');
  acciones.replaceChildren(crearElemento('li', {}, 'Cargando…'));
  abrirCajon(id);
  try {
    const mem = await fetch('/api/memoria').then((r) => r.json());
    const mias = mem.acciones.filter((a) => a.area === id && a.estado === 'pendiente').slice(0, 8);
    acciones.replaceChildren(...(mias.length ? mias.map((a) => crearElemento('li', {}, `${a.texto}${a.vence ? ` (vence ${a.vence})` : ''}`)) : [crearElemento('li', {}, 'Sin acciones abiertas.')]));
  } catch {
    acciones.replaceChildren(crearElemento('li', {}, 'No se pudo leer la bitácora.'));
  }
}

function abrirCajon(id) {
  $('#detalle').hidden = false;
  $('#detalle-fondo').hidden = false;
  document.body.classList.add('con-cajon');
  chatArea?.cargar(id);
  $('#detalle').scrollTop = 0;
  $('#detalle-cerrar').focus({ preventScroll: true });
}

function cerrarDetalle() {
  $('#detalle').hidden = true;
  $('#detalle-fondo').hidden = true;
  document.body.classList.remove('con-cajon');
}

// ---------- Reportes ----------

async function cargarReportes() {
  cargarPasaporte();
  const lista = $('#reportes-lista');
  lista.replaceChildren();
  const diagnosticos = await listarDiagnosticos();
  if (!diagnosticos.length) {
    lista.append(crearElemento('li', { class: 'subtitulo' }, 'Aún no hay diagnósticos guardados.'));
    return;
  }
  for (const d of diagnosticos) {
    const li = crearElemento('li', { class: 'reporte' });
    const info = crearElemento('div', { class: 'reporte-info' });
    info.append(crearElemento('strong', {}, d.nombre || 'Sin nombre'), crearElemento('small', {}, `${textoOpcion(d.giro || 'sin_giro')} · ${fechaCorta(d.creado)}`));
    const acciones = crearElemento('div', { class: 'reporte-acciones' });
    const ver = crearElemento('button', { class: 'boton compacto', type: 'button' }, 'Ver en el dashboard');
    ver.addEventListener('click', () => abrirDiagnostico(d.id));
    const word = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Word');
    word.addEventListener('click', () => descargarWord(d.id));
    const pdf = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'PDF');
    pdf.addEventListener('click', () => abrirPdf(d.id));
    const datos = crearElemento('button', { class: 'boton secundario compacto', type: 'button' }, 'Datos');
    datos.addEventListener('click', () => descargarDiagnostico(d.id, 0));
    const borrar = crearElemento('button', { class: 'boton secundario compacto peligro', type: 'button' }, 'Borrar');
    borrar.addEventListener('click', () => {
      if (!borrar.classList.contains('confirmar')) {
        borrar.classList.add('confirmar');
        borrar.textContent = '¿Borrar para siempre?';
        setTimeout(() => { borrar.classList.remove('confirmar'); borrar.textContent = 'Borrar'; }, 4000);
        return;
      }
      borrarDiagnostico(d.id);
    });
    acciones.append(ver, word, pdf, datos, borrar);
    li.append(info, acciones);
    lista.append(li);
  }
}

// ---------- Pasaporte de madurez ----------

async function cargarPasaporte() {
  const tarjeta = $('#pasaporte-card');
  const cifras = $('#pasaporte-cifras').checked;
  let p = null;
  try {
    const res = await fetch(`/api/pasaporte${cifras ? '?cifras=1' : ''}`);
    p = res.ok ? (await res.json()).pasaporte : null;
  } catch { p = null; }
  tarjeta.hidden = !p;
  if (!p) return;
  $('#pasaporte-valor').textContent = String(p.madurez.valor);
  $('#pasaporte-nivel').textContent = `${p.madurez.nivel} · de 5`;
  const dato = (titulo, texto) => { const li = crearElemento('li'); li.append(crearElemento('strong', {}, `${titulo}: `), document.createTextNode(texto)); return li; };
  const f = p.facturas;
  $('#pasaporte-datos').replaceChildren(
    dato('Tendencia', p.madurez.tendencia.texto),
    dato('Historial', p.historial.diagnosticos > 1 ? `${p.historial.diagnosticos} diagnósticos en ${p.historial.dias === 1 ? '1 día' : `${p.historial.dias} días`}` : 'un diagnóstico; con el segundo se verá la tendencia'),
    dato('Áreas', `${p.resumenAreas.bien} bien, ${p.resumenAreas.revisar} por revisar, ${p.resumenAreas.atencion} en atención`),
    dato('Facturas', f ? `${f.comprobantes} comprobantes del ${f.desde} al ${f.hasta}${cifras ? ` · ventas ${pesosMx(f.ventas)}` : ''}` : 'sin analizar; hazlo en Configuración › Datos reales para que el pasaporte tenga respaldo'),
    dato('Folio', p.folio),
  );
  if (p.historial.diasDesdeUltimo > 120) $('#pasaporte-datos').append(dato('Aviso', `el último diagnóstico tiene ${p.historial.diasDesdeUltimo} días; actualízalo antes de entregarlo`));
  const sufijo = cifras ? '?cifras=1' : '';
  $('#pasaporte-word').href = `/api/pasaporte/reporte.docx${sufijo}`;
  $('#pasaporte-pdf').href = `/api/pasaporte/reporte.html${sufijo}`;
}

async function verificarPasaporte() {
  const huella = $('#pasaporte-huella').value.trim();
  if (!huella) return mensaje($('#pasaporte-mensaje'), 'Escribe el folio o la huella.', 'error');
  try {
    const r = await fetch(`/api/pasaporte/verificar?huella=${encodeURIComponent(huella)}`).then((x) => x.json());
    if (r.coincide) mensaje($('#pasaporte-mensaje'), `Coincide con tus datos actuales (versión ${r.conCifras ? 'con' : 'sin'} montos).`, 'ok');
    else mensaje($('#pasaporte-mensaje'), 'No coincide: el documento fue alterado o tus datos cambiaron desde que lo emitiste.', 'error');
  } catch {
    mensaje($('#pasaporte-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

// Quita un diagnóstico del historial. Si era el que está en pantalla, el dashboard pasa al más reciente que quede.
async function borrarDiagnostico(id) {
  try {
    const res = await fetch(`/api/diagnosticos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('no se pudo');
  } catch {
    aviso('No se pudo borrar el diagnóstico.', 'error');
    return;
  }
  aviso('Diagnóstico borrado.', 'ok');
  const [reciente] = await listarDiagnosticos();
  if (estado.ultimo?.id === id || !reciente) {
    estado.ultimo = null;
    if (reciente) {
      try { renderResultados(await obtenerDiagnostico(reciente.id), { scroll: false }); } catch { /* queda el estado vacío */ }
    }
  } else {
    renderHistorial();
    renderAvance();
  }
  await cargarReportes();
  mostrarVista('reportes', { scroll: false });
}

// ---------- Avance entre diagnósticos ----------

const FLECHA_CAMBIO = { mejoro: '▲', empeoro: '▼', nuevo: '●', sin_datos: '○' };

// Compara el diagnóstico en pantalla con uno anterior (el que elija el servidor o el del selector).
async function renderAvance(contra = '') {
  const tarjeta = $('#avance-card');
  const id = estado.ultimo?.id;
  let p = null;
  if (id) {
    try {
      const res = await fetch(`/api/progreso?id=${encodeURIComponent(id)}${contra ? `&contra=${encodeURIComponent(contra)}` : ''}`);
      p = res.ok ? await res.json() : null;
    } catch { p = null; }
  }
  if (!p || estado.ultimo?.id !== id) { tarjeta.hidden = !p; return; }
  tarjeta.hidden = false;
  const c = p.comparacion;
  $('#avance-vacio').hidden = Boolean(c);
  $('#avance-cuerpo').hidden = !c;
  $('#avance-selector').hidden = !c || p.candidatos.length < 2;
  if (!c) return;

  const selector = $('#avance-contra');
  selector.replaceChildren(...p.candidatos.map((d) => crearElemento('option', { value: d.id }, `${fechaCorta(d.creado)} · ${d.nombre}`)));
  selector.value = c.anterior.id;

  const { antes, despues, delta } = c.madurez;
  const caja = $('.avance-delta');
  caja.className = `avance-delta ${delta > 0 ? 'sube' : delta < 0 ? 'baja' : ''}`.trim();
  $('#avance-delta').textContent = delta === 0 ? 'Sin cambio' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
  const lapso = c.dias === 0 ? 'el mismo día' : c.dias === 1 ? 'en 1 día' : `en ${c.dias} días`;
  $('#avance-rango').textContent = `Madurez de ${antes} a ${despues} de 5, ${lapso}.`;
  pintarSerieAvance(p.serie, c);

  const cambiadas = c.areas.filter((a) => a.cambio !== 'igual');
  $('#avance-areas').replaceChildren(...(cambiadas.length ? cambiadas.map((a) => {
    const li = crearElemento('li', { class: a.cambio });
    li.append(crearElemento('span', { class: 'flecha', 'aria-hidden': 'true' }, FLECHA_CAMBIO[a.cambio] || ''), crearElemento('span', {}, a.nombre), crearElemento('small', {}, `${ETIQUETA_COLOR[a.antes]} → ${ETIQUETA_COLOR[a.despues]}`));
    return li;
  }) : [crearElemento('li', { class: 'vacio' }, 'Ninguna área cambió de color entre los dos diagnósticos.')]));

  const cifra = (n, texto, tono) => {
    const d = crearElemento('div', { style: `--tono: ${tono}` });
    d.append(crearElemento('strong', {}, String(n)), crearElemento('span', {}, texto));
    return d;
  };
  const { resueltas, persistentes, nuevas } = c.acciones;
  $('#avance-plan').replaceChildren(cifra(resueltas.length, 'ya no hacen falta', 'var(--verde)'), cifra(persistentes.length, 'siguen pendientes', 'var(--amarillo)'), cifra(nuevas.length, 'nuevas', 'var(--cian)'));
  $('#avance-resueltas').replaceChildren(...(resueltas.length
    ? resueltas.slice(0, 5).map((a) => crearElemento('li', {}, `${a.accion} (${a.nombre})`))
    : [crearElemento('li', { class: 'vacio' }, 'Todas las acciones del plan anterior siguen apareciendo. Con tus respuestas nuevas, el motor todavía las pide.')]));
}

// Línea de madurez (0 a 5) con un punto por diagnóstico guardado; resalta los dos que se comparan.
function pintarSerieAvance(serie, c) {
  const svg = $('#avance-serie');
  svg.replaceChildren();
  if (serie.length < 2) return;
  const ancho = 300;
  const x = (i) => 14 + (i * (ancho - 28)) / (serie.length - 1);
  const y = (v) => 78 - (v / 5) * 62;
  const grad = svgEl('linearGradient', { id: 'grad-avance', x1: '0', y1: '0', x2: '1', y2: '0' });
  grad.append(svgEl('stop', { offset: '0', 'stop-color': '#8b5cf6' }), svgEl('stop', { offset: '1', 'stop-color': '#25e2ff' }));
  const defs = svgEl('defs');
  defs.append(grad);
  svg.append(defs);
  for (const v of [0, 2.5, 5]) svg.append(svgEl('line', { x1: 14, x2: ancho - 14, y1: y(v), y2: y(v), stroke: 'rgba(167,139,250,0.18)', 'stroke-dasharray': v === 0 ? '' : '3 6' }));
  svg.append(svgEl('polyline', { points: serie.map((s, i) => `${x(i).toFixed(1)},${y(s.madurez).toFixed(1)}`).join(' '), fill: 'none', stroke: 'url(#grad-avance)', 'stroke-width': '2.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  serie.forEach((s, i) => {
    const comparado = s.id === c.anterior.id || s.id === c.actual.id;
    const punto = svgEl('circle', { cx: x(i).toFixed(1), cy: y(s.madurez).toFixed(1), r: comparado ? '5.5' : '3', fill: comparado ? '#fff' : '#8b5cf6', stroke: '#0d0930', 'stroke-width': '1.5' });
    const titulo = svgEl('title');
    titulo.textContent = `${fechaCorta(s.creado)}: ${s.madurez} de 5`;
    punto.append(titulo);
    svg.append(punto);
    if (comparado) {
      const t = svgEl('text', { x: x(i).toFixed(1), y: (y(s.madurez) - 10).toFixed(1), 'text-anchor': i === 0 ? 'start' : i === serie.length - 1 ? 'end' : 'middle' });
      t.textContent = String(s.madurez);
      svg.append(t);
    }
  });
  const pie = (i, ancla) => { const t = svgEl('text', { x: x(i).toFixed(1), y: '94', 'text-anchor': ancla }); t.textContent = fechaCorta(serie[i].creado); svg.append(t); };
  pie(0, 'start');
  pie(serie.length - 1, 'end');
}

async function obtenerDiagnostico(id) {
  const res = await fetch(`/api/diagnosticos/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('No se encontró el diagnóstico');
  return res.json();
}

async function abrirDiagnostico(id) {
  try {
    renderResultados(await obtenerDiagnostico(id));
  } catch {
    mostrarVista('reportes');
  }
}

async function descargarDiagnostico(id, indice) {
  try {
    descargar(archivosDelResultado(await obtenerDiagnostico(id))[indice]);
  } catch { /* el botón no hace nada si el archivo ya no existe */ }
}

// ---------- Configuración ----------

function actualizarEncabezadoIA() {
  const el = $('#ia-estado');
  if (estado.proveedorIA === 'ninguno') {
    el.textContent = 'Instalación local · sin cuentas · sin IA';
    return;
  }
  const u = estado.uso || {};
  const consumo = u.total ? ` · ${u.total.toLocaleString('es-MX')} tokens${u.limite ? ` / ${u.limite.toLocaleString('es-MX')}` : ''}` : '';
  el.textContent = `IA: ${u.modelo || NOMBRE_PROVEEDOR[estado.proveedorIA] || estado.proveedorIA}${consumo}`;
}

async function refrescarEstadoIA() {
  try {
    const s = await fetch('/api/estado').then((r) => r.json());
    estado.proveedorIA = s.proveedorIA || 'ninguno';
    estado.uso = s.uso || null;
    estado.apoyo = s.apoyo || { activos: AGENTES_APOYO, inactivos: {} };
    $('#cfg-version').textContent = s.version || '—';
    pintarUso(s.uso);
  } catch {
    estado.proveedorIA = 'ninguno';
  }
  actualizarEncabezadoIA();
  for (const c of [chatArea, chatAgentes, chatOrquestador]) c?.refrescarNota();
}

function mostrarGrupoProveedor() {
  const proveedor = $('#cfg-proveedor').value;
  $('#cfg-anthropic').hidden = proveedor !== 'anthropic';
  $('#cfg-openai').hidden = proveedor !== 'openai';
}

function datosFormularioIA() {
  return {
    proveedor: $('#cfg-proveedor').value,
    anthropicKey: $('#cfg-anthropic-key').value.trim(),
    anthropicModelo: $('#cfg-anthropic-modelo').value.trim(),
    anthropicModeloBusqueda: $('#cfg-anthropic-modelo-busqueda').value.trim(),
    anthropicModeloAutomatico: $('#cfg-anthropic-modelo-automatico').value.trim(),
    openaiKey: $('#cfg-openai-key').value.trim(),
    openaiModelo: $('#cfg-openai-modelo').value.trim(),
    modoAhorro: $('#cfg-modo-ahorro').value,
    usarLotes: $('#cfg-lotes').checked,
    limiteMensualTokens: Number($('#cfg-limite').value) || 0,
    limiteDiarioTokens: Number($('#cfg-limite-diario').value) || 0,
  };
}

function pintarConfiguracion(cfg) {
  $('#cfg-proveedor').value = cfg.proveedor || 'ninguno';
  $('#cfg-anthropic-key').value = cfg.anthropicKey || '';
  $('#cfg-anthropic-modelo').value = cfg.anthropicModelo || '';
  $('#cfg-anthropic-modelo-busqueda').value = cfg.anthropicModeloBusqueda || '';
  $('#cfg-anthropic-modelo-automatico').value = cfg.anthropicModeloAutomatico || '';
  $('#cfg-modo-ahorro').value = cfg.modoAhorro || 'equilibrado';
  $('#cfg-lotes').checked = cfg.usarLotes !== false;
  $('#cfg-limite').value = cfg.limiteMensualTokens || 0;
  $('#cfg-limite-diario').value = cfg.limiteDiarioTokens || 0;
  $('#cfg-openai-key').value = cfg.openaiKey || '';
  $('#cfg-openai-modelo').value = cfg.openaiModelo || '';
  mostrarGrupoProveedor();
}

async function cargarConfiguracion() {
  renderIdentidad($('#config-identidad'));
  mensaje($('#identidad-mensaje'), '');
  cargarEmpresa();
  cargarFuentes();
  cargarUso();
  cargarDatosReales();
  cargarEmpresas();
  try {
    const cfg = await fetch('/api/configuracion').then((r) => r.json());
    pintarConfiguracion(cfg);
    if (cfg.fuente === 'env') mensaje($('#cfg-mensaje'), `IA activa desde el archivo .env (${NOMBRE_PROVEEDOR[cfg.proveedorActivo] || cfg.proveedorActivo}). Lo que guardes aquí tendrá prioridad.`);
    else if (cfg.fuente === 'pantalla') mensaje($('#cfg-mensaje'), `IA activa: ${NOMBRE_PROVEEDOR[cfg.proveedorActivo] || cfg.proveedorActivo}. La clave guardada se muestra enmascarada.`, 'ok');
    else mensaje($('#cfg-mensaje'), 'Sin IA. La aplicación funciona completa con el motor de reglas.');
  } catch {
    mensaje($('#cfg-mensaje'), 'No se pudo leer la configuración.', 'error');
  }
  await refrescarEstadoIA();
}

async function probarConexionIA() {
  const boton = $('#cfg-probar');
  boton.disabled = true;
  mensaje($('#cfg-mensaje'), 'Probando conexión…');
  try {
    const res = await fetch('/api/configuracion/probar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datosFormularioIA()) });
    const j = await res.json();
    if (res.ok) mensaje($('#cfg-mensaje'), `Conexión correcta con ${NOMBRE_PROVEEDOR[j.proveedor] || j.proveedor}. Respuesta: ${j.respuesta || 'OK'}`, 'ok');
    else mensaje($('#cfg-mensaje'), j.errores?.[0] || 'No se pudo conectar.', 'error');
  } catch {
    mensaje($('#cfg-mensaje'), 'No hay conexión con el servidor local.', 'error');
  } finally {
    boton.disabled = false;
  }
}

async function guardarConfiguracionIA(evento) {
  evento.preventDefault();
  mensaje($('#cfg-mensaje'), 'Guardando…');
  try {
    const res = await fetch('/api/configuracion', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datosFormularioIA()) });
    const cfg = await res.json();
    if (!res.ok) return mensaje($('#cfg-mensaje'), cfg.errores?.[0] || 'No se pudo guardar.', 'error');
    pintarConfiguracion(cfg);
    await refrescarEstadoIA();
    mensaje($('#cfg-mensaje'), estado.proveedorIA === 'ninguno' ? 'Guardado. Sin IA activa.' : `Guardado. IA activa: ${NOMBRE_PROVEEDOR[estado.proveedorIA]}. Los agentes ya pueden responder.`, 'ok');
  } catch {
    mensaje($('#cfg-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

async function quitarClavesIA() {
  try {
    const cfg = await fetch('/api/configuracion/claves', { method: 'DELETE' }).then((r) => r.json());
    pintarConfiguracion(cfg);
    await refrescarEstadoIA();
    mensaje($('#cfg-mensaje'), 'Claves eliminadas de tu equipo. Sin IA activa.', 'ok');
  } catch {
    mensaje($('#cfg-mensaje'), 'No hay conexión con el servidor local.', 'error');
  }
}

async function guardarIdentidadConfig() {
  try {
    await guardarNombre($('#config-identidad'));
    mensaje($('#identidad-mensaje'), 'Identidad guardada.', 'ok');
  } catch {
    mensaje($('#identidad-mensaje'), 'No se pudo guardar.', 'error');
  }
}

// ---------- Diagnóstico nuevo y avance ----------

// Abre el asistente para un diagnóstico nuevo. Si ya hay uno, parte de sus respuestas: el dueño solo corrige
// lo que cambió y el resultado se puede comparar con el anterior. "Empezar en blanco" las descarta.
function reiniciar({ enBlanco = false } = {}) {
  const previas = !enBlanco && estado.ultimo?.datos && Object.keys(estado.ultimo.datos).length ? estado.ultimo.datos : null;
  estado.respuestas = previas ? Object.fromEntries(Object.entries(previas).map(([k, v]) => [k, String(v)])) : {};
  estado.precargado = previas ? estado.ultimo.creado : null;
  // Al actualizar conviene el completo: lo esencial ya viene lleno y solo falta afinar.
  estado.modo = previas ? 'completo' : modoGuardado();
  estado.paso = 0;
  borrarBorrador().then(activarBorrador);
  renderPaso();
  mostrarVista('asistente');
}

async function avanzar(evento) {
  evento.preventDefault();
  mostrarErrores([]);
  const lista = pasos();
  const paso = lista[estado.paso];

  if (paso.tipo === 'identidad') {
    try { await guardarNombre($('#identidad-asistente')); } catch { /* el nombre es opcional */ }
  } else if (paso.tipo === 'equipo') {
    try { await guardarEquipo(); } catch { /* el equipo es opcional */ }
  } else {
    const errores = validarPaso();
    if (errores.length) return mostrarErrores(errores);
  }

  if (estado.paso === lista.length - 1) return enviarDiagnostico();
  estado.paso += 1;
  programarGuardado();
  renderPaso();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function retroceder() {
  if (estado.paso === 0) return;
  estado.paso -= 1;
  programarGuardado();
  renderPaso();
}

// ---------- Feed en vivo ----------

function conectarFeed() {
  const chip = $('#estado');
  const feed = $('#feed');
  const fuente = new EventSource('/api/eventos');

  fuente.onopen = () => {
    chip.textContent = 'Local · conectado';
    chip.classList.add('ok');
  };
  fuente.onerror = () => {
    chip.textContent = 'Sin conexión';
    chip.classList.remove('ok');
  };
  fuente.onmessage = (msg) => {
    const evento = JSON.parse(msg.data);
    const d = evento.datos;
    // Estado en vivo: qué agente está trabajando ahora y en qué.
    if (evento.tipo === 'trabajo_inicio') trabajosEnCurso.set(d.id, d);
    if (evento.tipo === 'trabajo_fin') trabajosEnCurso.delete(d.id);
    if (evento.tipo === 'trabajo_inicio' || evento.tipo === 'trabajo_fin') pintarTrabajando();
    const listaAct = $('#act-lista');
    if (listaAct && estado.vista === 'actividad' && evento.tipo !== 'permisos_cambiados') { listaAct.querySelector('.act-item:only-child:not(.trabajo_inicio)')?.remove(); listaAct.prepend(filaActividad(evento)); }
    if (evento.tipo === 'trabajo_inicio') return; // el feed del dashboard solo muestra lo terminado
    if (feed.querySelector('.vacio')) feed.replaceChildren();
    const nombreDe = (area) => (area === 'orquestador' ? 'Orquestador' : nombreArea(area));
    const texto = evento.tipo === 'diagnostico_creado'
      ? `Diagnóstico de ${d.nombre || 'sin nombre'} · prioridades: ${d.prioridad.length || 'ninguna'}`
      : evento.tipo === 'orden_enviada'
        ? `${d.origen === 'piloto' ? 'Piloto automático de' : d.origen === 'rutina' ? 'Rutina para' : d.tipo === 'idea' ? 'Idea para' : d.tipo === 'hecho' ? 'Dato de la empresa a' : d.tipo === 'concepto' ? 'Pregunta a' : 'Orden a'} ${nombreDe(d.area)}${d.pendiente ? ' · pendiente (sin IA)' : ''}${d.hechos ? ` · ${d.hechos} hechos registrados` : ''}`
        : evento.tipo === 'piloto_ejecutado'
          ? describirEvento(evento)
        : evento.tipo === 'respuesta_agente'
          ? `${nombreDe(d.area)} respondió${d.acciones ? ` · ${d.acciones} acciones a la bitácora` : ''}`
          : evento.tipo === 'investigacion_terminada'
            ? `Investigación de mercado: ${d.competidores} competidores · ${d.encargos} encargos${d.pendiente ? ' pendientes' : ''}`
            : evento.tipo === 'sitio_analizado'
              ? `Sitio analizado: ${d.puntaje}/100 · ${d.encargos} encargos`
              : evento.tipo === 'trabajo_fin'
                ? describirEvento(evento)
                : evento.tipo === 'busquedas_web'
                  ? describirEvento(evento)
              : evento.tipo === 'rutina_ejecutada'
                ? `Rutina "${d.nombre}" enviada a ${nombreDe(d.area)}${d.pendiente ? ' · pendiente (sin IA)' : ''}`
                : evento.tipo === 'rutina_sugerida'
                  ? `Orden repetida ${d.veces} veces a ${nombreDe(d.area)}: sugerencia de rutina`
                  : evento.tipo === 'permisos_cambiados'
                    ? 'Permisos actualizados'
              : evento.tipo === 'nota_agente'
                ? `${nombreDe(d.origen)} dejó una nota a ${nombreDe(d.destino)}`
                : evento.tipo === 'intercambio_agentes'
                  ? `${nombreDe(d.area)} atendió una petición de otro agente`
                  : evento.tipo;
    if (['investigacion_terminada', 'sitio_analizado', 'nota_agente', 'respuesta_agente', 'orden_enviada', 'calendario_importado'].includes(evento.tipo)) cargarBitacora();
    if (evento.tipo === 'investigacion_terminada') cargarInvestigacion();
    if (evento.tipo === 'sitio_analizado') cargarSitio();
    feed.prepend(crearElemento('li', {}, `${horaCorta(evento.momento)} · ${texto}`));
  };
}

// ---------- Arranque ----------

async function iniciar() {
  const [esquema, marca, equipo] = await Promise.all([
    fetch('/api/formulario').then((r) => r.json()),
    fetch('/api/marca').then((r) => r.json()),
    fetch('/api/equipo').then((r) => r.json()).catch(() => ({ areas: {} })),
  ]);
  estado.esquema = esquema;
  estado.marca = marca;
  estado.equipo = equipo;
  await cargarPersonalizados();
  await cargarHabilidades();
  chatArea = crearChat($('#chat-area'));
  chatAgentes = crearChat($('#chat-agentes'));
  chatOrquestador = crearChat($('#chat-orquestador'));
  aplicarMarca();
  await refrescarEstadoIA();

  document.querySelectorAll('[data-icono]').forEach((el) => el.replaceChildren(icono(el.dataset.icono)));
  for (const boton of document.querySelectorAll('.menu-item')) boton.addEventListener('click', manejarMenu);
  $('#formulario').addEventListener('submit', avanzar);
  $('#atras').addEventListener('click', retroceder);
  $('#nuevo').addEventListener('click', () => reiniciar());
  prepararControlesCiudad();
  $('#accion-nuevo').addEventListener('click', () => reiniciar());
  $('#avance-actualizar').addEventListener('click', () => reiniciar());
  $('#reales-analizar').addEventListener('click', analizarDatosReales);
  $('#reales-hechos').addEventListener('click', registrarHechosReales);
  $('#reales-olvidar').addEventListener('click', async () => { await fetch('/api/datos-reales', { method: 'DELETE' }); pintarDatosReales(null); mensaje($('#reales-mensaje'), 'Análisis olvidado. Los hechos ya registrados siguen en la bitácora.', 'ok'); renderInforme(); });
  $('#empresa-crear').addEventListener('click', crearEmpresaNueva);
  $('#pasaporte-cifras').addEventListener('change', cargarPasaporte);
  $('#pasaporte-verificar').addEventListener('click', verificarPasaporte);
  $('#empezar-en-blanco').addEventListener('click', () => reiniciar({ enBlanco: true }));
  $('#avance-contra').addEventListener('change', (e) => renderAvance(e.target.value));
  $('#vacio-empezar').addEventListener('click', () => { renderPaso(); mostrarVista('asistente'); });
  // El panel lateral vive directo en <body>: así "position: fixed" no depende de ninguna tarjeta con transformaciones.
  document.body.append($('#detalle-fondo'), $('#detalle'));
  $('#detalle-cerrar').addEventListener('click', cerrarDetalle);
  $('#detalle-fondo').addEventListener('click', cerrarDetalle);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#detalle').hidden) cerrarDetalle(); });
  $('#editar-equipo').addEventListener('click', editarEquipo);
  $('#ver-reportes').addEventListener('click', () => { cargarReportes(); mostrarVista('reportes'); });
  $('#accion-plan').addEventListener('click', () => irA('plan-card'));
  $('#accion-reporte').addEventListener('click', () => descargarWord(estado.ultimo?.id));
  $('#form-propio').addEventListener('submit', guardarPropio);
  $('#propio-cancelar').addEventListener('click', () => { rellenarFormularioPropio(); mensaje($('#propio-mensaje'), ''); });
  $('#propio-avatar').addEventListener('change', actualizarPreviewAvatar);
  $('#empresa-guardar').addEventListener('click', guardarEmpresa);
  $('#fuente-agregar').addEventListener('click', agregarFuente);
  $('#fuente-prueba').addEventListener('input', probarBusqueda);
  $('#doc-archivo').addEventListener('change', (e) => { subirDocumento(e.target.files[0]); e.target.value = ''; });
  $('#ajuste-agente').addEventListener('change', pintarAjuste);
  $('#ajuste-guardar').addEventListener('click', guardarAjuste);
  $('#optimizar-agentes').addEventListener('click', optimizarAgentes);
  $('#uso-guardar').addEventListener('click', guardarLimite);
  $('#hecho-agregar').addEventListener('click', agregarHecho);
  $('#cal-archivo').addEventListener('change', (e) => { importarCalendario(e.target.files[0]); e.target.value = ''; });
  $('#lab-tipo').addEventListener('change', pintarCamposLaboral);
  $('#rut-crear').addEventListener('click', crearRutinaManual);
  $('#piloto-global').addEventListener('change', cambiarPilotoGlobal);
  $('#act-filtro').addEventListener('change', cargarActividad);
  $('#act-recargar').addEventListener('click', cargarActividad);
  $('#lab-calcular').addEventListener('click', () => calcularLaboral(false));
  $('#lab-registrar').addEventListener('click', () => calcularLaboral(true));
  $('#cal-borrar').addEventListener('click', async () => { await fetch('/api/calendario', { method: 'DELETE' }); mensaje($('#cal-mensaje'), 'Agenda importada eliminada.', 'ok'); cargarCalendario(); });
  $('#inv-guardar').addEventListener('click', () => guardarProgramacion('investigacion', 'inv', $('#inv-mensaje')));
  $('#inv-ejecutar').addEventListener('click', ejecutarInvestigacion);
  $('#inv-importar-boton').addEventListener('click', importarInvestigacion);
  $('#sitio-analizar').addEventListener('click', analizarSitio);
  document.querySelectorAll('.pestana').forEach((b) => b.addEventListener('click', () => { mostrarPestana(b.dataset.pestana); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
  $('#equipo-filtro').addEventListener('input', filtrarEquipo);
  $('#form-campana').addEventListener('submit', descargarPiezaActual);
  $('#form-campana-ia').addEventListener('submit', generarCampanaIA);
  $('#modo-diagnostico').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-modo-diag]');
    if (boton) cambiarModoDiagnostico(boton.dataset.modoDiag);
  });
  $('#camp-descargar-todas').addEventListener('click', descargarTodasLasPiezas);
  $('#camp-plataforma').addEventListener('change', renderPiezas);
  $('#camp-pieza').addEventListener('change', previsualizar);
  for (const id of ['camp-titular', 'camp-subtitulo', 'camp-cta', 'camp-marca', 'camp-estilo', 'camp-fondo', 'camp-fondo2', 'camp-texto', 'camp-acento']) {
    $(`#${id}`).addEventListener('input', previsualizar);
  }
  $('#guardar-equipo').addEventListener('click', async () => {
    try {
      await guardarEquipo();
      mensaje($('#equipo-mensaje'), 'Equipo guardado.', 'ok');
      prepararAgentes();
    } catch {
      mensaje($('#equipo-mensaje'), 'No se pudo guardar.', 'error');
    }
  });
  $('#chat-selector').addEventListener('change', (e) => chatAgentes?.cargar(e.target.value));
  $('#cfg-proveedor').addEventListener('change', mostrarGrupoProveedor);
  $('#config-ia').addEventListener('submit', guardarConfiguracionIA);
  $('#cfg-probar').addEventListener('click', probarConexionIA);
  $('#cfg-quitar').addEventListener('click', quitarClavesIA);
  $('#guardar-identidad').addEventListener('click', guardarIdentidadConfig);

  // Restaura el borrador guardado para no pedir de nuevo lo ya respondido.
  const guardado = await fetch('/api/borrador').then((r) => r.json()).catch(() => null);
  const hayBorrador = Boolean(guardado && Object.keys(guardado.respuestas || {}).length);
  if (hayBorrador) {
    estado.respuestas = guardado.respuestas;
    estado.paso = Math.min(guardado.paso || 0, pasos().length - 1);
  }
  renderPaso();
  conectarFeed();

  // El dashboard abre con el último diagnóstico guardado. Si hay un borrador a medias, se retoma el asistente.
  const [reciente] = await listarDiagnosticos();
  if (reciente) {
    try {
      renderResultados(await obtenerDiagnostico(reciente.id), { scroll: false });
    } catch { /* si el archivo ya no existe, el dashboard muestra cómo empezar */ }
  }
  mostrarVista(hayBorrador ? 'asistente' : 'dashboard', { scroll: false });
}

iniciar();
