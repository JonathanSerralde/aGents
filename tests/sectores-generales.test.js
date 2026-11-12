import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTORES, sectoresActivos, contextoSectores } from '../src/sectores.js';
import { CAMPOS, validar } from '../src/formulario.js';
import { evaluar } from '../src/diagnostico.js';

const GIROS = CAMPOS.find((c) => c.id === 'giro').opciones;
const NUEVOS_GIROS = ['transporte', 'software', 'turismo', 'agro', 'servicios_personales', 'automotriz', 'inmobiliario'];
const NUEVOS_SECTORES = ['manufactura', 'construccion', 'servicios', ...NUEVOS_GIROS];
const base = { contacto_nombre: 'Ana', confianza: 'alto', empleados: '6-10', ventas_anuales: '1m-5m', antiguedad_anios: 3 };

// Campo del Bloque B → giro, distrito, un valor malo (rojo), uno regular (amarillo), uno sano y el texto del hallazgo.
const BLOQUE_B = {
  dias_cobro_estimaciones: { giro: 'construccion', distrito: 'finanzas', malo: 120, regular: 60, sano: 30, hallazgo: /cobrar estimaciones/ },
  viajes_vacios_pct: { giro: 'transporte', distrito: 'operaciones', malo: 50, regular: 30, sano: 10, hallazgo: /sin carga/ },
  combustible_pct: { giro: 'transporte', distrito: 'finanzas', malo: 50, regular: 40, sano: 30, hallazgo: /[Cc]ombustible/ },
  ingreso_recurrente_software_pct: { giro: 'software', distrito: 'ventas', malo: 10, regular: 45, sano: 80, hallazgo: /ingreso recurrente/i },
  cancelacion_anual_pct: { giro: 'software', distrito: 'ventas', malo: 40, regular: 20, sano: 5, hallazgo: /cancela/ },
  ocupacion_pct: { giro: 'turismo', distrito: 'operaciones', malo: 30, regular: 50, sano: 70, hallazgo: /Ocupación/ },
  reservas_directas_pct: { giro: 'turismo', distrito: 'ventas', malo: 10, regular: 30, sano: 60, hallazgo: /reservas directas/i },
  venta_intermediario_pct: { giro: 'agro', distrito: 'ventas', malo: 90, regular: 60, sano: 30, hallazgo: /intermediarios/ },
  perdida_produccion_pct: { giro: 'agro', distrito: 'operaciones', malo: 30, regular: 15, sano: 5, hallazgo: /pierde/ },
  clientes_regresan_pct: { giro: 'servicios_personales', distrito: 'ventas', malo: 20, regular: 50, sano: 80, hallazgo: /regresa o renueva/ },
  ocupacion_agenda_pct: { giro: 'servicios_personales', distrito: 'operaciones', malo: 20, regular: 50, sano: 80, hallazgo: /agenda|Agenda/ },
  retrabajos_pct: { giro: 'automotriz', distrito: 'operaciones', malo: 15, regular: 8, sano: 2, hallazgo: /garantía o reclamo/ },
  entregas_tarde_pct: { giro: 'automotriz', distrito: 'operaciones', malo: 40, regular: 20, sano: 5, hallazgo: /fecha prometida/ },
  desocupacion_pct: { giro: 'inmobiliario', distrito: 'operaciones', malo: 30, regular: 15, sano: 5, hallazgo: /inmuebles/ },
  renta_morosa_pct: { giro: 'inmobiliario', distrito: 'finanzas', malo: 25, regular: 10, sano: 2, hallazgo: /atraso/ },
};

test('el campo giro conserva las opciones anteriores, suma las nuevas y deja "otro" al final', () => {
  for (const g of ['comercio', 'servicios', 'manufactura', 'construccion', 'alimentos', 'agencia', 'educacion', 'salud', ...NUEVOS_GIROS]) assert.ok(GIROS.includes(g), g);
  assert.equal(GIROS.at(-1), 'otro');
  assert.equal(new Set(GIROS).size, GIROS.length);
  assert.ok(!GIROS.includes('tecnologia')); // "tecnologia" es un área, no un giro
  for (const g of NUEVOS_GIROS) assert.equal(validar({ ...base, giro: g }).ok, true, g);
});

test('cada giro distinto de "otro" activa al menos un sector', () => {
  // Excepción conocida: tests/departamentos.test.js exige que el giro "servicios" solo no active ningún sector;
  // el paquete de servicios profesionales se activa por lo que dice la ficha.
  const SOLO_POR_FICHA = [];
  for (const giro of GIROS.filter((g) => g !== 'otro' && !SOLO_POR_FICHA.includes(g))) {
    assert.ok(sectoresActivos({ giro }).length >= 1, `el giro ${giro} no activa ningún sector`);
  }
  for (const giro of [...NUEVOS_GIROS, 'manufactura', 'construccion']) assert.deepEqual(sectoresActivos({ giro }), [giro]);
  assert.deepEqual(sectoresActivos({ giro: 'servicios', ficha: { productos: 'Despacho contable y asesoría fiscal para pymes' } }), ['servicios']);
  assert.deepEqual(sectoresActivos({ giro: 'otro' }), []);
});

