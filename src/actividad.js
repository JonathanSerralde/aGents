// Registro de actividad de la oficina: todo lo que hacen los agentes (órdenes, consultas, encargos, búsquedas en
// internet, tareas semanales, rutinas) queda en data/actividad.json para que el usuario lo revise aunque no haya
// estado mirando. Lo que está pasando ahora mismo se lleva en memoria ("trabajando").
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_EVENTOS = 400;
// Eventos que no aportan al usuario (ruido de interfaz) y no se guardan.
const IGNORADOS = new Set(['permisos_cambiados']);

export function crearActividad(archivo) {
  const trabajando = new Map(); // id → { area, tipo, detalle, desde }
  function leerTodo() {
    if (!existsSync(archivo)) return [];
    try {
      const d = JSON.parse(readFileSync(archivo, 'utf8'));
      return Array.isArray(d) ? d : [];
    } catch {
      return [];
    }
  }
  function escribir(lista) {
    mkdirSync(dirname(archivo), { recursive: true });
    writeFileSync(archivo, JSON.stringify(lista.slice(-MAX_EVENTOS)), 'utf8');
  }
  return {
    registrar(evento) {
      if (IGNORADOS.has(evento.tipo)) return;
      if (evento.tipo === 'trabajo_inicio') trabajando.set(evento.datos.id, { ...evento.datos, desde: evento.momento });
      if (evento.tipo === 'trabajo_fin') trabajando.delete(evento.datos.id);
      try {
        escribir([...leerTodo(), { tipo: evento.tipo, datos: evento.datos, momento: evento.momento }]);
      } catch { /* el registro nunca interrumpe el trabajo */ }
    },
    listar({ limite = 200, area = null } = {}) {
      const lista = leerTodo().filter((e) => !area || e.datos?.area === area || e.datos?.origen === area || e.datos?.destino === area);
      return lista.slice(-limite).reverse();
    },
    trabajando() { return [...trabajando.values()]; },
  };
}
