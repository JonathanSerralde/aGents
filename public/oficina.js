// Ciudad de agentes en 3D. Todo se construye con geometría propia (no hay imágenes de fondo):
// cada área es un edificio con forma propia, iluminado según su estado real del diagnóstico.
// Clic en un edificio: selecciona el área. Arrastrar: desplaza. Rueda: acerca o aleja.
// Three.js 0.160.0 vive en public/vendor: la ciudad funciona sin internet.
import * as THREE from './vendor/three.module.js';
import { AREAS_ASSETS } from './assets.js';

// Cuadrícula 3 x 4 con la plaza en una celda. Al sur se dibujan los lotes de expansión horizontal.
const MAPA = [
  ['finanzas', 'ventas', 'marketing', 'compras'],
  ['operaciones', 'rh', 'tecnologia', 'fiscal'],
  ['direccion', 'riesgos', 'crecimiento', 'plaza'],
];
// Crecimiento vertical: factor de altura de todos los edificios según el nivel (0 a 4).
const FACTOR_ALTURA = [0.8, 0.9, 1.0, 1.15, 1.3];
const COLUMNAS = MAPA[0].length;
const FILAS = MAPA.length;
const SEP = 2.35; // distancia entre centros de lote
const LOTE = 1.7;
const VISTA = 11.6;
const ALTO_MIN = 360;

const COLOR_ESTADO = { verde: 0x3ddc97, amarillo: 0xffc857, rojo: 0xff5d6c, sin_datos: 0x7d8aa5 };
// El cuerpo del edificio conserva casi todo su color; el estado se lee en el aro luminoso.
const INTENSIDAD = { verde: 0.1, amarillo: 0.1, rojo: 0.13, sin_datos: 0.02 };
const BRILLO_ARO = { verde: 1.1, amarillo: 1.2, rojo: 1.5, sin_datos: 0.25 };
const CSS_ESTADO = { verde: '#3ddc97', amarillo: '#ffc857', rojo: '#ff5d6c', sin_datos: '#7d8aa5' };

// Forma y color de cada edificio, para que se distingan (banco, centro tecnológico, planta industrial...).
const FORMAS = {
  finanzas: { tipo: 'columnas', ancho: 1.25, prof: 1.0, alto: 1.5, color: 0xdbe6ff },
  ventas: { tipo: 'tienda', ancho: 1.3, prof: 1.05, alto: 0.85, color: 0xf3e6d0 },
  marketing: { tipo: 'pantalla', ancho: 1.1, prof: 1.1, alto: 1.15, color: 0xe2d6ff },
  compras: { tipo: 'nave', ancho: 1.45, prof: 1.05, alto: 0.75, color: 0xcfe7d4 },
  operaciones: { tipo: 'industrial', ancho: 1.25, prof: 1.25, alto: 0.95, color: 0xd7dbe6 },
  rh: { tipo: 'cilindro', radio: 0.62, alto: 1.05, color: 0xd6f2ff },
  tecnologia: { tipo: 'antena', ancho: 1.0, prof: 1.0, alto: 1.35, color: 0xc8e8ff },
  fiscal: { tipo: 'clasico', ancho: 1.25, prof: 1.0, alto: 1.0, color: 0xf0e8d8 },
  riesgos: { tipo: 'torre', radio: 0.52, alto: 1.7, color: 0xd3d9ff },
  direccion: { tipo: 'torre_alta', ancho: 0.95, prof: 0.95, alto: 2.2, color: 0xe9efff },
  crecimiento: { tipo: 'escalonado', ancho: 1.3, prof: 1.3, alto: 0.55, color: 0xd9f5ea },
};

const reducida = window.matchMedia('(prefers-reduced-motion: reduce)');
const cargador = new THREE.TextureLoader();

let renderer = null;
let camara = null;
let escena = null;
let canvasRef = null;
let cuadro = null;
let animados = [];
let seleccion = null;
let objetivo = new THREE.Vector3(0, 0.7, 0.8); // un poco arriba y al sur: caben los edificios altos y la expansión
let zoom = 1;
let arrastre = null;
let onSeleccionCb = () => {};
let edificios = new Map(); // id -> grupo del área

const raycaster = new THREE.Raycaster();

// Generador pseudoaleatorio con semilla: los árboles quedan iguales en cada render.
function aleatorio(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function materialBase(color, emisivo = 0x000000, intensidad = 0) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: 0.08, emissive: emisivo, emissiveIntensity: intensidad,
  });
}

