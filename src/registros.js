// Almacén genérico de registros con fecha (investigaciones de mercado, análisis del sitio): un JSON por registro
// en la carpeta indicada, ordenados del más reciente al más antiguo. Los ids son UUID, así nunca forman rutas raras.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const ID_VALIDO = /^[0-9a-f-]{36}$/;

// resumir(registro) devuelve lo que se muestra en la lista (sin el contenido completo).
export function crearRegistros(dir, resumir = (r) => ({ id: r.id, momento: r.momento })) {
  const ruta = (id) => join(dir, `${id}.json`);
  function leer(id) {
    if (!ID_VALIDO.test(String(id)) || !existsSync(ruta(id))) return null;
    try {
      return JSON.parse(readFileSync(ruta(id), 'utf8'));
    } catch {
      return null;
    }
  }
  return {
    guardar(datos) {
      const registro = { id: randomUUID(), momento: new Date().toISOString(), ...datos };
      mkdirSync(dir, { recursive: true });
      writeFileSync(ruta(registro.id), JSON.stringify(registro, null, 2), 'utf8');
      return registro;
    },
    obtener: leer,
    // Completa un registro ya guardado (por ejemplo, los encargos que llegaron después de repartirlo).
    actualizar(id, cambios) {
      const actual = leer(id);
      if (!actual) return null;
      const registro = { ...actual, ...cambios, id: actual.id, momento: actual.momento };
      writeFileSync(ruta(id), JSON.stringify(registro, null, 2), 'utf8');
      return registro;
    },
    listar() {
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => leer(f.replace(/\.json$/, '')))
        .filter(Boolean)
        .sort((a, b) => String(b.momento).localeCompare(String(a.momento)))
        .map(resumir);
    },
    ultimo() {
      const [meta] = this.listar();
      return meta ? leer(meta.id) : null;
    },
    borrar(id) {
      if (!ID_VALIDO.test(String(id)) || !existsSync(ruta(id))) return false;
      rmSync(ruta(id));
      return true;
    },
  };
}
