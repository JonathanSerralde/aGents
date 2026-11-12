// Archivo de memoria: todo lo que la oficina aprende del negocio, tipado y sin tope práctico, en un archivo local
// que NO viaja completo a la IA. En cada orden se busca aquí lo relacionado (por palabras, sin IA) y al agente solo
// le llegan unas cuantas entradas: lo que el dueño fijó, lo que tiene que ver con la orden y lo más reciente.
// Así el contexto cuesta lo mismo en el mes doce que en el primero, y nada importante se borra por viejo.
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export const TIPOS_ARCHIVO = {
  hecho: 'Hecho', // información real de la empresa
  decision: 'Decisión', // lo que el dueño aprobó o rechazó
  acuerdo: 'Conclusión', // en qué quedó un agente al responder
  accion: 'Acción cumplida',
  idea: 'Idea',
  concepto: 'Concepto',
};
export const MAX_ENTRADAS = 20000;
export const MAX_FIJOS = 12; // los fijos viajan siempre: pocos, para que el contexto siga siendo corto
const MAX_TEXTO = 400;
const MAX_CONTEXTO = 2200; // caracteres del bloque que llega al agente
const ID_VALIDO = /^[0-9a-f]{10}$/;
const PESO_TIPO = { decision: 1.25, hecho: 1.15, acuerdo: 1, accion: 0.85, idea: 0.8, concepto: 0.6 };