function posicion(c, r) {
  return { x: (c - (COLUMNAS - 1) / 2) * SEP, z: (r - (FILAS - 1) / 2) * SEP };
}

// Placa con nombre y estado. Textura de canvas: se escala con su proporción para no deformarse.
function crearPlaca(nombre, estadoTexto, color) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 420;
  lienzo.height = 150;
  const ctx = lienzo.getContext('2d');
  ctx.beginPath();
  ctx.roundRect(8, 8, 404, 134, 22);
  ctx.fillStyle = 'rgba(10, 16, 34, 0.9)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eef3ff';
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillText(nombre, 210, 60);
  ctx.fillStyle = color;
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.fillText(estadoTexto, 210, 110);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  // Sin prueba de profundidad: la placa siempre se lee, aunque haya un edificio delante.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, transparent: true, depthWrite: false, depthTest: false }));
  s.renderOrder = 10;
  s.center.set(0.5, 0);
  s.scale.set(1.2, 1.2 * (150 / 420), 1);
  return s;
}

// Avatar recortado en círculo con un aro del color de estado.
function crearAvatar(url, color) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 160;
  lienzo.height = 160;
  const ctx = lienzo.getContext('2d');
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, transparent: true, depthWrite: false, depthTest: false }));
  s.renderOrder = 9;
  s.center.set(0.5, 0);
  s.scale.set(0.55, 0.55, 1);

  const imagen = new Image();
  imagen.onload = () => {
    ctx.clearRect(0, 0, 160, 160);
    ctx.save();
    ctx.beginPath();
    ctx.arc(80, 80, 72, 0, Math.PI * 2);
    ctx.clip();
    const lado = Math.min(imagen.width, imagen.height);
    ctx.drawImage(imagen, (imagen.width - lado) / 2, (imagen.height - lado) / 2, lado, lado, 0, 0, 160, 160);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(80, 80, 73, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = color;
    ctx.stroke();
    textura.needsUpdate = true;
    repintar();
  };
  imagen.src = url;
  return s;
}

