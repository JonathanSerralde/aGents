// Red de agentes: mapa radial de la jerarquía real (/api/jerarquia). El Coordinador va al centro,
// las áreas alrededor y sus subagentes en el borde. El aro de cada nodo muestra su estado operativo
// (/api/situacion) y las líneas se encienden hasta el centro cuando un agente está trabajando.
// Todo el texto se inserta con textContent; no se interpreta HTML del usuario.

const NS = 'http://www.w3.org/2000/svg';
const ANCHO = 1240;
const ALTO = 1080;
const CX = ANCHO / 2;
const CY = ALTO / 2;
const RADIO_MIN = 168;
const RADIO_MAX = 338;
// Los nodos de los anillos interiores ocupan al menos este ángulo (en hojas): así no se enciman.
const PESO_MINIMO = 4.4;
const PESO_PRIMER_ANILLO = 3.2;
const COLOR_SEMAFORO = { verde: '#2ef0b5', amarillo: '#ffb23e', rojo: '#ff3d8b', sin_datos: '#74789f' };
const NOMBRE_ESTADO = { trabajando: 'trabajando ahora', activo: 'activo', bloqueado: 'bloqueado', sin_actividad: 'sin actividad' };

function el(tag, attrs = {}, texto) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto !== undefined) e.textContent = texto;
  return e;
}

const polar = (angulo, radio) => ({ x: CX + Math.cos(angulo) * radio, y: CY + Math.sin(angulo) * radio });
const recortar = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto);

// Reparte el círculo según las hojas de cada rama y fija el radio por profundidad.
function distribuir(arbol) {
  const nodos = [];
  let fondo = 0;
  const contar = (n, prof) => {
    fondo = Math.max(fondo, prof);
    n._prof = prof;
    n._hojas = n.hijos?.length ? n.hijos.reduce((s, h) => s + contar(h, prof + 1), 0) : 1;
    return n._hojas;
  };
  contar(arbol, 0);
  const pesar = (n) => {
    n._hojas = n.hijos?.length ? Math.max(PESO_MINIMO, n.hijos.reduce((s, h) => s + pesar(h), 0)) : n._prof <= 1 ? PESO_PRIMER_ANILLO : n._prof < fondo ? PESO_MINIMO : 1;
    return n._hojas;
  };
  pesar(arbol);
  // El primer anillo va cerca del centro y el resto se abre hacia el borde, donde hay más espacio para los nombres.
  const radioDe = (prof) => (prof === 0 ? 0 : fondo <= 1 ? RADIO_MAX * 0.7 : prof === 1 ? RADIO_MIN : RADIO_MIN + (RADIO_MAX - RADIO_MIN) * (0.62 + (0.38 * (prof - 2)) / Math.max(1, fondo - 2)));
  const ubicar = (n, prof, desde, hasta, padre) => {
    const angulo = (desde + hasta) / 2;
    const radio = radioDe(prof);
    const nodo = { id: n.id, nombre: n.nombre, tipo: n.tipo, prof, angulo, radio, padre, hoja: !n.hijos?.length, ...polar(angulo, radio) };
    nodos.push(nodo);
    let a = desde;
    for (const h of n.hijos || []) {
      const ancho = ((hasta - desde) * h._hojas) / (n.hijos.reduce((s, x) => s + x._hojas, 0));
      ubicar(h, prof + 1, a, a + ancho, nodo);
      a += ancho;
    }
  };
  // Empieza arriba (−90°) y da la vuelta completa.
  ubicar(arbol, 0, -Math.PI / 2, Math.PI * 1.5, null);
  return { nodos, fondo, radioDe };
}

const radioNodo = (n, fondo) => (n.prof === 0 ? 46 : n.hoja ? (n.prof < fondo ? 17 : 12) : n.prof === 1 ? 29 : 23);
const largoHoja = (n, fondo) => (n.prof === fondo ? 18 : 24);
const ANCHO_LETRA = 11.5; // ancho medio de una letra de 20 px en negritas
const ALTO_RENGLON = 20;

