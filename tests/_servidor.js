// Helper de pruebas: todas las rutas de datos apuntan a una carpeta temporal.
// Así ninguna prueba escribe en la carpeta data/ real del usuario, aunque el servidor tenga valores por defecto.
import { join } from 'node:path';

export function opcionesTemporales(dir, extra = {}) {
  return {
    dirDatos: join(dir, 'diagnosticos'),
    dirMarca: join(dir, 'marca'),
    archivoBorrador: join(dir, 'borrador.json'),
    archivoEquipo: join(dir, 'equipo.json'),
    dirConversaciones: join(dir, 'conversaciones'),
    archivoConfig: join(dir, 'config.json'),
    archivoAgentes: join(dir, 'agentes.json'),
    archivoEmpresa: join(dir, 'empresa.json'),
    archivoFuentes: join(dir, 'fuentes.json'),
    dirDocumentos: join(dir, 'documentos'),
    archivoUso: join(dir, 'uso.json'),
    archivoAjustes: join(dir, 'ajustes.json'),
    dirInvestigaciones: join(dir, 'investigaciones'),
    dirSitio: join(dir, 'sitio'),
    archivoProgramacion: join(dir, 'programacion.json'),
    archivoMemoria: join(dir, 'memoria.json'),
    archivoCalendario: join(dir, 'calendario.json'),
    archivoRutinas: join(dir, 'rutinas.json'),
    archivoActividad: join(dir, 'actividad.json'),
    archivoPiloto: join(dir, 'piloto.json'),
    archivoLotes: join(dir, 'lotes.json'),
    archivoDatosReales: join(dir, 'datos-reales.json'),
    archivoCampanas: join(dir, 'campanas.json'),
    archivoJuntas: join(dir, 'juntas.json'),
    dirRaizDatos: dir,
    archivoPid: join(dir, 'servidor.pid'),
    programador: false, // las pruebas no corren tareas semanales por sí solas
    proveedor: 'ninguno',
    anthropicKey: '',
    openaiKey: '',
    ...extra,
  };
}
