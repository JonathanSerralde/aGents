// Servidor local del orquestador. Sin dependencias: módulo http de Node.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync as readFileSync0 } from 'node:fs';
import { exec } from 'node:child_process';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { EventEmitter } from 'node:events';
import { config as configBase } from './config.js';
import { CAMPOS, SECCIONES, ETIQUETAS_NO_SE, validar } from './formulario.js';
import { evaluar, NOMBRES_DISTRITOS } from './diagnostico.js';
import { crearStore } from './store.js';
import { resumirConIA, proveedorActivo } from './agentes.js';
import { crearMarca, LIMITE_LOGO } from './marca.js';
import { crearBorrador } from './borrador.js';
import { crearEquipo } from './equipo.js';
import { crearConversaciones, esAreaValida, limpiarTexto, MAX_TEXTO } from './conversaciones.js';
import { sistemaPara } from './prompts.js';
import { conversar } from './agentes.js';
import { crearConfiguracion, enmascarar, configuracionEfectiva, sanitizarConfiguracion, modeloActivo, modeloPara, PERMISOS } from './configuracion.js';
import { enviarLote, resultadosLote } from './agentes.js';
import { crearRutinas, FRECUENCIAS } from './rutinas.js';
import { crearActividad } from './actividad.js';
import { crearPiloto, MAX_POR_TICK } from './piloto.js';
import { crearUso, limiteAlcanzado } from './uso.js';
import { crearAjustes, parsearPropuestas, parsearNuevosAgentes } from './ajustes.js';
import { arbol, nombreDe, subagentesPorArea, tipoDe } from './jerarquia.js';
import { resolverAgente } from './colaboracion.js';
import { crearPersonalizados, esIdPersonalizado, AVATARES_PERMITIDOS } from './personalizados.js';
import { crearEmpresa, CAMPOS_EMPRESA } from './empresa.js';
import { crearFuentes, buscar, fragmentosParaPrompt } from './conocimiento.js';
import { generarDocx, generarHtml } from './reporte.js';
import { crearDocumentos, LIMITE_DOCUMENTO } from './documentos.js';
import { colaborar, componerRespuesta, extraerPeticiones } from './colaboracion.js';
import { ORQUESTADOR, AREAS_CONVERSACION } from './conversaciones.js';
import { conversarConBusqueda } from './agentes.js';
import { instruccionInvestigacion, parsearInvestigacion, resumirSinIA, resumenParaPrompt, informeParaOrquestador, contenidoInvestigacion, crearInvestigaciones, MINIMO_COMPETIDORES, MINIMO_RESENAS } from './investigacion.js';
import { descargarSitio, evaluarSitio, informeSitioParaOrquestador, resumenSitioParaPrompt, contenidoSitio, crearAnalisisSitio } from './sitio.js';
import { crearProgramacion, crearProgramador, DIAS } from './programador.js';
import { crearMemoria } from './memoria.js';
import { docxDesdeBloques, htmlDesdeBloques } from './reporte.js';
import { estadoApoyo } from './apoyo.js';
import { HABILIDADES } from './habilidades.js';
import { contextoSectores } from './sectores.js';
import { informeOficina } from './informe.js';
import { clasificarTexto, extraerHechosDeTexto, instruccionPorTipo, DESCRIPCION_TIPO } from './clasificador.js';
import { crearCalendario, generarIcs, eventosDeOficina, agendaParaPrompt, LIMITE_ICS } from './calendario.js';
import { calcular, resumenCalculo, TIPOS_CALCULO, CAMPOS_CALCULO, PARAMETROS as PARAMETROS_LABORALES, VIGENCIA_LABORAL } from './laboral.js';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

const LIMITE_CUERPO = 100 * 1024;

// La versión sale de package.json para que pantalla, paquetes y README coincidan.
export const VERSION = (() => {
  try { return JSON.parse(readFileSync0(join(configBase.raiz, 'package.json'), 'utf8')).version || '0.0.0'; } catch { return '0.0.0'; }
})();

function enviarJSON(res, codigo, cuerpo) {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(cuerpo));
}

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    let tam = 0;
    const partes = [];
    req.on('data', (parte) => {
      tam += parte.length;
      if (tam > LIMITE_CUERPO) {
        rechazar(new Error('Solicitud demasiado grande'));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => {
      try {
        resolver(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'));
      } catch {
        rechazar(new Error('JSON no válido'));
      }
    });
    req.on('error', rechazar);
  });
}