// Elige dónde va el nombre de cada rama (áreas y jefes) probando varias posiciones alrededor del nodo y quedándose
// con la que menos se encima con otros nodos, con los nombres ya puestos y con los nombres radiales de las hojas.
// Se calcula con medidas aproximadas, sin leer el dibujo, para que funcione aunque la vista esté oculta.
function ubicarEtiquetas(nodos, fondo, nombreDe) {
  const obstaculos = [];
  const caja = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
  for (const n of nodos) {
    const r = radioNodo(n, fondo) + 4;
    obstaculos.push({ ...caja(n.x - r, n.y - r, n.x + r, n.y + r), de: n.id });
    if (n.prof === 0) obstaculos.push(caja(CX - 90, CY + r + 4, CX + 90, CY + r + 38));
    else if (n.hoja) {
      // El nombre de una hoja sale en línea recta hacia afuera: se cubre con cuadros a lo largo.
      const largo = Math.min(nombreDe(n).length, largoHoja(n, fondo)) * 9.5;
      for (let d = r + 8; d < r + 8 + largo; d += 18) {
        const p = { x: n.x + Math.cos(n.angulo) * d, y: n.y + Math.sin(n.angulo) * d };
        obstaculos.push(caja(p.x - 11, p.y - 11, p.x + 11, p.y + 11));
      }
    }
  }
  const encima = (a, b) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const salida = new Map();
  const ramas = nodos.filter((n) => n.prof > 0 && !n.hoja).sort((a, b) => a.prof - b.prof);
  for (const n of ramas) {
    const nombre = nombreDe(n);
    const palabras = nombre.split(' ');
    const corte = nombre.length > 11 && palabras.length > 1 ? Math.ceil(palabras.length / 2) : palabras.length;
    const renglones = [palabras.slice(0, corte).join(' '), palabras.slice(corte).join(' ')].filter(Boolean).map((r) => recortar(r, 16));
    const radio = radioNodo(n, fondo);
    const ancho = Math.max(...renglones.map((r) => r.length)) * ANCHO_LETRA;
    const alto = renglones.length * ALTO_RENGLON;
    const sube = (renglones.length - 1) * (ALTO_RENGLON / 2);
    const cos = Math.cos(n.angulo);
    const sin = Math.sin(n.angulo);
    const adentro = radio + 16 + Math.abs(cos) * (ancho / 2);
    const lado = radio + 18 + Math.abs(sin) * (ancho / 2);
    const debajo = [0, radio + 21];
    const arriba = [0, -(radio + 10) - (renglones.length - 1) * ALTO_RENGLON];
    const haciaCentro = [-cos * adentro, -sin * adentro + 6 - sube];
    const haciaFuera = [cos * adentro, sin * adentro + 6 - sube];
    const derecha = [radio + 10 + ancho / 2, 6 - sube];
    const izquierda = [-(radio + 10 + ancho / 2), 6 - sube];
    const lateral = [-sin * lado, cos * lado + 6 - sube];
    const lateralOpuesto = [sin * lado, -cos * lado + 6 - sube];
    // En el primer anillo se prefiere debajo; más afuera, hacia el centro, donde solo pasan líneas.
    const candidatos = n.prof === 1 ? [debajo, arriba, derecha, izquierda, haciaFuera, haciaCentro] : [haciaCentro, lateral, lateralOpuesto, debajo, arriba, derecha, izquierda, haciaFuera];
    let mejor = null;
    candidatos.forEach(([dx, dy], i) => {
      const c = caja(n.x + dx - ancho / 2 - 8, n.y + dy - 22, n.x + dx + ancho / 2 + 8, n.y + dy - 16 + alto + 8); // con margen, para que dos nombres no se lean como uno
      const fuera = Math.max(0, -c.x1) + Math.max(0, c.x2 - ANCHO) + Math.max(0, -c.y1) + Math.max(0, c.y2 - ALTO);
      const costo = obstaculos.reduce((t, o) => t + encima(c, o) * (o.de ? 5 : 1), 0) + fuera * 50 + i * 12; // a igualdad, la posición preferida
      if (!mejor || costo < mejor.costo) mejor = { costo, dx, dy, c };
    });
    obstaculos.push(mejor.c);
    salida.set(n.id, { dx: mejor.dx, dy: mejor.dy, renglones });
  }
  return salida;
}

function trazoEnlace(padre, hijo) {
  if (padre.prof === 0) return `M${padre.x.toFixed(1)},${padre.y.toFixed(1)} L${hijo.x.toFixed(1)},${hijo.y.toFixed(1)}`;
  const medio = (padre.radio + hijo.radio) / 2;
  const c1 = polar(padre.angulo, medio);
  const c2 = polar(hijo.angulo, medio);
  return `M${padre.x.toFixed(1)},${padre.y.toFixed(1)} C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${hijo.x.toFixed(1)},${hijo.y.toFixed(1)}`;
}

