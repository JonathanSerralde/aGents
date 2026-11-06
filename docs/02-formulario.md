# Formulario de diagnóstico

El formulario tiene dos bloques.

- **Bloque A (obligatorio, unos 15 minutos).** Diagnóstico inicial por distrito. Es el que implementa el MVP en `src/formulario.js`.
- **Bloque B (opcional, por giro).** Se muestra solo para el giro elegido. Incluye ocho preguntas: comercio (rotación de inventario y puntos de venta), servicios (horas facturables y proyectos activos), manufactura (paros al mes y antigüedad de maquinaria) y construcción (obras activas y días para cobrar estimaciones).

Todas las preguntas aceptan "no sé", salvo las de identificación.

## Bloque A

### Paso previo: Tu equipo y tus agentes (opcional)
Por cada área, el usuario indica quién responde por ella (responsable humano) y cómo se llama el agente que la acompaña. Si lo deja vacío, el responsable es "Tú" y el agente se llama "Agente de <área>". Los agentes apoyan al equipo; no lo sustituyen: cada acción del plan muestra a su responsable. Se guarda en `data/equipo.json`, se puede editar desde el dashboard y cada diagnóstico conserva una copia del equipo tal como estaba al generarse.

### 0. Contacto
- Nombre y cargo del responsable.
- Nivel de confianza en las respuestas (alto, medio, bajo).

### 1. Identificación
- Giro (comercio, servicios, manufactura, construcción, otro).
- Empleados (rangos).
- Ventas anuales (rangos).
- Antigüedad en años.
- Forma jurídica.
- Número de socios.
- Modalidad (física, en línea, mixta).

### 2. Dirección
- ¿Quién decide?
- ¿Existen acuerdos escritos entre socios?
- ¿Tiene plan escrito?
- Dependencia del dueño (1 a 5).

### 3. Finanzas
- Meses que puede operar sin ingresos.
- Margen aproximado (%).
- ¿Tiene deuda vigente?
- ¿Ha solicitado crédito?
- ¿Quién lleva la contabilidad? (propia, externa, no lleva)
- ¿Tiene estacionalidad de ventas?

### 4. Ventas y clientes
- Número de canales de venta.
- Porcentaje de clientes recurrentes.
- Porcentaje de ventas de sus tres clientes principales.
- Tiempo de respuesta a clientes (rápido, normal, lento).

### 5. Marketing
- Presupuesto mensual aproximado.
- ¿Mide resultados de su captación?

### 6. Compras
- ¿Depende de un solo proveedor?
- Condiciones de pago con proveedores (texto libre).

### 7. Operaciones
- Capacidad instalada en uso (%).
- Mermas (%).
- Quejas o devoluciones del último trimestre (ninguna, pocas, frecuentes).
- Local (rentado, propio, no aplica).

### 8. Recursos humanos
- Vacantes abiertas.
- Rotación anual (%).
- Cumplimiento con IMSS e INFONAVIT (al corriente, adeudo, no sé).
- ¿Capacitó personal en el último año?
- ¿Tiene manuales de puesto?
- Dificultad para contratar (1 a 5).

### 9. Tecnología
- Software que usa (texto libre).
- Digitalización (1 a 5).
- ¿Respalda su información?

### 10. Fiscal y legal
- ¿Emite CFDI?
- ¿Obligaciones fiscales al corriente?
- ¿Contratos escritos con clientes y proveedores? (sí, parcial, no)
- ¿Tiene seguros contratados?
- ¿Conoce programas de apoyo?

### 11. Riesgos
- ¿Depende de un solo cliente?
- ¿Ha tenido un conflicto legal o contractual en los últimos dos años?

### 11 bis. Motor de crecimiento
Segunda capa del diagnóstico: no "¿sobrevives?" sino "¿por dónde crecer?". Dos ejes:
- **Vertical** (vender más y mejor al mercado actual): proceso de venta escrito, costo de adquisición conocido, venta cruzada, margen de 20% o más.
- **Horizontal** (replicar en nuevos mercados, zonas o líneas): operación sin el dueño, procesos documentados, mercado nuevo identificado, capital para expandir.

Preguntas: meta de crecimiento (vertical, horizontal, ambos, no sé), crecimiento de ventas del último año (%), costo de adquisición, proceso de venta, venta cruzada, capacidad para el doble de demanda, mercado nuevo identificado, capital de expansión y puntos de operación actuales.

Cada eje devuelve un nivel de 0 a 4 con sus señales cumplidas y faltantes. El distrito "Crecimiento" se pone en rojo si Finanzas, Dirección u Operaciones están en atención (crecer con la base en rojo es la forma más rápida de quebrar), y en amarillo si la meta elegida tiene un motor con nivel 1 o menos.

### 12. Cualitativo
- Principal preocupación (texto libre).
- Horas semanales disponibles para mejorar el negocio.

## Reglas de semáforo (preliminares)

Cada distrito toma el peor color de sus reglas. Si no hay datos, aparece "sin datos". Las reglas están en `src/diagnostico.js` y son heurísticas de arranque, no un estándar oficial. Conviene calibrarlas con casos reales.

## Plan de acción

Cada alerta roja o amarilla trae una acción concreta. El plan se ordena por prioridad: las alertas rojas tienen un plazo de 30 días y las amarillas de 60 días.

## Vista de ciudad

Ciudad en 3D (Three.js) con un edificio de forma propia por distrito, iluminado con el color de su estado. Clic en un edificio abre su detalle; la rueda acerca y arrastrar desplaza. El crecimiento se refleja en la ciudad:
- **Vertical:** el nivel del eje escala la altura de todos los edificios (de 0.8 a 1.3).
- **Horizontal:** al sur aparecen cuatro lotes de expansión; cada señal cumplida construye uno, los demás quedan en contorno.

Si el usuario prefiere movimiento reducido, la ciudad se dibuja sin animación. En teléfono la ciudad se oculta y la reemplazan las tarjetas del equipo.
