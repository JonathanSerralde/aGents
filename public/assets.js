// Asignación de imágenes a cada área. Las imágenes viven en public/assets/ (generadas desde IMagenes/).
// Si cambias una imagen, cambia solo esta tabla.
export const AREAS_ASSETS = {
  direccion: { avatar: 'assets/avatares/avatar-12.png', edificio: 'assets/edificios/edificio-20.png' },
  finanzas: { avatar: 'assets/avatares/avatar-04.png', edificio: 'assets/edificios/edificio-10.png' },
  ventas: { avatar: 'assets/avatares/avatar-06.png', edificio: 'assets/edificios/edificio-15.png' },
  marketing: { avatar: 'assets/avatares/avatar-02.png', edificio: 'assets/edificios/edificio-05.png' },
  compras: { avatar: 'assets/avatares/avatar-01.png', edificio: 'assets/edificios/edificio-14.png' },
  operaciones: { avatar: 'assets/avatares/avatar-14.png', edificio: 'assets/edificios/edificio-01.png' },
  rh: { avatar: 'assets/avatares/avatar-09.png', edificio: 'assets/edificios/edificio-09.png' },
  tecnologia: { avatar: 'assets/avatares/avatar-11.png', edificio: 'assets/edificios/edificio-06.png' },
  fiscal: { avatar: 'assets/avatares/avatar-05.png', edificio: 'assets/edificios/edificio-04.png' },
  riesgos: { avatar: 'assets/avatares/avatar-03.png', edificio: 'assets/edificios/edificio-02.png' },
  crecimiento: { avatar: 'assets/avatares/avatar-13.png', edificio: 'assets/edificios/edificio-13.png' },
  // Agentes de apoyo: solo avatar (no tienen edificio en la ciudad).
  analista: { avatar: 'assets/avatares/avatar-08.png' },
  planificador: { avatar: 'assets/avatares/avatar-07.png' },
  brainstorm: { avatar: 'assets/avatares/avatar-13.png' }, // comparte con Crecimiento
  descubrimiento: { avatar: 'assets/avatares/avatar-08.png' }, // comparte con Analista
  proyectos: { avatar: 'assets/avatares/avatar-07.png' }, // comparte con Planificador
  inversiones: { avatar: 'assets/avatares/avatar-04.png' }, // comparte con Finanzas
  capacitacion: { avatar: 'assets/avatares/avatar-10.png' },
  trafico: { avatar: 'assets/avatares/avatar-02.png' }, // comparte imagen con Marketing hasta tener una propia
  auditoria: { avatar: 'assets/avatares/avatar-05.png' }, // comparte imagen con Fiscal y legal
  contraloria: { avatar: 'assets/avatares/avatar-04.png' }, // comparte con Finanzas
  mejora: { avatar: 'assets/avatares/avatar-14.png' }, // comparte con Operaciones
  transformacion: { avatar: 'assets/avatares/avatar-11.png' }, // comparte con Tecnología
  mercado: { avatar: 'assets/avatares/avatar-09.png' }, // comparte con Recursos humanos
  ciberseguridad: { avatar: 'assets/avatares/avatar-03.png' }, // comparte con Riesgos
  // Departamentos operativos: reutilizan la imagen del área a la que reportan.
  tienda: { avatar: 'assets/avatares/avatar-14.png' },
  imagen: { avatar: 'assets/avatares/avatar-02.png' },
  alimentos: { avatar: 'assets/avatares/avatar-14.png' },
  produccion: { avatar: 'assets/avatares/avatar-14.png' },
  expansion: { avatar: 'assets/avatares/avatar-13.png' },
  juridico: { avatar: 'assets/avatares/avatar-05.png' },
  mantenimiento: { avatar: 'assets/avatares/avatar-14.png' },
  reclutamiento: { avatar: 'assets/avatares/avatar-09.png' },
  nomina: { avatar: 'assets/avatares/avatar-09.png' },
  perdidas: { avatar: 'assets/avatares/avatar-05.png' },
  inventarios: { avatar: 'assets/avatares/avatar-01.png' },
  contabilidad: { avatar: 'assets/avatares/avatar-04.png' },
  logistica: { avatar: 'assets/avatares/avatar-01.png' },
  ecommerce: { avatar: 'assets/avatares/avatar-06.png' },
  atencion: { avatar: 'assets/avatares/avatar-06.png' },
  credito: { avatar: 'assets/avatares/avatar-04.png' },
  administracion: { avatar: 'assets/avatares/avatar-12.png' },
  cuentas: { avatar: 'assets/avatares/avatar-06.png' },
  escolar: { avatar: 'assets/avatares/avatar-10.png' },
  admisiones: { avatar: 'assets/avatares/avatar-06.png' },
  clinico: { avatar: 'assets/avatares/avatar-14.png' },
};

export const NOMBRES_APOYO = {
  analista: 'Analista', planificador: 'Planificador', brainstorm: 'Brainstorm y creatividad', descubrimiento: 'Descubrimiento de ideas', proyectos: 'Gestión ágil de proyectos', inversiones: 'Análisis de inversiones', capacitacion: 'Capacitación', trafico: 'Tráfico digital',
  auditoria: 'Auditoría', contraloria: 'Contraloría', mejora: 'Mejora continua', transformacion: 'Transformación digital',
  mercado: 'Investigación de mercado', ciberseguridad: 'Ciberseguridad',
  tienda: 'Operación de tienda', imagen: 'Imagen y exhibición', alimentos: 'Alimentos y bebidas', produccion: 'Producción y calidad',
  expansion: 'Expansión y aperturas', juridico: 'Jurídico', mantenimiento: 'Mantenimiento', reclutamiento: 'Reclutamiento y selección',
  nomina: 'Nómina y seguridad social', perdidas: 'Prevención de pérdidas', inventarios: 'Inventarios y almacén', contabilidad: 'Contabilidad',
  logistica: 'Logística e importaciones', ecommerce: 'Venta en línea', atencion: 'Atención a clientes', credito: 'Crédito y cobranza',
  administracion: 'Administración de oficina',
  cuentas: 'Cuentas y proyectos de agencia', escolar: 'Control escolar y académico', admisiones: 'Admisiones y retención de alumnos', clinico: 'Operación clínica y sanitaria',
};
// Agentes opcionales por sector: el servidor dice cuáles están activos y por qué (/api/estado → apoyo).
export const OPCIONALES = ['alimentos', 'cuentas', 'escolar', 'admisiones', 'clinico'];
export const AGENTES_APOYO = Object.keys(NOMBRES_APOYO);
