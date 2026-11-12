// Comunicación entre agentes. Un agente puede escribir "CONSULTAR: [área] — pregunta", el Coordinador (o un
// superior) "DELEGAR: [área] — orden", y cualquiera "INFORMAR: [área] — dato". Consultar y delegar llaman al agente
// destino y devuelven su respuesta al origen (una sola vuelta, con tope de encargos); informar solo deja una nota en
// la memoria compartida, sin llamar a la IA, y el destino la ve en su siguiente orden.
import { NOMBRES_DISTRITOS } from './diagnostico.js';
import { NOMBRES_APOYO } from './apoyo.js';
import { ORQUESTADOR } from './conversaciones.js';
import { puedeDelegar } from './jerarquia.js';

export const MAX_CONSULTAS = 2;
export const MAX_DELEGACIONES = 4;
export const MAX_NOTAS = 3;

const normalizar = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Encuentra el id de un agente por su nombre o id, incluidos los agentes propios del usuario.
export function resolverAgente(texto, propios = {}) {
  const t = normalizar(texto).replace(/^agente de\s+/, '').replace(/^el\s+/, '');
  if (!t) return null;
  if (t === 'coordinador' || t === 'orquestador') return ORQUESTADOR; // el nombre anterior sigue valiendo
  const candidatos = [
    ...Object.entries(NOMBRES_DISTRITOS),
    ...Object.entries(NOMBRES_APOYO),
    ...Object.entries(propios).map(([id, a]) => [id, a.nombre]),
  ];
  for (const [id, nombre] of candidatos) {
    const n = normalizar(nombre);
    if (t === id || t === n || n.startsWith(t) || t.startsWith(n)) return id;
  }
  // Nombres de agente asignados por el usuario (equipo)
  return null;
}

// Extrae las líneas CONSULTAR/DELEGAR de una respuesta. Devuelve [{ tipo, destinoTexto, texto }].
export function extraerPeticiones(respuesta) {
  const peticiones = [];
  const re = /^\s*(CONSULTAR|DELEGAR|INFORMAR)\s*:\s*\[?([^\]\n—–-]{2,60})\]?\s*[—–-]\s*(.+?)\s*$/gim;
  let m;
  while ((m = re.exec(String(respuesta || ''))) !== null) {
    peticiones.push({ tipo: m[1].toUpperCase(), destinoTexto: m[2].trim(), texto: m[3].trim() });
  }
  return peticiones;
}

// Quita las líneas de petición del texto que verá el usuario (ya se muestran como intercambio aparte).
export function limpiarPeticiones(respuesta) {
  return String(respuesta || '').replace(/^\s*(CONSULTAR|DELEGAR|INFORMAR)\s*:.*$/gim, '').replace(/\n{3,}/g, '\n\n').trim();
}

// Resuelve las peticiones llamando al agente destino. responder(areaDestino, textoParaDestino) debe devolver el texto.
// informar(areaDestino, textoNota) deja la nota en la memoria compartida. maximo: tope de consultas/encargos por orden.
export async function colaborar({ areaOrigen, nombreOrigen, respuesta, propios, equipo, responder, informar = null, maximo = null }) {
  const peticiones = extraerPeticiones(respuesta);
  const permitidas = maximo || (areaOrigen === ORQUESTADOR ? MAX_DELEGACIONES : Math.max(MAX_CONSULTAS, MAX_DELEGACIONES - 1));
  const intercambios = [];
  let llamadas = 0;
  let notas = 0;
  for (const p of peticiones) {
    if (p.tipo === 'INFORMAR' ? notas >= MAX_NOTAS : llamadas >= permitidas) continue;
    const destino = resolverAgente(p.destinoTexto, propios);
    if (!destino || destino === areaOrigen) {
      intercambios.push({ tipo: p.tipo, destino: null, destinoTexto: p.destinoTexto, texto: p.texto, respuesta: null, error: 'No existe un agente con ese nombre' });
      continue;
    }
    if (p.tipo === 'INFORMAR') {
      notas++;
      const nombreDestino = equipo?.areas?.[destino]?.agente || NOMBRES_DISTRITOS[destino] || NOMBRES_APOYO[destino] || propios[destino]?.nombre || destino;
      try {
        if (informar) await informar(destino, p.texto);
        intercambios.push({ tipo: p.tipo, destino, nombreDestino, texto: p.texto, respuesta: null, nota: true });
      } catch (err) {
        intercambios.push({ tipo: p.tipo, destino, nombreDestino, texto: p.texto, respuesta: null, error: err.message });
      }
      continue;
    }
    llamadas++;
    // Jerarquía: solo se delega a subordinados directos (el Coordinador, a cualquiera). Consultar siempre se puede.
    if (p.tipo === 'DELEGAR' && !puedeDelegar(areaOrigen, destino, propios)) {
      intercambios.push({ tipo: p.tipo, destino, destinoTexto: p.destinoTexto, texto: p.texto, respuesta: null, error: 'No está en tu línea de mando; pídelo al Coordinador o consúltalo' });
      continue;
    }
    const nombreDestino = equipo?.areas?.[destino]?.agente || NOMBRES_DISTRITOS[destino] || NOMBRES_APOYO[destino] || propios[destino]?.nombre || destino;
    const textoDestino = p.tipo === 'DELEGAR'
      ? `Encargo del Coordinador: ${p.texto}`
      : `Pregunta de ${nombreOrigen}: ${p.texto} (responde solo lo que te preguntan, breve y con datos de tu área).`;
    try {
      const r = await responder(destino, textoDestino);
      intercambios.push({ tipo: p.tipo, destino, nombreDestino, texto: p.texto, respuesta: r });
    } catch (err) {
      intercambios.push({ tipo: p.tipo, destino, nombreDestino, texto: p.texto, respuesta: null, error: err.message });
    }
  }
  return intercambios;
}

// Texto final para el usuario: respuesta limpia más lo que contestaron los demás agentes.
export function componerRespuesta(respuesta, intercambios) {
  const base = limpiarPeticiones(respuesta);
  if (!intercambios.length) return base;
  const partes = intercambios.map((i) => {
    const titulo = i.tipo === 'DELEGAR' ? `Encargo a ${i.nombreDestino || i.destinoTexto}` : i.tipo === 'INFORMAR' ? `Nota para ${i.nombreDestino || i.destinoTexto}` : `Consulta a ${i.nombreDestino || i.destinoTexto}`;
    if (i.nota) return `${titulo}: ${i.texto}\n→ (quedó en la memoria compartida; la verá en su siguiente orden)`;
    const cuerpo = i.respuesta ? i.respuesta : `(sin respuesta: ${i.error || 'error'})`;
    return `${titulo}: ${i.texto}\n→ ${cuerpo}`;
  });
  return `${base}\n\n— Respuestas de otros agentes —\n${partes.join('\n\n')}`;
}
