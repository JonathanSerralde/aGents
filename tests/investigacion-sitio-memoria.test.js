import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsearInvestigacion, resumirSinIA, instruccionInvestigacion, resumenParaPrompt, MINIMO_COMPETIDORES } from '../src/investigacion.js';
import { evaluarSitio, normalizarUrl, descargarSitio } from '../src/sitio.js';
import { proximaEjecucion, debeEjecutar, sanitizarProgramacion, crearProgramacion, crearProgramador } from '../src/programador.js';
import { extraerAcciones, extraerConclusion, crearMemoria } from '../src/memoria.js';
import { extraerPeticiones, colaborar } from '../src/colaboracion.js';
import { HABILIDADES } from '../src/habilidades.js';
import { superiorDe } from '../src/jerarquia.js';
import { AREAS_CONVERSACION } from '../src/conversaciones.js';
import { crearServidor } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

// Diez competidores con cinco comentarios de cada tipo, como los pide la tarea semanal.
function textoInvestigacion(n = 10) {
  const bloques = [];
  for (let i = 1; i <= n; i++) {
    bloques.push(`COMPETIDOR: Ferretería ${i} | Guadalajara | Google Maps`);
    for (let j = 1; j <= 5; j++) bloques.push(`POSITIVO: atienden rápido y tienen surtido ${j}`);
    for (let j = 1; j <= 5; j++) bloques.push(`NEGATIVO: precios altos y entregas tarde ${j}`);
  }
  return `${bloques.join('\n')}\nLO QUE BUSCAN LOS CLIENTES:\n- surtido completo\n- atención rápida\nLO QUE RECHAZAN:\n- precios altos\n- entregas tardías\nOPORTUNIDADES PARA LA EMPRESA:\n- prometer entrega el mismo día\nNOTA: dos competidores tenían pocas reseñas en Facebook`;
}

test('parsearInvestigacion lee el formato fijo, tolera viñetas y marca la cobertura', () => {
  const inv = parsearInvestigacion(textoInvestigacion());
  assert.equal(inv.competidores.length, 10);
  assert.equal(inv.competidores[0].nombre, 'Ferretería 1');
  assert.equal(inv.competidores[0].zona, 'Guadalajara');
  assert.equal(inv.competidores[0].positivos.length, 5);
  assert.equal(inv.competidores[0].negativos.length, 5);
  assert.deepEqual(inv.buscan, ['surtido completo', 'atención rápida']);
  assert.deepEqual(inv.rechazan, ['precios altos', 'entregas tardías']);
  assert.equal(inv.oportunidades[0], 'prometer entrega el mismo día');
  assert.equal(inv.notas.length, 1);
  assert.equal(inv.cumple.competidores, true);
  assert.equal(inv.cumple.resenas, true);

  const parcial = parsearInvestigacion('- COMPETIDOR: Uno | CDMX | Maps\n* Positivo: bien\n1. NEGATIVO: mal\nNOTA: pocas reseñas');
  assert.equal(parcial.competidores.length, 1);
  assert.equal(parcial.competidores[0].positivos[0], 'bien');
  assert.equal(parcial.competidores[0].notas[0], 'pocas reseñas');
  assert.equal(parcial.cumple.competidores, false);
  assert.deepEqual(parcial.cumple.incompletos, ['Uno']);
  assert.deepEqual(parsearInvestigacion('').competidores, []);
});

test('sin IA las conclusiones salen de las palabras repetidas y el prompt resume la última investigación', () => {
  const inv = resumirSinIA(parsearInvestigacion(textoInvestigacion(3).split('LO QUE BUSCAN')[0]));
  assert.ok(inv.buscan.some((x) => x.startsWith('surtido')));
  assert.ok(inv.rechazan.some((x) => x.startsWith('precios')));
  const texto = resumenParaPrompt({ ...inv, momento: '2026-11-05T10:00:00.000Z' });
  assert.match(texto, /Última investigación de mercado/);
  assert.match(texto, /3 competidores/);
  assert.equal(resumenParaPrompt(null), '');
  const instruccion = instruccionInvestigacion({ giro: 'comercio', zona: 'Guadalajara, Jalisco', productos: 'tornillos', competidores: '', nombre: 'Mi Ferretería' });
  assert.match(instruccion, new RegExp(`al menos ${MINIMO_COMPETIDORES} empresas`));
  assert.match(instruccion, /Guadalajara/);
  assert.match(instruccion, /no copies el texto original/);
});

