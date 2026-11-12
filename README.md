# aGents

**Una oficina de agentes de IA para que una pyme mexicana se diagnostique, se organice y crezca, instalada en su propia computadora.**

Doble clic, sin cuentas, sin servidores de nadie: 11 áreas de negocio + 33 agentes de apoyo + un Orquestador que se coordinan entre sí, con una ciudad 3D donde cada edificio es un departamento. Funciona completa **sin IA** (motor de reglas) y, si el empresario pone su propia clave de API, los agentes responden, investigan y trabajan solos.

> Pensada para el empresario por su cuenta que quiere crecer vertical (vender más a quien ya le compra) y horizontalmente (abrir mercados, sucursales o líneas), y para los consultores que lo acompañan. Cualquier pyme puede instalarla y moldearla: sectores, agentes, skills y tareas se editan desde la pantalla.

---

## ¿Para qué sirve?

| Si eres… | La oficina te da… |
|---|---|
| Dueño de una pyme | Un diagnóstico guiado de 15 minutos, un semáforo por área, un plan con plazos y un equipo de agentes que revisa tu negocio cada semana y te dice qué atender primero |
| Consultor o contador | Una herramienta que deja en tu cliente, con reportes en Word/PDF, calculadora laboral con la LFT, informe del Orquestador y bitácora de acciones |
| Desarrollador | Un proyecto Node.js sin dependencias, con 160 pruebas, API local documentada y agentes definidos en texto (habilidades) fáciles de ampliar |

## Principios (no negociables)

- **Todo local.** El servidor solo escucha en `127.0.0.1`; los datos viven en `data/` junto a la aplicación y nunca se versionan ni se envían a nadie.
- **Sin cuentas, sin login, sin telemetría.** Una instalación es un negocio.
- **IA opcional y con tu clave.** Solo Anthropic u OpenAI con la clave del propio usuario (nunca sesiones de suscripción de Claude o ChatGPT: sus términos no lo permiten). Sin clave, nada sale de la computadora.
- **Los agentes proponen, el dueño decide.** Ninguna idea se aprueba, ningún agente se crea ni se gasta dinero sin que la persona lo acepte.
- **Transparencia.** Lo que hacen los agentes (búsquedas, consultas, encargos, piloto) queda registrado y a la vista; los permisos se controlan desde el dashboard.

## Qué incluye

### Diagnóstico y motor de reglas (sin IA)
- Asistente guiado por pasos con identidad, logotipo y equipo; bloque específico por giro: comercio, servicios, manufactura, construcción, alimentos, agencia de marketing, educación y salud.
- Semáforo por área (verde/amarillo/rojo), **reglas cruzadas** que detectan contradicciones entre áreas (gastar en captación con la caja en rojo, expandirse dependiendo del dueño…), prioridad ponderada, plan de acción a 30/60 días y motor de crecimiento vertical/horizontal.
- Reportes en Word (.docx, generados sin dependencias) y página imprimible para PDF.
- **Informe del Orquestador** por reglas: estado, contradicciones, acciones vencidas, mercado, sitio y siguiente paso.
- **Calculadora laboral** (Ley Federal del Trabajo): aguinaldo, vacaciones y prima, finiquito, liquidación, PTU, fondo de ahorro, vales, descuento INFONAVIT y listas de alta/baja.
- **Análisis del sitio web** del negocio: HTTPS, encabezados de seguridad, versión móvil, botón de WhatsApp, aviso de privacidad, medición, velocidad.
- Campañas: piezas con los tamaños correctos de Meta, TikTok, Google/YouTube, LinkedIn, WhatsApp, X y Pinterest.
- Calendario `.ics`: exporta las fechas de la oficina a Google/Outlook/Apple e importa tu agenda.

