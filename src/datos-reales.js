// Datos reales del negocio, leídos en este equipo y sin IA: facturas CFDI (XML del SAT, versiones 3.3 y 4.0)
// y archivos CSV de ventas. Con ellos el diagnóstico deja de depender solo de lo que el dueño contesta:
// concentración de clientes, recurrencia, venta a crédito, proveedores y diferencia entre lo facturado y lo gastado.
// Los archivos nunca se copian ni se suben: solo se guarda el resumen.
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { baseDeFlujo } from './flujo.js';

export const MAX_ARCHIVOS = 5000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PROFUNDIDAD = 6;
const PUBLICO_GENERAL = ['XAXX010101000', 'XEXX010101000'];
const PROPIO_CSV = 'PROPIO'; // emisor de las ventas que vienen de un CSV: siempre es el negocio

const ENTIDADES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
const decodificar = (t) => String(t).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTIDADES[e.toLowerCase()] ?? m;
});

// Atributos de la primera etiqueta con ese nombre (con o sin prefijo cfdi:/tfd:).
function atributos(xml, etiqueta) {
  const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${etiqueta}\\b([^>]*)>`, 'i'));
  if (!m) return null;
  const attrs = {};
  for (const a of m[1].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1].toLowerCase()] = decodificar(a[2]).trim();
  return attrs;
}

const numero = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const pesos = (n) => Math.round(n * 100) / 100;
const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

// Lee un CFDI. Devuelve null si el XML no es un comprobante.
export function leerCfdi(xml) {
  const c = atributos(String(xml), 'Comprobante');
  const emisor = atributos(String(xml), 'Emisor');
  const receptor = atributos(String(xml), 'Receptor');
  if (!c || !emisor || !receptor || !c.fecha) return null;
  const timbre = atributos(String(xml), 'TimbreFiscalDigital');
  const cambio = c.moneda && c.moneda !== 'MXN' && c.moneda !== 'XXX' ? numero(c.tipocambio) || 1 : 1;
  // Complemento de pago: qué facturas cubre y con cuánto. Sirve para saber qué sigue por cobrar o por pagar.
  const pagos = [];
  if ((c.tipodecomprobante || '').toUpperCase()[0] === 'P') {
    const fechaPago = (String(xml).match(/FechaPago\s*=\s*"([^"]+)"/i)?.[1] || c.fecha).slice(0, 10);
    for (const m of String(xml).matchAll(/<(?:[\w-]+:)?DoctoRelacionado\b([^>]*)>/gi)) {
      const id = m[1].match(/IdDocumento\s*=\s*"([^"]+)"/i)?.[1];
      const importe = numero(m[1].match(/ImpPagado\s*=\s*"([^"]+)"/i)?.[1]);
      if (id && importe > 0) pagos.push({ uuid: id.toUpperCase(), importe, fecha: fechaPago });
    }
  }
  return {
    pagos,
    uuid: (timbre?.uuid || '').toUpperCase(),
    fecha: c.fecha.slice(0, 10),
    tipo: (c.tipodecomprobante || 'I').toUpperCase()[0], // I ingreso, E egreso, N nómina, P pago, T traslado
    total: pesos(numero(c.total) * cambio),
    metodoPago: (c.metodopago || '').toUpperCase(), // PUE de contado, PPD a crédito o en parcialidades
    emisor: { rfc: (emisor.rfc || '').toUpperCase(), nombre: emisor.nombre || '' },
    receptor: { rfc: (receptor.rfc || '').toUpperCase(), nombre: receptor.nombre || '' },
  };
}

// ---------- CSV de ventas ----------

function partirLinea(linea, sep) {
  const celdas = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (comillas) {
      if (ch === '"' && linea[i + 1] === '"') { actual += '"'; i++; } else if (ch === '"') comillas = false; else actual += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { celdas.push(actual); actual = ''; } else actual += ch;
  }
  celdas.push(actual);
  return celdas.map((c) => c.trim());
}

function fechaIso(texto) {
  const t = String(texto).trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/); // día/mes/año, como se escribe en México
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

const sinAcentos = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Lee un CSV de ventas con encabezados. Necesita una columna de fecha y una de importe; la de cliente es opcional.
// Devuelve las ventas con la misma forma que un CFDI emitido, o [] si el archivo no parece de ventas.
export function leerCsvVentas(texto, rfcPropio = PROPIO_CSV) {
  const lineas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) return [];
  const sep = [';', '\t', ','].sort((a, b) => lineas[0].split(b).length - lineas[0].split(a).length)[0];
  const cabeza = partirLinea(lineas[0], sep).map(sinAcentos);
  const buscar = (...claves) => cabeza.findIndex((c) => claves.some((k) => c.includes(k)));
  const iFecha = buscar('fecha', 'date');
  const iTotal = buscar('total', 'importe', 'monto', 'venta');
  const iCliente = buscar('cliente', 'receptor', 'razon', 'nombre');
  if (iFecha < 0 || iTotal < 0) return [];
  const ventas = [];
  for (const linea of lineas.slice(1)) {
    const c = partirLinea(linea, sep);
    const fecha = fechaIso(c[iFecha] || '');
    const total = numero(c[iTotal]);
    if (!fecha || total <= 0) continue;
    const cliente = iCliente >= 0 ? c[iCliente] || '' : '';
    ventas.push({ uuid: '', fecha, tipo: 'I', total: pesos(total), metodoPago: '', emisor: { rfc: rfcPropio, nombre: '' }, receptor: { rfc: cliente ? `CSV:${sinAcentos(cliente)}` : PUBLICO_GENERAL[0], nombre: cliente } });
  }
  return ventas;
}

// ---------- Lectura de la carpeta ----------

// Recorre la carpeta (y subcarpetas) y lee los .xml y .csv. No modifica nada.
export function leerCarpeta(carpeta, rfcPropio = '') {
  if (!carpeta || !existsSync(carpeta) || !statSync(carpeta).isDirectory()) throw new Error('La carpeta no existe en este equipo');
  const comprobantes = [];
  const cuenta = { xml: 0, csv: 0, ignorados: 0, truncado: false };
  const recorrer = (dir, nivel) => {
    for (const nombre of readdirSync(dir)) {
      if (cuenta.xml + cuenta.csv + cuenta.ignorados >= MAX_ARCHIVOS) { cuenta.truncado = true; return; }
      const ruta = join(dir, nombre);
      let info;
      try { info = statSync(ruta); } catch { continue; }
      if (info.isDirectory()) { if (nivel < MAX_PROFUNDIDAD) recorrer(ruta, nivel + 1); continue; }
      const ext = extname(nombre).toLowerCase();
      if ((ext !== '.xml' && ext !== '.csv') || info.size > MAX_BYTES) continue;
      let texto;
      try { texto = readFileSync(ruta, 'utf8'); } catch { cuenta.ignorados++; continue; }
      if (ext === '.xml') {
        const c = leerCfdi(texto);
        if (c) { comprobantes.push(c); cuenta.xml++; } else cuenta.ignorados++;
      } else {
        const ventas = leerCsvVentas(texto);
        if (ventas.length) { comprobantes.push(...ventas); cuenta.csv++; } else cuenta.ignorados++;
      }
    }
  };
  recorrer(carpeta, 0);
  return { comprobantes, archivos: cuenta };
}

// Huella barata de la carpeta (cuántos archivos, su tamaño y el cambio más reciente) para saber si hay algo
// nuevo sin volver a leer todo. La usa la vigilancia de la carpeta.
export function firmaCarpeta(carpeta) {
  if (!carpeta || !existsSync(carpeta)) return '';
  let n = 0;
  let bytes = 0;
  let reciente = 0;
  const recorrer = (dir, nivel) => {
    for (const nombre of readdirSync(dir)) {
      if (n >= MAX_ARCHIVOS) return;
      let info;
      try { info = statSync(join(dir, nombre)); } catch { continue; }
      if (info.isDirectory()) { if (nivel < MAX_PROFUNDIDAD) recorrer(join(dir, nombre), nivel + 1); continue; }
      const ext = extname(nombre).toLowerCase();
      if (ext !== '.xml' && ext !== '.csv') continue;
      n += 1;
      bytes += info.size;
      reciente = Math.max(reciente, Math.round(info.mtimeMs));
    }
  };
  try { recorrer(carpeta, 0); } catch { return ''; }
  return `${n}:${bytes}:${reciente}`;
}

// ---------- Análisis ----------

function agrupar(lista, clave) {
  const mapa = new Map();
  for (const c of lista) {
    const k = clave(c);
    const g = mapa.get(k.rfc) || { rfc: k.rfc, nombre: k.nombre, total: 0, facturas: 0, meses: new Set() };
    g.total += c.signo * c.total;
    g.facturas += 1;
    g.meses.add(c.fecha.slice(0, 7));
    if (!g.nombre && k.nombre) g.nombre = k.nombre;
    mapa.set(k.rfc, g);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

// Analiza los comprobantes. `rfcPropio` distingue lo emitido de lo recibido; si falta, se toma el RFC que más aparece.
export function analizarComprobantes(comprobantes, rfcPropio = '') {
  const vistos = new Set();
  const lista = comprobantes.filter((c) => {
    if (!c.uuid) return true;
    if (vistos.has(c.uuid)) return false;
    vistos.add(c.uuid);
    return true;
  });
  let propio = String(rfcPropio || '').toUpperCase().trim();
  if (!propio || !lista.some((c) => c.emisor.rfc === propio || c.receptor.rfc === propio)) {
    const veces = new Map();
    for (const c of lista) for (const r of [c.emisor.rfc, c.receptor.rfc]) if (r && r !== PROPIO_CSV && !r.startsWith('CSV:') && !PUBLICO_GENERAL.includes(r)) veces.set(r, (veces.get(r) || 0) + 1);
    propio = [...veces.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || propio;
  }

  // Las notas de crédito (egresos) restan a quien corresponde.
  const conSigno = lista.filter((c) => c.tipo === 'I' || c.tipo === 'E').map((c) => ({ ...c, signo: c.tipo === 'E' ? -1 : 1 }));
  const esPropio = (rfc) => rfc === PROPIO_CSV || (propio !== '' && rfc === propio);
  const emitidos = conSigno.filter((c) => esPropio(c.emisor.rfc));
  const recibidos = conSigno.filter((c) => esPropio(c.receptor.rfc) && !esPropio(c.emisor.rfc));
  const nomina = pesos(lista.filter((c) => c.tipo === 'N' && esPropio(c.emisor.rfc)).reduce((s, c) => s + c.total, 0));

  const suma = (l) => pesos(l.reduce((s, c) => s + c.signo * c.total, 0));
  const ventas = suma(emitidos);
  const gastos = suma(recibidos);
  const fechas = lista.map((c) => c.fecha).sort();
  const meses = [...new Set(emitidos.concat(recibidos).map((c) => c.fecha.slice(0, 7)))].sort();
  const porMes = meses.map((mes) => ({ mes, ventas: suma(emitidos.filter((c) => c.fecha.startsWith(mes))), gastos: suma(recibidos.filter((c) => c.fecha.startsWith(mes))) }));

  const clientes = agrupar(emitidos, (c) => c.receptor);
  const identificados = clientes.filter((c) => !PUBLICO_GENERAL.includes(c.rfc));
  const publico = clientes.filter((c) => PUBLICO_GENERAL.includes(c.rfc)).reduce((s, c) => s + c.total, 0);
  const proveedores = agrupar(recibidos, (c) => c.emisor);
  const top = (l, total) => l.slice(0, 5).map((c) => ({ nombre: c.nombre || c.rfc, total: pesos(c.total), pct: pct(c.total, total), facturas: c.facturas }));
  const facturasVenta = emitidos.filter((c) => c.signo > 0);
  const credito = pesos(facturasVenta.filter((c) => c.metodoPago === 'PPD').reduce((s, c) => s + c.total, 0));

  const r = {
    rfc: propio,
    periodo: { desde: fechas[0] || '', hasta: fechas[fechas.length - 1] || '', meses: meses.length },
    comprobantes: lista.length,
    ventas: {
      total: ventas, facturas: facturasVenta.length, ticketPromedio: facturasVenta.length ? pesos(ventas / facturasVenta.length) : 0,
      clientes: identificados.length, publicoGeneralPct: pct(publico, ventas),
      top1Pct: identificados[0] ? pct(identificados[0].total, ventas) : 0,
      top3Pct: pct(identificados.slice(0, 3).reduce((s, c) => s + c.total, 0), ventas),
      recurrenciaPct: pct(identificados.filter((c) => c.meses.size > 1).length, identificados.length),
      creditoPct: pct(credito, ventas),
      topClientes: top(identificados, ventas),
    },
    gastos: { total: gastos, proveedores: proveedores.length, top1Pct: proveedores[0] ? pct(proveedores[0].total, gastos) : 0, topProveedores: top(proveedores, gastos) },
    nomina,
    diferencia: pesos(ventas - gastos - nomina),
    porMes,
  };
  r.flujoBase = baseDeFlujo(lista, esPropio);
  r.hallazgos = hallazgosDe(r);
  r.hechos = hechosDe(r);
  return r;
}

const dinero = (n) => `$${Math.round(n).toLocaleString('es-MX')}`;

// Reglas sobre los datos reales. Cada hallazgo apunta al área que debe atenderlo.
function hallazgosDe(r) {
  const h = [];
  const v = r.ventas;
  const push = (area, color, texto) => h.push({ area, color, texto });
  if (v.total > 0) {
    if (v.top1Pct >= 50) push('ventas', 'rojo', `Un solo cliente concentra ${v.top1Pct}% de lo facturado (${v.topClientes[0].nombre}). Si se va, se va la mitad del negocio.`);
    else if (v.top3Pct >= 60) push('ventas', 'amarillo', `Los tres clientes principales concentran ${v.top3Pct}% de lo facturado.`);
    else if (v.clientes >= 3) push('ventas', 'verde', `La venta está repartida: el cliente más grande pesa ${v.top1Pct}% y los tres principales ${v.top3Pct}%.`);
    if (r.periodo.meses >= 3 && v.clientes >= 5) {
      if (v.recurrenciaPct < 30) push('ventas', 'amarillo', `Solo ${v.recurrenciaPct}% de los clientes identificados volvió a comprar en otro mes del periodo.`);
      else push('ventas', 'verde', `${v.recurrenciaPct}% de los clientes identificados compró en más de un mes.`);
    }
    if (v.creditoPct >= 50) push('finanzas', 'amarillo', `${v.creditoPct}% de la venta se factura a crédito o en parcialidades (PPD): la cobranza decide tu caja.`);
  }
  if (v.total > 0 && r.gastos.total > 0) {
    if (r.diferencia < 0) push('finanzas', 'rojo', `En el periodo se facturaron ${dinero(r.gastos.total + r.nomina)} de gastos y nómina contra ${dinero(v.total)} de ventas.`);
    else push('finanzas', 'verde', `Lo facturado cubre los gastos y la nómina con comprobante: quedan ${dinero(r.diferencia)} en el periodo.`);
  }
  if (r.gastos.total > 0 && r.gastos.proveedores >= 2 && r.gastos.top1Pct >= 50) push('compras', 'amarillo', `Un solo proveedor concentra ${r.gastos.top1Pct}% de lo comprado (${r.gastos.topProveedores[0].nombre}).`);
  return h;
}

// Frases cortas para registrarlas como hechos de la empresa (los agentes las tratan como verdad).
function hechosDe(r) {
  const p = `del ${r.periodo.desde} al ${r.periodo.hasta}`;
  const t = [];
  if (r.ventas.total > 0) {
    t.push({ area: 'ventas', texto: `Ventas facturadas ${p}: ${dinero(r.ventas.total)} en ${r.ventas.facturas} facturas a ${r.ventas.clientes} clientes identificados; ticket promedio ${dinero(r.ventas.ticketPromedio)}.` });
    if (r.ventas.clientes) t.push({ area: 'ventas', texto: `Concentración de clientes ${p}: el principal pesa ${r.ventas.top1Pct}% y los tres principales ${r.ventas.top3Pct}% de lo facturado; ${r.ventas.recurrenciaPct}% compró en más de un mes.` });
    if (r.ventas.creditoPct) t.push({ area: 'finanzas', texto: `${r.ventas.creditoPct}% de la venta facturada ${p} fue a crédito o en parcialidades (PPD).` });
  }
  if (r.gastos.total > 0) t.push({ area: 'compras', texto: `Compras y gastos con factura ${p}: ${dinero(r.gastos.total)} a ${r.gastos.proveedores} proveedores; el principal pesa ${r.gastos.top1Pct}%.` });
  if (r.nomina > 0) t.push({ area: 'rh', texto: `Nómina timbrada ${p}: ${dinero(r.nomina)}.` });
  return t;
}

// Resumen de una línea para el informe del Orquestador.
export function resumenDatosReales(r) {
  if (!r) return '';
  const partes = [`Datos reales del ${r.periodo.desde} al ${r.periodo.hasta} (${r.comprobantes} comprobantes)`];
  if (r.ventas.total) partes.push(`ventas ${dinero(r.ventas.total)}`);
  if (r.gastos.total) partes.push(`gastos ${dinero(r.gastos.total)}`);
  if (r.ventas.clientes) partes.push(`los tres clientes principales pesan ${r.ventas.top3Pct}%`);
  return `${partes.join('; ')}.`;
}

// ---------- Almacenamiento: solo el resumen ----------

export function crearDatosReales(archivo) {
  return {
    leer() {
      if (!existsSync(archivo)) return null;
      try { return JSON.parse(readFileSync(archivo, 'utf8')); } catch { return null; }
    },
    guardar(analisis) {
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify(analisis, null, 2), 'utf8');
      return analisis;
    },
    borrar() { rmSync(archivo, { force: true }); },
  };
}