// Edificio según su forma. Devuelve un grupo con la altura total para colocar la placa.
function construirEdificio(id, estilo, colorEstado, intensidad) {
  const grupo = new THREE.Group();
  const emisivo = COLOR_ESTADO[colorEstado];
  const muro = materialBase(estilo.color, emisivo, intensidad);
  const techo = materialBase(0x3b4b78, emisivo, intensidad * 0.6);
  const cristal = materialBase(0x1c3a6b, emisivo, intensidad * 1.4);
  let alto = estilo.alto;
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = false;
    grupo.add(m);
    return m;
  };

  switch (estilo.tipo) {
    case 'columnas': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.BoxGeometry(estilo.ancho + 0.1, 0.1, estilo.prof + 0.1), techo, 0, alto + 0.05, 0);
      for (let i = -2; i <= 2; i++) add(new THREE.CylinderGeometry(0.04, 0.04, alto * 0.8, 8), cristal, i * 0.22, alto * 0.4, estilo.prof / 2 + 0.03);
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 20), techo, 0, alto + 0.17, 0);
      add(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), cristal, 0, alto + 0.23, 0);
      break;
    }
    case 'tienda': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.BoxGeometry(estilo.ancho * 0.9, alto * 0.45, 0.05), cristal, 0, alto * 0.35, estilo.prof / 2 + 0.02);
      add(new THREE.BoxGeometry(estilo.ancho + 0.12, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xff6b6b, emissiveIntensity: 0.2 }), 0, alto * 0.82, estilo.prof / 2 + 0.12);
      break;
    }
    case 'pantalla': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.BoxGeometry(estilo.ancho * 0.7, 0.45, 0.05), new THREE.MeshStandardMaterial({ color: 0x3fd3ff, emissive: 0x3fd3ff, emissiveIntensity: 0.8 }), 0, alto + 0.35, 0);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), techo, 0, alto + 0.12, 0);
      alto += 0.45;
      break;
    }
    case 'nave': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      const techoNave = add(new THREE.CylinderGeometry(0.02, estilo.prof * 0.55, estilo.ancho, 3, 1, false), techo, 0, alto + 0.25, 0);
      techoNave.rotation.set(0, 0, Math.PI / 2);
      techoNave.scale.set(1, 1, 0.8);
      add(new THREE.BoxGeometry(estilo.ancho * 0.5, alto * 0.6, 0.05), cristal, 0, alto * 0.35, estilo.prof / 2 + 0.02);
      alto += 0.25;
      break;
    }
    case 'industrial': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 10), techo, -0.35, alto + 0.45, -0.2);
      add(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 10), techo, 0.3, alto + 0.35, 0.15);
      add(new THREE.TorusGeometry(0.28, 0.07, 8, 18), new THREE.MeshStandardMaterial({ color: 0x9fb0cc, emissive: 0x3fd3ff, emissiveIntensity: 0.25 }), 0.05, alto + 0.12, 0.3);
      alto += 0.5;
      break;
    }
    case 'cilindro': {
      add(new THREE.CylinderGeometry(estilo.radio, estilo.radio, alto, 28), muro, 0, alto / 2, 0);
      add(new THREE.TorusGeometry(estilo.radio * 0.98, 0.05, 8, 32), cristal, 0, alto * 0.55, 0).rotation.set(Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(estilo.radio + 0.06, estilo.radio + 0.06, 0.1, 28), techo, 0, alto + 0.05, 0);
      break;
    }
    case 'antena': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.SphereGeometry(0.34, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x3fd3ff, emissiveIntensity: 0.5 }), 0, alto, 0);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), techo, 0, alto + 0.45, 0);
      alto += 0.7;
      break;
    }
    case 'clasico': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      const frontón = add(new THREE.ConeGeometry(estilo.ancho * 0.72, 0.42, 4), muro, 0, alto + 0.21, 0);
      frontón.rotation.y = Math.PI / 4;
      for (let i = -1; i <= 1; i++) add(new THREE.CylinderGeometry(0.05, 0.05, alto * 0.85, 8), cristal, i * 0.38, alto * 0.42, estilo.prof / 2 + 0.05);
      alto += 0.42;
      break;
    }
    case 'torre': {
      add(new THREE.CylinderGeometry(estilo.radio, estilo.radio * 1.1, alto, 8), muro, 0, alto / 2, 0);
      add(new THREE.ConeGeometry(estilo.radio * 0.9, 0.5, 8), techo, 0, alto + 0.25, 0);
      add(new THREE.BoxGeometry(0.06, 0.4, 0.06), cristal, 0, alto + 0.7, 0);
      alto += 0.95;
      break;
    }
    case 'torre_alta': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.BoxGeometry(estilo.ancho * 0.6, 0.6, estilo.prof * 0.6), muro, 0, alto + 0.3, 0);
      add(new THREE.SphereGeometry(0.28, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), cristal, 0, alto + 0.6, 0);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), techo, 0, alto + 1.0, 0);
      alto += 1.0;
      break;
    }
    case 'escalonado': {
      // Pirámide de tres escalones: cada nivel representa una etapa de crecimiento.
      const escalones = 3;
      for (let i = 0; i < escalones; i++) {
        const w = estilo.ancho * (1 - i * 0.28);
        add(new THREE.BoxGeometry(w, alto, w), i === escalones - 1 ? cristal : muro, 0, alto * i + alto / 2, 0);
      }
      add(new THREE.ConeGeometry(0.14, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x9fe9ff, emissive: 0x3fd3ff, emissiveIntensity: 0.7 }), 0, alto * escalones + 0.2, 0);
      alto = alto * escalones + 0.4;
      break;
    }
    default:
      add(new THREE.BoxGeometry(1, alto, 1), muro, 0, alto / 2, 0);
  }
  grupo.userData.altoTotal = alto;
  return grupo;
}