### Agentes (con IA, usando tu clave)
- **11 agentes de área**: Dirección, Finanzas, Ventas, Marketing, Compras, Operaciones, Recursos humanos, Tecnología, Fiscal y legal, Riesgos, Crecimiento.
- **Staff del Orquestador**: Analista, Planificador, Brainstorm y creatividad, Descubrimiento de ideas, Gestión ágil de proyectos, Auditoría, Contraloría.
- **Subagentes por área**: Contabilidad, Crédito y cobranza, Análisis de inversiones, Venta en línea, Atención a clientes, Tráfico digital, Investigación de mercado, Imagen y exhibición, Operación de tienda, Producción y calidad, Mantenimiento, Inventarios y almacén, Logística e importaciones, Mejora continua, Capacitación, Reclutamiento, Nómina y seguridad social, Transformación digital, Ciberseguridad, Jurídico, Expansión y aperturas, Prevención de pérdidas, Administración de oficina.
- **Opcionales por sector** (se activan solos según el giro): Alimentos y bebidas, Cuentas de agencia, Control escolar, Admisiones, Operación clínica.
- Hasta 20 **agentes propios** creados por el usuario, y subagentes que el Orquestador propone cuando detecta una necesidad.
- Cada agente tiene su **skill** (rol, especialidad, preguntas que hace primero, marcos, acciones, límites, indicadores) con especificidad mexicana (CFDI, IMSS, LFT, Profeco, COFEPRIS, RVOE…) y **ajustes por negocio**.

### Cómo trabajan juntos
- **Jerarquía con efecto real**: quién reporta a quién decide quién puede delegar.
- **Comunicación entre agentes**: `CONSULTAR`, `DELEGAR`, `INFORMAR`, con segunda vuelta y presupuesto de llamadas por orden.
- **Memoria compartida (bitácora)**: acciones con plazo y vencimiento, **hechos** de la empresa, **ideas** en evaluación y glosario de **conceptos**. Un clasificador distingue si lo que escribes es un dato real, una idea o una pregunta, y el agente responde en consecuencia.
- **Investigación semanal de mercado**: al menos 10 competidores y 5 comentarios positivos y negativos de clientes por cada uno (búsqueda web del proveedor), repartida a Ventas, Marketing y a quien aluda cada queja.
- **Piloto automático**: cada agente tiene su revisión periódica (Finanzas revisa caja y cobranza, Fiscal el calendario del mes, Ventas la oferta de la semana, el Orquestador reparte lo que detecte) y la hace solo, coordinándose con los demás. Apagado hasta que el usuario lo enciende.
- **Rutinas**: si repites una orden tres veces, la oficina te ofrece automatizarla.
- Ingesta de documentos (Word, PDF con texto, imágenes con IA), bóvedas de notas Obsidian u otras carpetas Markdown, ficha completa de la empresa.

### Tareas automáticas que sí arrancan, y solo las que el usuario enciende
- Un agente del piloto o una tarea semanal sin configuración propia cuenta desde que se encendió (`_encendido` en `data/piloto.json`, `_inicio` en `data/programacion.json`), no desde "ahora" en cada lectura. Antes su próxima corrida siempre quedaba en el futuro y no corría nunca.
- El piloto sigue apagado de fábrica. Al encenderlo, cada agente hace su primera revisión en su próximo día y hora, no de inmediato.
- La investigación semanal de mercado (gasta IA y búsquedas) empieza en pausa hasta que el usuario la active; una investigación hecha a mano ya no la enciende. El análisis semanal del sitio (sin IA) corre solo.
- Reactivar una tarea que estuvo en pausa cuenta desde ese momento: no dispara la corrida "atrasada".

### Para cualquier industria
- **16 giros** en el diagnóstico: comercio, servicios profesionales, manufactura, construcción, alimentos, agencia, educación, salud, transporte y logística, tecnología y software, hospedaje y turismo, agropecuario, servicios personales, automotriz, inmobiliario y otro.
- **Cada giro tiene su contexto de sector** (`src/sectores.js`): indicadores de referencia, cumplimiento en México y qué hunde o hace crecer a ese tipo de negocio. Llega al prompt de todos los agentes. Los rangos son referencias generales, no cifras oficiales.
- **Preguntas de profundidad por giro** (Bloque B en `src/formulario.js`, reglas en `src/diagnostico.js`): dos indicadores que el dueño conoce de memoria por cada giro, con umbrales que pintan el semáforo y proponen la acción.

