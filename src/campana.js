// Campañas construidas por la IA: el agente de Tráfico digital (o Marketing) propone la campaña completa a partir
// de lo que el dueño quiere lograr y de lo que la oficina ya sabe del negocio. Cada propuesta trae lo necesario
// para generar las piezas (titular, texto de apoyo, llamada a la acción y colores) y para publicarlas
// (texto del anuncio, hashtags, a quién dirigirla y presupuesto sugerido). Aquí se arma la instrucción y se
// interpreta la respuesta; las imágenes las dibuja el navegador (public/campanas.js).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const OBJETIVOS = {
  vender: 'Vender una oferta o promoción',
  llenar: 'Llenar un curso, evento o agenda',
  conocer: 'Dar a conocer el negocio',
  recuperar: 'Recuperar clientes que ya no compran',
};
export const TONOS = { cercano: 'Cercano y sencillo', profesional: 'Profesional y sobrio', urgente: 'Directo y con urgencia' };
export const MAX = { titular: 70, apoyo: 110, cta: 24, texto: 600, hashtags: 120, angulo: 200, publico: 240, presupuesto: 160 };
const MAX_PROPUESTAS = 3;

const limpiar = (t, max) => String(t ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Lo que pide el dueño. `oferta` es obligatoria; lo demás tiene valores por defecto.
export function sanitizarPeticion(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  return {
    objetivo: e.objetivo in OBJETIVOS ? e.objetivo : 'vender',
    oferta: limpiar(e.oferta, 300),
    publico: limpiar(e.publico, 200),
    tono: e.tono in TONOS ? e.tono : 'cercano',
  };
}

export function instruccionCampana(p) {
  return [
    'Construye una campaña publicitaria completa para este negocio. No me preguntes nada: decide tú con lo que sabes de la empresa.',
    `Objetivo: ${OBJETIVOS[p.objetivo]}.`,
    `Qué se ofrece: ${p.oferta}.`,
    p.publico ? `A quién va dirigida: ${p.publico}.` : 'A quién va dirigida: decídelo tú según el negocio.',
    `Tono: ${TONOS[p.tono]}. Español de México.`,
    '',
    `Entrega exactamente ${MAX_PROPUESTAS} propuestas distintas entre sí (cada una con un ángulo diferente: beneficio, prueba o confianza, urgencia).`,
    'Usa este formato exacto, una línea por dato, sin negritas ni viñetas:',
    'PROPUESTA 1',
    `TITULAR: lo que va grande en la imagen (máximo ${MAX.titular} caracteres)`,
    `APOYO: una línea que completa el titular (máximo ${MAX.apoyo} caracteres)`,
    `CTA: llamada a la acción del botón (máximo ${MAX.cta} caracteres)`,
    'TEXTO: el texto que se pega al publicar el anuncio (2 a 4 frases)',
    'HASHTAGS: de 3 a 6, separados por espacio',
    'PUBLICO: a quién segmentar (edad, zona, intereses)',
    'PRESUPUESTO: monto diario sugerido en pesos y por cuántos días',
    'ANGULO: por qué esta propuesta puede funcionar, en una frase',
    'COLORES: fondo, fondo 2, texto y acento en hexadecimal, separados por coma (ejemplo: #0b1a3a, #3f2b96, #ffffff, #3fd3ff). El texto debe leerse bien sobre el fondo.',
    '',
    'No inventes precios, descuentos, fechas ni datos de la empresa que no estén en tu contexto o en lo que te di; si falta uno, redacta sin él.',
    'No prometas resultados garantizados ni validez oficial que el negocio no tenga. Entrega solo las propuestas: sin saludo, sin secciones ACCIONES ni ESTADO, y sin consultar ni delegar a otros agentes.',
  ].join('\n');
}

const HEX = /#[0-9a-f]{6}\b/gi;

// Luminancia relativa (0 a 1) para comprobar que el texto se lee sobre el fondo.
function luminancia(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// Interpreta la respuesta del agente. Ignora lo que no siga el formato y recorta cada dato a su máximo.
export function parsearCampana(texto) {
  const propuestas = [];
  let actual = null;
  for (const cruda of String(texto || '').split(/\r?\n/)) {
    const linea = cruda.replace(/\*\*/g, '').replace(/^[\s>#*•-]+/, '').trim();
    if (!linea) continue;
    if (/^PROPUESTA\s*\d*/i.test(linea)) {
      actual = { titular: '', apoyo: '', cta: '', texto: '', hashtags: '', publico: '', presupuesto: '', angulo: '', colores: null };
      propuestas.push(actual);
      continue;
    }
    const m = linea.match(/^(TITULAR|APOYO|CTA|TEXTO|HASHTAGS|PUBLICO|PÚBLICO|PRESUPUESTO|ANGULO|ÁNGULO|COLORES)\s*:\s*(.*)$/i);
    if (!m || !actual) continue;
    const clave = m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const valor = m[2].replace(/^["“”']+|["“”']+$/g, '');
    if (clave === 'colores') {
      const c = (valor.match(HEX) || []).map((h) => h.toLowerCase());
      if (c.length >= 4) {
        const colores = { fondo: c[0], fondo2: c[1], texto: c[2], acento: c[3] };
        // Si el texto no se lee sobre el fondo, se corrige a blanco o negro.
        if (contraste(colores.fondo, colores.texto) < 4.5) colores.texto = luminancia(colores.fondo) > 0.4 ? '#101010' : '#ffffff';
        actual.colores = colores;
      }
    } else if (clave === 'hashtags') {
      actual.hashtags = limpiar((valor.match(/#[\p{L}\p{N}_]+/gu) || []).slice(0, 6).join(' '), MAX.hashtags);
    } else {
      actual[clave] = limpiar(valor, MAX[clave]);
    }
  }
  return propuestas.filter((p) => p.titular).slice(0, MAX_PROPUESTAS);
}

// Última campaña generada: se guarda para no gastar tokens otra vez al volver a la pantalla.
export function crearCampanas(archivo) {
  return {
    leer() {
      if (!existsSync(archivo)) return null;
      try { return JSON.parse(readFileSync(archivo, 'utf8')); } catch { return null; }
    },
    guardar(campana) {
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify(campana, null, 2), 'utf8');
      return campana;
    },
  };
}
