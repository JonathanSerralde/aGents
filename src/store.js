// Almacenamiento local: un archivo JSON por diagnóstico dentro de data/diagnosticos/.
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function crearStore(dir) {
  mkdirSync(dir, { recursive: true });

  return {
    guardar(registro) {
      const id = randomUUID();
      const completo = { id, creado: new Date().toISOString(), ...registro };
      mkdirSync(dir, { recursive: true }); // la carpeta puede haberse borrado con el servidor en marcha
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(completo, null, 2), 'utf8');
      return completo;
    },

    obtener(id) {
      if (!UUID.test(id)) return null; // evita rutas arbitrarias
      const ruta = join(dir, `${id}.json`);
      if (!existsSync(ruta)) return null;
      return JSON.parse(readFileSync(ruta, 'utf8'));
    },

    // Borra un diagnóstico del historial. Devuelve false si no existe.
    borrar(id) {
      if (!UUID.test(id)) return false;
      const ruta = join(dir, `${id}.json`);
      if (!existsSync(ruta)) return false;
      rmSync(ruta);
      return true;
    },

    // El diagnóstico más reciente completo, o null si no hay ninguno.
    ultimo() {
      const [reciente] = this.listar();
      return reciente ? this.obtener(reciente.id) : null;
    },

    listar() {
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
        .map((d) => ({ id: d.id, creado: d.creado, nombre: d.contacto_nombre || 'Sin nombre', giro: d.datos?.giro }))
        .sort((a, b) => (a.creado < b.creado ? 1 : -1));
    },
  };
}