test('todos los sectores tienen nombre, giros, regex y al menos tres líneas de contexto, y los nuevos no agregan agentes', () => {
  for (const [id, s] of Object.entries(SECTORES)) {
    assert.ok(typeof s.nombre === 'string' && s.nombre.length >= 5, id);
    assert.ok(Array.isArray(s.giros) && s.giros.length >= 1, id);
    assert.ok(s.palabras instanceof RegExp, id);
    assert.ok(!s.palabras.global, `${id}: el regex no debe ser global (test() guardaría estado)`);
    assert.ok(Array.isArray(s.agentes), id);
    assert.ok(s.contexto.length >= 3 && s.contexto.every((l) => typeof l === 'string' && l.length > 40), id);
  }
  for (const id of NUEVOS_SECTORES) {
    assert.ok(SECTORES[id], `falta el sector ${id}`);
    assert.deepEqual(SECTORES[id].agentes, [], id);
    assert.equal(SECTORES[id].contexto.length, 3, id);
    assert.match(SECTORES[id].contexto[0], /^Indicadores del sector:/, id);
    assert.match(SECTORES[id].contexto[1], /^Cumplimiento:/, id);
  }
});

test('el contexto de cada sector nuevo llega al texto del prompt', () => {
  for (const id of NUEVOS_SECTORES) {
    const texto = contextoSectores([id]);
    assert.match(texto, /confirma cifras y normas con la fuente oficial/);
    assert.ok(texto.includes(`Sector: ${SECTORES[id].nombre}.`), id);
    for (const linea of SECTORES[id].contexto) assert.ok(texto.includes(`- ${linea}`), id);
  }
  const dos = contextoSectores(['transporte', 'agro']);
  assert.match(dos, /Carta Porte/);
  assert.match(dos, /SENASICA/);
});

test('los regex nuevos no se activan con textos neutros y sí con textos de su sector', () => {
  const neutros = [
    'Venta de productos y servicios al público en general',
    'Comercializadora del Centro SA de CV',
    'Atendemos a empresas y particulares de la zona; usamos software contable y pagamos renta del local',
    'Tornillos, herramienta y material eléctrico',
  ];
  for (const texto of neutros) {
    for (const id of NUEVOS_SECTORES) assert.ok(!SECTORES[id].palabras.test(texto), `${id} se activó con: ${texto}`);
    assert.deepEqual(sectoresActivos({ giro: 'otro', ficha: { productos: texto } }).filter((s) => NUEVOS_SECTORES.includes(s)), []);
  }
  const propios = {
    manufactura: 'Fábrica de envases de plástico',
    construccion: 'Constructora y remodelación de casas',
    servicios: 'Despacho de abogados y consultoría laboral',
    transporte: 'Transportes García: fletes y mudanzas',
    software: 'Desarrollo de software a la medida y aplicaciones móviles',
    turismo: 'Hotel boutique y tours por la sierra',
    agro: 'Rancho ganadero y cultivo de aguacate',
    servicios_personales: 'Barbería y salón de belleza',
    automotriz: 'Taller mecánico y venta de refacciones',
    inmobiliario: 'Inmobiliaria: venta y renta de bienes raíces',
  };
  for (const [id, texto] of Object.entries(propios)) {
    assert.ok(sectoresActivos({ giro: 'otro', ficha: { productos: texto } }).includes(id), `${id} no se activó con: ${texto}`);
  }
  assert.ok(!SECTORES.manufactura.palabras.test('Fábrica de software'));
});

test('cada giro tiene al menos dos campos de profundidad y los nuevos siguen el patrón del Bloque B', () => {
  for (const giro of GIROS.filter((g) => g !== 'otro')) {
    const campos = CAMPOS.filter((c) => c.giros?.includes(giro));
    assert.ok(campos.length >= 2, `${giro} tiene ${campos.length} campos de profundidad`);
  }
  for (const [id, caso] of Object.entries(BLOQUE_B)) {
    const campo = CAMPOS.find((c) => c.id === id);
    assert.ok(campo, id);
    assert.equal(campo.seccion, 'profundo', id);
    assert.equal(campo.distrito, caso.distrito, id);
    assert.deepEqual(campo.giros, [caso.giro], id);
  }
  assert.equal(new Set(CAMPOS.map((c) => c.id)).size, CAMPOS.length);
});

test('los campos nuevos del Bloque B solo aplican a su giro y dan hallazgo con acción cuando el valor es malo', () => {
  for (const [id, caso] of Object.entries(BLOQUE_B)) {
    const malo = validar({ ...base, giro: caso.giro, [id]: caso.malo });
    assert.equal(malo.ok, true, id);
    assert.equal(malo.datos[id], caso.malo, id);
    const r = evaluar(malo.datos);
    assert.equal(r.distritos[caso.distrito].color, 'rojo', id);
    assert.match(r.distritos[caso.distrito].hallazgos.join(' '), caso.hallazgo, id);
    assert.ok(r.plan.some((p) => p.distrito === caso.distrito && p.color === 'rojo' && p.plazo === '30 días' && p.accion.length > 20), `${id} sin acción en el plan`);

    const regular = evaluar(validar({ ...base, giro: caso.giro, [id]: caso.regular }).datos);
    assert.equal(regular.distritos[caso.distrito].color, 'amarillo', id);

    const sano = evaluar(validar({ ...base, giro: caso.giro, [id]: caso.sano }).datos);
    assert.equal(sano.distritos[caso.distrito].color, 'verde', id);
    assert.deepEqual(sano.distritos[caso.distrito].hallazgos, [], id);

    // En otro giro la respuesta se ignora y no produce hallazgo.
    const ajeno = validar({ ...base, giro: 'comercio', [id]: caso.malo });
    assert.equal(ajeno.ok, true, id);
    assert.equal(ajeno.datos[id], undefined, id);
    assert.equal(evaluar(ajeno.datos).distritos[caso.distrito].color, 'sin_datos', id);
  }
});

test('la interfaz tiene etiqueta legible para cada giro', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const mapa = app.slice(app.indexOf('const TEXTO_OPCION = {'), app.indexOf('const estado = {'));
  for (const giro of GIROS) assert.match(mapa, new RegExp(`\\b${giro}: '`), `falta la etiqueta de ${giro}`);
});
