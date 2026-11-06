// Ficha de la empresa: lo que todos los agentes deben saber del negocio, más allá del diagnóstico.
// Vive en data/empresa.json. Todos los campos son opcionales; solo lo lleno entra al contexto de los agentes.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const CAMPOS_EMPRESA = [
  { id: 'razonSocial', etiqueta: 'Razón social', max: 150, grupo: 'fiscal' },
  { id: 'rfc', etiqueta: 'RFC', max: 13, grupo: 'fiscal', mayusculas: true },
  { id: 'regimenFiscal', etiqueta: 'Régimen fiscal', max: 120, grupo: 'fiscal' },
  { id: 'domicilio', etiqueta: 'Domicilio fiscal (calle y número, colonia)', max: 250, grupo: 'fiscal' },
  { id: 'municipio', etiqueta: 'Municipio o alcaldía', max: 80, grupo: 'fiscal' },
  { id: 'estado', etiqueta: 'Estado', max: 60, grupo: 'fiscal' },
  { id: 'codigoPostal', etiqueta: 'Código postal', max: 5, grupo: 'fiscal' },
  { id: 'telefono', etiqueta: 'Teléfono', max: 20, grupo: 'contacto' },
  { id: 'correo', etiqueta: 'Correo', max: 120, grupo: 'contacto' },
  { id: 'sitioWeb', etiqueta: 'Sitio web o redes', max: 150, grupo: 'contacto' },
  { id: 'horario', etiqueta: 'Horario de operación', max: 120, grupo: 'contacto' },
  { id: 'anioFundacion', etiqueta: 'Año de fundación', max: 4, grupo: 'negocio' },
  { id: 'sucursales', etiqueta: 'Sucursales o puntos de operación', max: 250, grupo: 'negocio' },
  { id: 'productos', etiqueta: 'Productos o servicios principales (uno por línea)', max: 600, grupo: 'negocio', multilinea: true },
  { id: 'clientesPrincipales', etiqueta: 'Clientes principales o tipo de cliente', max: 400, grupo: 'negocio', multilinea: true },
  { id: 'proveedoresPrincipales', etiqueta: 'Proveedores principales', max: 400, grupo: 'negocio', multilinea: true },
  { id: 'competidores', etiqueta: 'Competidores', max: 300, grupo: 'negocio', multilinea: true },
  { id: 'notas', etiqueta: 'Lo que todos los agentes deben saber (reglas, historia, prioridades, restricciones)', max: 2000, grupo: 'notas', multilinea: true },
];

export function sanitizarEmpresa(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const ficha = {};
  for (const c of CAMPOS_EMPRESA) {
    let v = typeof e[c.id] === 'string' ? e[c.id].trim() : '';
    if (c.mayusculas) v = v.toUpperCase().replace(/[^A-Z0-9&Ñ]/g, ''); // primero limpiar, luego recortar
    ficha[c.id] = v.slice(0, c.max);
  }
  return ficha;
}

export function crearEmpresa(archivo) {
  return {
    leer() {
      if (!existsSync(archivo)) return sanitizarEmpresa(null);
      try {
        return sanitizarEmpresa(JSON.parse(readFileSync(archivo, 'utf8')));
      } catch {
        return sanitizarEmpresa(null);
      }
    },
    guardar(entrada) {
      const ficha = sanitizarEmpresa(entrada);
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify(ficha, null, 2), 'utf8');
      return ficha;
    },
  };
}

// Texto compacto para el prompt: solo campos con contenido, en el orden de la ficha.
export function fichaParaPrompt(ficha) {
  if (!ficha) return '';
  const lineas = [];
  for (const c of CAMPOS_EMPRESA) {
    const v = ficha[c.id];
    if (!v) continue;
    const etiqueta = c.etiqueta.replace(/\s*\(.*\)$/, '');
    lineas.push(`${etiqueta}: ${v.replace(/\s*\n\s*/g, '; ')}`);
  }
  return lineas.length ? `Ficha de la empresa:\n${lineas.join('\n')}` : '';
}