### Diagnóstico exprés
- El asistente ofrece dos caminos: **exprés** (22 preguntas esenciales en cuatro pasos, unos cinco minutos, para cualquier giro) y **completo** (todas las áreas más las preguntas del giro). El exprés da un primer semáforo y plan; al actualizar, el completo ya trae lleno lo contestado. La lista de preguntas esenciales vive en `CAMPOS_EXPRES` (`public/app.js`); el servidor no cambia, porque el motor ya tolera respuestas parciales.

### Avance medible
- **Tu avance** (`src/progreso.js`, `GET /api/progreso`): compara el diagnóstico en pantalla con uno anterior y dice, con reglas y sin IA, cuánto cambió la madurez, qué áreas mejoraron o empeoraron y qué acciones del plan anterior ya no hacen falta. Incluye la línea de madurez de todos los diagnósticos guardados y un selector para elegir contra cuál comparar. El Informe del Orquestador (pantalla, Word y PDF) abre con ese avance.
- **Actualizar diagnóstico**: el asistente parte de las respuestas del diagnóstico anterior; el dueño solo corrige lo que cambió (o elige "Empezar en blanco").
- **Borrar diagnósticos** de prueba desde Reportes (`DELETE /api/diagnosticos/:id`), con confirmación en el mismo botón.

### Junta semanal
- **Junta del lunes** (`src/junta.js`, `GET /api/junta`, vista "Junta semanal"): una hoja por semana con tres cifras (dinero y cobranza si hay facturas; madurez y áreas en atención si no), hasta tres decisiones en orden de urgencia con su motivo, y hasta tres compromisos con responsable, repartidos entre áreas. Sin IA. Los compromisos se fijan al abrir la semana y viven en la bitácora; el lunes siguiente la hoja empieza por decir cuáles se cumplieron. Se exporta a Word y PDF.
- **Compromisos editables:** el dueño agrega uno propio (con área, responsable y fecha), suma una acción abierta de la bitácora, corrige texto, responsable o fecha, o quita uno de la junta (sigue abierto en la bitácora). Máximo seis por semana.
- **Avisar al equipo sin servidores de terceros:** por cada responsable hay un mensaje ya escrito con "Enviar por WhatsApp" (abre el WhatsApp del propio usuario con `wa.me`; él elige el contacto) y "Copiar". La aplicación no envía nada por su cuenta.

### Flujo de caja a 13 semanas
- **Flujo de caja** (`src/flujo.js`, `GET/PUT /api/flujo`, tarjeta en el dashboard): proyecta semana por semana lo que entra (venta de contado promedio y cobranza de lo facturado a crédito que sigue abierto) y lo que sale (gastos de contado, nómina timbrada y pagos a proveedores), y avisa en qué semana faltaría dinero. Usa los complementos de pago para saber qué facturas siguen abiertas y cuánto tardan en pagar los clientes. El dueño captura su saldo de hoy; hay un escenario conservador. Sin IA. Los supuestos se muestran en pantalla: solo ve lo que tiene factura.
- **Carpeta vigilada:** mientras la aplicación esté abierta revisa cada diez minutos la carpeta de facturas; si hay archivos nuevos vuelve a analizarla sola y actualiza el flujo y el informe. Se puede apagar.

### Datos reales, entregables y varias empresas
- **Datos reales** (`src/datos-reales.js`, Configuración › Datos reales): lee en este equipo una carpeta con facturas CFDI 3.3/4.0 (.xml emitidos y recibidos) y CSV de ventas, sin IA y sin subir nada. Calcula ventas, gastos, nómina timbrada, concentración de clientes y proveedores, recurrencia y venta a crédito (PPD), y saca hallazgos por área. Solo guarda el resumen; los hechos se registran en la bitácora si el usuario lo pide. El Informe del Orquestador lo incluye.
- **Entregables del plan** (`src/entregable.js`): cada acción del plan descarga su documento de Word. Sin IA sale el formato adecuado (manual de procedimiento, política, formato de control, plan de una página o ficha de acción); con IA, el agente del área lo redacta con los datos de la empresa.
- **Varias empresas** (`src/empresas.js`, Configuración › Empresas): para consultores y despachos. Cada empresa tiene su carpeta (`data/` para la principal, `data/empresas/<id>/` para las demás); la clave de IA y los permisos son de la instalación.