function leerBinario(req, limite) {
  return new Promise((resolver, rechazar) => {
    let tam = 0;
    const partes = [];
    req.on('data', (parte) => {
      tam += parte.length;
      if (tam > limite) {
        rechazar(new Error('El archivo supera el tamaño permitido'));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => resolver(Buffer.concat(partes)));
    req.on('error', rechazar);
  });
}

export function crearServidor(opciones = {}) {
  const config = { ...configBase, ...opciones };
  const store = crearStore(config.dirDatos);
  const marca = crearMarca(config.dirMarca);
  const borrador = crearBorrador(config.archivoBorrador);
  const personalizados = crearPersonalizados(config.archivoAgentes);
  const empresa = crearEmpresa(config.archivoEmpresa);
  const fuentes = crearFuentes(config.archivoFuentes);
  const documentos = crearDocumentos(config.dirDocumentos);
  const MAX_TEXTO_DOCUMENTO_IA = 14000; // caracteres del documento que se envían al modelo

  // Prompt del sistema de cualquier agente, con su ficha, su habilidad y, si es el Orquestador, los nombres de los agentes propios.
  // Todos reciben además la última investigación de mercado, el último análisis del sitio y su parte de la memoria compartida.
  // Agentes de apoyo opcionales (por ejemplo, Alimentos y bebidas): activos según el giro, la ficha o la elección del usuario.
  function apoyo() {
    return estadoApoyo({ giro: store.ultimo()?.datos?.giro || '', ficha: empresa.leer(), opcionales: equipo.leer().opcionales });
  }
  const motivoInactivo = (area) => apoyo().inactivos[area] || null;

  function sistemaDe(area, { compacto = false } = {}) {
    const propios = personalizados.leer().agentes;
    const personalizado = esIdPersonalizado(area) ? propios[area] : (area === ORQUESTADOR ? { nombresPropios: Object.values(propios).map((a) => a.nombre) } : null);
    const ap = apoyo(); // una sola lectura de disco por prompt
    return sistemaPara(area, store.ultimo(), equipo.leer(), marca.leer(), personalizado, empresa.leer(), {
      propios,
      compacto,
      inactivos: Object.keys(ap.inactivos),
      sector: contextoSectores(ap.sectores),
      agenda: AGENTES_CON_AGENDA.includes(area) ? agendaParaPrompt(agendaProxima()) : '',
      ajuste: ajustes.leer(area),
      investigacion: resumenParaPrompt(investigaciones.ultima()),
      sitio: resumenSitioParaPrompt(analisisSitio.ultimo()),
      memoria: memoria.resumenParaPrompt(area, propios),
    });
  }

  // Cada respuesta de agente alimenta la memoria compartida (acciones abiertas y conclusión).
  function recordar(area, respuesta) {
    try {
      return memoria.registrarRespuesta(area, respuesta, personalizados.leer().agentes);
    } catch {
      return { conclusion: '', nuevas: 0 }; // la memoria nunca debe impedir una respuesta
    }
  }

  // ---- Tareas semanales: investigación de mercado y análisis del sitio ----

  // Reparte un informe entre los agentes. Con IA, el Orquestador decide a quién (y siempre a los obligatorios);
  // sin IA, el informe queda como orden pendiente para las personas responsables de las áreas obligatorias.
  // detalle: texto del informe que se adjunta a cada encargo para que el agente tenga el dato completo, no solo el resumen.
  async function repartir({ cfg, titulo, informe, obligatorios, instruccion, maximo = 6, detalle = '' }) {
    const bloqueo = bloqueoIA(cfg);
    const propios = personalizados.leer().agentes;
    if (bloqueo) {
      const encargos = obligatorios.map((destino) => {
        conversaciones.agregar(destino, { rol: 'usuario', texto: `${titulo}. ${informe}`, pendiente: true, origen: 'sistema' });
        return { tipo: 'DELEGAR', destino, nombreDestino: nombreDe(destino, propios), texto: `Revisar: ${titulo}`, respuesta: null, pendiente: true };
      });
      return { encargos, pendienteReparto: true, motivo: bloqueo, textoOrquestador: '' };
    }
    agenteEnCurso = ORQUESTADOR;
    const fin = trabajo(ORQUESTADOR, 'reparto', `Repartiendo: ${titulo}`);
    try {
      const mensaje = { rol: 'usuario', texto: `${instruccion}\n\n${informe}` };
      let respuesta = await conversar(cfg, sistemaDe(ORQUESTADOR), [mensaje]);
      if (!respuesta) throw new Error('El proveedor no devolvió texto');
      fin(true);
      // Los obligatorios siempre reciben encargo, aunque el Orquestador los haya omitido.
      const destinos = new Set(extraerPeticiones(respuesta).filter((p) => p.tipo === 'DELEGAR').map((p) => resolverAgente(p.destinoTexto, propios)));
      for (const destino of obligatorios) {
        if (!destinos.has(destino)) respuesta += `\nDELEGAR: [${nombreDe(destino, propios)}] — Revisa el informe "${titulo}" y propón qué cambiar en tu área esta semana.`;
      }
      const { texto, intercambios } = await resolverColaboracion(cfg, ORQUESTADOR, respuesta, { maximo, adjunto: detalle ? `Informe completo "${titulo}":\n${detalle.slice(0, 5000)}` : '' });
      conversaciones.agregar(ORQUESTADOR, { rol: 'usuario', texto: `${titulo}: reparte el trabajo.` });
      conversaciones.agregar(ORQUESTADOR, { rol: 'agente', texto });
      recordar(ORQUESTADOR, respuesta);
      return { encargos: intercambios, pendienteReparto: false, motivo: null, textoOrquestador: texto };
    } finally {
      agenteEnCurso = '';
    }
  }

  // Datos del negocio con los que el agente de mercado busca a la competencia.
  function contextoNegocio() {
    const ficha = empresa.leer();
    const ultimo = store.ultimo();
    return {
      nombre: marca.leer().nombre || ficha.razonSocial,
      giro: ultimo?.datos?.giro || '',
      productos: ficha.productos.replace(/\s*\n\s*/g, '; '),
      zona: [ficha.municipio, ficha.estado].filter(Boolean).join(', '),
      competidores: ficha.competidores.replace(/\s*\n\s*/g, '; '),
      sitio: ficha.sitioWeb,
    };
  }

  // Investigación de mercado: con IA busca en internet; con texto capturado a mano (sin IA) solo lo ordena y reparte.
  async function investigar({ origen = 'programada', textoManual = null } = {}) {
    const cfg = configActual();
    let crudo = textoManual;
    let busquedasHechas = [];
    if (!crudo) {
      const bloqueo = bloqueoIA(cfg);
      if (bloqueo) throw Object.assign(new Error(bloqueo), { codigo: 422 });
      if (cfg.permisos?.busquedaWeb === false) throw Object.assign(new Error('Búsqueda en internet desactivada por ti en Accesos y permisos'), { codigo: 422 });
      // Una sola investigación a la vez: dos clics seguidos no deben pagar dos veces.
      if (investigacionEnCurso) throw Object.assign(new Error('Ya hay una investigación en curso; espera a que termine'), { codigo: 409 });
      investigacionEnCurso = true;
      agenteEnCurso = 'mercado';
      const fin = trabajo('mercado', 'investigacion', 'Buscando competidores y reseñas de clientes en internet (hasta 8 búsquedas)');
      try {
        const sistema = `${sistemaDe('mercado')}\n\nEn esta tarea tienes búsqueda web activa: úsala para encontrar competidores reales y comentarios reales de sus clientes.`;
        const r = await conversarConBusqueda(cfg, sistema, [{ rol: 'usuario', texto: instruccionInvestigacion(contextoNegocio()) }]);
        crudo = r.texto;
        busquedasHechas = r.busquedas;
        fin(true, { busquedas: busquedasHechas.length });
        emitir('busquedas_web', { area: 'mercado', consultas: busquedasHechas.map((b) => b.consulta) });
      } catch (err) {
        fin(false, { error: err.message });
        throw err;
      } finally {
        agenteEnCurso = '';
        investigacionEnCurso = false;
      }
      if (!crudo) throw new Error('El proveedor no devolvió texto');
    }
    let inv = parsearInvestigacion(crudo);
    inv.busquedas = busquedasHechas;
    if (!inv.competidores.length) throw Object.assign(new Error('No se encontraron competidores en el formato esperado'), { codigo: 422, crudo: String(crudo).slice(0, 2000) });
    if (bloqueoIA(cfg)) inv = resumirSinIA(inv);
    const momento = new Date().toISOString();
    const titulo = 'Investigación semanal de mercado y competencia';
    // Se guarda ANTES de repartir: así Ventas, Marketing y los demás ya la tienen en su contexto cuando reciben el encargo.
    const registro = investigaciones.guardar({ ...inv, momento, origen, encargos: [], pendienteReparto: true, motivoPendiente: 'repartiendo', textoOrquestador: '' });
    const informe = informeParaOrquestador({ ...inv, momento });
    const reparto = await repartir({
      cfg, titulo, informe, obligatorios: ['ventas', 'marketing'],
      instruccion: 'Llegó la investigación semanal del agente de Investigación de mercado. Resume en tres líneas qué buscan y qué rechazan los clientes del sector y reparte el trabajo: DELEGAR a Ventas (argumentario, objeciones y oferta de la semana) y a Marketing (mensajes y oferta), y a cualquier otra área o agente que necesite esta información según las quejas (Operaciones por servicio o entregas, Compras por surtido, Finanzas por precio, RH o Capacitación por atención, Tráfico digital si hay campañas, Tecnología por sitio o pagos). Cada encargo debe citar el hallazgo concreto que lo motiva: los agentes ya tienen el resumen de la investigación en su contexto, pero no el detalle por competidor.',
      detalle: informe,
    });
    investigaciones.actualizar(registro.id, { encargos: reparto.encargos, pendienteReparto: reparto.pendienteReparto, motivoPendiente: reparto.motivo, textoOrquestador: reparto.textoOrquestador });
    Object.assign(registro, { encargos: reparto.encargos, pendienteReparto: reparto.pendienteReparto, motivoPendiente: reparto.motivo, textoOrquestador: reparto.textoOrquestador });
    conversaciones.agregar('mercado', { rol: 'agente', texto: `Investigación del ${new Date(momento).toLocaleDateString('es-MX')}: ${inv.competidores.length} competidores y ${inv.competidores.reduce((s, c) => s + c.positivos.length + c.negativos.length, 0)} comentarios. Buscan: ${inv.buscan.slice(0, 3).join('; ') || 'sin conclusión'}. Rechazan: ${inv.rechazan.slice(0, 3).join('; ') || 'sin conclusión'}. Entregado al Orquestador.`.slice(0, MAX_TEXTO) });
    emitir('investigacion_terminada', { id: registro.id, competidores: inv.competidores.length, encargos: reparto.encargos.length, pendiente: reparto.pendienteReparto, busquedas: busquedasHechas.length, encargados: reparto.encargos.map((e) => e.destino) });
    return registro;
  }

  // Análisis del sitio web propio: descarga local y reglas; el reparto usa IA si la hay.
  async function revisarSitio({ url = null, origen = 'programada' } = {}) {
    const direccion = url || contextoNegocio().sitio;
    if (!direccion) throw Object.assign(new Error('Escribe el sitio web en la ficha de la empresa (Configuración) o aquí mismo'), { codigo: 422 });
    if (configActual().permisos?.analizarSitio === false) throw Object.assign(new Error('Análisis del sitio desactivado por ti en Accesos y permisos'), { codigo: 422 });
    const datos = await descargarSitio(direccion, { fetchImpl: config.fetchSitio || fetch });
    const analisis = evaluarSitio(datos);
    const momento = new Date().toISOString();
    const cfg = configActual();
    const titulo = `Análisis del sitio ${analisis.urlFinal}`;
    const obligatorios = [...new Set(['tecnologia', ...analisis.areas])].slice(0, 6);
    // Se guarda antes de repartir para que los agentes encargados ya lo vean en su contexto.
    const registro = analisisSitio.guardar({ ...analisis, momento, origen, encargos: [], pendienteReparto: true, motivoPendiente: 'repartiendo', textoOrquestador: '' });
    const informe = informeSitioParaOrquestador({ ...analisis, momento });
    const reparto = await repartir({
      cfg, titulo, informe, obligatorios,
      instruccion: 'Llegó el análisis automático del sitio web de la empresa. Resume en dos líneas cómo está el sitio y reparte los hallazgos: DELEGAR a cada área indicada entre corchetes (Ciberseguridad y Tecnología para seguridad y velocidad, Marketing para textos y vista previa, Ventas para el contacto directo, Tráfico digital para la medición, Fiscal y legal para el aviso de privacidad). Agrupa los hallazgos de una misma área en un solo encargo con la acción concreta.',
      detalle: informe,
    });
    analisisSitio.actualizar(registro.id, { encargos: reparto.encargos, pendienteReparto: reparto.pendienteReparto, motivoPendiente: reparto.motivo, textoOrquestador: reparto.textoOrquestador });
    Object.assign(registro, { encargos: reparto.encargos, pendienteReparto: reparto.pendienteReparto, motivoPendiente: reparto.motivo, textoOrquestador: reparto.textoOrquestador });
    emitir('sitio_analizado', { id: registro.id, url: analisis.urlFinal, puntaje: analisis.puntaje, encargos: reparto.encargos.length, pendiente: reparto.pendienteReparto });
    return registro;
  }

  // Estado de una tarea semanal para la pantalla: programación, próxima corrida y por qué no corrió la última vez.
  function estadoTarea(nombre) {
    const prog = programacion.leer(nombre);
    return { ...prog, diaNombre: DIAS[prog.diaSemana], puedeIA: !bloqueoIA(configActual()), motivoIA: bloqueoIA(configActual()) };
  }

  // "Optimizar agentes": el Orquestador propone ajustes por negocio para los agentes con más trabajo pendiente.
  async function optimizarAgentes(req, res) {
    const cfg = configActual();
    const bloqueo = bloqueoIA(cfg);
    if (bloqueo) return enviarJSON(res, 422, { ok: false, errores: [bloqueo] });
    const ultimo = store.ultimo();
    const propios = personalizados.leer().agentes;
    const prioritarios = ultimo ? ultimo.resultado.prioridad.slice(0, 5) : [];
    const candidatos = [...new Set([...prioritarios, 'orquestador', 'analista', 'planificador'])].slice(0, 6);
    const nombres = candidatos.map((id) => nombreDe(id, propios));
    const conversacionesRecientes = candidatos.map((id) => {
      const m = conversaciones.leer(id).slice(-4).map((x) => `${x.rol === 'agente' ? 'Agente' : 'Usuario'}: ${x.texto.slice(0, 300)}`).join('\n');
      return m ? `Conversación reciente de ${nombreDe(id, propios)}:\n${m}` : '';
    }).filter(Boolean).join('\n\n');
    const instruccion = [
      'Revisa el estado del negocio y propón, para cada uno de estos agentes, ajustes que los hagan más útiles para ESTA empresa:',
      nombres.join(', '),
      'Para cada agente escribe un bloque con este formato exacto:',
      'AGENTE: [nombre]\nNOTAS: una o dos frases con lo que debe tener presente de este negocio\nMARCOS:\n- hasta dos marcos o métodos adicionales\nACCIONES:\n- hasta dos acciones concretas adicionales\nLIMITES:\n- hasta un límite adicional\nMOTIVO: por qué lo propones, en una frase',
      'Sé específico con el giro, el tamaño y los hallazgos. No repitas lo que ya hace el agente. No uses CONSULTAR ni DELEGAR.',
      'Si este negocio necesita un subagente que ningún agente actual cubre (por su giro, un canal, un proceso o un cliente especial), propón hasta dos con este formato exacto, después de los bloques AGENTE:',
      'NUEVO AGENTE: [nombre corto]\nROL: una frase\nESPECIALIDAD: una frase\nAREAS: áreas que ve, separadas por coma (de: ' + Object.keys(NOMBRES_DISTRITOS).join(', ') + ', o "todas")\nPREGUNTA:\n- hasta dos preguntas que hace primero\nMARCOS:\n- hasta tres marcos\nACCIONES:\n- hasta tres acciones\nLIMITES:\n- hasta dos límites\nMOTIVO: por qué este negocio lo necesita',
      'No propongas agentes que dupliquen a los existentes.',
      conversacionesRecientes,
    ].join('\n\n');
    try {
      agenteEnCurso = 'optimizacion';
      const respuesta = await conversar(cfg, sistemaDe(ORQUESTADOR), [{ rol: 'usuario', texto: instruccion }]);
      const propuestas = parsearPropuestas(respuesta);
      const aplicadas = [];
      for (const p of propuestas) {
        const id = resolverAgente(p.nombre, propios);
        if (!id) continue;
        ajustes.proponer(id, p, p.motivo);
        aplicadas.push({ id, nombre: nombreDe(id, propios) });
      }
      // Subagentes nuevos: quedan como propuesta hasta que el usuario los acepte en "Mis agentes".
      const nuevos = parsearNuevosAgentes(respuesta).filter((n) => !resolverAgente(n.nombre, propios));
      const propuestasNuevas = nuevos.length ? personalizados.proponer(nuevos) : personalizados.propuestas();
      emitir('propuestas_ajustes', { agentes: aplicadas.length, nuevos: propuestasNuevas.length });
      return enviarJSON(res, 200, { ok: true, propuestas: aplicadas, nuevos: propuestasNuevas, ajustes: ajustes.todos() });
    } catch (err) {
      return enviarJSON(res, 502, { ok: false, errores: [`No se pudieron generar propuestas: ${err.message}`] });
    } finally {
      agenteEnCurso = '';
    }
  }

  // Responde una petición de otro agente (consulta o encargo). El agente consultado puede a su vez hacer UNA consulta
  // (segunda vuelta) mientras quede presupuesto de llamadas de la orden; a la tercera vuelta ya no.
  const PRESUPUESTO_LLAMADAS = 6;
  // adjunto: texto extra (p. ej. el informe completo) que recibe el agente junto con la petición, sin guardarse dos veces.
  async function responderComoAgente(cfg, area, texto, presupuesto = null, profundidad = 0, adjunto = '') {
    const inactivo = motivoInactivo(area);
    if (inactivo) throw new Error(`agente ${inactivo}`);
    if (presupuesto && presupuesto.usadas >= presupuesto.max) throw new Error('se agotó el presupuesto de consultas de esta orden');
    if (presupuesto) presupuesto.usadas++;
    const puedeConsultar = profundidad === 0 && presupuesto && presupuesto.usadas < presupuesto.max;
    // Prompt compacto (sin referencias largas, sector ni agenda) y modelo económico: son respuestas cortas entre agentes.
    const sistema = `${sistemaDe(area, { compacto: true })}\n\nEsta petición viene de otro agente del sistema: responde breve y directo, sin usar DELEGAR${puedeConsultar ? '. Si te falta un dato que solo otro agente tiene, puedes hacer UNA sola CONSULTAR' : ' ni CONSULTAR'}.${adjunto ? `\n\n${adjunto}` : ''}`;
    const historial = conversaciones.leer(area).slice(-4).map(({ rol, texto: t }) => ({ rol, texto: t }));
    const previo = agenteEnCurso;
    agenteEnCurso = area; // el consumo se atribuye a quien responde, no a quien preguntó
    const fin = trabajo(area, /^Encargo del Orquestador/.test(texto) ? 'encargo' : 'consulta', texto);
    let cruda;
    try {
      cruda = await conversar(cfg, sistema, [...historial, { rol: 'usuario', texto }], { nivel: 'automatico' });
      fin(true);
    } catch (err) {
      fin(false, { error: err.message });
      throw err;
    } finally {
      agenteEnCurso = previo;
    }
    if (!cruda) throw new Error('sin respuesta');
    let respuesta = cruda;
    if (puedeConsultar) {
      // Solo consultas e informes: un agente consultado nunca delega.
      const sinDelegar = cruda.replace(/^\s*DELEGAR\s*:.*$/gim, '');
      const intercambios = await colaborar({
        areaOrigen: area, nombreOrigen: nombreDe(area, personalizados.leer().agentes), respuesta: sinDelegar, propios: personalizados.leer().agentes, equipo: equipo.leer(), maximo: 1,
        responder: (destino, t) => responderComoAgente(cfg, destino, t, presupuesto, profundidad + 1),
        informar: (destino, t) => { memoria.agregarNota(destino, area, t); emitir('nota_agente', { origen: area, destino }); },
      });
      respuesta = componerRespuesta(sinDelegar, intercambios);
    }
    conversaciones.agregar(area, { rol: 'usuario', texto, origen: 'agente' });
    conversaciones.agregar(area, { rol: 'agente', texto: respuesta });
    recordar(area, cruda);
    emitir('intercambio_agentes', { area, profundidad });
    return respuesta;
  }

  // Resuelve CONSULTAR/DELEGAR/INFORMAR de una respuesta y devuelve el texto final y los intercambios.
  async function resolverColaboracion(cfg, areaOrigen, respuesta, { maximo = null, adjunto = '' } = {}) {
    const propios = personalizados.leer().agentes;
    const eq = equipo.leer();
    const nombreOrigen = eq.areas?.[areaOrigen]?.agente || (areaOrigen === ORQUESTADOR ? 'el Orquestador' : `el agente de ${areaOrigen}`);
    const presupuesto = { usadas: 0, max: PRESUPUESTO_LLAMADAS };
    const intercambios = await colaborar({
      areaOrigen, nombreOrigen, respuesta, propios, equipo: eq, maximo,
      responder: (destino, texto) => responderComoAgente(cfg, destino, texto, presupuesto, 0, adjunto),
      informar: (destino, texto) => { memoria.agregarNota(destino, areaOrigen, texto); emitir('nota_agente', { origen: areaOrigen, destino }); },
    });
    return { texto: componerRespuesta(respuesta, intercambios), intercambios };
  }

  // Informe del Orquestador (reglas, sin IA): estado, contradicciones, acciones vencidas, mercado y sitio.
  function informeActual() {
    return informeOficina({ diagnostico: store.ultimo(), equipo: equipo.leer(), marca: marca.leer(), memoria, investigacion: investigaciones.ultima(), sitio: analisisSitio.ultimo(), apoyo: apoyo(), propios: personalizados.leer().agentes });
  }

  async function analizarDocumento(req, res, id) {
    const meta = documentos.obtener(id);
    if (!meta) return enviarJSON(res, 404, { error: 'Documento no encontrado' });
    const cfg = configActual();
    const bloqueo = bloqueoIA(cfg) || (cfg.permisos?.documentosIA === false ? 'Documentos con IA desactivados por ti en Accesos y permisos' : null);
    if (bloqueo) {
      const analisis = documentos.guardarAnalisis(id, { pendiente: true, resumen: `${bloqueo}: el documento queda guardado para analizarlo después.` });
      return enviarJSON(res, 200, { ok: true, pendiente: true, analisis });
    }
    agenteEnCurso = 'documentos';
    const esImagen = documentos.esImagen(meta);
    if (!esImagen && !meta.texto) {
      const analisis = documentos.guardarAnalisis(id, { pendiente: false, resumen: 'No se pudo extraer texto de este archivo (por ejemplo, un PDF escaneado). Conviértelo a Word o a imagen y vuelve a subirlo.' });
      return enviarJSON(res, 200, { ok: true, analisis });
    }
    const instruccion = [
      `Analiza el documento "${meta.nombre}" que te entrega la empresa.`,
      '1) Resume en cinco líneas qué es y qué dice. 2) Señala los datos o cifras importantes. 3) Indica a qué áreas afecta.',
      '4) Reparte el trabajo: por cada área que deba actuar, escribe una línea DELEGAR con una orden concreta basada en el documento.',
      esImagen ? 'El documento es una imagen: describe lo que ves y extrae el texto legible.' : `Contenido del documento (puede estar truncado):\n${meta.texto.slice(0, MAX_TEXTO_DOCUMENTO_IA)}`,
    ].join('\n');
    const mensaje = { rol: 'usuario', texto: instruccion };
    if (esImagen) {
      const bytes = documentos.contenido(id);
      if (!bytes) return enviarJSON(res, 404, { error: 'No se encontró el archivo' });
      mensaje.imagen = { tipo: meta.tipo, base64: bytes.toString('base64') };
    }
    try {
      const respuesta = await conversar(cfg, sistemaDe(ORQUESTADOR), [mensaje]);
      if (!respuesta) throw new Error('El proveedor no devolvió texto');
      const { texto, intercambios } = await resolverColaboracion(cfg, ORQUESTADOR, respuesta);
      conversaciones.agregar(ORQUESTADOR, { rol: 'usuario', texto: `Analiza el documento "${meta.nombre}" y reparte el trabajo.` });
      conversaciones.agregar(ORQUESTADOR, { rol: 'agente', texto });
      recordar(ORQUESTADOR, respuesta);
      const analisis = documentos.guardarAnalisis(id, { pendiente: false, resumen: texto, delegaciones: intercambios });
      emitir('documento_analizado', { id, nombre: meta.nombre, encargos: intercambios.length });
      return enviarJSON(res, 200, { ok: true, analisis });
    } catch (err) {
      return enviarJSON(res, 502, { ok: false, errores: [`No se pudo analizar: ${err.message}`] });
    } finally {
      agenteEnCurso = '';
    }
  }
  const idsPropios = () => personalizados.ids();
  const equipo = crearEquipo(config.archivoEquipo, idsPropios);
  const conversaciones = crearConversaciones(config.dirConversaciones, idsPropios);
  const configuracion = crearConfiguracion(config.archivoConfig);
  const HISTORIAL_PARA_IA = 12;
  const HISTORIAL_AUTOMATICO = 6; // piloto y rutinas: menos historial, menos tokens

  const uso = crearUso(config.archivoUso);
  const ajustes = crearAjustes(config.archivoAjustes);
  const AGENTES_CON_BUSQUEDA = ['inversiones']; // el analista de inversiones investiga precios y tasas antes de recomendar
  const BUSQUEDAS_EN_CHAT = 5;
  const investigaciones = crearInvestigaciones(config.dirInvestigaciones);
  const analisisSitio = crearAnalisisSitio(config.dirSitio);
  const programacion = crearProgramacion(config.archivoProgramacion);
  const memoria = crearMemoria(config.archivoMemoria);
  const calendario = crearCalendario(config.archivoCalendario);
  const rutinas = crearRutinas(config.archivoRutinas);
  const piloto = crearPiloto(config.archivoPiloto);
  // Agentes que pueden ir en piloto: Orquestador, áreas, apoyo activo y propios.
  const idsPiloto = () => [ORQUESTADOR, ...Object.keys(NOMBRES_DISTRITOS), ...apoyo().activos, ...idsPropios()];
  const AGENTES_CON_AGENDA = [ORQUESTADOR, 'proyectos', 'direccion', 'planificador'];
  let agenteEnCurso = '';
  let investigacionEnCurso = false;

  // Agenda de los próximos 14 días: lo importado del calendario del usuario más las fechas propias de la oficina.
  function agendaProxima(dias = 14) {
    const desde = new Date();
    const hasta = new Date(); hasta.setDate(hasta.getDate() + dias);
    const [d, h] = [desde, hasta].map((f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`);
    const propias = eventosDeOficina({ memoria, diagnostico: store.ultimo(), programacion, propios: personalizados.leer().agentes }).filter((e) => e.fecha >= d && e.fecha <= h).map((e) => ({ ...e, hora: '', origen: 'oficina' }));
    const importados = calendario.proximos(dias).map((e) => ({ ...e, origen: 'calendario' }));
    return [...importados, ...propias].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
  }

  // Tareas semanales. Corren solas mientras el servidor esté encendido (programador: false lo apaga, p. ej. en pruebas).
  // El permiso "Tareas semanales automáticas" del dashboard las detiene sin borrar la programación.
  const conPermiso = (fn) => async () => {
    if (configActual().permisos?.tareasAutomaticas === false) throw new Error('Tareas automáticas desactivadas en Accesos y permisos');
    return fn();
  };
  const programador = crearProgramador({
    programacion,
    tareas: {
      investigacion: conPermiso(async () => { const r = await investigar({ origen: 'programada' }); return { id: r.id, competidores: r.competidores.length }; }),
      sitio: conPermiso(async () => { const r = await revisarSitio({ origen: 'programada' }); return { id: r.id, puntaje: r.puntaje }; }),
    },
    ahora: config.ahora,
  });

  // Configuración vigente: lo guardado desde la pantalla manda sobre .env. Se relee en cada uso para no reiniciar.
  // Lleva el registrador de consumo para que cada llamada al proveedor quede anotada.
  const configActual = () => ({
    ...configuracionEfectiva(config, configuracion.leer()),
    registrarUso: (u) => uso.registrar({ ...u, agente: agenteEnCurso }),
  });

  // Estado del monitor: consumo del mes, límite y modelo activo.
  function estadoUso(cfg = configActual()) {
    const resumen = uso.resumen();
    const limite = cfg.limiteMensualTokens || 0;
    const limiteDiario = cfg.limiteDiarioTokens || 0;
    return { ...resumen, limite, limiteDiario, alcanzado: limiteAlcanzado(resumen, limite) || limiteAlcanzado({ total: resumen.hoy }, limiteDiario), porcentaje: limite ? Math.min(100, Math.round((resumen.total / limite) * 100)) : null, porcentajeHoy: limiteDiario ? Math.min(100, Math.round((resumen.hoy / limiteDiario) * 100)) : null, modelo: modeloActivo(cfg), modeloAutomatico: proveedorActivo(cfg) ? modeloPara(cfg, 'automatico') : '', modoAhorro: cfg.modoAhorro || 'equilibrado', usarLotes: cfg.usarLotes !== false, proveedor: proveedorActivo(cfg) || 'ninguno' };
  }

  // ¿Se puede llamar al proveedor ahora? Devuelve null si sí, o el motivo si no.
  function bloqueoIA(cfg) {
    if (cfg.permisos && cfg.permisos.ia === false) return 'IA desactivada por ti en Accesos y permisos';
    if (!proveedorActivo(cfg)) return 'Sin IA configurada';
    const resumen = uso.resumen();
    if (limiteAlcanzado(resumen, cfg.limiteMensualTokens)) return `Se alcanzó el límite mensual de ${cfg.limiteMensualTokens.toLocaleString('es-MX')} tokens; súbelo o espera al próximo mes en Configuración`;
    if (limiteAlcanzado({ total: resumen.hoy }, cfg.limiteDiarioTokens)) return `Se alcanzó el límite diario de ${cfg.limiteDiarioTokens.toLocaleString('es-MX')} tokens; mañana se reanuda (o súbelo en Configuración)`;
    return null;
  }

  // Prueba una conexión con los valores propuestos (o los guardados si vienen enmascarados).
  async function probarConexion(req, res) {
    let cuerpo;
    try {
      cuerpo = await leerCuerpo(req);
    } catch (err) {
      return enviarJSON(res, 400, { ok: false, errores: [err.message] });
    }
    const propuesta = sanitizarConfiguracion(cuerpo);
    const guardada = configuracion.leer();
    for (const campo of ['anthropicKey', 'openaiKey']) {
      if (!propuesta[campo] || propuesta[campo].startsWith('••••')) propuesta[campo] = guardada[campo];
    }
    const cfg = configuracionEfectiva(config, propuesta);
    if (!proveedorActivo(cfg)) {
      return enviarJSON(res, 422, { ok: false, errores: ['Elige un proveedor y escribe su clave (y el modelo, en OpenAI).'] });
    }
    try {
      const respuesta = await conversar(cfg, 'Responde únicamente con la palabra OK.', [{ rol: 'usuario', texto: 'Prueba de conexión.' }]);
      return enviarJSON(res, 200, { ok: true, proveedor: proveedorActivo(cfg), respuesta: String(respuesta || '').slice(0, 80) });
    } catch (err) {
      return enviarJSON(res, 502, { ok: false, errores: [`No se pudo conectar: ${err.message}`] });
    }
  }

  // Orden a un agente. Sin IA la orden queda pendiente para la persona responsable; con IA el agente responde.
  async function ordenar(req, res, area) {
    let cuerpo;
    try {
      cuerpo = await leerCuerpo(req);
    } catch (err) {
      return enviarJSON(res, 400, { ok: false, errores: [err.message] });
    }
    const texto = limpiarTexto(cuerpo.texto);
    if (!texto) return enviarJSON(res, 422, { ok: false, errores: [`Escribe una orden de hasta ${MAX_TEXTO} caracteres`] });
    const r = await procesarOrden(area, texto, { origen: 'usuario' });
    return enviarJSON(res, r.codigo, r.cuerpo);
  }

  // Núcleo de una orden (la usa el chat y las rutinas automáticas). Devuelve { codigo, cuerpo }.
  // Paso 1 de una orden: registrar el mensaje, clasificarlo y armar el prompt. Devuelve lo necesario para llamar a la IA
  // (o para encolarla en un lote) y, si la IA está bloqueada, la respuesta "pendiente" lista.
  function prepararOrden(area, texto, { origen = 'usuario' } = {}) {
    const cfg = configActual();
    const bloqueo = bloqueoIA(cfg);
    const activo = !bloqueo;
    // ¿Qué nos está dando el usuario: un hecho de la empresa, una idea, una pregunta de concepto o una orden?
    const clasificacion = clasificarTexto(texto);
    conversaciones.agregar(area, { rol: 'usuario', texto, pendiente: !activo, tipo: clasificacion.tipo, origen });
    let hechosNuevos = 0;
    if (clasificacion.contieneHecho && origen === 'usuario') {
      try { hechosNuevos = memoria.agregarHechos(area, extraerHechosDeTexto(texto), 'usuario'); } catch { /* la memoria nunca bloquea una orden */ }
    }
    // Órdenes repetidas: a la tercera vez parecida, la oficina ofrece automatizarla.
    let sugerenciaRutina = null;
    if (origen === 'usuario') {
      try { sugerenciaRutina = rutinas.registrarOrden(area, texto).sugerencia; } catch { /* sin efecto en la orden */ }
      if (sugerenciaRutina) emitir('rutina_sugerida', { area, veces: sugerenciaRutina.veces });
    }
    emitir('orden_enviada', { area, pendiente: !activo, tipo: clasificacion.tipo, hechos: hechosNuevos, origen });
    if (!activo) {
      return { bloqueado: { codigo: 200, cuerpo: { ok: true, pendiente: true, motivo: bloqueo, respuesta: null, clasificacion, sugerenciaRutina, mensajes: conversaciones.leer(area) } } };
    }
    let sistema = `${sistemaDe(area)}\n\nEl mensaje actual del usuario es ${DESCRIPCION_TIPO[clasificacion.tipo]}. ${instruccionPorTipo(clasificacion.tipo)}`;
    if (origen === 'rutina') sistema += '\n\nEsta orden la envía una rutina automática que el usuario programó: responde completo y con fecha, como un reporte que leerá después.';
    if (origen === 'piloto') sistema += '\n\nEsta es tu revisión periódica automática (piloto automático): nadie te la pidió hoy. Escribe como un reporte fechado que el dueño leerá después: breve, concreto, con tus ACCIONES y, si aplica, CONSULTAR o INFORMAR a otros agentes. Si no hay nada nuevo desde tu última revisión, dilo en dos líneas y no inventes trabajo.';
    // Notas de las bóvedas relacionadas con la orden (solo lectura, con tope de fragmentos).
    let notas = [];
    try {
      notas = buscar(fuentes.leer(), texto);
      if (notas.length) sistema += `\n\n${fragmentosParaPrompt(notas)}`;
    } catch { /* una bóveda inaccesible no debe impedir la orden */ }
    // Lo automático lleva menos historial: cada mensaje reenviado cuesta tokens en cada orden.
    const largoHistorial = origen === 'usuario' ? HISTORIAL_PARA_IA : HISTORIAL_AUTOMATICO;
    const historial = conversaciones.leer(area).slice(-largoHistorial).map(({ rol, texto: t }) => ({ rol, texto: t }));
    const nivel = origen === 'usuario' ? 'principal' : 'automatico';
    const conBusqueda = AGENTES_CON_BUSQUEDA.includes(area) && cfg.permisos?.busquedaWeb !== false;
    return { cfg, sistema, historial, nivel, conBusqueda, clasificacion, sugerenciaRutina, notas, origen };
  }

  // Paso 2: con la respuesta cruda de la IA, resolver colaboración, guardar, recordar y avisar.
  async function concluirOrden(area, cruda, { cfg, clasificacion, sugerenciaRutina = null, notas = [], origen, busquedas = [] }) {
    const { texto: respuesta, intercambios } = await resolverColaboracion(cfg, area, cruda);
    conversaciones.agregar(area, { rol: 'agente', texto: respuesta });
    const recuerdo = recordar(area, cruda);
    memoria.notasPara(area, { marcarLeidas: true }); // las notas ya entraron en el contexto de esta orden
    emitir('respuesta_agente', { area, intercambios: intercambios.length, acciones: recuerdo.nuevas, hechos: recuerdo.hechos, ideas: recuerdo.ideas, conceptos: recuerdo.conceptos, origen, destinos: intercambios.map((i) => i.destino).filter(Boolean) });
    return { codigo: 200, cuerpo: { ok: true, pendiente: false, respuesta, intercambios, busquedas, clasificacion, sugerenciaRutina, memoria: recuerdo, notas: notas.map((n) => ({ fuente: n.fuente, ruta: n.ruta, titulo: n.titulo })), uso: estadoUso(cfg), mensajes: conversaciones.leer(area) } };
  }

  async function procesarOrden(area, texto, { origen = 'usuario' } = {}) {
    const prep = prepararOrden(area, texto, { origen });
    if (prep.bloqueado) return prep.bloqueado;
    const { cfg, sistema, historial, nivel, conBusqueda } = prep;
    agenteEnCurso = area;
    const fin = trabajo(area, conBusqueda ? 'busqueda' : 'orden', conBusqueda ? `Investigando en internet para: ${texto.slice(0, 100)}` : texto);
    try {
      // Algunos agentes investigan en internet dentro del chat (búsqueda web del proveedor, con tope y cobro por búsqueda).
      let cruda;
      let busquedas = [];
      if (conBusqueda) {
        const r = await conversarConBusqueda(cfg, `${sistema}\n\nTienes búsqueda web activa (máximo ${BUSQUEDAS_EN_CHAT} búsquedas): úsala solo para datos externos que no tengas (precios, tasas, proveedores, normas) y cita la fuente.`, historial, { maxBusquedas: BUSQUEDAS_EN_CHAT });
        cruda = r.texto;
        busquedas = r.busquedas;
        if (busquedas.length) emitir('busquedas_web', { area, consultas: busquedas.map((b) => b.consulta) });
      } else {
        cruda = await conversar(cfg, sistema, historial, { nivel });
      }
      if (!cruda) throw new Error('El proveedor no devolvió texto');
      fin(true, { busquedas: busquedas.length });
      return await concluirOrden(area, cruda, { ...prep, busquedas });
    } catch (err) {
      fin(false, { error: err.message });
      return { codigo: 502, cuerpo: { ok: false, errores: [`El agente no pudo responder: ${err.message}`], mensajes: conversaciones.leer(area) } };
    } finally {
      agenteEnCurso = '';
    }
  }

  // ---- Lotes del piloto automático (Message Batches: 50% del precio; resultados en minutos u horas) ----
  function leerLotes() {
    try { return existsSync(config.archivoLotes) ? JSON.parse(readFileSync0(config.archivoLotes, 'utf8')) : []; } catch { return []; }
  }
  function escribirLotes(lista) {
    mkdirSync(dirname(config.archivoLotes), { recursive: true });
    writeFileSync(config.archivoLotes, JSON.stringify(lista, null, 2), 'utf8');
  }

  // Encola las revisiones del piloto que ya tocan en un solo lote. Devuelve los agentes encolados.
  async function encolarPiloto(vencidos, ahora) {
    const propios = personalizados.leer().agentes;
    const items = [];
    const contexto = {};
    for (const p of vencidos) {
      const prep = prepararOrden(p.id, p.tareaEfectiva, { origen: 'piloto' });
      if (prep.bloqueado) continue;
      items.push({ id: p.id, sistema: prep.sistema, mensajes: prep.historial, nivel: 'automatico' });
      contexto[p.id] = { clasificacion: prep.clasificacion, origen: 'piloto', nombre: p.nombre };
    }
    if (!items.length) return [];
    const cfg = configActual();
    const fin = trabajo(ORQUESTADOR, 'lote', `Enviando ${items.length} revisiones del piloto en un lote (50% del precio)`);
    try {
      const loteId = await enviarLote(cfg, items);
      fin(true);
      escribirLotes([...leerLotes(), { id: loteId, creado: ahora.toISOString(), agentes: contexto }]);
      for (const p of vencidos) piloto.marcarEjecutado(p.id, 'en lote (esperando resultado)', ahora, propios);
      emitir('lote_enviado', { id: loteId, agentes: Object.keys(contexto) });
      return Object.keys(contexto);
    } catch (err) {
      fin(false, { error: err.message });
      for (const p of vencidos) piloto.marcarEjecutado(p.id, `error al enviar el lote: ${err.message}`, ahora, propios);
      return [];
    }
  }

  // Revisa los lotes pendientes y, cuando terminan, concluye cada orden como si la IA hubiera respondido en directo.
  async function revisarLotes() {
    const lotes = leerLotes();
    if (!lotes.length) return [];
    const cfg = configActual();
    if (!proveedorActivo(cfg)) return [];
    const propios = personalizados.leer().agentes;
    const ahora = () => (config.ahora ? config.ahora() : new Date()); // reloj inyectable (pruebas)
    const concluidos = [];
    const restantes = [];
    for (const lote of lotes) {
      let resultados = null;
      try {
        resultados = await resultadosLote(cfg, lote.id, (id) => id);
      } catch (err) {
        // Un lote que lleva más de un día sin poder consultarse se descarta y sus agentes quedan marcados con el error.
        if (ahora() - new Date(lote.creado) > 26 * 3600 * 1000) {
          for (const id of Object.keys(lote.agentes)) piloto.marcarEjecutado(id, `lote perdido: ${err.message}`, ahora(), propios);
          continue;
        }
        restantes.push(lote);
        continue;
      }
      if (!resultados) { restantes.push(lote); continue; }
      for (const r of resultados) {
        const ctx = lote.agentes[r.id];
        if (!ctx) continue;
        if (!r.ok || !r.texto) {
          piloto.marcarEjecutado(r.id, `error en el lote: ${r.error || 'sin texto'}`, ahora(), propios);
          continue;
        }
        agenteEnCurso = r.id;
        try {
          const res = await concluirOrden(r.id, r.texto, { cfg, clasificacion: ctx.clasificacion, origen: 'piloto' });
          piloto.marcarEjecutado(r.id, `respondida (lote) · ${res.cuerpo.intercambios?.length || 0} intercambios · ${res.cuerpo.memoria?.nuevas || 0} acciones`, ahora(), propios);
          emitir('piloto_ejecutado', { area: r.id, nombre: ctx.nombre, resultado: 'respondida (lote)', pendiente: false, destinos: res.cuerpo.intercambios?.map((i) => i.destino).filter(Boolean) || [] });
          concluidos.push(r.id);
        } catch (err) {
          piloto.marcarEjecutado(r.id, `error al concluir: ${err.message}`, ahora(), propios);
        } finally {
          agenteEnCurso = '';
        }
      }
    }
    escribirLotes(restantes);
    return concluidos;
  }

  // Rutinas automáticas: cada minuto se revisa si alguna ya debe correr (respeta el permiso "rutinas").
  async function tickRutinas(ahora = config.ahora ? config.ahora() : new Date()) {
    const cfg = configActual();
    if (cfg.permisos?.rutinas === false) return [];
    const corridas = [];
    for (const r of rutinas.vencidas(ahora)) {
      if (!esAreaValida(r.area, idsPropios()) || motivoInactivo(r.area)) { rutinas.marcarEjecutada(r.id, 'agente no disponible', ahora); continue; }
      const res = await procesarOrden(r.area, r.texto, { origen: 'rutina' });
      rutinas.marcarEjecutada(r.id, res.cuerpo.pendiente ? `pendiente: ${res.cuerpo.motivo}` : res.cuerpo.ok ? 'respondida' : res.cuerpo.errores?.[0], ahora);
      emitir('rutina_ejecutada', { id: r.id, area: r.area, nombre: r.nombre, pendiente: Boolean(res.cuerpo.pendiente) });
      corridas.push(r.id);
    }
    return corridas;
  }

  // Piloto automático: cada minuto, hasta MAX_POR_TICK agentes a los que ya les tocó hacen su revisión periódica.
  // Con lotes activados (Anthropic), todas las revisiones que tocan se envían juntas al 50% del precio y se concluyen al llegar.
  async function tickPiloto(ahora = config.ahora ? config.ahora() : new Date()) {
    const cfg = configActual();
    await revisarLotes().catch(() => {});
    if (cfg.permisos?.piloto === false || bloqueoIA(cfg)) return [];
    const propios = personalizados.leer().agentes;
    const vencidos = piloto.vencidos(idsPiloto(), ahora, propios);
    if (!vencidos.length) return [];
    const proveedor = proveedorActivo(cfg);
    if (cfg.usarLotes !== false && (proveedor === 'anthropic' || proveedor === 'prueba') && !AGENTES_CON_BUSQUEDA.some((a) => vencidos.some((v) => v.id === a))) {
      return encolarPiloto(vencidos.slice(0, 25), ahora);
    }
    const corridas = [];
    for (const p of vencidos.slice(0, MAX_POR_TICK)) {
      const res = await procesarOrden(p.id, p.tareaEfectiva, { origen: 'piloto' });
      const resultado = res.cuerpo.pendiente ? `pendiente: ${res.cuerpo.motivo}` : res.cuerpo.ok ? `respondida · ${res.cuerpo.intercambios?.length || 0} intercambios · ${res.cuerpo.memoria?.nuevas || 0} acciones` : res.cuerpo.errores?.[0];
      piloto.marcarEjecutado(p.id, resultado, ahora, propios);
      emitir('piloto_ejecutado', { area: p.id, nombre: p.nombre, resultado, pendiente: Boolean(res.cuerpo.pendiente), destinos: res.cuerpo.intercambios?.map((i) => i.destino).filter(Boolean) || [] });
      corridas.push(p.id);
    }
    return corridas;
  }

  // Panel "Accesos y permisos": qué puede hacer la aplicación, qué sale del equipo y el interruptor de cada cosa.
  function panelPermisos() {
    const cfg = configActual();
    const guardada = configuracion.leer();
    const filas = Object.entries(PERMISOS).map(([id, p]) => ({ id, ...p, activo: cfg.permisos[id] !== false, tipo: 'permiso' }));
    const informativas = [
      { id: 'proveedor', nombre: 'Proveedor de IA y clave', descripcion: proveedorActivo(cfg) ? `${proveedorActivo(cfg)} · modelo ${modeloActivo(cfg) || 'por defecto'} · clave ${enmascarar(guardada)[proveedorActivo(cfg) === 'openai' ? 'openaiKey' : 'anthropicKey'] || 'desde .env'}` : 'Sin proveedor: los agentes trabajan sin IA.', sale: 'Solo con tu clave, guardada en data/config.json dentro de este equipo.', tipo: 'info' },
      { id: 'bovedas', nombre: 'Bóvedas de notas', descripcion: `${fuentes.leer().length} carpeta(s) conectada(s), solo lectura.`, sale: 'Fragmentos de notas relacionados con una orden, solo si la IA está activa.', tipo: 'info' },
      { id: 'servidor', nombre: 'Servidor local', descripcion: `Escucha solo en ${config.host}:${config.puerto}; nadie fuera de esta computadora puede entrar.`, sale: 'Nada.', tipo: 'info' },
      { id: 'datos', nombre: 'Tus datos', descripcion: 'Diagnósticos, conversaciones, memoria, documentos y calendario viven en la carpeta data/ junto a la aplicación.', sale: 'Nada: respalda o borra la carpeta cuando quieras.', tipo: 'info' },
    ];
    return { permisos: cfg.permisos, filas: [...filas, ...informativas], uso: estadoUso(cfg) };
  }
  const eventos = new EventEmitter();
  const publico = join(config.raiz, 'public');
  const actividad = crearActividad(config.archivoActividad);

  // Todo evento va al feed en vivo (SSE) y al registro persistente de actividad.
  function emitir(tipo, datos) {
    const evento = { tipo, datos, momento: new Date().toISOString() };
    actividad.registrar(evento);
    eventos.emit('evento', evento);
  }

  // Marca el inicio y el fin de un trabajo de un agente para que el usuario vea qué está pasando ahora mismo.
  let contadorTrabajo = 0;
  function trabajo(area, tipo, detalle) {
    const id = `t${Date.now()}-${++contadorTrabajo}`;
    const inicio = Date.now();
    emitir('trabajo_inicio', { id, area, tipo, detalle: String(detalle || '').slice(0, 160) });
    return (ok = true, extra = {}) => emitir('trabajo_fin', { id, area, tipo, ok, ms: Date.now() - inicio, ...extra });
  }

  async function diagnosticar(req, res) {
    let entrada;
    try {
      entrada = await leerCuerpo(req);
    } catch (err) {
      return enviarJSON(res, 400, { ok: false, errores: [err.message] });
    }

    const { ok, errores, datos } = validar(entrada);
    if (!ok) return enviarJSON(res, 422, { ok: false, errores });

    const resultado = evaluar(datos);
    const ia = await resumirConIA(configActual(), resultado);

    // Se guarda el equipo tal como estaba al generar el diagnóstico, para saber quién respondía por cada área.
    const registro = store.guardar({
      contacto_nombre: datos.contacto_nombre,
      datos,
      resultado,
      resumenIA: ia,
      equipo: equipo.leer(),
    });

    emitir('diagnostico_creado', {
      id: registro.id,
      nombre: registro.contacto_nombre,
      prioridad: resultado.prioridad,
    });

    enviarJSON(res, 201, { ok: true, id: registro.id, resultado, resumenIA: ia });
  }

  function flujoEventos(req, res) {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(': conectado\n\n');
    const enviar = (evento) => res.write(`data: ${JSON.stringify(evento)}\n\n`);
    eventos.on('evento', enviar);
    req.on('close', () => eventos.off('evento', enviar));
  }

  async function servirEstatico(req, res, rutaUrl) {
    const relativa = rutaUrl === '/' ? 'index.html' : rutaUrl.slice(1);
    const ruta = normalize(join(publico, relativa));
    if (!ruta.startsWith(publico + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const contenido = await readFile(ruta);
      res.writeHead(200, { 'content-type': TIPOS[extname(ruta)] || 'application/octet-stream' });
      res.end(contenido);
    } catch {
      res.writeHead(404).end('No encontrado');
    }
  }

  // Ningún error de una petición debe tumbar el servidor: se registra y se responde 500.
  const servidor = createServer((req, res) => {
    despachar(req, res).catch((err) => {
      console.error(`Error atendiendo ${req.method} ${req.url}: ${err.message}`);
      if (!res.headersSent) enviarJSON(res, 500, { ok: false, errores: ['Error interno del servidor local'] });
      else res.end();
    });
  });

  async function despachar(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const ruta = url.pathname;
    const metodo = req.method;

    if (ruta === '/api/formulario' && metodo === 'GET') {
      return enviarJSON(res, 200, {
        secciones: SECCIONES,
        campos: CAMPOS,
        etiquetasNoSe: ETIQUETAS_NO_SE,
      });
    }

    if (ruta === '/api/diagnosticos' && metodo === 'POST') return diagnosticar(req, res);

    if (ruta === '/api/diagnosticos' && metodo === 'GET') {
      return enviarJSON(res, 200, { diagnosticos: store.listar() });
    }

    const coincide = ruta.match(/^\/api\/diagnosticos\/([^/]+)$/);
    if (coincide && metodo === 'GET') {
      const registro = store.obtener(coincide[1]);
      return registro ? enviarJSON(res, 200, registro) : enviarJSON(res, 404, { error: 'No encontrado' });
    }

    // Reportes para personas: Word y página imprimible (PDF desde el navegador).
    const reporte = ruta.match(/^\/api\/diagnosticos\/([^/]+)\/reporte\.(docx|html)$/);
    if (reporte && metodo === 'GET') {
      const registro = store.obtener(reporte[1]);
      if (!registro) return enviarJSON(res, 404, { error: 'No encontrado' });
      const fecha = (registro.creado || '').slice(0, 10);
      if (reporte[2] === 'docx') {
        const docx = generarDocx(registro, registro.equipo || equipo.leer(), marca.leer());
        res.writeHead(200, {
          'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'content-disposition': `attachment; filename="diagnostico-${fecha}.docx"`,
          'content-length': docx.length,
        });
        return res.end(docx);
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(generarHtml(registro, registro.equipo || equipo.leer(), marca.leer()));
    }

    // Documentos para analizar (PDF, Word, texto, imágenes)
    if (ruta === '/api/documentos' && metodo === 'GET') return enviarJSON(res, 200, { documentos: documentos.listar() });
    if (ruta === '/api/documentos' && metodo === 'POST') {
      try {
        const buffer = await leerBinario(req, LIMITE_DOCUMENTO + 1);
        const nombre = decodeURIComponent(String(req.headers['x-nombre'] || '')).slice(0, 120);
        const doc = documentos.guardar(nombre, String(req.headers['content-type'] || '').split(';')[0].trim(), buffer);
        emitir('documento_subido', { id: doc.id, nombre: doc.nombre });
        return enviarJSON(res, 201, doc);
      } catch (err) {
        return enviarJSON(res, 422, { ok: false, errores: [err.message] });
      }
    }
    const doc = ruta.match(/^\/api\/documentos\/([0-9a-f-]{36})(\/analizar)?$/);
    if (doc) {
      if (doc[2] && metodo === 'POST') return analizarDocumento(req, res, doc[1]);
      if (!doc[2] && metodo === 'GET') {
        const meta = documentos.obtener(doc[1]);
        return meta ? enviarJSON(res, 200, { ...meta, texto: (meta.texto || '').slice(0, 4000) }) : enviarJSON(res, 404, { error: 'Documento no encontrado' });
      }
      if (!doc[2] && metodo === 'DELETE') return documentos.borrar(doc[1]) ? enviarJSON(res, 200, { ok: true }) : enviarJSON(res, 404, { error: 'Documento no encontrado' });
    }

    // Bóvedas de notas (Obsidian u otras carpetas con Markdown)
    if (ruta === '/api/fuentes' && metodo === 'GET') return enviarJSON(res, 200, { fuentes: fuentes.leer() });
    if (ruta === '/api/fuentes' && metodo === 'POST') {
      try {
        const cuerpo = await leerCuerpo(req);
        return enviarJSON(res, 201, { fuentes: fuentes.agregar(cuerpo) });
      } catch (err) {
        return enviarJSON(res, 422, { ok: false, errores: [err.message] });
      }
    }
    if (ruta === '/api/fuentes' && metodo === 'DELETE') {
      try {
        const cuerpo = await leerCuerpo(req);
        return enviarJSON(res, 200, { fuentes: fuentes.quitar(cuerpo.ruta) });
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, errores: [err.message] });
      }
    }
    if (ruta === '/api/fuentes/buscar' && metodo === 'GET') {
      const q = url.searchParams.get('q') || '';
      try {
        return enviarJSON(res, 200, { resultados: buscar(fuentes.leer(), q, { maxChars: 300 }) });
      } catch (err) {
        return enviarJSON(res, 500, { ok: false, errores: [err.message] });
      }
    }

    if (ruta === '/api/borrador' && metodo === 'GET') return enviarJSON(res, 200, borrador.leer());

    if (ruta === '/api/borrador' && metodo === 'PUT') {
      try {
        const cuerpo = await leerCuerpo(req);
        return enviarJSON(res, 200, borrador.guardar(cuerpo));
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, errores: [err.message] });
      }
    }

    if (ruta === '/api/borrador' && metodo === 'DELETE') {
      borrador.borrar();
      return enviarJSON(res, 200, { ok: true });
    }

    const agente = ruta.match(/^\/api\/agentes\/([a-z0-9-]+)\/mensajes$/);
    if (agente) {
      const area = agente[1];
      if (!esAreaValida(area, idsPropios())) return enviarJSON(res, 404, { error: 'Agente desconocido' });
      const inactivo = motivoInactivo(area);
      if (inactivo) return enviarJSON(res, 404, { error: `Agente ${inactivo}. Actívalo en Agentes › Equipo o cambia el giro del diagnóstico.`, inactivo: true });
      if (metodo === 'GET') return enviarJSON(res, 200, { area, mensajes: conversaciones.leer(area) });
      if (metodo === 'POST') return ordenar(req, res, area);
    }

    // Ficha de la empresa
    if (ruta === '/api/empresa' && metodo === 'GET') return enviarJSON(res, 200, { ficha: empresa.leer(), campos: CAMPOS_EMPRESA });
    if (ruta === '/api/empresa' && metodo === 'PUT') {
      try {
        const cuerpo = await leerCuerpo(req);
        return enviarJSON(res, 200, { ficha: empresa.guardar(cuerpo) });
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, errores: [err.message] });
      }
    }

    // Agentes creados por el usuario
    if (ruta === '/api/agentes-personalizados' && metodo === 'GET') {
      return enviarJSON(res, 200, { ...personalizados.leer(), propuestas: personalizados.propuestas(), avatares: AVATARES_PERMITIDOS });
    }
    const propuesta = ruta.match(/^\/api\/agentes-personalizados\/propuestas\/(\d{1,2})\/(aceptar|rechazar)$/);
    if (propuesta && metodo === 'POST') {
      const indice = Number(propuesta[1]);
      if (propuesta[2] === 'aceptar') {
        try {
          const creado = personalizados.aceptarPropuesta(indice);
          if (!creado) return enviarJSON(res, 404, { error: 'Esa propuesta ya no existe' });
          emitir('agente_creado', { area: creado.id, nombre: creado.nombre });
          return enviarJSON(res, 201, creado);
        } catch (err) {
          return enviarJSON(res, 422, { ok: false, errores: [err.message] });
        }
      }
      return personalizados.rechazarPropuesta(indice) ? enviarJSON(res, 200, { ok: true }) : enviarJSON(res, 404, { error: 'Esa propuesta ya no existe' });
    }
    if (ruta === '/api/agentes-personalizados' && metodo === 'POST') {
      try {
        const cuerpo = await leerCuerpo(req);
        const creado = personalizados.guardar(cuerpo);
        emitir('agente_creado', { area: creado.id, nombre: creado.nombre });
        return enviarJSON(res, 201, creado);
      } catch (err) {
        return enviarJSON(res, 422, { ok: false, errores: [err.message] });
      }
    }
    const propio = ruta.match(/^\/api\/agentes-personalizados\/([a-z0-9-]+)$/);
    if (propio && esIdPersonalizado(propio[1])) {
      const id = propio[1];
      if (metodo === 'PUT') {
        try {
          const cuerpo = await leerCuerpo(req);
          return enviarJSON(res, 200, personalizados.guardar(cuerpo, id));
        } catch (err) {
          return enviarJSON(res, err.message.includes('no existe') ? 404 : 422, { ok: false, errores: [err.message] });
        }
      }
      if (metodo === 'DELETE') {
        return personalizados.borrar(id) ? enviarJSON(res, 200, { ok: true }) : enviarJSON(res, 404, { error: 'Ese agente no existe' });
      }
    }

    if (ruta === '/api/equipo' && metodo === 'GET') return enviarJSON(res, 200, equipo.leer());

    if (ruta === '/api/equipo' && metodo === 'PUT') {
      try {
        const cuerpo = await leerCuerpo(req);
        return enviarJSON(res, 200, equipo.guardar(cuerpo));
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, errores: [err.message] });
      }
    }

    if (ruta === '/api/marca' && metodo === 'GET') return enviarJSON(res, 200, marca.leer());

    if (ruta === '/api/marca' && metodo === 'PUT') {
      try {
        const cuerpo = await leerCuerpo(req);
        return enviarJSON(res, 200, { nombre: marca.guardarNombre(cuerpo.nombre) });
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, error: err.message });
      }
    }

    if (ruta === '/api/marca/logo' && metodo === 'POST') {
      try {
        const buffer = await leerBinario(req, LIMITE_LOGO + 1);
        marca.guardarLogo(req.headers['content-type'], buffer);
        return enviarJSON(res, 201, { ok: true, ...marca.leer() });
      } catch (err) {
        return enviarJSON(res, 422, { ok: false, error: err.message });
      }
    }

    if (ruta === '/api/marca/logo' && metodo === 'GET') {
      const logo = marca.logo();
      if (!logo) return enviarJSON(res, 404, { error: 'Sin logotipo' });
      const contenido = await readFile(logo.ruta);
      res.writeHead(200, { 'content-type': logo.tipo, 'cache-control': 'no-store' });
      return res.end(contenido);
    }

    if (ruta === '/api/eventos' && metodo === 'GET') return flujoEventos(req, res);

    if (ruta === '/api/estado' && metodo === 'GET') {
      const cfg = configActual();
      return enviarJSON(res, 200, {
        version: VERSION,
        proveedorIA: proveedorActivo(cfg) || 'ninguno',
        modelo: modeloActivo(cfg),
        uso: estadoUso(cfg),
        apoyo: apoyo(),
        trabajando: actividad.trabajando(),
        local: true,
      });
    }

    if (ruta === '/api/uso' && metodo === 'GET') return enviarJSON(res, 200, { actual: estadoUso(), historial: uso.historial() });

    // Investigación semanal de mercado y competencia
    if (ruta === '/api/investigacion' && metodo === 'GET') {
      return enviarJSON(res, 200, { programacion: estadoTarea('investigacion'), investigaciones: investigaciones.listar(), minimos: { competidores: MINIMO_COMPETIDORES, resenas: MINIMO_RESENAS }, dias: DIAS });
    }
    if (ruta === '/api/investigacion/ejecutar' && metodo === 'POST') {
      try {
        const registro = await investigar({ origen: 'manual' });
        programacion.marcarEjecutada('investigacion', { id: registro.id, competidores: registro.competidores.length });
        return enviarJSON(res, 200, { ok: true, investigacion: registro });
      } catch (err) {
        return enviarJSON(res, err.codigo || 502, { ok: false, errores: [err.message], crudo: err.crudo });
      }
    }
    if (ruta === '/api/investigacion/importar' && metodo === 'POST') {
      try {
        const cuerpo = await leerCuerpo(req);
        const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.slice(0, 60000) : '';
        if (!texto.trim()) return enviarJSON(res, 422, { ok: false, errores: ['Pega las reseñas en el formato indicado'] });
        const registro = await investigar({ origen: 'manual', textoManual: texto });
        return enviarJSON(res, 200, { ok: true, investigacion: registro });
      } catch (err) {
        return enviarJSON(res, err.codigo || 502, { ok: false, errores: [err.message] });
      }
    }
    const tareaProg = ruta.match(/^\/api\/(investigacion|sitio)\/programacion$/);
    if (tareaProg && metodo === 'PUT') {
      try {
        programacion.guardar(tareaProg[1], await leerCuerpo(req));
        return enviarJSON(res, 200, { ok: true, programacion: estadoTarea(tareaProg[1]) });
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, errores: [err.message] });
      }
    }
    const inv = ruta.match(/^\/api\/investigacion\/([0-9a-f-]{36})(\/reporte\.(docx|html))?$/);
    if (inv) {
      const registro = investigaciones.obtener(inv[1]);
      if (!registro) return enviarJSON(res, 404, { error: 'Investigación no encontrada' });
      if (!inv[2] && metodo === 'GET') return enviarJSON(res, 200, registro);
      if (!inv[2] && metodo === 'DELETE') return enviarJSON(res, 200, { ok: investigaciones.borrar(inv[1]) });
      if (inv[2] && metodo === 'GET') return entregarReporte(res, contenidoInvestigacion(registro, marca.leer()), inv[3], `investigacion-${registro.momento.slice(0, 10)}`);
    }

    // Análisis del sitio web propio
    if (ruta === '/api/sitio' && metodo === 'GET') {
      return enviarJSON(res, 200, { programacion: estadoTarea('sitio'), analisis: analisisSitio.listar(), sitioFicha: empresa.leer().sitioWeb, dias: DIAS });
    }
    if (ruta === '/api/sitio/analizar' && metodo === 'POST') {
      try {
        const cuerpo = await leerCuerpo(req);
        const registro = await revisarSitio({ url: typeof cuerpo.url === 'string' && cuerpo.url.trim() ? cuerpo.url.trim().slice(0, 300) : null, origen: 'manual' });
        programacion.marcarEjecutada('sitio', { id: registro.id, puntaje: registro.puntaje });
        return enviarJSON(res, 200, { ok: true, analisis: registro });
      } catch (err) {
        const mensaje = err.name === 'AbortError' ? 'El sitio tardó más de 12 segundos en responder' : err.message;
        return enviarJSON(res, err.codigo || 502, { ok: false, errores: [`No se pudo analizar el sitio: ${mensaje}`] });
      }
    }
    const sit = ruta.match(/^\/api\/sitio\/([0-9a-f-]{36})(\/reporte\.(docx|html))?$/);
    if (sit) {
      const registro = analisisSitio.obtener(sit[1]);
      if (!registro) return enviarJSON(res, 404, { error: 'Análisis no encontrado' });
      if (!sit[2] && metodo === 'GET') return enviarJSON(res, 200, registro);
      if (!sit[2] && metodo === 'DELETE') return enviarJSON(res, 200, { ok: analisisSitio.borrar(sit[1]) });
      if (sit[2] && metodo === 'GET') return entregarReporte(res, contenidoSitio(registro, marca.leer()), sit[3], `sitio-${registro.momento.slice(0, 10)}`);
    }

    // Calendario: exportar las fechas de la oficina (.ics) e importar la agenda del usuario
    if (ruta === '/api/calendario.ics' && metodo === 'GET') {
      const ics = generarIcs(eventosDeOficina({ memoria, diagnostico: store.ultimo(), programacion, propios: personalizados.leer().agentes }), { nombre: `${marca.leer().nombre || 'Oficina Multiagente'} · agentes` });
      res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="oficina-multiagente.ics"', 'cache-control': 'no-store' });
      return res.end(ics);
    }
    if (ruta === '/api/calendario' && metodo === 'GET') {
      const c = calendario.leer();
      return enviarJSON(res, 200, { proximos: agendaProxima(14), importado: c.importado, nombre: c.nombre, eventosImportados: c.eventos.length, propios: eventosDeOficina({ memoria, diagnostico: store.ultimo(), programacion, propios: personalizados.leer().agentes }).length });
    }
    if (ruta === '/api/calendario/importar' && metodo === 'POST') {
      try {
        const buffer = await leerBinario(req, LIMITE_ICS + 1);
        if (buffer.length > LIMITE_ICS) return enviarJSON(res, 422, { ok: false, errores: ['El archivo supera 2 MB'] });
        const nombre = decodeURIComponent(String(req.headers['x-nombre'] || '')).slice(0, 80);
        const datos = calendario.importar(buffer.toString('utf8'), nombre);
        emitir('calendario_importado', { eventos: datos.eventos.length });
        return enviarJSON(res, 201, { ok: true, eventos: datos.eventos.length, proximos: agendaProxima(14) });
      } catch (err) {
        return enviarJSON(res, 422, { ok: false, errores: [err.message] });
      }
    }
    if (ruta === '/api/calendario' && metodo === 'DELETE') { calendario.borrar(); return enviarJSON(res, 200, { ok: true }); }

    // Piloto automático por agente
    if (ruta === '/api/piloto' && metodo === 'GET') {
      const cfg = configActual();
      const propios = personalizados.leer().agentes;
      const agentes = piloto.listar(idsPiloto(), propios);
      return enviarJSON(res, 200, { activo: cfg.permisos?.piloto !== false, puedeIA: !bloqueoIA(cfg), motivoIA: bloqueoIA(cfg), agentes, dias: DIAS, frecuencias: FRECUENCIAS, encendidos: agentes.filter((a) => a.activo).length, maxPorTick: MAX_POR_TICK, usarLotes: cfg.usarLotes !== false && proveedorActivo(cfg) === 'anthropic', modeloAutomatico: proveedorActivo(cfg) ? modeloPara(cfg, 'automatico') : '', lotesPendientes: leerLotes().map((l) => ({ id: l.id, creado: l.creado, agentes: Object.keys(l.agentes) })) });
    }
    const pil = ruta.match(/^\/api\/piloto\/([a-z][a-z0-9-]{1,40})(\/ejecutar)?$/);
    if (pil) {
      const id = pil[1];
      if (!idsPiloto().includes(id)) return enviarJSON(res, 404, { error: 'Agente desconocido o inactivo' });
      const propios = personalizados.leer().agentes;
      if (!pil[2] && metodo === 'PUT') {
        try {
          const p = piloto.guardar(id, await leerCuerpo(req), propios);
          emitir('piloto_configurado', { area: id, activo: p.activo, frecuencia: p.frecuencia });
          return enviarJSON(res, 200, p);
        } catch (err) {
          return enviarJSON(res, 400, { ok: false, errores: [err.message] });
        }
      }
      if (pil[2] && metodo === 'POST') {
        const p = piloto.de(id, propios);
        const r = await procesarOrden(id, p.tareaEfectiva, { origen: 'piloto' });
        const resultado = r.cuerpo.pendiente ? `pendiente: ${r.cuerpo.motivo}` : r.cuerpo.ok ? `respondida · ${r.cuerpo.intercambios?.length || 0} intercambios · ${r.cuerpo.memoria?.nuevas || 0} acciones` : r.cuerpo.errores?.[0];
        piloto.marcarEjecutado(id, resultado, new Date(), propios);
        emitir('piloto_ejecutado', { area: id, nombre: p.nombre, resultado, pendiente: Boolean(r.cuerpo.pendiente), destinos: r.cuerpo.intercambios?.map((i) => i.destino).filter(Boolean) || [] });
        return enviarJSON(res, r.codigo, { ...r.cuerpo, piloto: piloto.de(id, propios) });
      }
    }

    // Actividad: qué han hecho los agentes y qué están haciendo ahora mismo
    if (ruta === '/api/actividad' && metodo === 'GET') {
      const area = url.searchParams.get('area') || null;
      return enviarJSON(res, 200, { eventos: actividad.listar({ limite: 200, area }), trabajando: actividad.trabajando() });
    }

    // Accesos y permisos (el usuario final decide qué puede hacer la aplicación)
    if (ruta === '/api/permisos' && metodo === 'GET') return enviarJSON(res, 200, panelPermisos());
    if (ruta === '/api/permisos' && metodo === 'PUT') {
      try {
        const cuerpo = await leerCuerpo(req);
        configuracion.guardarPermisos(cuerpo.permisos || cuerpo);
        emitir('permisos_cambiados', {});
        return enviarJSON(res, 200, panelPermisos());
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, errores: [err.message] });
      }
    }

    // Rutinas: órdenes repetidas que el usuario decide automatizar
    if (ruta === '/api/rutinas' && metodo === 'GET') return enviarJSON(res, 200, { rutinas: rutinas.listar(), sugerencias: rutinas.sugerencias(), frecuencias: FRECUENCIAS, dias: DIAS, activas: configActual().permisos?.rutinas !== false });
    if (ruta === '/api/rutinas' && metodo === 'POST') {
      try {
        const cuerpo = await leerCuerpo(req);
        if (!esAreaValida(cuerpo.area, idsPropios())) return enviarJSON(res, 422, { ok: false, errores: ['Agente desconocido'] });
        const r = rutinas.crear(cuerpo);
        emitir('rutina_creada', { id: r.id, area: r.area, nombre: r.nombre });
        return enviarJSON(res, 201, r);
      } catch (err) {
        return enviarJSON(res, 422, { ok: false, errores: [err.message] });
      }
    }
    const sug = ruta.match(/^\/api\/rutinas\/sugerencias\/([0-9a-f]{8})$/);
    if (sug && metodo === 'DELETE') return rutinas.descartarSugerencia(sug[1]) ? enviarJSON(res, 200, { ok: true }) : enviarJSON(res, 404, { error: 'Sugerencia no encontrada' });
    const rut = ruta.match(/^\/api\/rutinas\/([0-9a-f]{8})(\/ejecutar)?$/);
    if (rut) {
      const id = rut[1];
      if (rut[2] && metodo === 'POST') {
        const r = rutinas.obtener(id);
        if (!r) return enviarJSON(res, 404, { error: 'Rutina no encontrada' });
        const resultado = await procesarOrden(r.area, r.texto, { origen: 'rutina' });
        rutinas.marcarEjecutada(id, resultado.cuerpo.pendiente ? `pendiente: ${resultado.cuerpo.motivo}` : resultado.cuerpo.ok ? 'respondida' : resultado.cuerpo.errores?.[0]);
        emitir('rutina_ejecutada', { id, area: r.area, nombre: r.nombre, pendiente: Boolean(resultado.cuerpo.pendiente) });
        return enviarJSON(res, resultado.codigo, { ...resultado.cuerpo, rutina: rutinas.obtener(id) });
      }
      if (!rut[2] && metodo === 'PUT') {
        try {
          const r = rutinas.actualizar(id, await leerCuerpo(req));
          return r ? enviarJSON(res, 200, r) : enviarJSON(res, 404, { error: 'Rutina no encontrada' });
        } catch (err) {
          return enviarJSON(res, 422, { ok: false, errores: [err.message] });
        }
      }
      if (!rut[2] && metodo === 'DELETE') return rutinas.borrar(id) ? enviarJSON(res, 200, { ok: true }) : enviarJSON(res, 404, { error: 'Rutina no encontrada' });
    }

    // Calculadora laboral (LFT) para RH y Nómina: finiquito, liquidación, aguinaldo, PTU, vacaciones, fondo, vales, INFONAVIT, altas y bajas
    if (ruta === '/api/laboral' && metodo === 'GET') return enviarJSON(res, 200, { tipos: TIPOS_CALCULO, campos: CAMPOS_CALCULO, parametros: PARAMETROS_LABORALES, vigencia: VIGENCIA_LABORAL });
    if (ruta === '/api/laboral/calcular' && metodo === 'POST') {
      try {
        const cuerpo = await leerCuerpo(req);
        const r = calcular(String(cuerpo.tipo || ''), cuerpo.parametros || cuerpo);
        if (cuerpo.registrar) {
          const quien = limpiarTexto(cuerpo.trabajador) || 'trabajador';
          memoria.agregarHechos('rh', [`${quien}: ${resumenCalculo(r)}`], 'calculadora laboral');
        }
        return enviarJSON(res, 200, { ok: true, resultado: r });
      } catch (err) {
        return enviarJSON(res, 422, { ok: false, errores: [err.message] });
      }
    }

    // Informe del Orquestador sin IA
    if (ruta === '/api/informe' && metodo === 'GET') return enviarJSON(res, 200, informeActual());
    const inf = ruta.match(/^\/api\/informe\/reporte\.(docx|html)$/);
    if (inf && metodo === 'GET') return entregarReporte(res, informeActual().bloques, inf[1], `informe-${new Date().toISOString().slice(0, 10)}`);

    // Memoria compartida: acciones abiertas, conclusiones y notas entre agentes
    if (ruta === '/api/memoria' && metodo === 'GET') {
      const d = memoria.leer();
      return enviarJSON(res, 200, { acciones: memoria.acciones(), conclusiones: d.conclusiones, notas: d.notas.slice(-30).reverse(), hechos: memoria.hechos(), ideas: memoria.ideas(), conceptos: memoria.conceptos() });
    }
    if (ruta === '/api/memoria/hechos' && metodo === 'POST') {
      try {
        const cuerpo = await leerCuerpo(req);
        const texto = limpiarTexto(cuerpo.texto);
        if (!texto) return enviarJSON(res, 422, { ok: false, errores: ['Escribe el dato'] });
        const area = esAreaValida(cuerpo.area, idsPropios()) ? cuerpo.area : 'direccion';
        memoria.agregarHechos(area, [texto], 'dueño');
        return enviarJSON(res, 201, { ok: true, hechos: memoria.hechos() });
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, errores: [err.message] });
      }
    }
    const hecho = ruta.match(/^\/api\/memoria\/hechos\/([0-9a-f]{8})$/);
    if (hecho && metodo === 'DELETE') return memoria.borrarHecho(hecho[1]) ? enviarJSON(res, 200, { ok: true }) : enviarJSON(res, 404, { error: 'Hecho no encontrado' });
    const idea = ruta.match(/^\/api\/memoria\/ideas\/([0-9a-f]{8})$/);
    if (idea && metodo === 'PUT') {
      try {
        const cuerpo = await leerCuerpo(req);
        const i = memoria.marcarIdea(idea[1], cuerpo.estado);
        return i ? enviarJSON(res, 200, i) : enviarJSON(res, 404, { error: 'Idea no encontrada' });
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, errores: [err.message] });
      }
    }
    const acc = ruta.match(/^\/api\/memoria\/acciones\/([0-9a-f]{8})$/);
    if (acc && metodo === 'PUT') {
      try {
        const cuerpo = await leerCuerpo(req);
        const a = memoria.marcar(acc[1], cuerpo.estado);
        return a ? enviarJSON(res, 200, a) : enviarJSON(res, 404, { error: 'Acción no encontrada' });
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, errores: [err.message] });
      }
    }

    // Perfil breve de cada agente para la pantalla (rol, especialidad, qué pregunta primero)
    if (ruta === '/api/habilidades' && metodo === 'GET') {
      const perfil = (h) => ({ rol: h.rol || '', especialidad: h.especialidad || '', pregunta_primero: (h.pregunta_primero || []).slice(0, 3) });
      const salida = {};
      for (const [id, h] of Object.entries(HABILIDADES)) salida[id] = perfil(h);
      for (const [id, a] of Object.entries(personalizados.leer().agentes)) salida[id] = perfil(a);
      return enviarJSON(res, 200, { habilidades: salida });
    }

    // Jerarquía y ajustes por negocio de los agentes
    if (ruta === '/api/jerarquia' && metodo === 'GET') {
      const propios = personalizados.leer().agentes;
      const inactivos = Object.keys(apoyo().inactivos);
      const tipos = Object.fromEntries([...AREAS_CONVERSACION, ...Object.keys(propios)].map((id) => [id, tipoDe(id, propios)]));
      return enviarJSON(res, 200, { arbol: arbol(propios, inactivos), subagentes: subagentesPorArea(propios, inactivos), tipos, apoyo: apoyo() });
    }
    if (ruta === '/api/ajustes' && metodo === 'GET') return enviarJSON(res, 200, { ajustes: ajustes.todos() });
    if (ruta === '/api/ajustes/optimizar' && metodo === 'POST') return optimizarAgentes(req, res);
    const aj = ruta.match(/^\/api\/ajustes\/([a-z][a-z0-9-]{1,40})(\/aceptar|\/rechazar)?$/);
    if (aj) {
      const id = aj[1];
      if (!esAreaValida(id, idsPropios())) return enviarJSON(res, 404, { error: 'Agente desconocido' });
      if (!aj[2] && metodo === 'GET') return enviarJSON(res, 200, ajustes.leer(id));
      if (!aj[2] && metodo === 'PUT') {
        try {
          return enviarJSON(res, 200, ajustes.guardar(id, await leerCuerpo(req)));
        } catch (err) {
          return enviarJSON(res, 400, { ok: false, errores: [err.message] });
        }
      }
      if (aj[2] === '/aceptar' && metodo === 'POST') return enviarJSON(res, 200, ajustes.aceptar(id) || ajustes.leer(id));
      if (aj[2] === '/rechazar' && metodo === 'POST') return enviarJSON(res, 200, ajustes.rechazar(id) || ajustes.leer(id));
    }

    if (ruta === '/api/configuracion' && metodo === 'GET') {
      const guardada = configuracion.leer();
      return enviarJSON(res, 200, {
        ...enmascarar(guardada),
        proveedorActivo: proveedorActivo(configActual()) || 'ninguno',
        // Indica de dónde sale la IA activa: de la pantalla, del archivo .env o de ningún lado.
        fuente: proveedorActivo(configuracionEfectiva({ ...config, proveedor: 'ninguno', anthropicKey: '', openaiKey: '' }, guardada))
          ? 'pantalla' : (proveedorActivo(config) ? 'env' : 'ninguna'),
      });
    }

    if (ruta === '/api/configuracion' && metodo === 'PUT') {
      try {
        const cuerpo = await leerCuerpo(req);
        const guardada = configuracion.guardar(cuerpo);
        return enviarJSON(res, 200, { ...enmascarar(guardada), proveedorActivo: proveedorActivo(configActual()) || 'ninguno' });
      } catch (err) {
        return enviarJSON(res, 400, { ok: false, errores: [err.message] });
      }
    }

    if (ruta === '/api/configuracion/claves' && metodo === 'DELETE') {
      const guardada = configuracion.borrarClaves();
      return enviarJSON(res, 200, { ...enmascarar(guardada), proveedorActivo: proveedorActivo(configActual()) || 'ninguno' });
    }

    if (ruta === '/api/configuracion/probar' && metodo === 'POST') return probarConexion(req, res);

    if (metodo === 'GET') return servirEstatico(req, res, ruta);

    enviarJSON(res, 405, { error: 'Método no permitido' });
  }

  // Reporte en Word o página imprimible a partir de bloques (investigación, sitio).
  function entregarReporte(res, bloques, formato, nombre) {
    if (formato === 'docx') {
      const docx = docxDesdeBloques(bloques);
      res.writeHead(200, {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="${nombre}.docx"`,
        'content-length': docx.length,
      });
      return res.end(docx);
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(htmlDesdeBloques(bloques));
  }

  let temporizadorRutinas = null;
  if (config.programador !== false) {
    servidor.on('listening', () => {
      programador.iniciar();
      temporizadorRutinas = setInterval(() => { tickRutinas().catch(() => {}); tickPiloto().catch(() => {}); }, 60 * 1000);
      temporizadorRutinas.unref?.();
    });
  }
  servidor.on('close', () => { programador.detener(); if (temporizadorRutinas) clearInterval(temporizadorRutinas); eventos.removeAllListeners('evento'); });
  servidor.programador = programador; // las pruebas disparan el tick a mano
  servidor.tickRutinas = tickRutinas;
  servidor.tickPiloto = tickPiloto;
  servidor.revisarLotes = revisarLotes;
  return servidor;
}

// Abre la dirección local en el navegador predeterminado. La URL es fija, nunca viene del usuario.
function abrirNavegador(url) {
  const comando = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(comando, () => { /* si no hay navegador, el usuario puede abrir la URL a mano */ });
}

// Arranque directo: node src/server.js
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('server.js')) {
  const url = `http://${configBase.host}:${configBase.puerto}`;
  const servidor = crearServidor();

  servidor.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Oficina-Multiagente ya está en ejecución en ${url}`);
      if (configBase.abrirNavegador) abrirNavegador(url);
      process.exit(0);
    }
    console.error(`No se pudo iniciar el servidor: ${err.message}`);
    process.exit(1);
  });

  servidor.listen(configBase.puerto, configBase.host, () => {
    console.log(`Oficina-Multiagente en ${url}`);
    console.log(`Proveedor de IA: ${proveedorActivo(configBase) || 'ninguno (solo reglas)'}`);
    console.log('Deja esta ventana abierta mientras uses la aplicación. Para cerrar: Detener.cmd o cierra esta ventana.');
    try {
      mkdirSync(dirname(configBase.archivoPid), { recursive: true });
      writeFileSync(configBase.archivoPid, String(process.pid), 'utf8');
    } catch { /* sin archivo de pid, Detener.cmd no podrá cerrarlo; la ventana sigue sirviendo */ }
    if (configBase.abrirNavegador) abrirNavegador(url);
  });

  const limpiar = () => {
    try { rmSync(configBase.archivoPid, { force: true }); } catch { /* nada que limpiar */ }
    process.exit(0);
  };
  process.on('SIGINT', limpiar);
  process.on('SIGTERM', limpiar);
}