test('evaluarSitio detecta seguridad, celular, contacto, privacidad y medición', () => {
  const inseguro = evaluarSitio({ url: 'http://x.mx/', urlFinal: 'http://x.mx/', status: 200, ms: 5000, bytes: 4 * 1024 * 1024, encabezados: { server: 'Apache/2.4.1' }, html: '<html><head><title>X</title></head><body><form action="http://x.mx/enviar"><input name="correo"></form></body></html>', redirigeHttp: null });
  const por = (id) => inseguro.hallazgos.find((h) => h.id === id);
  assert.equal(por('https').color, 'rojo');
  assert.equal(por('https').area, 'ciberseguridad');
  assert.equal(por('versiones').color, 'amarillo');
  assert.equal(por('movil').color, 'rojo');
  assert.equal(por('contacto').color, 'rojo');
  assert.equal(por('contacto').area, 'ventas');
  assert.equal(por('privacidad').color, 'rojo');
  assert.equal(por('formularios').color, 'rojo');
  assert.equal(por('peso').color, 'rojo');
  assert.equal(por('tiempo').color, 'rojo');
  assert.equal(por('medicion').color, 'amarillo');
  assert.ok(inseguro.puntaje < 40);
  assert.ok(inseguro.areas.includes('ciberseguridad'));

  const seguro = evaluarSitio({
    url: 'https://y.mx/', urlFinal: 'https://y.mx/', status: 200, ms: 400, bytes: 50000, redirigeHttp: true,
    encabezados: { 'strict-transport-security': 'max-age=1', 'content-security-policy': "default-src 'self'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff' },
    html: '<html lang="es-MX"><head><title>Ferretería Ejemplo en Guadalajara: todo para tu obra</title><meta name="viewport" content="width=device-width"><meta name="description" content="Herramientas, pintura y material eléctrico con entrega el mismo día en Guadalajara."><meta property="og:title" content="Ferretería"></head><body><h1>Todo para tu obra</h1><a href="https://wa.me/5213312345678">WhatsApp</a><a href="https://facebook.com/x">FB</a><a href="/aviso-de-privacidad">Aviso de privacidad</a><script src="https://www.googletagmanager.com/gtag/js"></script></body></html>',
  });
  assert.equal(seguro.puntaje, 100);
  assert.equal(seguro.categorias.seguridad, 'verde');
  assert.deepEqual(seguro.areas, []);
});

test('normalizarUrl completa el esquema y rechaza direcciones raras; descargarSitio usa el fetch inyectado', async () => {
  assert.equal(normalizarUrl('miempresa.mx'), 'https://miempresa.mx/');
  assert.equal(normalizarUrl(' http://a.b.mx/pagina#x '), 'http://a.b.mx/pagina');
  assert.throws(() => normalizarUrl(''), /Escribe la dirección/);
  assert.throws(() => normalizarUrl('ftp://a.mx'), /no es válida/);
  assert.throws(() => normalizarUrl('localhost'), /no es válida/);
  for (const interna of ['http://127.0.0.1:4791', '192.168.1.10', 'http://10.0.0.5/admin', 'https://172.20.3.4', 'http://169.254.1.1', 'http://[::1]/', 'impresora.local']) {
    assert.throws(() => normalizarUrl(interna), /internas|no es válida/, interna);
  }
  assert.equal(normalizarUrl('8.8.8.8'), 'https://8.8.8.8/');
  const llamadas = [];
  const fetchFalso = async (url) => {
    llamadas.push(url);
    return { url: url.replace(/^http:/, 'https:'), status: 200, headers: new Headers({ 'content-type': 'text/html' }), body: null, arrayBuffer: async () => new TextEncoder().encode('<html><title>ok</title></html>').buffer };
  };
  const d = await descargarSitio('ejemplo.mx', { fetchImpl: fetchFalso });
  assert.equal(d.urlFinal, 'https://ejemplo.mx/');
  assert.equal(d.redirigeHttp, true);
  assert.deepEqual(llamadas, ['https://ejemplo.mx/', 'http://ejemplo.mx/']);
  assert.match(d.html, /ok/);
});

test('la programación semanal calcula la próxima corrida y no repite ni insiste tras un fallo', () => {
  const prog = sanitizarProgramacion({ diaSemana: 1, hora: 9 }, { activadaEn: '2026-11-04T12:00:00.000Z' }); // miércoles
  const proxima = proximaEjecucion(prog, new Date(2026, 10, 4, 12, 0)); // 4 nov 2026 es miércoles
  assert.equal(proxima.getDay(), 1);
  assert.equal(proxima.getHours(), 9);
  assert.equal(proxima.getDate(), 9);
  assert.equal(debeEjecutar({ ...prog, activadaEn: new Date(2026, 10, 4, 12).toISOString() }, new Date(2026, 10, 8, 9)), false);
  assert.equal(debeEjecutar({ ...prog, activadaEn: new Date(2026, 10, 4, 12).toISOString() }, new Date(2026, 10, 9, 9)), true);
  assert.equal(debeEjecutar({ ...prog, activadaEn: new Date(2026, 10, 4, 12).toISOString(), ultimaEjecucion: new Date(2026, 10, 9, 9, 1).toISOString() }, new Date(2026, 10, 10, 9)), false);
  assert.equal(debeEjecutar({ ...prog, activadaEn: new Date(2026, 10, 4, 12).toISOString(), ultimaEjecucion: new Date(2026, 10, 9, 9, 1).toISOString() }, new Date(2026, 10, 16, 9)), true);
  // Si se perdió la hora (computadora apagada), corre en cuanto pueda.
  assert.equal(debeEjecutar({ ...prog, activadaEn: new Date(2026, 10, 4, 12).toISOString() }, new Date(2026, 10, 11, 20)), true);
  // Tras un intento fallido espera 6 horas.
  assert.equal(debeEjecutar({ ...prog, activadaEn: new Date(2026, 10, 4, 12).toISOString(), ultimoIntento: { momento: new Date(2026, 10, 11, 19).toISOString(), error: 'x' } }, new Date(2026, 10, 11, 20)), false);
  assert.equal(debeEjecutar({ ...prog, activa: false }, new Date(2026, 10, 30)), false);
  assert.equal(sanitizarProgramacion({ diaSemana: 9, hora: 30, activa: '0' }).diaSemana, 1);
  assert.equal(sanitizarProgramacion({ activa: '0' }).activa, false);
});

test('el programador corre la tarea una sola vez cuando toca y anota el error si falla', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prog-'));
  try {
    const programacion = crearProgramacion(join(dir, 'programacion.json'));
    let reloj = new Date(2026, 10, 4, 12); // miércoles 4 de noviembre de 2026
    // Las dos tareas se activan con el reloj de la prueba: así nada depende de la fecha real en que corre.
    programacion.guardar('investigacion', { diaSemana: 1, hora: 9 }, reloj);
    programacion.guardar('sitio', { diaSemana: 1, hora: 9 }, reloj);
    assert.equal(programacion.leer('investigacion').activadaEn, reloj.toISOString());
    let corridas = 0;
    const programador = crearProgramador({ programacion, tareas: { investigacion: async () => { corridas++; return { ok: true }; }, sitio: async () => { throw new Error('sin sitio'); } }, ahora: () => reloj });
    await programador.tick();
    assert.equal(corridas, 0);
    reloj = new Date(2026, 10, 9, 9, 30);
    await programador.tick();
    await programador.tick();
    assert.equal(corridas, 1);
    assert.deepEqual(programacion.leer('investigacion').ultimoResultado, { ok: true });
    assert.equal(programacion.leer('sitio').ultimoIntento.error, 'sin sitio');
    assert.equal(programacion.leer('sitio').ultimaEjecucion, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('la memoria compartida guarda acciones y conclusiones, evita repetidos y arma el contexto por agente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mem-'));
  try {
    const respuesta = 'Conviene reactivar clientes inactivos este mes.\n\nACCIONES:\n- [ventas] Llamar a los 20 clientes inactivos — Rosa — 2 semanas\n- [marketing] Publicar la oferta de la semana — Luis — viernes\n- sin área: revisar precios\nCONSULTAR: [finanzas] — ¿hay caja para descuentos?';
    assert.equal(extraerConclusion(respuesta), 'Conviene reactivar clientes inactivos este mes.');
    const acciones = extraerAcciones(respuesta);
    assert.equal(acciones.length, 3);
    assert.deepEqual(acciones[0], { areaTexto: 'ventas', texto: 'Llamar a los 20 clientes inactivos', responsable: 'Rosa', plazo: '2 semanas' });
    assert.equal(acciones[2].areaTexto, '');
    assert.deepEqual(extraerAcciones('sin sección'), []);

    const memoria = crearMemoria(join(dir, 'memoria.json'));
    assert.equal(memoria.registrarRespuesta('ventas', respuesta).nuevas, 3);
    assert.equal(memoria.registrarRespuesta('ventas', respuesta).nuevas, 0); // repetidas
    assert.equal(memoria.acciones({ area: 'marketing' }).length, 1);
    assert.equal(memoria.acciones({ area: 'ventas' }).length, 2); // la que no traía área se queda con quien la propuso
    const id = memoria.acciones({ area: 'marketing' })[0].id;
    assert.equal(memoria.marcar(id, 'hecha').estado, 'hecha');
    assert.equal(memoria.marcar('zzzzzzzz', 'hecha'), null);
    memoria.agregarNota('marketing', 'mercado', 'La competencia bajó precios 10%');
    assert.match(memoria.resumenParaPrompt('orquestador'), /Ventas \(2\)/);
    assert.match(memoria.resumenParaPrompt('orquestador'), /Últimas conclusiones/);
    assert.match(memoria.resumenParaPrompt('ventas'), /Tus acciones abiertas/);
    assert.doesNotMatch(memoria.resumenParaPrompt('ventas'), /Notas que te dejaron/);
    assert.match(memoria.resumenParaPrompt('marketing'), /Investigación de mercado: La competencia bajó precios 10%/);
    assert.equal(memoria.notasPara('marketing', { marcarLeidas: true }).length, 1);
    assert.equal(memoria.notasPara('marketing').length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('INFORMAR deja una nota sin llamar al agente destino y respeta su tope', async () => {
  const respuesta = 'Listo.\nINFORMAR: [Ventas] — hay promoción nueva de la competencia\nINFORMAR: [Marketing] — bajaron precios\nINFORMAR: [Finanzas] — a\nINFORMAR: [RH] — b\nCONSULTAR: [Operaciones] — ¿capacidad?';
  assert.equal(extraerPeticiones(respuesta).filter((p) => p.tipo === 'INFORMAR').length, 4);
  const notas = [];
  const llamadas = [];
  const intercambios = await colaborar({ areaOrigen: 'mercado', nombreOrigen: 'Mercado', respuesta, propios: {}, equipo: { areas: {} }, responder: async (d) => { llamadas.push(d); return 'ok'; }, informar: (d, t) => notas.push([d, t]) });
  assert.equal(notas.length, 3);
  assert.deepEqual(llamadas, ['operaciones']);
  assert.equal(intercambios.filter((i) => i.nota).length, 3);
});

test('el agente de ciberseguridad existe, reporta a Tecnología y no pide contraseñas', () => {
  assert.ok(AREAS_CONVERSACION.includes('ciberseguridad'));
  assert.equal(superiorDe('ciberseguridad'), 'tecnologia');
  assert.match(HABILIDADES.ciberseguridad.limites.join(' '), /No pide contraseñas/);
  assert.match(HABILIDADES.ventas.marcos.join(' '), /objeciones/i);
});

async function conServidor(extra, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'inv-srv-'));
  const servidor = crearServidor(opcionesTemporales(dir, extra));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await fn(base, servidor, dir);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
}

// IA simulada: con búsqueda devuelve la investigación; como Orquestador reparte; los demás responden con acciones.
function iaSimulada(recibido) {
  return async ({ sistema, mensajes, busqueda }) => {
    recibido.push({ sistema, texto: mensajes.at(-1).texto, busqueda: Boolean(busqueda) });
    if (busqueda) return { texto: textoInvestigacion(), busquedas: [{ consulta: 'ferreterías en Guadalajara', fuentes: [{ titulo: 'Directorio', url: 'https://ejemplo.mx/dir' }] }, { consulta: 'reseñas ferreterías Guadalajara', fuentes: [] }] };
    if (/Eres el Orquestador/.test(sistema) && /investigación semanal/i.test(mensajes.at(-1).texto)) {
      return 'Los clientes quieren surtido y rapidez.\nDELEGAR: [Ventas] — Arma el argumentario con surtido y entrega\nDELEGAR: [Operaciones] — Revisa los tiempos de entrega';
    }
    if (/Eres el Orquestador/.test(sistema) && /análisis automático del sitio/i.test(mensajes.at(-1).texto)) {
      return 'El sitio está flojo en seguridad.\nDELEGAR: [Ciberseguridad] — Pide HTTPS al hospedaje';
    }
    if (/Esta petición viene de otro agente/.test(sistema)) return 'Hecho.\nACCIONES:\n- [ventas] Redactar el argumentario — Rosa — esta semana';
    return 'OK';
  };
}

test('la investigación semanal busca, informa al Orquestador y reparte a Ventas, Marketing y a quien haga falta', async () => {
  const recibido = [];
  await conServidor({ llamarIA: iaSimulada(recibido) }, async (base) => {
    await fetch(`${base}/api/empresa`, json('PUT', { municipio: 'Guadalajara', estado: 'Jalisco', productos: 'tornillos\npintura', sitioWeb: 'https://ejemplo.mx' }));
    // "Optimizar agentes" también puede proponer subagentes nuevos; el mock del Orquestador no propone ninguno aquí.
    const estado0 = await (await fetch(`${base}/api/investigacion`)).json();
    assert.equal(estado0.programacion.activa, false); // gasta IA: empieza en pausa hasta que el usuario la active
    assert.equal(estado0.programacion.proxima, null);
    assert.equal(estado0.programacion.puedeIA, true);
    assert.equal(estado0.investigaciones.length, 0);

    const res = await fetch(`${base}/api/investigacion/ejecutar`, { method: 'POST' });
    assert.equal(res.status, 200);
    const { investigacion } = await res.json();
    assert.equal(investigacion.competidores.length, 10);
    assert.equal(investigacion.cumple.resenas, true);
    const busquedas = recibido.filter((r) => r.busqueda);
    assert.equal(busquedas.length, 1);
    assert.match(busquedas[0].sistema, /búsqueda web activa/);
    assert.match(busquedas[0].texto, /Guadalajara, Jalisco/);
    assert.match(busquedas[0].texto, /tornillos; pintura/);
    // Ventas y Operaciones los pidió el Orquestador; Marketing se agregó por ser obligatorio.
    const destinos = investigacion.encargos.map((e) => e.destino).sort();
    assert.deepEqual(destinos, ['marketing', 'operaciones', 'ventas']);
    // Los encargados ya tenían la investigación en su contexto (se guarda antes de repartir) y el informe completo adjunto.
    const encargados = recibido.filter((r) => /Esta petición viene de otro agente/.test(r.sistema));
    assert.equal(encargados.length, 3);
    for (const r of encargados) {
      assert.match(r.sistema, /Última investigación de mercado/);
      assert.match(r.sistema, /Informe completo "Investigación semanal/);
      assert.match(r.sistema, /Ferretería 1/);
    }
    assert.ok(investigacion.encargos.every((e) => e.respuesta));
    assert.equal(investigacion.pendienteReparto, false);

    // Las conversaciones de los agentes destino traen el encargo, y la memoria compartida las acciones.
    const ventas = await (await fetch(`${base}/api/agentes/ventas/mensajes`)).json();
    assert.match(ventas.mensajes[0].texto, /Encargo del Orquestador/);
    assert.equal(ventas.mensajes[0].origen, 'agente');
    // El consumo se atribuye a cada agente que respondió, no todo al Orquestador.
    const uso = await (await fetch(`${base}/api/uso`)).json();
    assert.ok(uso.actual.porAgente.ventas > 0 && uso.actual.porAgente.mercado > 0 && uso.actual.porAgente.orquestador > 0);
    const memoria = await (await fetch(`${base}/api/memoria`)).json();
    assert.ok(memoria.acciones.some((a) => a.area === 'ventas' && /argumentario/.test(a.texto)));
    assert.ok(memoria.conclusiones.orquestador);

    // A partir de ahora, todos los agentes reciben la investigación en su contexto.
    recibido.length = 0;
    await fetch(`${base}/api/agentes/ventas/mensajes`, json('POST', { texto: 'Prepara la oferta de la semana' }));
    assert.match(recibido.at(-1).sistema, /Última investigación de mercado/);
    assert.match(recibido.at(-1).sistema, /surtido completo/);
    assert.match(recibido.at(-1).sistema, /Tus acciones abiertas/);

    // El usuario ve qué se buscó: consultas y fuentes en el registro, en el reporte y en la actividad.
    assert.equal(investigacion.busquedas.length, 2);
    assert.equal(investigacion.busquedas[0].fuentes[0].url, 'https://ejemplo.mx/dir');
    const actividad = await (await fetch(`${base}/api/actividad`)).json();
    const tipos = actividad.eventos.map((e) => e.tipo);
    assert.ok(tipos.includes('busquedas_web') && tipos.includes('trabajo_inicio') && tipos.includes('trabajo_fin') && tipos.includes('investigacion_terminada'));
    assert.deepEqual(actividad.eventos.find((e) => e.tipo === 'busquedas_web').datos.consultas, ['ferreterías en Guadalajara', 'reseñas ferreterías Guadalajara']);
    const fines = actividad.eventos.filter((e) => e.tipo === 'trabajo_fin');
    assert.ok(fines.some((e) => e.datos.area === 'mercado' && e.datos.tipo === 'investigacion' && e.datos.busquedas === 2));
    assert.ok(fines.some((e) => e.datos.area === 'ventas' && e.datos.tipo === 'encargo'));
    assert.deepEqual(actividad.trabajando, []); // nada quedó colgado
    assert.equal((await (await fetch(`${base}/api/actividad?area=ventas`)).json()).eventos.every((e) => [e.datos.area, e.datos.destino, e.datos.origen].includes('ventas')), true);
    const html0 = await (await fetch(`${base}/api/investigacion/${investigacion.id}/reporte.html`)).text();
    assert.match(html0, /Búsquedas realizadas en internet/);
    const lista = await (await fetch(`${base}/api/investigacion`)).json();
    assert.equal(lista.investigaciones.length, 1);
    assert.equal(lista.programacion.ultimaEjecucion !== null, true);
    const docx = await fetch(`${base}/api/investigacion/${investigacion.id}/reporte.docx`);
    assert.equal(docx.status, 200);
    assert.equal(Buffer.from(await docx.arrayBuffer()).readUInt32LE(0), 0x04034b50);
    const html = await (await fetch(`${base}/api/investigacion/${investigacion.id}/reporte.html`)).text();
    assert.match(html, /Lo que buscan los clientes/);
    assert.match(html, /Ferretería 1/);
    assert.equal((await fetch(`${base}/api/investigacion/00000000-0000-0000-0000-000000000000`)).status, 404);

    // Programación editable
    const prog = await (await fetch(`${base}/api/investigacion/programacion`, json('PUT', { diaSemana: 5, hora: 7, activa: false }))).json();
    assert.equal(prog.programacion.diaSemana, 5);
    assert.equal(prog.programacion.activa, false);
    assert.equal(prog.programacion.proxima, null);
  });
});

test('sin IA la investigación automática se rechaza, pero las reseñas capturadas a mano se guardan y quedan pendientes para Ventas y Marketing', async () => {
  await conServidor({}, async (base) => {
    const res = await fetch(`${base}/api/investigacion/ejecutar`, { method: 'POST' });
    assert.equal(res.status, 422);
    assert.match((await res.json()).errores[0], /Sin IA configurada/);
    assert.equal((await fetch(`${base}/api/investigacion/importar`, json('POST', { texto: '   ' }))).status, 422);
    assert.equal((await fetch(`${base}/api/investigacion/importar`, json('POST', { texto: 'nada que ver' }))).status, 422);

    const ok = await (await fetch(`${base}/api/investigacion/importar`, json('POST', { texto: textoInvestigacion(3).split('LO QUE BUSCAN')[0] }))).json();
    assert.equal(ok.investigacion.origen, 'manual');
    assert.equal(ok.investigacion.pendienteReparto, true);
    assert.equal(ok.investigacion.competidores.length, 3);
    assert.ok(ok.investigacion.buscan.length > 0); // conclusiones por palabras repetidas
    assert.deepEqual(ok.investigacion.encargos.map((e) => e.destino), ['ventas', 'marketing']);
    const marketing = await (await fetch(`${base}/api/agentes/marketing/mensajes`)).json();
    assert.equal(marketing.mensajes[0].pendiente, true);
    assert.match(marketing.mensajes[0].texto, /Investigación semanal/);
    const estado = await (await fetch(`${base}/api/investigacion`)).json();
    assert.equal(estado.programacion.puedeIA, false);
  });
});

test('el análisis del sitio descarga la página, califica y reparte a Ciberseguridad y Tecnología', async () => {
  const recibido = [];
  const fetchSitio = async (url) => ({
    url, status: 200, headers: new Headers({ 'content-type': 'text/html', server: 'nginx/1.2' }), body: null,
    arrayBuffer: async () => new TextEncoder().encode('<html><head><title>Mi tienda</title></head><body><form><input></form></body></html>').buffer,
  });
  await conServidor({ llamarIA: iaSimulada(recibido), fetchSitio }, async (base) => {
    const sin = await fetch(`${base}/api/sitio/analizar`, json('POST', {}));
    assert.equal(sin.status, 422);
    assert.match((await sin.json()).errores[0], /ficha de la empresa/);

    const res = await fetch(`${base}/api/sitio/analizar`, json('POST', { url: 'http://mitienda.mx' }));
    assert.equal(res.status, 200);
    const { analisis } = await res.json();
    assert.equal(analisis.urlFinal, 'http://mitienda.mx/');
    assert.ok(analisis.puntaje < 60);
    assert.equal(analisis.hallazgos.find((h) => h.id === 'https').color, 'rojo');
    assert.equal(analisis.hallazgos.find((h) => h.id === 'privacidad').color, 'rojo');
    const destinos = analisis.encargos.map((e) => e.destino);
    assert.ok(destinos.includes('ciberseguridad'));
    assert.ok(destinos.includes('tecnologia'));
    assert.ok(destinos.includes('ventas')); // el contacto directo en rojo es de Ventas
    const ciber = await (await fetch(`${base}/api/agentes/ciberseguridad/mensajes`)).json();
    assert.match(ciber.mensajes[0].texto, /Encargo del Orquestador/);

    recibido.length = 0;
    await fetch(`${base}/api/agentes/tecnologia/mensajes`, json('POST', { texto: '¿Qué arreglo primero?' }));
    assert.match(recibido.at(-1).sistema, /Último análisis del sitio web/);
    assert.match(recibido.at(-1).sistema, /Conexión segura/);

    const lista = await (await fetch(`${base}/api/sitio`)).json();
    assert.equal(lista.analisis.length, 1);
    assert.equal(lista.analisis[0].rojos > 0, true);
    const html = await (await fetch(`${base}/api/sitio/${analisis.id}/reporte.html`)).text();
    assert.match(html, /Análisis del sitio web/);
    assert.equal((await fetch(`${base}/api/sitio/${analisis.id}/reporte.docx`)).status, 200);
    assert.equal((await fetch(`${base}/api/sitio/${analisis.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/api/sitio/${analisis.id}`)).status, 404);
  });
});

test('las tareas programadas corren desde el servidor cuando toca y usan el sitio de la ficha', async () => {
  const recibido = [];
  let reloj = new Date(2026, 10, 4, 12);
  const fetchSitio = async (url) => ({ url: url.replace(/^http:/, 'https:'), status: 200, headers: new Headers(), body: null, arrayBuffer: async () => new TextEncoder().encode('<html lang="es"><head><title>Tienda segura y rápida</title><meta name="viewport" content="w"></head><body><a href="https://wa.me/521">wa</a></body></html>').buffer });
  await conServidor({ llamarIA: iaSimulada(recibido), fetchSitio, ahora: () => reloj }, async (base, servidor, dir) => {
    await fetch(`${base}/api/empresa`, json('PUT', { sitioWeb: 'tienda.mx' }));
    // Las tareas quedan activadas con el reloj de la prueba (mismo archivo que usa el servidor), no con la fecha real.
    const programacion = crearProgramacion(join(dir, 'programacion.json'));
    for (const tarea of ['investigacion', 'sitio']) programacion.guardar(tarea, {}, reloj);
    await servidor.programador.tick();
    assert.equal((await (await fetch(`${base}/api/investigacion`)).json()).investigaciones.length, 0);
    reloj = new Date(2026, 10, 9, 9, 5); // lunes 9:05: ya tocó
    await servidor.programador.tick();
    const inv = await (await fetch(`${base}/api/investigacion`)).json();
    assert.equal(inv.investigaciones.length, 1);
    assert.equal(inv.investigaciones[0].origen, 'programada');
    const sitio = await (await fetch(`${base}/api/sitio`)).json();
    assert.equal(sitio.analisis.length, 1);
    assert.equal(sitio.analisis[0].url, 'https://tienda.mx/');
    await servidor.programador.tick();
    assert.equal((await (await fetch(`${base}/api/investigacion`)).json()).investigaciones.length, 1); // no repite
  });
});