### Pasaporte de madurez
- **Pasaporte** (`src/pasaporte.js`, Reportes › Pasaporte de madurez): documento en Word o PDF para terceros (financiera, cliente grande, socio) con el nivel de madurez, su tendencia, el estado por área, el avance entre diagnósticos, lo que dicen las facturas y el seguimiento de acciones. Sin IA y para cualquier giro. Los montos en pesos solo van si el dueño lo marca. Lleva folio y huella SHA-256 del contenido: `GET /api/pasaporte/verificar` dice si coincide con los datos actuales. Es una autodeclaración, no una auditoría, y el documento lo dice.

### Campañas construidas por la IA
- **Campañas** (`src/campana.js`, `POST /api/campanas/generar`): el dueño dice qué quiere anunciar y el agente de Tráfico digital (o Marketing, si aquel está inactivo) arma tres propuestas completas con lo que la oficina sabe del negocio: titular, texto de apoyo, llamada a la acción, colores, texto para publicar, hashtags, a quién dirigirla e inversión sugerida. Una sola llamada al proveedor; la última campaña queda guardada. El navegador dibuja la vista previa de cada propuesta y, al elegir una, pasa al formulario de piezas para descargarla en todos los tamaños. Sin IA, el formulario manual sigue funcionando.

### Protección de la instalación
- La clave de API se guarda **cifrada con DPAPI en Windows** (`src/boveda.js`), ligada al usuario que la guardó. En otros sistemas sigue en texto plano.
- El servidor solo atiende peticiones dirigidas a la dirección local y, si cambian algo, hechas desde la propia interfaz: otra página abierta en el navegador no puede dar órdenes a la oficina.

### Piloto
- `docs/03-piloto.md`: protocolo de ocho semanas con cinco negocios de giros distintos y criterios para decidir si se sigue.

### Interfaz
- **Ciudad 3D nocturna** (`public/oficina.js`): cada área es un edificio de cristal cuyo aro, aristas y acentos muestran su semáforo; las áreas en atención llevan una baliza. En la plaza vive el núcleo del Orquestador, enlazado con cada edificio (el enlace se enciende cuando ese agente trabaja). Cámaras isométrica, panorámica y aérea, órbita, rayos X y acercamiento; arrastrar gira, Mayús + arrastrar desplaza, Ctrl + rueda acerca.
- **Simulador de escenarios** sobre la ciudad: cambia el color de cada área (o usa un escenario) y recalcula la madurez con la misma fórmula del dashboard. Solo en pantalla: nunca modifica el diagnóstico guardado.
- **Red de agentes** (`public/red.js`): mapa radial de la jerarquía real con el estado operativo de cada agente (`/api/jerarquia` + `/api/situacion`), quién está bloqueado y el último movimiento. Sin IA.
- Menú plegable en escritorio (se recuerda en el navegador), esqueleto de carga mientras llega la información, estados vacíos con su acción, cifras que cuentan y gráficas que se trazan al entrar. Todo respeta la preferencia de movimiento reducido.
- Tema "cromo líquido" (`public/estilos.css`) con tipografías del sistema: sigue sin cargar nada de internet.

### Control y ahorro
- **Accesos y permisos** en el dashboard: interruptor por capacidad (IA, búsqueda web, documentos, tareas semanales, sitio, rutinas, piloto) con la nota de qué sale de tu equipo.
- **Monitor de consumo**: tokens por mes y por día, por agente y por modelo; caché leída y búsquedas; límites mensual y diario que bloquean con motivo claro.
- **Plan de ahorro de tokens**: caché de prompt (sistema e historial), modelo económico para lo automático, piloto por lotes al 50 % (Message Batches), historial y prompts recortados en lo interno, prompt en dos bloques (lo estable se lee de caché; lo que cambia por orden va aparte), pensamiento extendido apagado (los prompts ya dan la estructura) y continuación automática si una respuesta se corta.
- **Situación de la oficina**: cada agente termina sus respuestas con una línea ESTADO (en curso, entregado o bloqueado); con eso, el registro de actividad y el piloto, la oficina sabe qué hace cada agente. El Orquestador y Dirección lo reciben en su contexto, y la pregunta "¿qué está haciendo cada agente?" se contesta con reglas al instante, sin gastar tokens, incluso con la IA apagada.
- **Actividad**: historial de todo lo que hacen los agentes (consultas de búsqueda incluidas) y estado en vivo en el encabezado.