// Dibuja la red. opciones: nombre(id), avatar(id), estado(id), semaforo(id), alElegir(id).
export function pintarRed(svg, arbol, opciones) {
  svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
  svg.replaceChildren();
  if (!arbol) return;
  const { nodos, fondo, radioDe } = distribuir(arbol);

  const defs = el('defs');
  const grad = el('linearGradient', { id: 'red-grad', x1: '0', y1: '0', x2: '1', y2: '1' });
  grad.append(el('stop', { offset: '0', 'stop-color': '#25e2ff' }), el('stop', { offset: '0.55', 'stop-color': '#8b5cf6' }), el('stop', { offset: '1', 'stop-color': '#e24bf2' }));
  const halo = el('radialGradient', { id: 'red-halo' });
  halo.append(el('stop', { offset: '0', 'stop-color': '#8b5cf6', 'stop-opacity': '0.55' }), el('stop', { offset: '1', 'stop-color': '#8b5cf6', 'stop-opacity': '0' }));
  defs.append(grad, halo);
  svg.append(defs);

  // Órbitas de cada nivel y resplandor del centro.
  for (let p = 1; p <= fondo; p++) svg.append(el('circle', { cx: CX, cy: CY, r: radioDe(p).toFixed(1), class: 'red-anillo' }));
  svg.append(el('circle', { cx: CX, cy: CY, r: '150', fill: 'url(#red-halo)' }));

  // Un agente trabajando enciende su camino completo hasta el Coordinador.
  const estados = new Map(nodos.map((n) => [n.id, opciones.estado(n.id)]));
  const encendidos = new Set();
  for (const n of nodos) {
    if (estados.get(n.id) !== 'trabajando') continue;
    for (let x = n; x && x.padre; x = x.padre) encendidos.add(x.id);
  }

  const capaEnlaces = el('g');
  for (const n of nodos) {
    if (!n.padre) continue;
    capaEnlaces.append(el('path', { d: trazoEnlace(n.padre, n), class: `red-enlace${n.padre.prof === 0 ? ' nivel-1' : ''}${encendidos.has(n.id) ? ' activo' : ''}` }));
  }
  svg.append(capaEnlaces);

  const etiquetas = ubicarEtiquetas(nodos, fondo, (n) => opciones.nombre(n.id) || n.nombre);
  const capaNodos = el('g');
  for (const n of nodos) {
    const nombre = opciones.nombre(n.id) || n.nombre;
    const estado = n.prof === 0 ? (estados.get(n.id) === 'trabajando' ? 'trabajando' : 'activo') : estados.get(n.id);
    const radio = radioNodo(n, fondo);
    const clases = ['red-nodo', estado, n.prof === 0 ? 'centro' : '', n.hoja ? 'hoja' : 'rama', n.tipo === 'area' ? 'area' : ''].filter(Boolean).join(' ');
    const g = el('g', { class: clases, transform: `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`, tabindex: '0', role: 'button', 'aria-label': `${nombre}, ${NOMBRE_ESTADO[estado] || estado}` });
    g.append(el('title', {}, `${nombre} · ${NOMBRE_ESTADO[estado] || estado}`));
    g.append(el('circle', { r: radio, class: 'aro' }));

    const foto = radio >= 15 ? opciones.avatar(n.id) : '';
    if (foto) {
      const idRecorte = `red-recorte-${nodos.indexOf(n)}`;
      const recorte = el('clipPath', { id: idRecorte });
      recorte.append(el('circle', { r: radio - 2.5 }));
      g.append(recorte, el('image', { href: foto, x: -radio, y: -radio, width: radio * 2, height: radio * 2, preserveAspectRatio: 'xMidYMin slice', 'clip-path': `url(#${idRecorte})` }));
    } else if (n.prof === 0) {
      // Núcleo del Coordinador: el símbolo oficial de aGents.
      g.append(el('image', { href: 'assets/marca/icono-192.png', x: '-27', y: '-27', width: '54', height: '54' }));
    }

    // Semáforo del diagnóstico (solo las áreas lo tienen).
    const color = opciones.semaforo(n.id);
    if (color && COLOR_SEMAFORO[color]) g.append(el('circle', { cx: (radio * 0.72).toFixed(1), cy: (-radio * 0.72).toFixed(1), r: '7', fill: COLOR_SEMAFORO[color], class: 'red-semaforo' }));

    // Etiqueta: las hojas del borde se escriben hacia afuera; las ramas, debajo del nodo.
    if (n.prof === 0) {
      g.append(el('text', { y: radio + 28, 'text-anchor': 'middle', 'paint-order': 'stroke', stroke: '#0a0728', 'stroke-width': '6' }, nombre));
    } else if (n.hoja) {
      const grados = (n.angulo * 180) / Math.PI;
      const izquierda = Math.cos(n.angulo) < 0;
      g.append(el('text', {
        transform: `rotate(${(izquierda ? grados + 180 : grados).toFixed(1)})`,
        x: izquierda ? -(radio + 9) : radio + 9, y: '6', 'text-anchor': izquierda ? 'end' : 'start',
      }, recortar(nombre, largoHoja(n, fondo))));
    } else {
      // La posición ya se eligió en ubicarEtiquetas, lejos de otros nodos y nombres.
      const texto = el('text', { 'text-anchor': 'middle', 'paint-order': 'stroke', stroke: '#0a0728', 'stroke-width': '6' });
      const { dx, dy, renglones } = etiquetas.get(n.id);
      renglones.forEach((r, i) => texto.append(el('tspan', { x: dx.toFixed(1), y: (dy + i * ALTO_RENGLON).toFixed(1) }, r)));
      g.append(texto);
    }

    const elegir = () => opciones.alElegir(n.id);
    g.addEventListener('click', elegir);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } });
    capaNodos.append(g);
  }
  svg.append(capaNodos);
}