// Lotes de expansión horizontal al sur de la ciudad: uno por señal cumplida, en contorno.
function construirExpansion(horizontal) {
  const grupo = new THREE.Group();
  const total = horizontal?.max || 4;
  const logrados = horizontal?.nivel || 0;
  const zFila = (FILAS / 2) * SEP + 0.9;
  for (let i = 0; i < total; i++) {
    const x = (i - (total - 1) / 2) * 1.5;
    const activo = i < logrados;
    const lote = new THREE.Group();
    lote.position.set(x, 0, zFila);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.85), materialBase(activo ? 0x1a2148 : 0x14243a));
    base.position.y = 0.04;
    const borde = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.05, 0.08, 0.85)),
      new THREE.LineBasicMaterial({ color: activo ? 0x3ddc97 : 0x3fd3ff, transparent: true, opacity: activo ? 0.9 : 0.45 }),
    );
    borde.position.y = 0.04;
    lote.add(base, borde);
    if (activo) {
      const edificio = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.45), materialBase(0xd9f5ea, 0x3ddc97, 0.12));
      edificio.position.y = 0.33;
      lote.add(edificio);
    } else {
      const fantasma = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.55, 0.5, 0.45)),
        new THREE.LineBasicMaterial({ color: 0x3fd3ff, transparent: true, opacity: 0.35 }),
      );
      fantasma.position.y = 0.33;
      lote.add(fantasma);
    }
    grupo.add(lote);
  }
  const etiqueta = crearPlaca('Expansión', `${logrados} de ${total} señales`, logrados > 0 ? '#3ddc97' : '#3fd3ff');
  etiqueta.position.set(0, 0.95, zFila);
  grupo.add(etiqueta);
  return grupo;
}

function construirPlaza() {
  const grupo = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(LOTE * 0.5, LOTE * 0.55, 0.12, 36), materialBase(0x1f7a58));
  base.position.y = 0.06;
  grupo.add(base);
  const borde = new THREE.Mesh(new THREE.TorusGeometry(LOTE * 0.5, 0.04, 8, 48), materialBase(0x3fd3ff, 0x3fd3ff, 0.8));
  borde.rotation.x = Math.PI / 2;
  borde.position.y = 0.13;
  grupo.add(borde);

  const pileta = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.16, 32), materialBase(0xc9d8ff));
  pileta.position.y = 0.17;
  const agua = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 32), new THREE.MeshStandardMaterial({ color: 0x3fd3ff, emissive: 0x3fd3ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
  agua.position.y = 0.26;
  const chorro = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0x9fe9ff, emissive: 0x9fe9ff, emissiveIntensity: 0.7, transparent: true, opacity: 0.7 }));
  chorro.position.y = 0.45;
  grupo.add(pileta, agua, chorro);
  animados.push({ tipo: 'chorro', objeto: chorro });
  return grupo;
}

function construirArbol(x, z, rnd) {
  const grupo = new THREE.Group();
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 6), materialBase(0x6b4a2e));
  tronco.position.y = 0.11;
  const copa = new THREE.Mesh(
    rnd() > 0.5 ? new THREE.SphereGeometry(0.2, 12, 10) : new THREE.ConeGeometry(0.2, 0.5, 8),
    materialBase(rnd() > 0.5 ? 0x2fa876 : 0x23875f),
  );
  copa.position.y = 0.38;
  grupo.add(tronco, copa);
  grupo.position.set(x, 0, z);
  grupo.scale.setScalar(0.8 + rnd() * 0.5);
  return grupo;
}