## Instalación

### Empresarios: Windows (doble clic)
1. Descarga `aGents-<versión>-windows.zip` y descomprímelo donde quieras.
2. Doble clic en `Iniciar.cmd`. Se abre tu navegador en http://127.0.0.1:4791.
3. Para cerrar, `Detener.cmd` o cierra la ventana negra.

Trae su propio Node.js; no instalas nada más. La aplicación no está firmada: si Windows avisa, "Más información → Ejecutar de todas formas".

### Empresarios: Mac (Apple Silicon)
1. Descomprime `aGents-<versión>-macos.tar.gz`.
2. La primera vez: clic derecho en `Iniciar.command` → Abrir → confirma.
3. Para cerrar, `Detener.command`.

### Desarrolladores
Node.js 18 o superior. Sin dependencias (`npm install` no hace falta).

```bash
git clone https://github.com/JonathanSerralde/aGents.git
cd aGents
npm start          # http://127.0.0.1:4791
npm test           # 160 pruebas
```

Construir los paquetes:

```powershell
powershell -ExecutionPolicy Bypass -File instalador\construir.ps1 -NodeExe "C:\ruta\a\node.exe"
```
```bash
node instalador/construir-mac.mjs --arq arm64      # Apple Silicon; añade ,x64 para Intel
```

## Activar la IA (opcional)

En **Configuración › Inteligencia artificial** elige Anthropic u OpenAI, pega tu clave y pulsa "Probar conexión". La clave se guarda en `data/config.json`, solo en tu equipo, y se muestra enmascarada. Alternativa para desarrolladores: copia `.env.example` a `.env`.

Recomendaciones de costo: modo de ahorro *Equilibrado* (tu chat con el modelo principal; lo automático con `claude-haiku-5-5`), piloto por lotes encendido, límite diario de tokens y, para la investigación de mercado, el modelo económico. Cada búsqueda web se cobra aparte en la cuenta del proveedor.

## Estructura del proyecto

```
src/            Servidor http (sin frameworks), motor de reglas, agentes, memoria, piloto, calculadoras
  habilidades.js  Las skills de cada agente: edítalas para moldear la oficina a tu negocio
  sectores.js     Paquetes por sector: agentes opcionales y contexto
  prompts.js      Cómo se arma el contexto de cada agente
public/         Interfaz (vanilla JS), ciudad 3D (Three.js guardado en vendor/), red de agentes, campañas
docs/           Principios y decisiones, descubrimiento (por qué fracasan las pymes), formulario
tests/          node --test; siempre escriben en carpetas temporales, nunca en data/
instalador/     Constructores de los paquetes de Windows y Mac
data/           Tus datos (ignorada por git)
```

