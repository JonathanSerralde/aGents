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

### Control y ahorro
- **Accesos y permisos** en el dashboard: interruptor por capacidad (IA, búsqueda web, documentos, tareas semanales, sitio, rutinas, piloto) con la nota de qué sale de tu equipo.
- **Monitor de consumo**: tokens por mes y por día, por agente y por modelo; caché leída y búsquedas; límites mensual y diario que bloquean con motivo claro.
- **Plan de ahorro de tokens**: caché de prompt (sistema e historial), modelo económico para lo automático, piloto por lotes al 50 % (Message Batches), historial y prompts recortados en lo interno, pensamiento extendido apagado (los prompts ya dan la estructura) y continuación automática si una respuesta se corta.
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
public/         Interfaz (vanilla JS), ciudad 3D (Three.js guardado en vendor/), campañas
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
