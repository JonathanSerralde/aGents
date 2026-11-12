import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NOMBRES_APOYO, AGENTES_APOYO, OPCIONALES, estadoApoyo } from '../src/apoyo.js';
import { HABILIDADES } from '../src/habilidades.js';
import { superiorDe, arbol, organigrama, tipoDe, subagentesPorArea, describirPosicion } from '../src/jerarquia.js';
import { sanitizarEquipo } from '../src/equipo.js';
import { sistemaPara } from '../src/prompts.js';
import { validar } from '../src/formulario.js';
import { evaluar } from '../src/diagnostico.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';
import { SECTORES, sectoresActivos, contextoSectores } from '../src/sectores.js';
import { parsearNuevosAgentes, parsearPropuestas } from '../src/ajustes.js';
import { crearPersonalizados } from '../src/personalizados.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

// Departamentos del organigrama de referencia (docs/00-principios.md) y el agente que los cubre.
const COBERTURA = {
  'Dirección General': 'direccion', 'Operación Tienda': 'tienda', 'Imagen': 'imagen', 'Operación A y B': 'alimentos', 'Cafeterías': 'alimentos',
  'Construcción': 'expansion', 'Expansión y Relaciones': 'expansion', 'Jurídico Inmobiliario': 'juridico', 'Mercadotecnia': 'marketing',
  'Mantenimiento': 'mantenimiento', 'Recursos Humanos': 'rh', 'Reclutamiento': 'reclutamiento', 'Capacitación': 'capacitacion',
  'Relaciones Sindicales': 'juridico', 'Archivo de personal': 'administracion', 'Nóminas y Seguridad Social': 'nomina', 'Auditoría': 'auditoria',
  'Prevención de Pérdidas': 'perdidas', 'Auditoría de Inventarios': 'inventarios', 'Shoppers': 'mercado', 'Administración y Finanzas': 'finanzas',
  'Presupuestos': 'contraloria', 'Impuestos': 'fiscal', 'Caja General': 'finanzas', 'Tesorería': 'finanzas', 'Contabilidad': 'contabilidad',
  'Sistemas': 'tecnologia', 'Seguridad Informática': 'ciberseguridad', 'Compras': 'compras', 'Importaciones y Logística': 'logistica',
  'Ventas por Internet': 'ecommerce', 'Atención a Clientes': 'atencion', 'Crédito': 'credito', 'Producción y Almacén': 'produccion',
  'Servicios de Oficina': 'administracion',
};

test('cada departamento del organigrama de referencia tiene un agente con habilidad, jerarquía y avatar', () => {
  const assets = readFileSync(new URL('../public/assets.js', import.meta.url), 'utf8');
  for (const [departamento, id] of Object.entries(COBERTURA)) {
    assert.ok(HABILIDADES[id], `${departamento} → ${id} sin habilidad`);
    assert.ok(HABILIDADES[id].marcos.length >= 3 && HABILIDADES[id].acciones.length >= 3 && HABILIDADES[id].limites.length >= 1, `${id} incompleto`);
  }
  for (const id of AGENTES_APOYO) {
    assert.ok(NOMBRES_APOYO[id].length >= 5, id);
    assert.ok(superiorDe(id), `${id} sin superior`);
    assert.ok(assets.includes(`  ${id}: { avatar:`) || assets.includes(` ${id}: { avatar:`), `${id} sin avatar en public/assets.js`);
    assert.ok(assets.includes(`${id}: '${NOMBRES_APOYO[id]}'`), `${id} sin nombre en public/assets.js`);
  }
  assert.equal(AGENTES_APOYO.length, 35);
});

test('el gestor ágil de proyectos es staff con vista completa de la bitácora y el analista de inversiones cierra con confianza', () => {
  assert.equal(tipoDe('proyectos'), 'staff');
  assert.equal(superiorDe('proyectos'), 'orquestador');
  assert.match(HABILIDADES.proyectos.marcos.join(' '), /Sprint de dos semanas/);
  assert.match(HABILIDADES.proyectos.marcos.join(' '), /límite de trabajo en curso/);
  assert.match(HABILIDADES.proyectos.limites.join(' '), /quincena de trabajo/);
  assert.equal(tipoDe('inversiones'), 'subagente');
  assert.equal(superiorDe('inversiones'), 'finanzas');
  assert.match(HABILIDADES.inversiones.marcos.join(' '), /siete pasos/);
  assert.match(HABILIDADES.inversiones.marcos.join(' '), /nivel de confianza/);
  assert.match(HABILIDADES.inversiones.limites.join(' '), /asesor registrado/);
  assert.match(sistemaPara('inversiones', null, null, null), /Nafin/); // referencias de financiamiento
});

