// Agenda de citas y clientes: módulo opcional para cualquier negocio que atiende con cita (consultorio, salón,
// taller, despacho, clases). Se enciende en Configuración; apagado, no aparece ni ocupa nada.
// Todo vive en un archivo local. A los agentes solo les llegan cifras agregadas (cuántas citas, cuántas faltaron,
// cuánto se cobró): los nombres, teléfonos y notas de las personas nunca entran al contexto de la IA.
// No es un expediente: la nota de cada persona es corta y de trato (cómo prefiere que le llamen, horario), no clínica.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export const ETIQUETAS_AGENDA = { clientes: ['cliente', 'clientes'], pacientes: ['paciente', 'pacientes'], alumnos: ['alumno', 'alumnos'], huespedes: ['huésped', 'huéspedes'] };
export const ESTADOS_CITA = { programada: 'Programada', confirmada: 'Confirmada', asistio: 'Asistió', no_asistio: 'No asistió', cancelada: 'Cancelada' };
export const MAX_CLIENTES = 5000;
export const MAX_CITAS = 20000;
const ID_VALIDO = /^[0-9a-f]{10}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIA = 24 * 60 * 60 * 1000;

const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const telefono = (v) => String(v ?? '').replace(/[^\d+]/g, '').slice(0, 15);
const dinero = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(1e7, Math.round(n * 100) / 100) : 0; };
const nuevoId = () => randomBytes(5).toString('hex');
const dos = (n) => String(n).padStart(2, '0');
export const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const minutos = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
const sumarDias = (fecha, n) => { const [a, m, d] = fecha.split('-').map(Number); return fechaLocal(new Date(a, m - 1, d + n)); };
const pesos = (n) => `$${Math.round(n).toLocaleString('es-MX')}`;

