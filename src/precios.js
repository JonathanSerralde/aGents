// Costo en dinero del uso de IA: convierte tokens a dólares con el precio de lista del proveedor y a pesos con el
// tipo de cambio que el dueño captura. Todo se calcula aquí, sin consultar a nadie: los precios y el tipo de cambio
// cambian, así que son aproximados y se pueden corregir en Configuración › Consumo de IA.
// Precios en dólares por millón de tokens (lista de Anthropic, octubre de 2026). Otros proveedores no traen
// precio: el dueño lo escribe (precioEntradaUsd y precioSalidaUsd) o el costo se muestra como desconocido.

export const TIPO_CAMBIO_SUGERIDO = 18.5; // pesos por dólar; es un punto de partida, no un dato del día
export const USD_POR_BUSQUEDA = 0.01; // búsqueda web del proveedor: 10 dólares por cada mil
const FACTOR_CACHE = 0.1; // lo leído de la caché del proveedor cuesta la décima parte
const FACTOR_LOTE = 0.5; // los lotes (piloto automático) cuestan la mitad
const CARACTERES_POR_TOKEN = 3.2; // español: se estima de más para no quedarse corto

// El primer patrón que coincide gana: los más específicos van primero.
const TABLA = [
  [/^claude-(fable|mythos)-5/, 10, 50],
  [/^claude-opus-5-5/, 4, 20],
  [/^claude-opus-(5|4-[5-8])/, 5, 25],
  [/^claude-sonnet-5/, 2, 10],
  [/^claude-sonnet-4/, 3, 15],
  [/^claude-haiku-5-5/, 0.1, 0.5],
  [/^claude-haiku-4-5/, 1, 5],
];

const numero = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

// Precio por millón de tokens de un modelo, o null si no se conoce. `ajustes` es la configuración del dueño.
export function precioDe(modelo, ajustes = {}) {
  const propio = { entrada: numero(ajustes.precioEntradaUsd), salida: numero(ajustes.precioSalidaUsd) };
  if (propio.entrada && propio.salida) return { ...propio, origen: 'tuyo' };
  const id = String(modelo || '').toLowerCase().trim();
  const fila = TABLA.find(([patron]) => patron.test(id));
  return fila ? { entrada: fila[1], salida: fila[2], origen: 'lista' } : null;
}

export const tipoCambioDe = (ajustes = {}) => numero(ajustes.tipoCambio) || TIPO_CAMBIO_SUGERIDO;
export const tokensDe = (texto) => Math.ceil(String(texto || '').length / CARACTERES_POR_TOKEN);

// Costo en dólares de una llamada ya hecha. `entrada` incluye lo leído de caché, como lo registra src/uso.js.
// Devuelve null si el modelo no tiene precio conocido. No cuenta el recargo por escribir en caché (25%).
export function costoUsd({ modelo = '', entrada = 0, salida = 0, cacheLeido = 0, busquedas = 0 } = {}, ajustes = {}) {
  const precio = precioDe(String(modelo).replace(/\s*\(lote\)\s*$/, ''), ajustes);
  if (!precio) return null;
  const lote = /\(lote\)\s*$/.test(String(modelo)) ? FACTOR_LOTE : 1;
  const cache = Math.min(numero(cacheLeido), numero(entrada));
  const tokens = ((numero(entrada) - cache) + cache * FACTOR_CACHE) * precio.entrada + numero(salida) * precio.salida;
  return (tokens / 1e6) * lote + numero(busquedas) * USD_POR_BUSQUEDA;
}

// Tokens del mes que se registraron antes de que la oficina llevara el costo llamada por llamada (o sin él).
// Se les calcula un costo aproximado repartiendo entrada, salida y caché en la proporción del mes, modelo por modelo.
// `mes` es el resumen de src/uso.js. Devuelve { usd, sinPrecio } para sumar a lo ya contado.
export function costoLegado(mes, ajustes = {}) {
  const total = numero(mes.entrada) + numero(mes.salida);
  const legado = total - numero(mes.conCosto) - numero(mes.sinPrecio);
  if (!total || legado <= 0) return { usd: 0, sinPrecio: 0 };
  const parteSalida = numero(mes.salida) / total;
  const parteCache = mes.entrada ? Math.min(1, numero(mes.cacheLeido) / mes.entrada) : 0;
  let usd = 0;
  let sinPrecio = 0;
  for (const [clave, tokens] of Object.entries(mes.porModelo || {})) {
    const entrada = tokens * (1 - parteSalida);
    const c = costoUsd({ modelo: clave.split(':').slice(1).join(':'), entrada, salida: tokens * parteSalida, cacheLeido: entrada * parteCache }, ajustes);
    if (c === null) sinPrecio += tokens; else usd += c;
  }
  const escala = legado / total;
  const busquedas = numero(mes.conCosto) ? 0 : numero(mes.busquedas) * USD_POR_BUSQUEDA;
  return { usd: usd * escala + busquedas, sinPrecio: Math.round(sinPrecio * escala) };
}

// Estimación antes de actuar. Recibe los tokens de entrada, la salida esperada y la salida máxima posible,
// por el número de llamadas. Devuelve pesos { aproximado, hasta } o null si no hay precio.
export function estimar({ modelo, tokensEntrada, salidaEsperada, salidaMaxima, llamadas = 1, busquedas = 0, lote = false }, ajustes = {}) {
  const id = lote ? `${modelo} (lote)` : modelo;
  const una = (salida, b) => costoUsd({ modelo: id, entrada: tokensEntrada, salida, busquedas: b }, ajustes);
  const aproximado = una(salidaEsperada, Math.ceil(busquedas / 2));
  if (aproximado === null) return null;
  const cambio = tipoCambioDe(ajustes);
  return { aproximado: aproximado * llamadas * cambio, hasta: una(salidaMaxima, busquedas) * llamadas * cambio };
}

// "$0.05", "$1.20", "$35": con centavos solo cuando importan. Por debajo de un centavo se dice así.
export function pesosCortos(n) {
  if (n === null || n === undefined) return '';
  if (n < 0.01) return 'menos de 1 centavo';
  if (n < 10) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}