test('Brainstorm y Descubrimiento son staff del Orquestador, producen ideas y validan con experimentos', () => {
  assert.equal(tipoDe('brainstorm'), 'staff');
  assert.equal(tipoDe('descubrimiento'), 'staff');
  assert.equal(superiorDe('brainstorm'), 'orquestador');
  assert.match(HABILIDADES.brainstorm.marcos.join(' '), /SCAMPER/);
  assert.match(HABILIDADES.brainstorm.marcos.join(' '), /Cómo podríamos/);
  assert.match(HABILIDADES.brainstorm.limites.join(' '), /No disfraza una idea de hecho/);
  assert.match(HABILIDADES.descubrimiento.marcos.join(' '), /Mom Test/);
  assert.match(HABILIDADES.descubrimiento.marcos.join(' '), /jobs to be done/i);
  assert.match(HABILIDADES.descubrimiento.limites.join(' '), /conducta/);
  const s = sistemaPara('descubrimiento', null, null, null);
  assert.match(s, /agente de apoyo de Descubrimiento de ideas/);
  assert.match(s, /IDEA = propuesta o supuesto no confirmado/);
});

test('Alimentos y bebidas es opcional: se activa por giro, por la ficha o a mano', () => {
  assert.deepEqual(Object.keys(OPCIONALES), ['alimentos', 'cuentas', 'escolar', 'admisiones', 'clinico']);
  const base = estadoApoyo({ giro: 'comercio', ficha: { productos: 'tornillos' } });
  assert.ok(!base.activos.includes('alimentos'));
  assert.match(base.inactivos.alimentos, /Restaurante/);
  assert.deepEqual(base.sectores, ['retail']);
  assert.equal(base.opcionales.alimentos.sector, 'alimentos');
  assert.ok(estadoApoyo({ giro: 'alimentos' }).activos.includes('alimentos'));
  assert.ok(estadoApoyo({ giro: 'comercio', ficha: { productos: 'Tacos al pastor\nAgua de horchata' } }).activos.includes('alimentos'));
  assert.ok(estadoApoyo({ giro: 'servicios', ficha: { notas: 'Tenemos una cafetería en la recepción' } }).activos.includes('alimentos'));
  assert.ok(estadoApoyo({ giro: 'comercio', opcionales: { alimentos: 'si' } }).activos.includes('alimentos'));
  const apagado = estadoApoyo({ giro: 'alimentos', opcionales: { alimentos: 'no' } });
  assert.ok(!apagado.activos.includes('alimentos'));
  assert.match(apagado.inactivos.alimentos, /desactivado por el usuario/);
  assert.equal(estadoApoyo({}).activos.length, AGENTES_APOYO.length - 5);

  const equipo = sanitizarEquipo({ areas: {}, opcionales: { alimentos: 'si', otro: 'si' } });
  assert.deepEqual(equipo.opcionales, { alimentos: 'si', cuentas: 'auto', escolar: 'auto', admisiones: 'auto', clinico: 'auto' });
  assert.equal(sanitizarEquipo({ opcionales: { alimentos: 'tal vez' } }).opcionales.alimentos, 'auto');
  assert.ok('alimentos' in equipo.areas);
});

