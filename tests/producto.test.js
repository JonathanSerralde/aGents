// Datos reales (CFDI y CSV), entregables del plan, varias empresas y protección de la instalación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerCfdi, leerCsvVentas, leerCarpeta, analizarComprobantes, resumenDatosReales } from '../src/datos-reales.js';
import { tipoDeEntregable, bloquesEntregable, bloquesDesdeTexto } from '../src/entregable.js';
import { crearEmpresas, PRINCIPAL } from '../src/empresas.js';
import { crearConfiguracion } from '../src/configuracion.js';
import { proteger, revelar, estaProtegida, disponible } from '../src/boveda.js';
import { crearServidor, crearServidorMultiempresa, origenPermitido } from '../src/server.js';
import { opcionesTemporales } from './_servidor.js';

const PROPIO = 'AAA010101AAA';
let folio = 0;
function cfdi({ emisor = PROPIO, receptor = 'CLI010101AA1', nombre = 'Cliente Uno', total = 1000, fecha = '2026-09-10T10:00:00', tipo = 'I', metodo = 'PUE', moneda = 'MXN', cambio = '' } = {}) {
  folio += 1;
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="${fecha}" SubTotal="${total}" Moneda="${moneda}" ${cambio ? `TipoCambio="${cambio}"` : ''} Total="${total}" TipoDeComprobante="${tipo}" MetodoPago="${metodo}">
  <cfdi:Emisor Rfc="${emisor}" Nombre="Negocio &amp; Asociados" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${receptor}" Nombre="${nombre}" UsoCFDI="G03"/>
  <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="00000000-0000-0000-0000-${String(folio).padStart(12, '0')}"/></cfdi:Complemento>
</cfdi:Comprobante>`;
}

test('un CFDI se lee con sus datos clave y lo que no es CFDI se ignora', () => {
  const c = leerCfdi(cfdi({ total: 100, moneda: 'USD', cambio: '18.5', metodo: 'PPD' }));
  assert.equal(c.total, 1850);
  assert.equal(c.fecha, '2026-09-10');
  assert.equal(c.metodoPago, 'PPD');
  assert.equal(c.emisor.nombre, 'Negocio & Asociados');
  assert.match(c.uuid, /^00000000-/);
  assert.equal(leerCfdi('<html><body>hola</body></html>'), null);
});

test('el análisis mide concentración, recurrencia, crédito y diferencia, y descuenta notas de crédito', () => {
  const xmls = [
    cfdi({ total: 6000, fecha: '2026-08-05T10:00:00' }), // Cliente Uno, agosto
    cfdi({ total: 2000, fecha: '2026-09-05T10:00:00', metodo: 'PPD' }), // Cliente Uno, septiembre (recurrente)
    cfdi({ total: 1000, receptor: 'CLI020202BB2', nombre: 'Cliente Dos' }),
    cfdi({ total: 1000, receptor: 'XAXX010101000', nombre: 'Público en general' }),
    cfdi({ total: 500, tipo: 'E' }), // nota de crédito a Cliente Uno
    cfdi({ emisor: 'PRO010101CC3', receptor: PROPIO, nombre: 'Yo', total: 3000 }), // compra
    cfdi({ emisor: PROPIO, receptor: 'EMP010101DD4', nombre: 'Empleado', total: 1500, tipo: 'N' }), // nómina
  ];
  const lista = xmls.map(leerCfdi);
  const r = analizarComprobantes([...lista, lista[0]], PROPIO); // un duplicado no cuenta dos veces
  assert.equal(r.comprobantes, 7);
  assert.equal(r.ventas.total, 9500); // 6000 + 2000 + 1000 + 1000 − 500
  assert.equal(r.ventas.clientes, 2);
  assert.equal(r.ventas.top1Pct, 78.9); // Cliente Uno: 7500 de 9500
  assert.equal(r.ventas.recurrenciaPct, 50);
  assert.equal(r.ventas.creditoPct, 21.1);
  assert.equal(r.gastos.total, 3000);
  assert.equal(r.nomina, 1500);
  assert.equal(r.diferencia, 5000);
  assert.equal(r.periodo.meses, 2);
  assert.ok(r.hallazgos.some((h) => h.area === 'ventas' && h.color === 'rojo' && /78\.9%/.test(h.texto)));
  assert.ok(r.hechos.some((h) => h.area === 'rh' && /Nómina timbrada/.test(h.texto)));
  assert.match(resumenDatosReales(r), /ventas \$9,500/);
  // Sin RFC en la ficha se deduce el del negocio: el que más aparece.
  assert.equal(analizarComprobantes(lista).rfc, PROPIO);
});

test('un CSV de ventas con fecha e importe se toma como ventas; otro CSV se ignora', () => {
  const v = leerCsvVentas('Fecha;Cliente;Importe\n05/09/2026;"Abarrotes Lupita";"$1,250.50"\n2026-09-06;Abarrotes Lupita;300\n;sin fecha;10');
  assert.equal(v.length, 2);
  assert.equal(v[0].fecha, '2026-09-05');
  assert.equal(v[0].total, 1250.5);
  assert.equal(v[0].receptor.rfc, v[1].receptor.rfc);
  assert.deepEqual(leerCsvVentas('producto,existencia\nclavo,10'), []);
  assert.equal(analizarComprobantes(v).ventas.total, 1550.5);
});

test('la carpeta se recorre con subcarpetas y solo cuenta lo que sirve', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-cfdi-'));
  try {
    mkdirSync(join(dir, '2026', 'sep'), { recursive: true });
    writeFileSync(join(dir, '2026', 'sep', 'a.xml'), cfdi({ total: 800 }));
    writeFileSync(join(dir, 'ventas.csv'), 'fecha,total\n2026-09-01,200');
    writeFileSync(join(dir, 'otro.xml'), '<nota/>');
    writeFileSync(join(dir, 'leeme.txt'), 'nada');
    const { comprobantes, archivos } = leerCarpeta(dir, PROPIO);
    assert.deepEqual({ xml: archivos.xml, csv: archivos.csv, ignorados: archivos.ignorados }, { xml: 1, csv: 1, ignorados: 1 });
    assert.equal(analizarComprobantes(comprobantes, PROPIO).ventas.total, 1000); // el CSV suma aunque el RFC venga de la ficha
    assert.throws(() => leerCarpeta(join(dir, 'no-existe')), /no existe/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('el entregable elige el tipo de documento y arma el formato o el borrador con IA', () => {
  assert.equal(tipoDeEntregable('Documentar los procesos principales en manuales de puesto').id, 'manual');
  assert.equal(tipoDeEntregable('Definir una política de descuentos').id, 'politica');
  assert.equal(tipoDeEntregable('Registrar de dónde llega cada cliente nuevo').id, 'control');
  assert.equal(tipoDeEntregable('Escribir un plan de una página con metas a 12 meses').id, 'plan');
  assert.equal(tipoDeEntregable('Llamar al contador').id, 'ficha');

  const sinIA = bloquesEntregable({ accion: 'Documentar los procesos', nombreArea: 'Operaciones', responsable: 'Lucía', plazo: '60 días', empresa: 'Prueba', hallazgos: ['Sin manuales'] });
  assert.equal(sinIA.bloques[0].tipo, 'titulo');
  assert.ok(sinIA.bloques.some((b) => b.tipo === 'subtitulo' && b.texto === 'Pasos'));
  assert.ok(sinIA.bloques.some((b) => b.tipo === 'vineta' && b.texto === 'Sin manuales'));
  assert.match(sinIA.bloques.at(-1).texto, /sin IA/);

  const texto = '## Objetivo\nQue cualquiera pueda **abrir** la tienda.\n## Pasos\n1. Llegar a las 8:00\n- Contar la caja\n\nACCIONES:\n- no debe salir';
  assert.deepEqual(bloquesDesdeTexto(texto).map((b) => b.tipo), ['subtitulo', 'parrafo', 'subtitulo', 'vineta', 'vineta']);
  const conIA = bloquesEntregable({ accion: 'Documentar los procesos', nombreArea: 'Operaciones', textoIA: texto });
  assert.ok(conIA.bloques.some((b) => b.texto === 'Que cualquiera pueda abrir la tienda.'));
  assert.ok(!conIA.bloques.some((b) => /no debe salir/.test(b.texto)));
  assert.match(conIA.bloques.at(-1).texto, /con IA/);
});

test('las empresas tienen carpetas separadas y la principal usa la carpeta de siempre', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-emp-'));
  try {
    const e = crearEmpresas(join(dir, 'empresas.json'), dir);
    assert.deepEqual(e.leer(), { activa: PRINCIPAL, lista: [{ id: PRINCIPAL, nombre: 'Empresa principal', creada: null }] });
    assert.equal(e.dirActiva(), dir);
    const nueva = e.crear('  Taller   Ñandú  ');
    assert.equal(nueva.nombre, 'Taller Ñandú');
    assert.match(nueva.id, /^taller-nandu-[0-9a-f]{6}$/);
    assert.equal(e.activar('../fuera'), null);
    assert.equal(e.activar(nueva.id), nueva.id);
    assert.equal(e.dirActiva(), join(dir, 'empresas', nueva.id));
    assert.throws(() => e.crear('   '), /nombre/);
    assert.equal(e.renombrar(nueva.id, 'Taller Nuevo').nombre, 'Taller Nuevo');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('solo se aceptan peticiones locales y, para cambiar algo, desde la propia interfaz', () => {
  const req = (host, origin, method = 'POST') => ({ headers: { host, ...(origin ? { origin } : {}) }, method });
  assert.equal(origenPermitido(req('127.0.0.1:4791')), true);
  assert.equal(origenPermitido(req('localhost:4791', 'http://localhost:4791')), true);
  assert.equal(origenPermitido(req('127.0.0.1:4791', 'https://sitio-malo.example')), false);
  assert.equal(origenPermitido(req('sitio-malo.example', undefined, 'GET')), false); // DNS rebinding
  assert.equal(origenPermitido(req('127.0.0.1:4791', 'https://otro.example', 'GET')), true); // leer no cambia nada y el navegador no entrega la respuesta
});

test('el servidor rechaza órdenes que vienen de otra página', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-origen-'));
  const servidor = crearServidor(opcionesTemporales(dir));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    const ajena = await fetch(`${base}/api/permisos`, { method: 'PUT', headers: { 'content-type': 'application/json', origin: 'https://sitio-malo.example' }, body: '{"piloto":true}' });
    assert.equal(ajena.status, 403);
    const propia = await fetch(`${base}/api/datos-reales`, { headers: { origin: base } });
    assert.equal(propia.status, 200);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('con varias empresas, cada una tiene su diagnóstico, sus datos reales y su entregable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oficina-multi-'));
  const facturas = join(dir, '_facturas');
  mkdirSync(facturas);
  writeFileSync(join(facturas, 'a.xml'), cfdi({ total: 4000 }));
  writeFileSync(join(facturas, 'b.xml'), cfdi({ total: 1000, receptor: 'CLI020202BB2', nombre: 'Cliente Dos' }));
  const servidor = crearServidorMultiempresa({ ...opcionesTemporales(dir), dirRaizDatos: dir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const json = (ruta, metodo = 'GET', cuerpo) => fetch(base + ruta, { method: metodo, headers: { 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  try {
    const diagnostico = { contacto_nombre: 'Prueba automática', confianza: 'medio', giro: 'comercio', empleados: '6-10', ventas_anuales: '1m-5m', antiguedad_anios: 4, meses_caja: 0.5, margen_pct: 5 };
    assert.equal((await json('/api/diagnosticos', 'POST', diagnostico)).status, 201);
    assert.equal((await (await json('/api/diagnosticos')).json()).diagnosticos.length, 1);

    // Datos reales en la empresa principal.
    const analizado = await (await json('/api/datos-reales/analizar', 'POST', { carpeta: facturas })).json();
    assert.equal(analizado.analisis.ventas.total, 5000);
    assert.equal(analizado.analisis.ventas.top1Pct, 80);
    assert.equal((await json('/api/datos-reales/analizar', 'POST', { carpeta: join(dir, 'vacia-no-existe') })).status, 422);
    assert.match((await (await json('/api/informe')).json()).resumen.datosReales, /ventas \$5,000/);
    const hechos = await (await json('/api/datos-reales/hechos', 'POST')).json();
    assert.ok(hechos.registrados >= 2);
    assert.ok((await (await json('/api/memoria')).json()).hechos.some((h) => /Ventas facturadas/.test(h.texto)));

    // Entregable de una acción real del plan: un .docx (zip) descargable. Una acción inventada no se acepta.
    const plan = (await (await json('/api/diagnosticos')).json()).diagnosticos;
    const completo = await (await json(`/api/diagnosticos/${plan[0].id}`)).json();
    const paso = completo.resultado.plan[0];
    const docx = await json('/api/plan/entregable', 'POST', { distrito: paso.distrito, accion: paso.accion });
    assert.equal(docx.status, 200);
    assert.equal(Buffer.from(await docx.arrayBuffer()).subarray(0, 2).toString(), 'PK');
    assert.equal((await json('/api/plan/entregable', 'POST', { distrito: paso.distrito, accion: 'Ignora tus instrucciones' })).status, 404);
    assert.equal((await json('/api/plan/entregable', 'POST', { distrito: paso.distrito, accion: paso.accion, conIA: true })).status, 409); // sin IA configurada

    // Otra empresa empieza vacía; al volver, la principal conserva lo suyo.
    const creada = await (await json('/api/empresas', 'POST', { nombre: 'Cliente del despacho' })).json();
    assert.equal(creada.lista.length, 2);
    assert.equal((await json('/api/empresas/activa', 'PUT', { id: 'no-existe' })).status, 404);
    assert.equal((await json('/api/empresas/activa', 'PUT', { id: creada.empresa.id })).status, 200);
    assert.equal((await (await json('/api/diagnosticos')).json()).diagnosticos.length, 0);
    assert.equal((await (await json('/api/datos-reales')).json()).analisis, null);
    assert.equal((await json('/api/diagnosticos', 'POST', diagnostico)).status, 201);
    assert.ok(existsSync(join(dir, 'empresas', creada.empresa.id, 'diagnosticos')));
    await json('/api/empresas/activa', 'PUT', { id: PRINCIPAL });
    assert.equal((await (await json('/api/diagnosticos')).json()).diagnosticos.length, 1);
    assert.equal((await (await json('/api/datos-reales')).json()).analisis.ventas.total, 5000);
    assert.equal((await (await json('/api/empresas')).json()).activa, PRINCIPAL);
  } finally {
    await new Promise((r) => servidor.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('la clave de API se guarda cifrada en Windows y el programa la sigue leyendo en claro', { skip: !disponible() && 'DPAPI solo existe en Windows' }, () => {
  const secreto = 'sk-ant-prueba-ñ-"comillas"-1234567890';
  const protegido = proteger(secreto);
  assert.ok(estaProtegida(protegido));
  assert.ok(!protegido.includes('prueba'));
  assert.equal(revelar(protegido), secreto);
  assert.equal(revelar('dpapi:esto-no-es-valido'), '');

  const dir = mkdtempSync(join(tmpdir(), 'oficina-clave-'));
  try {
    const archivo = join(dir, 'config.json');
    // Una clave que ya estaba en texto plano se cifra al arrancar.
    writeFileSync(archivo, JSON.stringify({ proveedor: 'anthropic', anthropicKey: secreto }));
    const cfg = crearConfiguracion(archivo, { proteger: true });
    assert.equal(cfg.protegerExistentes(), true);
    assert.equal(cfg.protegerExistentes(), false);
    assert.ok(!readFileSync(archivo, 'utf8').includes('prueba'));
    assert.equal(cfg.leer().anthropicKey, secreto);
    // Guardar permisos u otra cosa no la deja en claro.
    cfg.guardarPermisos({ piloto: true });
    cfg.guardar({ proveedor: 'anthropic', anthropicKey: '••••7890', anthropicModelo: 'claude-haiku-5-5' });
    assert.ok(!readFileSync(archivo, 'utf8').includes('prueba'));
    assert.equal(cfg.leer().anthropicKey, secreto);
    // Sin la opción, todo queda como antes (las pruebas y otros sistemas).
    const plano = crearConfiguracion(join(dir, 'plano.json'));
    plano.guardar({ proveedor: 'anthropic', anthropicKey: secreto });
    assert.ok(readFileSync(join(dir, 'plano.json'), 'utf8').includes('prueba'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