## API local

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/formulario` | Esquema del formulario |
| POST / GET | `/api/diagnosticos[/:id]` · GET `/:id/reporte.docx|html` | Diagnósticos y reportes |
| GET/PUT | `/api/equipo` | Responsable y agente por área; agentes opcionales |
| GET/POST | `/api/agentes/:area/mensajes` | Conversación y órdenes a cualquier agente (resuelve `CONSULTAR`/`DELEGAR`/`INFORMAR`) |
| GET/POST/PUT/DELETE | `/api/agentes-personalizados[/:id]` · POST `/propuestas/:i/aceptar|rechazar` | Agentes propios y propuestas del Orquestador |
| GET/PUT | `/api/empresa` | Ficha de la empresa |
| GET/POST/DELETE | `/api/fuentes` · GET `/buscar?q=` | Bóvedas de notas |
| GET/POST | `/api/documentos` · POST `/:id/analizar` | Documentos e ingesta |
| GET/PUT/DELETE | `/api/configuracion[/claves]` · POST `/probar` | Proveedor, clave, modo de ahorro, límites |
| GET/PUT | `/api/permisos` | Accesos y permisos |
| GET | `/api/uso` | Consumo por mes, día, agente y modelo |
| GET | `/api/jerarquia` · `/api/habilidades` | Organigrama, tipos y perfiles |
| GET/PUT | `/api/ajustes[/:agente]` · POST `/optimizar` | Ajustes por negocio y optimización |
| GET | `/api/memoria` · PUT `/acciones/:id` · POST `/hechos` · PUT `/ideas/:id` | Bitácora: acciones, hechos, ideas, glosario |
| GET | `/api/informe[/reporte.docx|html]` | Informe del Orquestador |
| GET/POST | `/api/investigacion` · `/ejecutar` · `/importar` · PUT `/programacion` | Investigación semanal de mercado |
| GET/POST | `/api/sitio` · `/analizar` | Análisis del sitio web |
| GET/POST | `/api/laboral` · `/calcular` | Calculadora laboral |
| GET | `/api/calendario.ics` · `/api/calendario` · POST `/importar` | Calendario |
| GET/POST | `/api/rutinas` · PUT/DELETE `/:id` · POST `/:id/ejecutar` | Rutinas automáticas |
| GET | `/api/piloto` · PUT `/:agente` · POST `/:agente/ejecutar` | Piloto automático por agente |
| GET | `/api/actividad[?area=]` | Registro de actividad y qué hacen ahora |
| GET | `/api/eventos` · `/api/estado` | Flujo en vivo (SSE) y estado |

## Hitos

**Logrados (v0.2.0)**
- [x] Descubrimiento: causas de fracaso y éxito de pymes mexicanas, sectores SCIAN, necesidades y puestos clave
- [x] Formulario de diagnóstico completo y motor de reglas con semáforo, plan y motor de crecimiento
- [x] Ciudad 3D y dashboard; asistente guiado; logotipo e identidad
- [x] Paquetes de doble clic para Windows y Mac (Apple Silicon)
- [x] Agentes por área, de apoyo, por sector y propios; jerarquía; comunicación y memoria compartida
- [x] Documentos, bóvedas Obsidian, reportes Word/PDF, campañas, calendario, calculadora laboral
- [x] Investigación semanal de mercado, análisis del sitio, piloto automático, rutinas, actividad en vivo
- [x] Permisos del usuario, monitor de consumo y plan de ahorro de tokens
- [x] 160 pruebas automáticas y verificación de interfaz con Playwright

**Siguientes**
- [ ] Validar skills y piloto con casos reales de varios giros (los textos son de arranque)
- [ ] Probar el paquete de Mac en un equipo real; firma y notarización
- [ ] Streaming de respuestas para ver las búsquedas una por una
- [ ] OCR para PDF escaneados; generación de imágenes con IA en campañas
- [ ] Tema claro y tour de primera vez
- [ ] Más paquetes de sector (hotelería, transporte, inmobiliaria)

## Privacidad y seguridad

- Nada sale de la computadora salvo lo que la IA necesita para responder, y solo con tu clave y tu permiso.
- Las claves se guardan en texto plano en `data/config.json` dentro de tu equipo; "Quitar claves" las borra.
- El análisis de sitio solo acepta direcciones públicas (bloquea redes internas); las bóvedas son de solo lectura; los documentos tienen tope de 15 MB y se verifican por contenido.
- Las reglas y los textos de los agentes son heurísticas de arranque: no sustituyen a un contador, abogado o consultor.

## Contribuir

1. Abre un *issue* con el giro o la necesidad que no está cubierta.
2. Para agregar un sector: una entrada en `src/sectores.js`, la skill de cada agente en `src/habilidades.js` y su posición en `src/jerarquia.js`, con su prueba en `tests/`.
3. `npm test` debe quedar en verde; las pruebas nunca deben tocar `data/`.

## Licencia

MIT. Ver `LICENSE`.