test('los paquetes de sector activan sus subagentes y dan contexto: agencia, escuela, salud y retail', () => {
  assert.deepEqual(sectoresActivos({ giro: 'agencia' }), ['agencia']);
  assert.deepEqual(sectoresActivos({ giro: 'educacion' }), ['educacion']);
  assert.deepEqual(sectoresActivos({ giro: 'salud' }), ['salud']);
  assert.deepEqual(sectoresActivos({ giro: 'comercio' }), ['retail']);
  assert.deepEqual(sectoresActivos({ giro: 'servicios', ficha: { productos: 'Community management y campañas de marketing digital' } }), ['agencia', 'servicios']);
  assert.deepEqual(sectoresActivos({ giro: 'otro', ficha: { notas: 'Somos una escuela de inglés con 120 alumnos' } }), ['educacion']);
  assert.deepEqual(sectoresActivos({ giro: 'otro', ficha: { razonSocial: 'Clínica Dental Sonrisa SA de CV' } }), ['salud']);
  assert.deepEqual(sectoresActivos({ giro: 'servicios' }), ['servicios']); // todo giro tiene su contexto de sector

  const agencia = estadoApoyo({ giro: 'agencia' });
  assert.ok(agencia.activos.includes('cuentas'));
  assert.ok(!agencia.activos.includes('escolar') && !agencia.activos.includes('alimentos'));
  const escuela = estadoApoyo({ giro: 'educacion' });
  assert.ok(escuela.activos.includes('escolar') && escuela.activos.includes('admisiones'));
  assert.ok(estadoApoyo({ giro: 'salud' }).activos.includes('clinico'));
  // Retail no agrega agentes: sus departamentos son permanentes.
  const retail = estadoApoyo({ giro: 'comercio' });
  assert.deepEqual(retail.sectores, ['retail']);
  assert.equal(retail.activos.length, AGENTES_APOYO.length - 5);
  for (const id of ['tienda', 'inventarios', 'imagen', 'perdidas']) assert.ok(retail.activos.includes(id));

  const ctx = contextoSectores(['retail', 'salud']);
  assert.match(ctx, /Buen Fin/);
  assert.match(ctx, /COFEPRIS/);
  assert.equal(contextoSectores([]), '');
  const prompt = sistemaPara('ventas', null, null, null, null, null, { sector: contextoSectores(['educacion']) });
  assert.match(prompt, /RVOE/);
  for (const s of Object.values(SECTORES)) assert.ok(s.contexto.length >= 3 && s.nombre && s.giros.length);
});