function construirCiudad(resultado) {
  const rnd = aleatorio(42);
  const ancho = COLUMNAS * SEP;
  const fondo = FILAS * SEP;
  const vertical = resultado.crecimiento?.vertical?.nivel ?? 0;
  const factorAltura = FACTOR_ALTURA[Math.min(vertical, FACTOR_ALTURA.length - 1)];
  escena.add(construirExpansion(resultado.crecimiento?.horizontal));

  // Base del terreno y agua alrededor
  // El terreno se alarga al sur para dar lugar a los lotes de expansión.
  const extraSur = 2.2;
  const agua = new THREE.Mesh(new THREE.BoxGeometry(ancho + 1.6, 0.05, fondo + 1.6 + extraSur), materialBase(0x0b2440));
  agua.position.set(0, -0.03, extraSur / 2);
  const pasto = new THREE.Mesh(new THREE.BoxGeometry(ancho + 1.0, 0.1, fondo + 1.0 + extraSur), materialBase(0x2c6e49));
  pasto.position.set(0, 0.0, extraSur / 2);
  escena.add(agua, pasto);

  // Calles: franjas entre lotes con una línea luminosa
  const calle = materialBase(0x1b2033);
  const luz = new THREE.MeshBasicMaterial({ color: 0x3fd3ff, transparent: true, opacity: 0.35 });
  for (let i = 0; i <= FILAS; i++) {
    const z = (i - FILAS / 2) * SEP;
    const franja = new THREE.Mesh(new THREE.BoxGeometry(ancho + 0.4, 0.03, 0.36), calle);
    franja.position.set(0, 0.03, z);
    const linea = new THREE.Mesh(new THREE.BoxGeometry(ancho + 0.4, 0.035, 0.02), luz);
    linea.position.set(0, 0.05, z);
    escena.add(franja, linea);
  }
  for (let j = 0; j <= COLUMNAS; j++) {
    const x = (j - COLUMNAS / 2) * SEP;
    const franja = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, fondo + 0.4), calle);
    franja.position.set(x, 0.03, 0);
    const linea = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, fondo + 0.4), luz);
    linea.position.set(x, 0.05, 0);
    escena.add(franja, linea);
  }

  // Árboles en el borde de la ciudad
  for (let i = 0; i < 26; i++) {
    const lado = i % 4;
    const t = rnd() * 2 - 1;
    const margen = 1.0 + rnd() * 0.35;
    let x = 0;
    let z = 0;
    if (lado === 0) { x = t * (ancho / 2 + 0.2); z = -(fondo / 2 + margen); }
    if (lado === 1) { x = t * (ancho / 2 + 0.2); z = fondo / 2 + margen; }
    if (lado === 2) { x = -(ancho / 2 + margen); z = t * (fondo / 2 + 0.2); }
    if (lado === 3) { x = ancho / 2 + margen; z = t * (fondo / 2 + 0.2); }
    escena.add(construirArbol(x, z, rnd));
  }

  for (let r = 0; r < FILAS; r++) {
    for (let c = 0; c < COLUMNAS; c++) {
      const id = MAPA[r][c];
      const { x, z } = posicion(c, r);

      if (id === 'plaza') {
        const plaza = construirPlaza();
        plaza.position.set(x, 0, z);
        escena.add(plaza);
        continue;
      }

      const d = resultado.distritos[id];
      const color = d ? d.color : 'sin_datos';
      const estilo = { ...FORMAS[id], alto: FORMAS[id].alto * factorAltura };
      const lote = new THREE.Group();
      lote.position.set(x, 0, z);
      lote.userData = { area: id };

      // Base del lote con aro luminoso del estado
      const base = new THREE.Mesh(new THREE.CylinderGeometry(LOTE * 0.5, LOTE * 0.55, 0.12, 36), materialBase(0x1a2148));
      base.position.y = 0.06;
      base.userData = { area: id };
      const aro = new THREE.Mesh(new THREE.TorusGeometry(LOTE * 0.5, 0.045, 8, 48), materialBase(COLOR_ESTADO[color], COLOR_ESTADO[color], BRILLO_ARO[color]));
      aro.rotation.x = Math.PI / 2;
      aro.position.y = 0.13;
      lote.add(base, aro);

      const edificio = construirEdificio(id, estilo, color, INTENSIDAD[color]);
      // Se agrega el área sin reemplazar userData: ahí vive la altura total para ubicar la placa.
      lote.add(edificio);
      edificio.traverse((o) => { o.userData.area = id; });

      const altura = edificio.userData.altoTotal;
      const placa = crearPlaca(d ? d.nombre : id, etiquetaEstado(d), CSS_ESTADO[color]);
      placa.position.set(0, altura + 0.2, 0);
      lote.add(placa);

      const avatar = AREAS_ASSETS[id] ? crearAvatar(AREAS_ASSETS[id].avatar, CSS_ESTADO[color]) : null;
      if (avatar) {
        avatar.position.set(-LOTE * 0.5 + 0.05, 0.14, LOTE * 0.5 - 0.1);
        lote.add(avatar);
      }

      // Anillo de selección (oculto hasta hacer clic)
      const seleccionAnillo = new THREE.Mesh(new THREE.RingGeometry(LOTE * 0.58, LOTE * 0.68, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
      seleccionAnillo.rotation.x = -Math.PI / 2;
      seleccionAnillo.position.y = 0.16;
      seleccionAnillo.visible = false;
      lote.add(seleccionAnillo);
      lote.userData.anillo = seleccionAnillo;

      if (color === 'rojo' || color === 'amarillo') animados.push({ tipo: 'pulso', objeto: aro, base: BRILLO_ARO[color] });

      edificios.set(id, lote);
      escena.add(lote);
    }
  }
}

function etiquetaEstado(d) {
  if (!d) return 'Sin datos';
  if (d.color === 'verde') return 'Listo';
  if (d.color === 'sin_datos') return 'Sin datos';
  return 'Revisar';
}

function repintar() {
  if (reducida.matches && renderer && escena) renderer.render(escena, camara);
}

function dimensionar() {
  const w = canvasRef.clientWidth || 800;
  const h = Math.max(ALTO_MIN, Math.round(w * 0.6));
  renderer.setSize(w, h, false);
  canvasRef.style.height = `${h}px`;
  const aspecto = w / h;
  camara.left = (-VISTA * aspecto) / 2;
  camara.right = (VISTA * aspecto) / 2;
  camara.top = VISTA / 2;
  camara.bottom = -VISTA / 2;
  camara.zoom = zoom;
  camara.updateProjectionMatrix();
  ubicarCamara();
  repintar();
}

function ubicarCamara() {
  camara.position.set(objetivo.x + 10, objetivo.y + 12, objetivo.z + 10);
  camara.lookAt(objetivo);
}

function paso(tiempo) {
  for (const a of animados) {
    if (a.tipo === 'pulso') a.objeto.material.emissiveIntensity = a.base * (0.75 + Math.sin(tiempo * 0.005) * 0.25);
    if (a.tipo === 'chorro') a.objeto.scale.y = 0.9 + Math.sin(tiempo * 0.006) * 0.1;
  }
  renderer.render(escena, camara);
  cuadro = requestAnimationFrame(paso);
}

function marcarSeleccion(id) {
  for (const [area, lote] of edificios) lote.userData.anillo.visible = area === id;
  seleccion = id;
  repintar();
}

function iniciarRenderer(canvas) {
  canvasRef = canvas;
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.min(2.2, Math.max(0.7, zoom - e.deltaY * 0.0012));
    dimensionar();
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    arrastre = { x: e.clientX, y: e.clientY, movido: false };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x;
    const dy = e.clientY - arrastre.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) arrastre.movido = true;
    if (!arrastre.movido) return;
    // Unidades del mundo por píxel. El objetivo se mueve en sentido contrario al arrastre,
    // por el plano del suelo: derecha = (1, 0, -1)/√2 y abajo en pantalla = (1, 0, 1)/√2.
    const escala = VISTA / canvas.clientHeight / zoom;
    objetivo.x -= ((dx + dy) * escala) / Math.SQRT2;
    objetivo.z -= ((dy - dx) * escala) / Math.SQRT2;
    ubicarCamara();
    repintar();
    arrastre.x = e.clientX;
    arrastre.y = e.clientY;
  });

  canvas.addEventListener('pointerup', (e) => {
    const fueClic = arrastre && !arrastre.movido;
    arrastre = null;
    if (!fueClic) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camara);
    const objetivos = [...edificios.values()];
    // El rayo puede tocar primero un aro, un sprite o el anillo invisible de selección:
    // se ignoran los ocultos y se sube por la jerarquía hasta encontrar el lote con su área.
    const hits = raycaster.intersectObjects(objetivos, true).filter((h) => h.object.visible);
    let nodo = hits.length ? hits[0].object : null;
    while (nodo && !nodo.userData.area) nodo = nodo.parent;
    const area = nodo ? nodo.userData.area : null;
    if (area) {
      marcarSeleccion(area);
      onSeleccionCb(area);
    }
  });

  window.addEventListener('resize', () => { if (escena) dimensionar(); });
}

// Dibuja la ciudad. onSeleccion(id) se llama al hacer clic en un edificio.
export function renderOficina(canvas, resultado, opciones = {}) {
  if (opciones.onSeleccion) onSeleccionCb = opciones.onSeleccion;
  if (cuadro) cancelAnimationFrame(cuadro);
  cuadro = null;
  animados = [];
  edificios = new Map();
  if (escena) escena.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  escena = null;
  if (!resultado) return;

  iniciarRenderer(canvas);
  escena = new THREE.Scene();
  escena.add(new THREE.HemisphereLight(0xdff3ff, 0x1a2a40, 1.1));
  const sol = new THREE.DirectionalLight(0xffffff, 1.1);
  sol.position.set(6, 10, 4);
  escena.add(sol);

  construirCiudad(resultado);
  if (seleccion && !edificios.has(seleccion)) seleccion = null;
  if (seleccion) marcarSeleccion(seleccion);

  dimensionar();
  if (reducida.matches) renderer.render(escena, camara);
  else cuadro = requestAnimationFrame(paso);
}

// Selecciona un área desde fuera (por ejemplo, una tarjeta del equipo).
export function seleccionarArea(id) {
  if (!edificios.has(id)) return;
  marcarSeleccion(id);
}