export function crearAgenda(archivo) {
  function leer() {
    let d = null;
    if (existsSync(archivo)) {
      try { d = JSON.parse(readFileSync(archivo, 'utf8')); } catch { d = null; }
    }
    return {
      activa: d?.activa === true,
      etiqueta: ETIQUETAS_AGENDA[d?.etiqueta] ? d.etiqueta : 'clientes',
      clientes: Array.isArray(d?.clientes) ? d.clientes.filter((c) => c && ID_VALIDO.test(c.id) && c.nombre) : [],
      citas: Array.isArray(d?.citas) ? d.citas.filter((c) => c && ID_VALIDO.test(c.id) && FECHA.test(c.fecha) && HORA.test(c.hora) && ESTADOS_CITA[c.estado]) : [],
    };
  }
  function escribir(datos) {
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(datos, null, 2), 'utf8');
    return datos;
  }
  const error = (mensaje) => { throw new Error(mensaje); };

  // Otra cita activa de la misma persona que atiende, que se encime en el horario.
  function choque(citas, cita) {
    const inicio = minutos(cita.hora);
    const fin = inicio + cita.duracion;
    return citas.find((c) => c.id !== cita.id && c.fecha === cita.fecha && c.estado !== 'cancelada' && c.estado !== 'no_asistio'
      && (c.atiende || '').toLowerCase() === (cita.atiende || '').toLowerCase() && minutos(c.hora) < fin && inicio < minutos(c.hora) + c.duracion) || null;
  }

  // Valida y limpia los campos de una cita. `base` es la cita actual cuando se edita.
  function limpiarCita(entrada, base = {}) {
    const c = { ...base };
    if (entrada.fecha !== undefined) c.fecha = String(entrada.fecha);
    if (entrada.hora !== undefined) c.hora = String(entrada.hora);
    if (entrada.duracion !== undefined) c.duracion = Math.min(600, Math.max(5, Math.round(Number(entrada.duracion) || 0)));
    if (entrada.servicio !== undefined) c.servicio = texto(entrada.servicio, 120);
    if (entrada.atiende !== undefined) c.atiende = texto(entrada.atiende, 80);
    if (entrada.precio !== undefined) c.precio = dinero(entrada.precio);
    if (entrada.estado !== undefined) c.estado = ESTADOS_CITA[entrada.estado] ? entrada.estado : error('Ese estado de cita no existe');
    if (entrada.pagado !== undefined) c.pagado = entrada.pagado === true;
    if (!FECHA.test(c.fecha || '')) error('Elige la fecha de la cita');
    if (!HORA.test(c.hora || '')) error('Elige la hora de la cita');
    c.duracion ||= 30;
    c.estado ||= 'programada';
    return c;
  }

  // Cifras de los últimos `dias` días y de la semana que viene. Sin nombres: esto es lo único que ven los agentes.
  function indicadores(ahora = new Date(), dias = 30) {
    const { citas, clientes } = leer();
    const hoy = fechaLocal(ahora);
    const desde = fechaLocal(new Date(ahora.getTime() - dias * DIA));
    const pasadas = citas.filter((c) => c.fecha >= desde && c.fecha <= hoy && c.estado !== 'programada' && c.estado !== 'confirmada');
    const cuenta = (estado) => pasadas.filter((c) => c.estado === estado).length;
    const asistieron = pasadas.filter((c) => c.estado === 'asistio');
    const cobrado = asistieron.filter((c) => c.pagado).reduce((s, c) => s + (c.precio || 0), 0);
    const porCobrar = citas.filter((c) => c.estado === 'asistio' && !c.pagado && c.precio > 0).reduce((s, c) => s + c.precio, 0);
    const proximas = citas.filter((c) => c.fecha >= hoy && c.fecha < sumarDias(hoy, 7) && (c.estado === 'programada' || c.estado === 'confirmada'));
    const visitas = new Map();
    for (const c of citas.filter((x) => x.estado === 'asistio')) visitas.set(c.clienteId, (visitas.get(c.clienteId) || 0) + 1);
    const decididas = cuenta('asistio') + cuenta('no_asistio');
    return {
      dias, citas: pasadas.length, asistieron: asistieron.length, noAsistieron: cuenta('no_asistio'), canceladas: cuenta('cancelada'),
      noAsistieronPct: decididas ? Math.round((cuenta('no_asistio') / decididas) * 100) : null,
      cobrado, porCobrar, ingresoPorVisita: asistieron.length ? Math.round(cobrado / asistieron.length) : 0,
      hoy: citas.filter((c) => c.fecha === hoy && c.estado !== 'cancelada').length,
      proximas7: proximas.length, sinConfirmar7: proximas.filter((c) => c.estado === 'programada').length,
      personas: clientes.length, vuelven: visitas.size ? Math.round(([...visitas.values()].filter((n) => n > 1).length / visitas.size) * 100) : null,
    };
  }

  return {
    leer,
    indicadores,

    configurar({ activa, etiqueta } = {}) {
      const d = leer();
      if (typeof activa === 'boolean') d.activa = activa;
      if (ETIQUETAS_AGENDA[etiqueta]) d.etiqueta = etiqueta;
      escribir(d);
      return { activa: d.activa, etiqueta: d.etiqueta };
    },

    // Alta o corrección de una persona. Con el mismo nombre y teléfono devuelve la que ya existe.
    guardarCliente({ id = '', nombre, telefono: tel, nota } = {}) {
      const d = leer();
      const limpio = texto(nombre, 100);
      if (limpio.length < 2) error('Escribe el nombre');
      let c = id ? d.clientes.find((x) => x.id === id) : d.clientes.find((x) => x.nombre.toLowerCase() === limpio.toLowerCase() && (!tel || !x.telefono || x.telefono === telefono(tel)));
      if (id && !c) error('Esa persona no existe');
      if (!c) {
        if (d.clientes.length >= MAX_CLIENTES) error(`La agenda admite hasta ${MAX_CLIENTES} personas`);
        c = { id: nuevoId(), nombre: limpio, telefono: '', nota: '', creado: new Date().toISOString() };
        d.clientes.push(c);
      }
      c.nombre = limpio;
      if (tel !== undefined && telefono(tel)) c.telefono = telefono(tel);
      if (nota !== undefined) c.nota = texto(nota, 200);
      escribir(d);
      return c;
    },

    // Borra a la persona y sus citas: es la forma de atender una solicitud de eliminar sus datos.
    borrarCliente(id) {
      const d = leer();
      if (!d.clientes.some((c) => c.id === id)) return false;
      escribir({ ...d, clientes: d.clientes.filter((c) => c.id !== id), citas: d.citas.filter((c) => c.clienteId !== id) });
      return true;
    },

    // Nueva cita. Si choca con otra de la misma persona que atiende, se rechaza salvo que venga `forzar`.
    agregarCita(entrada = {}) {
      const d = leer();
      if (!d.clientes.some((c) => c.id === entrada.clienteId)) error('Elige a quién es la cita');
      if (d.citas.length >= MAX_CITAS) error('La agenda está llena: borra citas antiguas');
      const cita = { id: nuevoId(), clienteId: entrada.clienteId, servicio: '', atiende: '', precio: 0, pagado: false, creado: new Date().toISOString(), ...limpiarCita(entrada) };
      const otra = choque(d.citas, cita);
      if (otra && entrada.forzar !== true) error(`Ya hay una cita a las ${otra.hora}${cita.atiende ? ` con ${cita.atiende}` : ''} que se encima con ese horario`);
      d.citas.push(cita);
      escribir(d);
      return cita;
    },

    cambiarCita(id, entrada = {}) {
      const d = leer();
      const i = d.citas.findIndex((c) => c.id === id);
      if (i < 0) return null;
      const cita = limpiarCita(entrada, d.citas[i]);
      const cambioHorario = cita.fecha !== d.citas[i].fecha || cita.hora !== d.citas[i].hora || cita.duracion !== d.citas[i].duracion || cita.atiende !== d.citas[i].atiende;
      const otra = cambioHorario ? choque(d.citas, cita) : null;
      if (otra && entrada.forzar !== true) error(`Ya hay una cita a las ${otra.hora} que se encima con ese horario`);
      d.citas[i] = cita;
      escribir(d);
      return cita;
    },

    borrarCita(id) {
      const d = leer();
      if (!d.citas.some((c) => c.id === id)) return false;
      escribir({ ...d, citas: d.citas.filter((c) => c.id !== id) });
      return true;
    },

    // Citas de un rango de días, ordenadas, con el nombre y teléfono de la persona (solo para la pantalla del dueño).
    citasEntre(desde, dias = 7) {
      const d = leer();
      const hasta = sumarDias(desde, dias);
      const persona = new Map(d.clientes.map((c) => [c.id, c]));
      return d.citas.filter((c) => c.fecha >= desde && c.fecha < hasta)
        .sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`))
        .map((c) => ({ ...c, nombre: persona.get(c.clienteId)?.nombre || 'Sin nombre', telefono: persona.get(c.clienteId)?.telefono || '' }));
    },

    // Personas con sus cuentas: visitas, próxima cita y lo que deben.
    clientesConResumen(ahora = new Date()) {
      const d = leer();
      const hoy = fechaLocal(ahora);
      return d.clientes.map((c) => {
        const suyas = d.citas.filter((x) => x.clienteId === c.id);
        const proxima = suyas.filter((x) => x.fecha >= hoy && (x.estado === 'programada' || x.estado === 'confirmada')).sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`))[0];
        return { ...c, visitas: suyas.filter((x) => x.estado === 'asistio').length, faltas: suyas.filter((x) => x.estado === 'no_asistio').length, debe: suyas.filter((x) => x.estado === 'asistio' && !x.pagado).reduce((s, x) => s + (x.precio || 0), 0), proxima: proxima ? `${proxima.fecha} ${proxima.hora}` : '' };
      }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    },

    // Texto para los agentes: solo cifras. Vacío si la agenda está apagada o sin movimiento.
    paraPrompt(ahora = new Date()) {
      const d = leer();
      if (!d.activa || !d.citas.length) return '';
      const i = indicadores(ahora);
      const [, plural] = ETIQUETAS_AGENDA[d.etiqueta];
      const partes = [`Agenda de citas del negocio (HECHO; cifras agregadas, sin datos personales): ${i.personas} ${plural} registrados.`];
      if (i.citas) partes.push(`Últimos ${i.dias} días: ${i.citas} citas, ${i.asistieron} asistieron, ${i.noAsistieron} no se presentaron${i.noAsistieronPct === null ? '' : ` (${i.noAsistieronPct}%)`} y ${i.canceladas} cancelaron. Cobrado ${pesos(i.cobrado)}${i.ingresoPorVisita ? `, ${pesos(i.ingresoPorVisita)} por visita` : ''}; por cobrar de visitas ya atendidas ${pesos(i.porCobrar)}.`);
      partes.push(`Próximos 7 días: ${i.proximas7} citas, ${i.sinConfirmar7} sin confirmar.${i.vuelven === null ? '' : ` Vuelve ${i.vuelven}% de quienes ya vinieron.`}`);
      partes.push('No tienes nombres ni teléfonos de estas personas y no debes pedirlos: propón acciones generales (recordatorios, confirmación, política de cancelación).');
      return partes.join(' ');
    },
  };
}

// Mensaje de recordatorio para enviar por WhatsApp. Lo manda el dueño desde su teléfono; la aplicación no envía nada.
export function recordatorio({ nombre, fecha, hora, servicio = '' }, negocio = '') {
  const [a, m, d] = fecha.split('-').map(Number);
  const dia = new Date(a, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return `Hola, ${nombre.split(' ')[0]}. Te recordamos tu cita${servicio ? ` de ${servicio}` : ''} el ${dia} a las ${hora}${negocio ? ` en ${negocio}` : ''}. ¿Nos confirmas tu asistencia? Si no puedes venir, avísanos para reagendar.`;
}
