// Conocimiento de referencia para pymes mexicanas. Lo reciben los agentes a los que les sirve (fiscal, RH, finanzas,
// orquestador, analista, planificador). Son datos de contexto, no asesoría: cada cifra lleva su fecha y el agente
// debe pedir confirmación con un profesional o la fuente oficial. Revisar este archivo al menos una vez al año.
export const VIGENCIA = 'noviembre de 2026';

export const CONOCIMIENTO_MX = {
  laboral: [
    'Alta en el IMSS dentro de los 5 días hábiles siguientes al inicio de labores; antes, el patrón debe estar registrado ante IMSS, INFONAVIT y SAT.',
    'Vacaciones: desde 2023 ("vacaciones dignas") son 12 días pagados en el primer año y aumentan con la antigüedad; prima vacacional mínima de 25%.',
    'Aguinaldo mínimo de 15 días de salario, pagadero antes del 20 de diciembre. PTU: reparto de 10% de la utilidad fiscal, con topes por trabajador.',
    'Salario mínimo 2026: alrededor de $315 diarios en zona general y $440.87 en la Zona Libre de la Frontera Norte (confirmar en CONASAMI).',
    'Cuotas obrero-patronales del IMSS se pagan cada mes (vencen el día 17); el salario base de cotización incluye aguinaldo y prima vacacional.',
    'Contrato escrito, descripción de puesto y constancias de capacitación (DC-3) son la evidencia básica ante una inspección de la STPS.',
  ],
  fiscal: [
    'RESICO personas físicas: tope de 3.5 millones de pesos de ingresos anuales (art. 113-E LISR), ISR de 1% a 2.5% sobre lo cobrado; no elimina el IVA. Hay una propuesta para subir el tope a 5 millones, no aprobada a la fecha.',
    'RESICO personas morales: tope de 35 millones de pesos (art. 206 LISR).',
    'El SAT puede sacar del RESICO a quien deje caducar su e.firma o no atienda el buzón tributario, aunque no supere el tope.',
    'Obligaciones comunes: CFDI 4.0 por cada ingreso (y complemento de pago cuando se cobra después), declaraciones mensuales de ISR e IVA, declaración anual, retenciones cuando aplican, contabilidad electrónica según régimen.',
    'Un requerimiento o adeudo del SAT se atiende con un contador de inmediato; la omisión genera recargos y multas.',
  ],
  financiamiento: [
    'Encuesta PYME 2018 del INEGI: 76.8% de las pymes no tenía acceso a financiamiento; la falta de información financiera ordenada es una de las causas de rechazo.',
    'Nafin opera programas para mipymes (Financiamiento Plan México, Credicadenas, Mujeres Empresarias, Tu Primer Crédito, Cadenas Productivas, Eco Crédito) a través de bancos e intermediarios; en 2026 hubo bolsas estatales (por ejemplo, Chihuahua e Hidalgo) con garantías o sin garantía. Requisitos y montos se confirman en nafin.com o con el intermediario.',
    'Expediente mínimo para pedir crédito: estados financieros de dos ejercicios, declaraciones anuales, estados de cuenta de seis meses, flujo de caja proyectado, acta constitutiva y poderes (personas morales), buró de crédito limpio.',
    'Según la ENAPROCE, más de 60% de los emprendedores desconoce los programas públicos de apoyo: preguntar primero en la Secretaría de Economía del estado y en nafin.com.',
  ],
  mercado: [
    'Las pymes mexicanas que vendieron en línea pasaron de 18.7% a 28.8% entre 2019 y 2024 (Censos Económicos); los canales dominantes son WhatsApp, Mercado Libre, Amazon México y redes sociales.',
    'Publicidad: lo que se promete debe ser verificable (Ley Federal de Protección al Consumidor, Profeco); precios en pesos con IVA incluido al consumidor final.',
    'Protección de datos: si se recopilan datos de clientes, se necesita aviso de privacidad conforme a la LFPDPPP.',
  ],
  digital: [
    'Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP): toda empresa que recabe datos de clientes o empleados debe tener aviso de privacidad (simplificado en el punto de captura, integral disponible) y atender derechos ARCO; la autoridad sanciona su ausencia.',
    'Fraudes frecuentes contra pymes: suplantación del banco o del SAT por llamada, SMS o WhatsApp; correos que "cambian" la cuenta CLABE de un proveedor; falsos soportes técnicos que piden acceso remoto. El banco y el SAT nunca piden contraseñas ni tokens por esos medios.',
    'Reportes: fraudes bancarios ante el banco y la Condusef; delitos informáticos ante la Policía Cibernética (Guardia Nacional, 088) o la fiscalía estatal.',
    'Pagos con tarjeta: la pasarela o terminal (por ejemplo, Clip, Mercado Pago, Stripe, la del banco) debe estar certificada PCI; la empresa no debe almacenar números completos de tarjeta.',
    'Facturas electrónicas y contabilidad: respaldar los XML de los CFDI emitidos y recibidos; el SAT puede requerirlos durante cinco años.',
  ],
};