test('el Orquestador puede proponer subagentes nuevos y el usuario los acepta o rechaza', () => {
  const respuesta = 'AGENTE: Ventas\nNOTAS: vende a crédito\nMOTIVO: así opera\n\nNUEVO AGENTE: [Gestor de licitaciones]\nROL: Prepara licitaciones públicas\nESPECIALIDAD: CompraNet y bases\nAREAS: ventas, fiscal\nPREGUNTA:\n- ¿Qué licitaciones has ganado?\nMARCOS:\n- Calendario de licitaciones\nACCIONES:\n- Armar el expediente\nLIMITES:\n- No firma\nMOTIVO: 40% de la venta es a gobierno\n\nNUEVO AGENTE: Ventas\nROL: duplicado\nMOTIVO: x';
  const nuevos = parsearNuevosAgentes(respuesta);
  assert.equal(nuevos.length, 2);
  assert.equal(nuevos[0].nombre, 'Gestor de licitaciones');
  assert.deepEqual(nuevos[0].areas, ['ventas', 'fiscal']);
  assert.equal(nuevos[0].marcos[0], 'Calendario de licitaciones');
  assert.match(nuevos[0].motivo, /gobierno/);
  // Los bloques NUEVO AGENTE no contaminan los ajustes de agentes existentes.
  const ajustes = parsearPropuestas(respuesta);
  assert.equal(ajustes.length, 1);
  assert.equal(ajustes[0].nombre, 'Ventas');

  const dir = mkdtempSync(join(tmpdir(), 'prop-'));
  try {
    const p = crearPersonalizados(join(dir, 'agentes.json'));
    p.guardar({ nombre: 'Ya existe' });
    const lista = p.proponer([nuevos[0], { nombre: 'Ya existe', motivo: 'repetido' }, { nombre: '' }]);
    assert.equal(lista.length, 1);
    assert.equal(p.propuestas()[0].nombre, 'Gestor de licitaciones');
    assert.equal(p.ids().length, 1); // nada creado todavía
    const creado = p.aceptarPropuesta(0);
    assert.equal(creado.id, 'x-gestor-de-licitaciones');
    assert.deepEqual(p.obtener(creado.id).areas, ['ventas', 'fiscal']);
    assert.equal(p.propuestas().length, 0);
    assert.equal(p.aceptarPropuesta(0), null);
    p.proponer([{ nombre: 'Otro' }]);
    assert.equal(p.rechazarPropuesta(0), true);
    assert.equal(p.propuestas().length, 0);
    assert.equal(p.ids().length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('los agentes inactivos no aparecen en el organigrama ni en la lista del Orquestador', () => {
  const texto = organigrama({}, ['alimentos']);
  assert.doesNotMatch(texto, /Alimentos y bebidas/);
  assert.match(organigrama({}), /Alimentos y bebidas/);
  const ids = [];
  const recorrer = (n) => { ids.push(n.id); n.hijos.forEach(recorrer); };
  recorrer(arbol({}, ['alimentos']));
  assert.ok(!ids.includes('alimentos'));
  assert.ok(ids.includes('nomina') && ids.includes('juridico'));
  const orq = sistemaPara('orquestador', null, null, null, null, null, { inactivos: ['alimentos'] });
  assert.doesNotMatch(orq, /Alimentos y bebidas/);
  assert.match(orq, /Crédito y cobranza/);
  assert.match(sistemaPara('orquestador', null, null, null), /Alimentos y bebidas/);
  const ops = sistemaPara('operaciones', null, null, null, null, null, { inactivos: ['alimentos'] });
  assert.doesNotMatch(ops, /Alimentos y bebidas/);
  assert.match(ops, /Operación de tienda/);
});

test('se distingue qué agentes son subagentes y de quién dependen', () => {
  assert.equal(tipoDe('orquestador'), 'orquestador');
  assert.equal(tipoDe('ventas'), 'area');
  assert.equal(tipoDe('direccion'), 'area');
  assert.equal(tipoDe('analista'), 'staff');
  assert.equal(tipoDe('contraloria'), 'staff');
  assert.equal(tipoDe('trafico'), 'subagente');
  assert.equal(tipoDe('nomina'), 'subagente');
  assert.equal(tipoDe('x-norte', { 'x-norte': { nombre: 'Norte', areas: ['ventas'] } }), 'propio');
  assert.equal(tipoDe('nada'), null);
  const grupos = subagentesPorArea();
  assert.deepEqual(grupos.marketing.sort(), ['imagen', 'mercado', 'trafico']);
  assert.deepEqual(grupos.rh.sort(), ['capacitacion', 'nomina', 'reclutamiento']);
  assert.deepEqual(grupos.operaciones.sort(), ['alimentos', 'clinico', 'escolar', 'inventarios', 'logistica', 'mantenimiento', 'mejora', 'produccion', 'tienda']);
  assert.deepEqual(grupos.finanzas.sort(), ['contabilidad', 'credito', 'inversiones']);
  assert.deepEqual(grupos.tecnologia.sort(), ['ciberseguridad', 'transformacion']);
  assert.deepEqual(grupos.ventas.sort(), ['admisiones', 'atencion', 'cuentas', 'ecommerce']);
  assert.deepEqual(grupos.fiscal, ['juridico']);
  assert.deepEqual(grupos.crecimiento, ['expansion']);
  assert.deepEqual(grupos.auditoria, ['perdidas']);
  assert.deepEqual(grupos.direccion, ['administracion']);
  assert.ok(!subagentesPorArea({}, ['alimentos']).operaciones.includes('alimentos'));
  assert.equal(Object.values(grupos).flat().length, 28);
  assert.match(describirPosicion('nomina'), /Eres subagente de Recursos humanos/);
  assert.doesNotMatch(describirPosicion('finanzas'), /subagente/);
  assert.match(organigrama(), /- Nómina y seguridad social \(subagente\)/);
  assert.match(organigrama(), /- Analista \(staff\)/);
  const nodos = [];
  const recorrer = (n) => { nodos.push(n); n.hijos.forEach(recorrer); };
  recorrer(arbol());
  assert.equal(nodos.find((n) => n.id === 'trafico').tipo, 'subagente');
});

test('el giro de alimentos trae sus preguntas y reglas de costo y merma', () => {
  const base = { contacto_nombre: 'Ana', confianza: 'alto', giro: 'alimentos', empleados: '6-10', ventas_anuales: '1m-5m', antiguedad_anios: 3 };
  const caro = validar({ ...base, costo_alimentos_pct: 45, merma_alimentos_pct: 9 });
  assert.equal(caro.ok, true);
  const r = evaluar(caro.datos);
  assert.equal(r.distritos.finanzas.color, 'rojo');
  assert.match(r.distritos.finanzas.hallazgos.join(' '), /Costo de alimentos/);
  assert.equal(r.distritos.operaciones.color, 'rojo');
  const sano = evaluar(validar({ ...base, costo_alimentos_pct: 30, merma_alimentos_pct: 2 }).datos);
  assert.notEqual(sano.distritos.finanzas.color, 'rojo');
  // Para otro giro, esas preguntas se ignoran.
  const comercio = validar({ ...base, giro: 'comercio', costo_alimentos_pct: 90 }).datos;
  assert.equal(comercio.costo_alimentos_pct, undefined);
});

test('el servidor bloquea al agente opcional inactivo y lo activa desde el equipo o el giro', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dep-srv-'));
  const servidor = crearServidor(opcionesTemporales(dir));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const estado = await (await fetch(`${base}/api/estado`)).json();
    assert.ok(estado.apoyo.inactivos.alimentos);
    assert.ok(estado.apoyo.activos.includes('nomina'));
    const bloqueado = await fetch(`${base}/api/agentes/alimentos/mensajes`, json('POST', { texto: 'Costea el menú' }));
    assert.equal(bloqueado.status, 404);
    assert.equal((await bloqueado.json()).inactivo, true);
    assert.equal((await fetch(`${base}/api/agentes/nomina/mensajes`, json('POST', { texto: 'Calendario IMSS' }))).status, 200);
    const jer = await (await fetch(`${base}/api/jerarquia`)).json();
    const ids = [];
    const recorrer = (n) => { ids.push(n.id); n.hijos.forEach(recorrer); };
    recorrer(jer.arbol);
    assert.ok(!ids.includes('alimentos'));
    assert.equal(jer.tipos.nomina, 'subagente');
    assert.equal(jer.tipos.ventas, 'area');
    assert.ok(!jer.subagentes.operaciones.includes('alimentos'));

    // Forzado desde el equipo
    const eq = await (await fetch(`${base}/api/equipo`, json('PUT', { areas: {}, opcionales: { alimentos: 'si' } }))).json();
    assert.equal(eq.opcionales.alimentos, 'si');
    assert.equal((await fetch(`${base}/api/agentes/alimentos/mensajes`, json('POST', { texto: 'Costea el menú' }))).status, 200);
    assert.ok((await (await fetch(`${base}/api/estado`)).json()).apoyo.activos.includes('alimentos'));

    // Automático por giro del diagnóstico
    await fetch(`${base}/api/equipo`, json('PUT', { areas: {}, opcionales: { alimentos: 'auto' } }));
    assert.equal((await fetch(`${base}/api/agentes/alimentos/mensajes`)).status, 404);
    await fetch(`${base}/api/diagnosticos`, json('POST', { contacto_nombre: 'Ana', confianza: 'alto', giro: 'alimentos', empleados: '1-5', ventas_anuales: 'menos_1m', antiguedad_anios: 2 }));
    assert.equal((await fetch(`${base}/api/agentes/alimentos/mensajes`)).status, 200);
    // Y desactivado a mano aunque el giro lo pida
    await fetch(`${base}/api/equipo`, json('PUT', { areas: {}, opcionales: { alimentos: 'no' } }));
    assert.equal((await fetch(`${base}/api/agentes/alimentos/mensajes`)).status, 404);
    // Una escuela por giro activa Control escolar y Admisiones, y todos los agentes reciben el contexto del sector.
    await fetch(`${base}/api/diagnosticos`, json('POST', { contacto_nombre: 'Ana', confianza: 'alto', giro: 'educacion', empleados: '6-10', ventas_anuales: '1m-5m', antiguedad_anios: 5, retencion_alumnos_pct: 60, validez_oficial: 'en_tramite' }));
    const est = await (await fetch(`${base}/api/estado`)).json();
    assert.deepEqual(est.apoyo.sectores, ['educacion']);
    assert.ok(est.apoyo.activos.includes('escolar') && est.apoyo.activos.includes('admisiones'));
    assert.ok(!est.apoyo.activos.includes('cuentas'));
    assert.equal((await fetch(`${base}/api/agentes/admisiones/mensajes`)).status, 200);
    const ult = await (await fetch(`${base}/api/diagnosticos`)).json();
    const reg = await (await fetch(`${base}/api/diagnosticos/${ult.diagnosticos[0].id}`)).json();
    assert.equal(reg.resultado.distritos.ventas.color, 'rojo');
    assert.equal(reg.resultado.distritos.fiscal.color, 'amarillo');
    // Propuestas de subagentes por API
    assert.equal((await fetch(`${base}/api/agentes-personalizados/propuestas/0/aceptar`, { method: 'POST' })).status, 404);
    assert.deepEqual((await (await fetch(`${base}/api/agentes-personalizados`)).json()).propuestas, []);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