const limpiar = (t, max = MAX_TEXTO) => String(t ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const normalizar = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const VACIAS = new Set(['para', 'por', 'con', 'sin', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'del', 'que', 'como', 'esta', 'este', 'esto', 'estos', 'estas', 'mas', 'pero', 'muy', 'hay', 'son', 'fue', 'ser', 'han', 'sus', 'nos', 'les', 'cual', 'cuando', 'donde', 'quien', 'sobre', 'entre', 'desde', 'hasta', 'cada', 'todo', 'toda', 'todos', 'todas', 'tiene', 'tienen', 'hacer', 'puede', 'quiero', 'necesito', 'dame', 'dime', 'favor', 'area', 'empresa', 'negocio']);
// Palabras de negocio que suelen decir lo mismo: buscar una encuentra las otras. No sustituye a una búsqueda por
// significado (eso pediría un modelo), pero cubre los casos comunes de una pyme.
const SINONIMOS = [
  ['credito', 'plazo', 'fiado', 'financiamiento', 'prestamo', 'deuda', 'parcialidad'],
  ['cobranza', 'cobrar', 'cobro', 'adeudo', 'cartera', 'moroso', 'vencido'],
  ['proveedor', 'surtidor', 'distribuidor', 'mayorista'],
  ['cliente', 'comprador', 'consumidor'],
  ['precio', 'tarifa', 'cotizacion', 'descuento', 'promocion'],
  ['costo', 'gasto', 'egreso', 'presupuesto'],
  ['venta', 'ingreso', 'facturacion', 'pedido'],
  ['empleado', 'personal', 'trabajador', 'colaborador', 'plantilla', 'nomina', 'sueldo', 'salario'],
  ['contratar', 'contratacion', 'vacante', 'reclutamiento'],
  ['publicidad', 'anuncio', 'campana', 'marketing', 'promocion', 'volante', 'redes'],
  ['inventario', 'almacen', 'existencia', 'stock', 'bodega', 'mercancia'],
  ['renta', 'alquiler', 'arrendamiento', 'local'],
  ['banco', 'cuenta', 'efectivo', 'caja', 'liquidez', 'saldo'],
  ['impuesto', 'fiscal', 'sat', 'iva', 'isr', 'declaracion', 'factura', 'cfdi'],
  ['contrato', 'convenio', 'acuerdo', 'clausula'],
  ['horario', 'turno', 'jornada'],
  ['entrega', 'envio', 'reparto', 'flete', 'logistica'],
  ['sucursal', 'tienda', 'sede', 'punto'],
  ['socio', 'dueno', 'propietario', 'accionista'],
];
const GRUPO_DE = new Map();
SINONIMOS.forEach((grupo, i) => { for (const p of grupo) GRUPO_DE.set(p, [...(GRUPO_DE.get(p) || []), i]); });

// Raíz aproximada: sin plural. Suficiente para que "proveedores" encuentre "proveedor".
const raiz = (p) => (p.length > 5 && p.endsWith('es') ? p.slice(0, -2) : p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p);
export function palabrasDe(texto) {
  const palabras = normalizar(texto).match(/[a-z0-9ñ]{3,}/g) || [];
  return [...new Set(palabras.filter((p) => !VACIAS.has(p)).map(raiz))];
}

export function crearArchivo(archivo) {
  let cache = null; // { mtime, entradas, indice: Map(id -> Set de palabras) }

  function leer() {
    if (!existsSync(archivo)) return { entradas: [], indice: new Map() };
    const mtime = statSync(archivo).mtimeMs;
    if (cache && cache.mtime === mtime) return cache;
    let lista = [];
    try {
      const d = JSON.parse(readFileSync(archivo, 'utf8'));
      lista = Array.isArray(d?.entradas) ? d.entradas.filter((e) => e && ID_VALIDO.test(e.id) && TIPOS_ARCHIVO[e.tipo] && typeof e.texto === 'string') : [];
    } catch { lista = []; }
    cache = { mtime, entradas: lista, indice: new Map(lista.map((e) => [e.id, new Set(palabrasDe(e.texto))])) };
    return cache;
  }
  function escribir(entradas) {
    // Si se llena, salen primero las más antiguas que no estén fijas.
    let lista = entradas;
    if (lista.length > MAX_ENTRADAS) {
      let sobra = lista.length - MAX_ENTRADAS;
      lista = lista.filter((e) => e.fijo || sobra-- <= 0);
    }
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify({ version: 1, entradas: lista }), 'utf8');
    // El índice se conserva en memoria: solo se calculan las palabras de lo nuevo o lo corregido.
    const previo = cache?.indice;
    cache = { mtime: statSync(archivo).mtimeMs, entradas: lista, indice: new Map(lista.map((e) => [e.id, previo?.get(e.id) || new Set(palabrasDe(e.texto))])) };
    return lista;
  }
  const clave = (e) => `${e.tipo}|${normalizar(e.texto)}`;

  // Busca por palabras con sinónimos de negocio. Devuelve las entradas ordenadas por relación con la consulta.
  function buscar(consulta, { area = '', tipos = null, limite = 6, excluir = null } = {}) {
    const { entradas, indice } = leer();
    const terminos = palabrasDe(consulta);
    if (!terminos.length || !entradas.length) return [];
    // Cada término vale más cuanto más raro es en el archivo; los sinónimos cuentan un poco menos que la palabra exacta.
    const frecuencia = new Map();
    for (const set of indice.values()) for (const p of set) frecuencia.set(p, (frecuencia.get(p) || 0) + 1);
    const peso = (p) => Math.log(1 + entradas.length / (frecuencia.get(p) || 1));
    const buscados = new Map(terminos.map((t) => [t, 1]));
    for (const t of terminos) for (const g of GRUPO_DE.get(t) || []) for (const s of SINONIMOS[g]) if (!buscados.has(s)) buscados.set(s, 0.6);
    const ahora = Date.now();
    const resultados = [];
    for (const e of entradas) {
      if (tipos && !tipos.includes(e.tipo)) continue;
      if (excluir?.has(e.id)) continue;
      const set = indice.get(e.id);
      let puntos = 0;
      let coincidencias = 0;
      for (const [p, w] of buscados) if (set.has(p)) { puntos += w * peso(p); coincidencias++; }
      if (!coincidencias) continue;
      puntos *= PESO_TIPO[e.tipo] || 1;
      if (area && e.area === area) puntos *= 1.2;
      const dias = Math.max(0, (ahora - new Date(e.momento || 0).getTime()) / 86400000);
      puntos *= 1 + 0.25 / (1 + dias / 60); // lo reciente gana un poco, sin enterrar lo antiguo
      resultados.push({ ...e, puntos: Math.round(puntos * 100) / 100 });
    }
    return resultados.sort((a, b) => b.puntos - a.puntos || String(b.momento).localeCompare(String(a.momento))).slice(0, limite);
  }

  return {
    existe: () => existsSync(archivo),
    buscar,

    // Guarda una entrada. Si ya existe una igual del mismo tipo, devuelve esa.
    agregar({ tipo, area = '', texto, fuente = '', momento = null, fijo = false } = {}) {
      const limpio = limpiar(texto);
      if (!TIPOS_ARCHIVO[tipo] || limpio.length < 3) return null;
      const { entradas } = leer();
      const nueva = { id: randomBytes(5).toString('hex'), tipo, area: limpiar(area, 60), texto: limpio, fuente: limpiar(fuente, 80), momento: momento || new Date().toISOString(), ...(fijo ? { fijo: true } : {}) };
      const repetida = entradas.find((e) => clave(e) === clave(nueva));
      if (repetida) return repetida;
      escribir([...entradas, nueva]);
      return nueva;
    },

    // Primera vez: trae lo que ya había en la memoria de la oficina para que nada anterior quede fuera del archivo.
    importar(memoria) {
      const { entradas } = leer();
      const vistas = new Set(entradas.map(clave));
      const nuevas = [];
      const sumar = (tipo, area, texto, fuente, momento) => {
        const limpio = limpiar(texto);
        if (limpio.length < 3) return;
        const e = { id: randomBytes(5).toString('hex'), tipo, area: limpiar(area, 60), texto: limpio, fuente: limpiar(fuente, 80), momento: momento || new Date().toISOString() };
        if (vistas.has(clave(e))) return;
        vistas.add(clave(e));
        nuevas.push(e);
      };
      for (const h of memoria?.hechos || []) sumar('hecho', h.area, h.texto, h.fuente || h.origen, h.momento);
      for (const i of memoria?.ideas || []) sumar(i.estado === 'por_validar' ? 'idea' : 'decision', i.area, i.estado === 'aprobada' ? `Idea aprobada: ${i.texto}` : i.estado === 'descartada' ? `Idea descartada: ${i.texto}` : i.texto, 'dueño', i.actualizado || i.momento);
      for (const c of memoria?.conceptos || []) sumar('concepto', '', `${c.termino}: ${c.texto}`, c.origen, c.momento);
      for (const [area, c] of Object.entries(memoria?.conclusiones || {})) sumar('acuerdo', area, c.texto, 'agente', c.momento);
      for (const a of (memoria?.acciones || []).filter((x) => x.estado === 'hecha')) sumar('accion', a.area, a.texto, a.responsable || 'bitácora', a.actualizado || a.momento);
      if (nuevas.length) escribir([...entradas, ...nuevas].sort((a, b) => String(a.momento).localeCompare(String(b.momento))));
      return nuevas.length;
    },

    // El dueño fija, suelta o corrige una entrada. Devuelve la entrada, null si no existe o un error si ya hay muchas fijas.
    cambiar(id, { fijo, texto } = {}) {
      if (!ID_VALIDO.test(String(id))) return null;
      const { entradas } = leer();
      const e = entradas.find((x) => x.id === id);
      if (!e) return null;
      if (fijo === true && !e.fijo && entradas.filter((x) => x.fijo).length >= MAX_FIJOS) throw new Error(`Solo se pueden fijar ${MAX_FIJOS} entradas: suelta una antes de fijar otra`);
      if (typeof fijo === 'boolean') { if (fijo) e.fijo = true; else delete e.fijo; }
      if (typeof texto === 'string' && limpiar(texto).length >= 3) { e.texto = limpiar(texto); cache?.indice.delete(e.id); }
      escribir(entradas);
      return e;
    },

    borrar(id) {
      const { entradas } = leer();
      const resto = entradas.filter((e) => e.id !== id);
      if (resto.length === entradas.length) return false;
      escribir(resto);
      return true;
    },

    // Quita una entrada por su contenido (cuando el dueño borra un hecho equivocado de la bitácora).
    olvidar(tipo, texto) {
      const { entradas } = leer();
      const objetivo = `${tipo}|${normalizar(limpiar(texto))}`;
      const resto = entradas.filter((e) => clave(e) !== objetivo);
      if (resto.length !== entradas.length) escribir(resto);
      return entradas.length - resto.length;
    },

    // Para la pantalla: con consulta, por relación; sin ella, lo más reciente. Siempre con el conteo por tipo.
    listar({ q = '', tipo = '', area = '', limite = 40 } = {}) {
      const { entradas } = leer();
      const porTipo = Object.fromEntries(Object.keys(TIPOS_ARCHIVO).map((t) => [t, 0]));
      for (const e of entradas) porTipo[e.tipo]++;
      const tipos = TIPOS_ARCHIVO[tipo] ? [tipo] : null;
      let lista;
      if (String(q).trim()) lista = buscar(q, { tipos, limite: 200 }).filter((e) => !area || e.area === area);
      else lista = entradas.filter((e) => (!tipos || e.tipo === tipo) && (!area || e.area === area)).slice().reverse();
      // Las fijas van primero cuando no se está buscando.
      if (!String(q).trim()) lista.sort((a, b) => (b.fijo ? 1 : 0) - (a.fijo ? 1 : 0));
      return { total: entradas.length, fijas: entradas.filter((e) => e.fijo).length, porTipo, encontradas: lista.length, entradas: lista.slice(0, limite) };
    },

    // Lo único del archivo que llega al agente: lo fijado, lo relacionado con la orden y lo más nuevo.
    // nombreArea(id) traduce el área a su nombre. Devuelve '' si el archivo está vacío.
    paraPrompt({ consulta = '', area = '', nombreArea = (id) => id } = {}) {
      const { entradas } = leer();
      if (!entradas.length) return '';
      const fecha = (e) => String(e.momento || '').slice(0, 10);
      const linea = (e) => `${e.texto} [${[TIPOS_ARCHIVO[e.tipo].toLowerCase(), e.fuente, fecha(e)].filter(Boolean).join(', ')}]`;
      const usados = new Set();
      const tomar = (lista) => lista.filter((e) => !usados.has(e.id) && usados.add(e.id));
      const fijos = tomar(entradas.filter((e) => e.fijo).slice(-MAX_FIJOS));
      const relacionados = tomar(buscar(consulta, { area, tipos: ['hecho', 'decision', 'acuerdo', 'accion', 'idea'], limite: 6, excluir: usados }));
      // Red de seguridad: lo más nuevo viaja aunque no coincida en palabras con la orden.
      const recientes = tomar(entradas.filter((e) => e.tipo === 'hecho' || e.tipo === 'decision').slice(-3).reverse());
      const propios = area ? tomar(entradas.filter((e) => e.tipo === 'acuerdo' && e.area === area).slice(-2).reverse()) : [];
      const partes = ['HECHOS registrados de la empresa (trátalos como información real; cita la fuente):'];
      if (fijos.length) partes.push(`Siempre presentes, fijados por el dueño: ${fijos.map(linea).join(' | ')}`);
      if (relacionados.length) partes.push(`Del archivo de memoria, relacionados con esta orden: ${relacionados.map(linea).join(' | ')}`);
      if (recientes.length) partes.push(`Lo más reciente: ${recientes.map(linea).join(' | ')}`);
      if (propios.length) partes.push(`Tus últimas conclusiones en ${nombreArea(area)}: ${propios.map((e) => `${e.texto} [${fecha(e)}]`).join(' | ')}`);
      const resto = entradas.length - usados.size;
      if (resto > 0) partes.push(`El archivo guarda ${resto} ${resto === 1 ? 'entrada más que no se muestra' : 'entradas más que no se muestran'} aquí: si te falta un dato de la empresa que debería existir, pídelo al dueño en lugar de suponerlo.`);
      return partes.length > 1 ? partes.join('\n').slice(0, MAX_CONTEXTO) : '';
    },
  };
}

// Recorta el historial que se reenvía en cada orden: los últimos mensajes van completos y los anteriores, resumidos
// a su inicio. Una respuesta larga de hace diez mensajes no debe pagarse entera cada vez.
export function historialParaIA(mensajes, { completos = 4, max = 500 } = {}) {
  const corte = mensajes.length - completos;
  return mensajes.map((m, i) => (i >= corte || m.texto.length <= max ? m : { ...m, texto: `${m.texto.slice(0, max).trimEnd()}… (mensaje anterior recortado)` }));
}