const POR_AGENTE = {
  rh: ['laboral'],
  fiscal: ['fiscal', 'laboral'],
  finanzas: ['financiamiento', 'fiscal'],
  ventas: ['mercado'],
  marketing: ['mercado'],
  trafico: ['mercado'],
  orquestador: ['laboral', 'fiscal', 'financiamiento', 'mercado', 'digital'],
  analista: ['financiamiento', 'mercado'],
  brainstorm: ['mercado'],
  descubrimiento: ['mercado'],
  inversiones: ['financiamiento', 'fiscal'],
  proyectos: ['laboral'],
  planificador: ['laboral', 'financiamiento'],
  crecimiento: ['financiamiento', 'mercado'],
  riesgos: ['laboral', 'fiscal'],
  auditoria: ['laboral', 'fiscal'],
  contraloria: ['fiscal'],
  transformacion: ['mercado', 'digital'],
  mercado: ['mercado'],
  ciberseguridad: ['digital'],
  tecnologia: ['digital'],
  nomina: ['laboral'],
  reclutamiento: ['laboral'],
  juridico: ['laboral', 'fiscal'],
  contabilidad: ['fiscal'],
  credito: ['financiamiento'],
  ecommerce: ['mercado', 'digital'],
  atencion: ['mercado'],
  tienda: ['mercado'],
  cuentas: ['mercado', 'fiscal'],
  escolar: ['laboral'],
  admisiones: ['mercado'],
  clinico: ['laboral'],
};

// Texto para el prompt con los bloques que corresponden al agente. Vacío si no le toca ninguno.
// Con `consulta` (el texto de la orden), un agente con varios bloques recibe solo los que tocan el tema: el Coordinador
// carga cinco y casi nunca hacen falta todos. Quien tiene un solo bloque lo recibe siempre, porque es su materia.
const sinAcentos = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const TEMA = {
  laboral: ['emplead', 'trabajador', 'nomina', 'imss', 'infonavit', 'despid', 'despedir', 'finiquit', 'liquidaci', 'aguinaldo', 'vacacion', 'contrat', 'salari', 'sueldo', 'ptu', 'laboral', 'personal', 'renunci', 'incapacidad', 'horas extra'],
  fiscal: ['sat', 'impuesto', 'iva', 'isr', 'factur', 'cfdi', 'declaraci', 'fiscal', 'regimen', 'resico', 'deduc', 'contador', 'multa', 'requerimiento'],
  financiamiento: ['credito', 'prestamo', 'financ', 'banco', 'tasa', 'interes', 'inversion', 'invertir', 'capital', 'deuda', 'apoyo', 'subsidio', 'fondo'],
  mercado: ['cliente', 'venta', 'vender', 'mercado', 'competencia', 'competidor', 'precio', 'consumidor', 'profeco', 'publicidad', 'campana', 'marketing', 'promocion', 'anuncio'],
  digital: ['sitio', 'web', 'internet', 'digital', 'software', 'sistema', 'datos personales', 'privacidad', 'ciber', 'contrasena', 'respaldo', 'whatsapp', 'redes', 'en linea', 'pagina'],
};
export function conocimientoPara(area, consulta = '') {
  let bloques = POR_AGENTE[area];
  if (!bloques) return '';
  if (consulta && bloques.length > 1) {
    const texto = sinAcentos(consulta);
    bloques = bloques.filter((b) => TEMA[b].some((palabra) => texto.includes(palabra)));
    if (!bloques.length) return '';
  }
  const lineas = bloques.flatMap((b) => CONOCIMIENTO_MX[b].map((l) => `- ${l}`));
  return `Referencias para pymes en México (vigentes a ${VIGENCIA}; cifras y plazos deben confirmarse con la fuente oficial o un profesional antes de actuar):\n${lineas.join('\n')}`;
}
