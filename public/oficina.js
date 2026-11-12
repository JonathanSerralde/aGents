// Ciudad de agentes en 3D: una ciudad nocturna de cristal y neón construida con geometría propia
// (no hay imágenes de fondo). Cada área es un edificio con forma propia; su estado real del diagnóstico
// se lee en el aro, las aristas y los acentos luminosos. En la plaza vive el núcleo del Orquestador,
// conectado con cada edificio.
// Clic en un edificio: selecciona el área. Arrastrar: gira la cámara. Mayús + arrastrar: desplaza.
// Ctrl + rueda (o los botones de la escena): acerca o aleja.
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

const CIAN = 0x25e2ff;
const VIOLETA = 0x8b5cf6;
const MAGENTA = 0xe24bf2;
const COLOR_ESTADO = { verde: 0x2ef0b5, amarillo: 0xffb23e, rojo: 0xff3d8b, sin_datos: 0x8b93b8 };
const CSS_ESTADO = { verde: '#2ef0b5', amarillo: '#ffb23e', rojo: '#ff3d8b', sin_datos: '#8b93b8' };
const BRILLO_ARO = { verde: 1, amarillo: 1, rojo: 1, sin_datos: 0.45 };

// Forma y tinte de cada edificio, para que se distingan (banco, centro tecnológico, planta industrial...).
const FORMAS = {
  finanzas: { tipo: 'columnas', ancho: 1.25, prof: 1.0, alto: 1.5, color: 0x3a4cae },
  ventas: { tipo: 'tienda', ancho: 1.3, prof: 1.05, alto: 0.85, color: 0x8a45a0 },
  marketing: { tipo: 'pantalla', ancho: 1.1, prof: 1.1, alto: 1.15, color: 0x6748cf },
  compras: { tipo: 'nave', ancho: 1.45, prof: 1.05, alto: 0.75, color: 0x2f7890 },
  operaciones: { tipo: 'industrial', ancho: 1.25, prof: 1.25, alto: 0.95, color: 0x46528a },
  rh: { tipo: 'cilindro', radio: 0.62, alto: 1.05, color: 0x2f7fb4 },
  tecnologia: { tipo: 'antena', ancho: 1.0, prof: 1.0, alto: 1.35, color: 0x2a62c4 },
  fiscal: { tipo: 'clasico', ancho: 1.25, prof: 1.0, alto: 1.0, color: 0x7654a6 },
  riesgos: { tipo: 'torre', radio: 0.52, alto: 1.7, color: 0x5443bd },
  direccion: { tipo: 'torre_alta', ancho: 0.95, prof: 0.95, alto: 2.2, color: 0x4349b8 },
  crecimiento: { tipo: 'escalonado', ancho: 1.3, prof: 1.3, alto: 0.55, color: 0x2c8c8c },
};

// Vistas de cámara: ángulo horizontal, ángulo desde la vertical y distancia.
const VISTAS_CAMARA = {
  isometrica: { azim: Math.PI / 4, polar: 0.95, dist: 16.8 },
  panoramica: { azim: 0.42, polar: 1.27, dist: 14.5 },
  aerea: { azim: 0, polar: 0.06, dist: 21 },
};
const CENTRO = new THREE.Vector3(0, 1.15, 0.9); // un poco al sur: caben los lotes de expansión

const reducida = window.matchMedia('(prefers-reduced-motion: reduce)');

let renderer = null;
let camara = null;
let escena = null;
let canvasRef = null;
let cuadro = null;
let animados = [];
let seleccion = null;
let sobre = null; // área bajo el puntero
let arrastre = null;
let onSeleccionCb = () => {};
let edificios = new Map(); // id -> grupo del área
let enlaces = new Map(); // id -> { pulso, curva } del núcleo al edificio
let cuerpos = new Set(); // materiales sólidos que se vuelven traslúcidos en rayos X
let aristas = new Set(); // materiales de las aristas luminosas
let texturas = new Set();
let trabajando = new Set(); // áreas con un agente trabajando ahora
let modoRayosX = false;
let modoOrbita = false;
let vistaActual = 'isometrica';
let anterior = 0;
const objetivo = CENTRO.clone();
const cam = { ...VISTAS_CAMARA.isometrica };
const destino = { ...VISTAS_CAMARA.isometrica };

const raycaster = new THREE.Raycaster();

// Generador pseudoaleatorio con semilla: ventanas y partículas quedan iguales en cada render.
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

function posicion(c, r) {
  return { x: (c - (COLUMNAS - 1) / 2) * SEP, z: (r - (FILAS - 1) / 2) * SEP };
}

// ---------- Texturas generadas ----------

function registrar(textura) {
  texturas.add(textura);
  return textura;
}

// Resplandor radial para halos, haces y partículas (mezcla aditiva).
function texturaHalo() {
  const lienzo = document.createElement('canvas');
  lienzo.width = 128;
  lienzo.height = 128;
  const ctx = lienzo.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return registrar(new THREE.CanvasTexture(lienzo));
}

// Fachada con ventanas encendidas al azar: se usa como mapa emisivo del muro.
function texturaVentanas(rnd) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 256;
  lienzo.height = 256;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 12; x++) {
      const v = rnd();
      if (v < 0.42) continue;
      ctx.fillStyle = `rgba(255,255,255,${(0.15 + v * v * 0.85).toFixed(2)})`;
      ctx.fillRect(x * 21.33 + 5, y * 16 + 5, 11, 6);
    }
  }
  const t = new THREE.CanvasTexture(lienzo);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return registrar(t);
}

let haloTex = null;
let ventanasTex = null;

function halo(color, escala, opacidad = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity: opacidad, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(escala, escala, 1);
  return s;
}

// Placa con nombre y estado. Textura de canvas: se escala con su proporción para no deformarse.
function crearPlaca(nombre, estadoTexto, color) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 512;
  lienzo.height = 168;
  const ctx = lienzo.getContext('2d');
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 152, 40);
  ctx.fillStyle = 'rgba(9, 6, 28, 0.86)';
  ctx.fill();
  const borde = ctx.createLinearGradient(0, 0, 512, 168);
  borde.addColorStop(0, 'rgba(255,255,255,0.75)');
  borde.addColorStop(0.5, color);
  borde.addColorStop(1, 'rgba(139,92,246,0.7)');
  ctx.lineWidth = 4;
  ctx.strokeStyle = borde;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4f6ff';
  let tam = 46;
  ctx.font = `600 ${tam}px Bahnschrift, "Segoe UI", system-ui, sans-serif`;
  while (ctx.measureText(nombre).width > 440 && tam > 26) {
    tam -= 2;
    ctx.font = `600 ${tam}px Bahnschrift, "Segoe UI", system-ui, sans-serif`;
  }
  ctx.fillText(nombre, 256, 64);
  ctx.font = '600 30px Bahnschrift, "Segoe UI", system-ui, sans-serif';
  const anchoTexto = ctx.measureText(estadoTexto).width;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(256 - anchoTexto / 2 - 18, 118, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(estadoTexto, 256 + 6, 119);
  const textura = registrar(new THREE.CanvasTexture(lienzo));
  textura.colorSpace = THREE.SRGBColorSpace;
  // Sin prueba de profundidad: la placa siempre se lee, aunque haya un edificio delante.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, transparent: true, depthWrite: false, depthTest: false }));
  s.renderOrder = 10;
  s.center.set(0.5, 0);
  s.scale.set(1.45, 1.45 * (168 / 512), 1);
  return s;
}

// Avatar recortado en círculo con un aro del color de estado.
function crearAvatar(url, color) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 160;
  lienzo.height = 160;
  const ctx = lienzo.getContext('2d');
  const textura = registrar(new THREE.CanvasTexture(lienzo));
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
    ctx.fillStyle = '#120d33';
    ctx.fillRect(0, 0, 160, 160);
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

// ---------- Materiales ----------

function materialCuerpo(opciones) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.45, ...opciones });
  cuerpos.add(m);
  return m;
}

function materialNeon(color, opacidad = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacidad < 1, opacity: opacidad });
}

function materialArista(color, opacidad = 0.55) {
  const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacidad });
  m.userData.base = opacidad;
  aristas.add(m);
  return m;
}

// Edificio según su forma. Devuelve un grupo con la altura total para colocar la placa.
function construirEdificio(id, estilo, colorEstado) {
  const grupo = new THREE.Group();
  const tono = COLOR_ESTADO[colorEstado];
  const fachada = ventanasTex.clone();
  fachada.needsUpdate = true;
  fachada.repeat.set(1, Math.max(2, Math.round(estilo.alto * 2.2)) / 4);
  registrar(fachada);
  const luzVentana = new THREE.Color(0xbfe9ff).lerp(new THREE.Color(tono), 0.35);
  const muro = materialCuerpo({ color: new THREE.Color(estilo.color).multiplyScalar(0.5), emissive: luzVentana, emissiveMap: fachada, emissiveIntensity: 0.95, metalness: 0.6, roughness: 0.28 });
  const techo = materialCuerpo({ color: 0x1c1746, metalness: 0.7, roughness: 0.25, emissive: tono, emissiveIntensity: 0.12 });
  // Los acentos (cúpulas, columnas, vitrales) brillan con el color del estado del área.
  const cristal = materialCuerpo({ color: tono, emissive: tono, emissiveIntensity: colorEstado === 'sin_datos' ? 0.35 : 0.95, metalness: 0.2, roughness: 0.2 });
  const linea = materialArista(new THREE.Color(0xffffff).lerp(new THREE.Color(tono), 0.55));
  let alto = estilo.alto;
  const add = (geo, mat, x = 0, y = 0, z = 0, conArista = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    grupo.add(m);
    if (conArista) {
      const borde = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), linea);
      m.add(borde);
    }
    return m;
  };

  switch (estilo.tipo) {
    case 'columnas': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.BoxGeometry(estilo.ancho + 0.1, 0.1, estilo.prof + 0.1), techo, 0, alto + 0.05, 0);
      for (let i = -2; i <= 2; i++) add(new THREE.CylinderGeometry(0.04, 0.04, alto * 0.8, 8), cristal, i * 0.22, alto * 0.4, estilo.prof / 2 + 0.03, false);
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 20), techo, 0, alto + 0.17, 0, false);
      add(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), cristal, 0, alto + 0.23, 0, false);
      break;
    }
    case 'tienda': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.BoxGeometry(estilo.ancho * 0.9, alto * 0.45, 0.05), cristal, 0, alto * 0.35, estilo.prof / 2 + 0.02, false);
      add(new THREE.BoxGeometry(estilo.ancho + 0.12, 0.12, 0.3), materialCuerpo({ color: MAGENTA, emissive: MAGENTA, emissiveIntensity: 0.7 }), 0, alto * 0.82, estilo.prof / 2 + 0.12);
      add(new THREE.BoxGeometry(estilo.ancho + 0.08, 0.08, estilo.prof + 0.08), techo, 0, alto + 0.04, 0);
      break;
    }
    case 'pantalla': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.BoxGeometry(estilo.ancho + 0.08, 0.08, estilo.prof + 0.08), techo, 0, alto + 0.04, 0);
      add(new THREE.BoxGeometry(estilo.ancho * 0.8, 0.5, 0.05), materialCuerpo({ color: CIAN, emissive: CIAN, emissiveIntensity: 1.1 }), 0, alto + 0.42, 0);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), techo, 0, alto + 0.16, 0, false);
      alto += 0.55;
      break;
    }
    case 'nave': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      const techoNave = add(new THREE.CylinderGeometry(0.02, estilo.prof * 0.55, estilo.ancho, 3, 1, false), techo, 0, alto + 0.25, 0);
      techoNave.rotation.set(0, 0, Math.PI / 2);
      techoNave.scale.set(1, 1, 0.8);
      add(new THREE.BoxGeometry(estilo.ancho * 0.5, alto * 0.6, 0.05), cristal, 0, alto * 0.35, estilo.prof / 2 + 0.02, false);
      alto += 0.25;
      break;
    }
    case 'industrial': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.BoxGeometry(estilo.ancho + 0.08, 0.08, estilo.prof + 0.08), techo, 0, alto + 0.04, 0);
      add(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 10), techo, -0.35, alto + 0.45, -0.2);
      add(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 10), techo, 0.3, alto + 0.35, 0.15);
      add(new THREE.TorusGeometry(0.28, 0.07, 8, 18), cristal, 0.05, alto + 0.14, 0.3, false);
      alto += 0.5;
      break;
    }
    case 'cilindro': {
      add(new THREE.CylinderGeometry(estilo.radio, estilo.radio, alto, 28), muro, 0, alto / 2, 0);
      add(new THREE.TorusGeometry(estilo.radio * 1.01, 0.05, 8, 32), cristal, 0, alto * 0.55, 0, false).rotation.set(Math.PI / 2, 0, 0);
      add(new THREE.CylinderGeometry(estilo.radio + 0.06, estilo.radio + 0.06, 0.1, 28), techo, 0, alto + 0.05, 0);
      break;
    }
    case 'antena': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.BoxGeometry(estilo.ancho + 0.08, 0.06, estilo.prof + 0.08), techo, 0, alto + 0.03, 0);
      add(new THREE.SphereGeometry(0.34, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), cristal, 0, alto + 0.05, 0, false);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), techo, 0, alto + 0.5, 0, false);
      alto += 0.75;
      break;
    }
    case 'clasico': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      const fronton = add(new THREE.ConeGeometry(estilo.ancho * 0.72, 0.42, 4), techo, 0, alto + 0.21, 0);
      fronton.rotation.y = Math.PI / 4;
      for (let i = -1; i <= 1; i++) add(new THREE.CylinderGeometry(0.05, 0.05, alto * 0.85, 8), cristal, i * 0.38, alto * 0.42, estilo.prof / 2 + 0.05, false);
      alto += 0.42;
      break;
    }
    case 'torre': {
      add(new THREE.CylinderGeometry(estilo.radio, estilo.radio * 1.1, alto, 8), muro, 0, alto / 2, 0);
      add(new THREE.ConeGeometry(estilo.radio * 0.9, 0.5, 8), techo, 0, alto + 0.25, 0);
      add(new THREE.BoxGeometry(0.06, 0.4, 0.06), cristal, 0, alto + 0.7, 0, false);
      alto += 0.95;
      break;
    }
    case 'torre_alta': {
      add(new THREE.BoxGeometry(estilo.ancho, alto, estilo.prof), muro, 0, alto / 2, 0);
      add(new THREE.BoxGeometry(estilo.ancho * 0.6, 0.6, estilo.prof * 0.6), muro, 0, alto + 0.3, 0);
      add(new THREE.SphereGeometry(0.28, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), cristal, 0, alto + 0.6, 0, false);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), techo, 0, alto + 1.0, 0, false);
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
      add(new THREE.ConeGeometry(0.14, 0.4, 8), cristal, 0, alto * escalones + 0.2, 0, false);
      alto = alto * escalones + 0.4;
      break;
    }
    default:
      add(new THREE.BoxGeometry(1, alto, 1), muro, 0, alto / 2, 0);
  }
  grupo.userData.altoTotal = alto;
  return grupo;
}

// Lotes de expansión horizontal al sur de la ciudad: uno por señal cumplida, en holograma los que faltan.
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
    const geoBase = new THREE.BoxGeometry(1.05, 0.08, 0.85);
    const base = new THREE.Mesh(geoBase, materialCuerpo({ color: activo ? 0x1d1a52 : 0x110e30 }));
    base.position.y = 0.19;
    const borde = new THREE.LineSegments(new THREE.EdgesGeometry(geoBase), materialArista(activo ? COLOR_ESTADO.verde : CIAN, activo ? 0.95 : 0.45));
    base.add(borde);
    lote.add(base);
    const geoEdificio = new THREE.BoxGeometry(0.55, 0.5, 0.45);
    if (activo) {
      const edificio = new THREE.Mesh(geoEdificio, materialCuerpo({ color: 0x2c8c8c, emissive: COLOR_ESTADO.verde, emissiveIntensity: 0.35 }));
      edificio.position.y = 0.48;
      edificio.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoEdificio), materialArista(COLOR_ESTADO.verde, 0.8)));
      lote.add(edificio);
    } else {
      const fantasma = new THREE.LineSegments(new THREE.EdgesGeometry(geoEdificio), materialArista(CIAN, 0.35));
      fantasma.position.y = 0.48;
      lote.add(fantasma);
    }
    grupo.add(lote);
  }
  const etiqueta = crearPlaca('Expansión', `${logrados} de ${total} señales`, logrados > 0 ? CSS_ESTADO.verde : '#25e2ff');
  etiqueta.position.set(0, 1.05, zFila);
  etiqueta.scale.multiplyScalar(0.85);
  grupo.add(etiqueta);
  return grupo;
}

// Plaza central: el núcleo del Orquestador, que coordina a todos los edificios.
function construirNucleo() {
  const grupo = new THREE.Group();
  grupo.userData = { area: 'orquestador' };
  const base = new THREE.Mesh(new THREE.CylinderGeometry(LOTE * 0.5, LOTE * 0.56, 0.14, 48), materialCuerpo({ color: 0x151040, metalness: 0.8, roughness: 0.2 }));
  base.position.y = 0.22;
  const aro = new THREE.Mesh(new THREE.TorusGeometry(LOTE * 0.5, 0.035, 8, 64), materialNeon(CIAN));
  aro.rotation.x = Math.PI / 2;
  aro.position.y = 0.3;
  grupo.add(base, aro);

  const centro = new THREE.Group();
  centro.position.y = 1.15;
  const esfera = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: VIOLETA, emissiveIntensity: 1.6, metalness: 0.9, roughness: 0.1 }));
  const jaula = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.5, 1)), new THREE.LineBasicMaterial({ color: CIAN, transparent: true, opacity: 0.9 }));
  const anillo1 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.018, 8, 64), materialNeon(MAGENTA));
  anillo1.rotation.x = 1.15;
  const anillo2 = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.014, 8, 64), materialNeon(CIAN));
  anillo2.rotation.set(0.5, 0.6, 0);
  centro.add(esfera, jaula, anillo1, anillo2, halo(VIOLETA, 2.6, 0.9), halo(CIAN, 1.2, 0.8));
  grupo.add(centro);

  // Columna de energía que sube desde la plaza.
  const columna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.3, 0.9, 20, 1, true), new THREE.MeshBasicMaterial({ color: CIAN, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  columna.position.y = 0.72;
  grupo.add(columna);

  const luz = new THREE.PointLight(CIAN, 26, 9, 2);
  luz.position.y = 1.3;
  grupo.add(luz);

  const placa = crearPlaca('Orquestador', 'Coordina la oficina', '#25e2ff');
  placa.position.set(0, 2.15, 0);
  grupo.add(placa);
  // Los halos no cuentan para el clic: son más grandes que el núcleo y taparían a los vecinos.
  grupo.traverse((o) => { if (!o.isSprite || o === placa) o.userData.area = 'orquestador'; });

  animados.push({ tipo: 'nucleo', esfera, jaula, anillo1, anillo2, centro });
  return grupo;
}

// Enlace luminoso del núcleo a un edificio, con un pulso que lo recorre.
function construirEnlace(id, desde, hasta, color) {
  const medio = desde.clone().add(hasta).multiplyScalar(0.5);
  medio.y = 1.9 + desde.distanceTo(hasta) * 0.12;
  const curva = new THREE.QuadraticBezierCurve3(desde, medio, hasta);
  const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curva.getPoints(28)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.2 }));
  const pulso = halo(color, 0.34, 0.95);
  escena.add(linea, pulso);
  const datos = { curva, pulso, linea, desfase: (enlaces.size * 0.137) % 1 };
  enlaces.set(id, datos);
  return datos;
}

function construirSuelo(ancho, fondo, extraSur) {
  const grupo = new THREE.Group();
  // Plataforma de metal oscuro con canto luminoso.
  const geo = new THREE.BoxGeometry(ancho + 1.5, 0.3, fondo + 1.5 + extraSur);
  const losa = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x0d0a2a, metalness: 0.35, roughness: 0.7 }));
  losa.position.set(0, 0, extraSur / 2);
  const canto = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: VIOLETA, transparent: true, opacity: 0.9 }));
  losa.add(canto);
  grupo.add(losa);

  // Trama fina sobre la plataforma.
  const trama = new THREE.GridHelper(Math.max(ancho, fondo + extraSur) + 1.4, 26, 0x4b3aa8, 0x2a1f6e);
  trama.material.transparent = true;
  trama.material.opacity = 0.5;
  trama.position.set(0, 0.153, extraSur / 2);
  grupo.add(trama);

  // Retícula holográfica que se pierde en la niebla.
  const reticula = new THREE.GridHelper(80, 80, VIOLETA, 0x3a2a8a);
  reticula.material.transparent = true;
  reticula.material.opacity = 0.28;
  reticula.position.y = -0.16;
  grupo.add(reticula);

  // Calles: líneas de luz entre los lotes.
  const luz = new THREE.MeshBasicMaterial({ color: CIAN, transparent: true, opacity: 0.55 });
  const luz2 = new THREE.MeshBasicMaterial({ color: VIOLETA, transparent: true, opacity: 0.55 });
  for (let i = 0; i <= FILAS; i++) {
    const linea = new THREE.Mesh(new THREE.BoxGeometry(ancho + 0.4, 0.012, 0.03), i % 2 ? luz2 : luz);
    linea.position.set(0, 0.157, (i - FILAS / 2) * SEP);
    grupo.add(linea);
  }
  for (let j = 0; j <= COLUMNAS; j++) {
    const linea = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, fondo + 0.4), j % 2 ? luz : luz2);
    linea.position.set((j - COLUMNAS / 2) * SEP, 0.157, 0);
    grupo.add(linea);
  }
  return grupo;
}

// Partículas suspendidas sobre la ciudad y drones que la patrullan.
function construirAmbiente(rnd) {
  const n = 220;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rnd() - 0.5) * 34;
    pos[i * 3 + 1] = 0.6 + rnd() * 9;
    pos[i * 3 + 2] = (rnd() - 0.5) * 30;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const polvo = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb9a8ff, size: 0.09, map: haloTex, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  escena.add(polvo);
  animados.push({ tipo: 'polvo', objeto: polvo });

  const colores = [CIAN, MAGENTA, 0xffffff];
  for (let i = 0; i < 3; i++) {
    const dron = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: 0xdfe6ff, emissive: colores[i], emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.2 }));
    dron.add(cuerpo, halo(colores[i], 0.7, 0.8));
    escena.add(dron);
    animados.push({ tipo: 'dron', objeto: dron, radio: 3.6 + i * 1.5, alto: 3.1 + i * 0.5, velocidad: (0.22 - i * 0.05) * (i % 2 ? -1 : 1), fase: i * 2.1 });
  }
}

function construirCiudad(resultado) {
  const rnd = aleatorio(42);
  const ancho = COLUMNAS * SEP;
  const fondo = FILAS * SEP;
  const extraSur = 2.2;
  const vertical = resultado.crecimiento?.vertical?.nivel ?? 0;
  const factorAltura = FACTOR_ALTURA[Math.min(vertical, FACTOR_ALTURA.length - 1)];

  haloTex = texturaHalo();
  ventanasTex = texturaVentanas(rnd);

  escena.add(construirSuelo(ancho, fondo, extraSur));
  escena.add(construirExpansion(resultado.crecimiento?.horizontal));
  construirAmbiente(rnd);

  let nucleo = null;
  const pendientes = [];

  for (let r = 0; r < FILAS; r++) {
    for (let c = 0; c < COLUMNAS; c++) {
      const id = MAPA[r][c];
      const { x, z } = posicion(c, r);

      if (id === 'plaza') {
        nucleo = construirNucleo();
        nucleo.position.set(x, 0, z);
        escena.add(nucleo);
        continue;
      }

      const d = resultado.distritos[id];
      const color = d ? d.color : 'sin_datos';
      const tono = COLOR_ESTADO[color];
      const estilo = { ...FORMAS[id], alto: FORMAS[id].alto * factorAltura };
      const lote = new THREE.Group();
      lote.position.set(x, 0, z);
      lote.userData = { area: id };

      // Base del lote con aro luminoso del estado y un resplandor sobre el piso.
      const base = new THREE.Mesh(new THREE.CylinderGeometry(LOTE * 0.5, LOTE * 0.55, 0.12, 40), materialCuerpo({ color: 0x17123f, metalness: 0.75, roughness: 0.25 }));
      base.position.y = 0.21;
      const aro = new THREE.Mesh(new THREE.TorusGeometry(LOTE * 0.5, 0.04, 8, 56), materialNeon(tono, BRILLO_ARO[color]));
      aro.rotation.x = Math.PI / 2;
      aro.position.y = 0.28;
      const resplandor = new THREE.Mesh(new THREE.PlaneGeometry(LOTE * 1.9, LOTE * 1.9), new THREE.MeshBasicMaterial({ map: haloTex, color: tono, transparent: true, opacity: color === 'sin_datos' ? 0.12 : 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
      resplandor.rotation.x = -Math.PI / 2;
      resplandor.position.y = 0.165;
      lote.add(base, aro, resplandor);

      const edificio = construirEdificio(id, estilo, color);
      edificio.position.y = 0.27;
      lote.add(edificio);

      const altura = edificio.userData.altoTotal + 0.27;

      if (color === 'rojo' || color === 'amarillo') animados.push({ tipo: 'pulso', objeto: aro, resplandor });

      // Todo lo anterior responde al clic; placa y avatar también llevan su área.
      lote.traverse((o) => { o.userData.area = id; });

      // Las áreas en atención llevan una baliza: un haz vertical que se ve desde cualquier ángulo.
      if (color === 'rojo') {
        const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.02, LOTE * 0.5, altura + 2.4, 24, 1, true), new THREE.MeshBasicMaterial({ color: tono, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        haz.position.y = (altura + 2.4) / 2 + 0.2;
        lote.add(haz);
        animados.push({ tipo: 'haz', objeto: haz });
      }
      const placa = crearPlaca(d ? d.nombre : id, etiquetaEstado(d), CSS_ESTADO[color]);
      placa.position.set(0, altura + 0.22, 0);
      placa.userData.area = id;
      lote.add(placa);

      const avatar = AREAS_ASSETS[id] ? crearAvatar(AREAS_ASSETS[id].avatar, CSS_ESTADO[color]) : null;
      if (avatar) {
        avatar.position.set(-LOTE * 0.5 + 0.05, 0.3, LOTE * 0.5 - 0.1);
        avatar.userData.area = id;
        lote.add(avatar);
      }

      // Anillo de selección (oculto hasta hacer clic)
      const anillo = new THREE.Mesh(new THREE.RingGeometry(LOTE * 0.6, LOTE * 0.68, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
      anillo.rotation.x = -Math.PI / 2;
      anillo.position.y = 0.18;
      anillo.visible = false;
      lote.add(anillo);
      lote.userData.anillo = anillo;
      lote.userData.escala = 1;

      edificios.set(id, lote);
      escena.add(lote);
      pendientes.push({ id, punto: new THREE.Vector3(x, altura * 0.72, z), tono });
    }
  }

  if (nucleo) {
    const origen = new THREE.Vector3(nucleo.position.x, 1.15, nucleo.position.z);
    for (const p of pendientes) construirEnlace(p.id, origen, p.punto, p.tono);
  }
}

function etiquetaEstado(d) {
  if (!d) return 'Sin datos';
  if (d.color === 'verde') return 'Bien';
  if (d.color === 'sin_datos') return 'Sin datos';
  return d.color === 'rojo' ? 'Atención' : 'Revisar';
}

// ---------- Cámara ----------

function ubicarCamara() {
  const aspecto = camara.aspect || 1.6;
  // En pantallas angostas la ciudad se aleja para caber a lo ancho.
  const dist = cam.dist * Math.max(1, 1.3 / aspecto);
  const s = Math.sin(cam.polar);
  camara.position.set(objetivo.x + dist * s * Math.sin(cam.azim), objetivo.y + dist * Math.cos(cam.polar), objetivo.z + dist * s * Math.cos(cam.azim));
  camara.lookAt(objetivo);
}

function dimensionar() {
  if (!renderer || !canvasRef) return;
  const w = canvasRef.clientWidth;
  const h = canvasRef.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camara.aspect = w / h;
  camara.updateProjectionMatrix();
  ubicarCamara();
  repintar();
}

function dibujar() {
  if (renderer && escena) renderer.render(escena, camara);
}

// Con movimiento reducido no hay ciclo de animación: se pinta solo cuando algo cambia.
function repintar() {
  if (!cuadro) dibujar();
}

function aplicarRayosX() {
  for (const m of cuerpos) {
    m.transparent = modoRayosX;
    m.opacity = modoRayosX ? 0.1 : 1;
    m.depthWrite = !modoRayosX;
    m.needsUpdate = true;
  }
  for (const m of aristas) m.opacity = modoRayosX ? 1 : m.userData.base;
}

function paso(tiempo) {
  cuadro = requestAnimationFrame(paso);
  // La ciudad no gasta recursos mientras su vista está oculta.
  if (!canvasRef || canvasRef.offsetParent === null) return;
  const dt = Math.min(0.05, (tiempo - anterior) / 1000 || 0.016);
  anterior = tiempo;
  const t = tiempo / 1000;

  if (modoOrbita && !arrastre) destino.azim += dt * 0.22;
  const k = 1 - Math.exp(-dt * 5);
  cam.azim += (destino.azim - cam.azim) * k;
  cam.polar += (destino.polar - cam.polar) * k;
  cam.dist += (destino.dist - cam.dist) * k;
  ubicarCamara();

  for (const a of animados) {
    if (a.tipo === 'pulso') {
      const v = 0.72 + Math.sin(t * 3.2) * 0.28;
      a.objeto.material.opacity = v;
      a.objeto.material.transparent = true;
      a.resplandor.material.opacity = 0.25 + v * 0.3;
    } else if (a.tipo === 'haz') {
      a.objeto.material.opacity = 0.07 + (Math.sin(t * 2.4) + 1) * 0.045;
    } else if (a.tipo === 'nucleo') {
      a.esfera.rotation.y = t * 0.6;
      a.jaula.rotation.set(t * 0.35, -t * 0.5, 0);
      a.anillo1.rotation.z = t * 0.7;
      a.anillo2.rotation.z = -t * 0.45;
      a.centro.position.y = 1.15 + Math.sin(t * 1.3) * 0.06;
    } else if (a.tipo === 'polvo') {
      a.objeto.rotation.y = t * 0.012;
    } else if (a.tipo === 'dron') {
      const ang = a.fase + t * a.velocidad;
      a.objeto.position.set(Math.cos(ang) * a.radio, a.alto + Math.sin(t * 1.1 + a.fase) * 0.25, 0.4 + Math.sin(ang) * a.radio * 0.8);
      a.objeto.rotation.y = t * 2;
    }
  }

  // Pulsos del Orquestador hacia cada área: más rápidos y brillantes si su agente está trabajando.
  for (const [id, e] of enlaces) {
    const activo = trabajando.has(id);
    const u = (t * (activo ? 0.7 : 0.16) + e.desfase) % 1;
    e.pulso.position.copy(e.curva.getPoint(u));
    e.pulso.material.opacity = (activo ? 1 : 0.55) * Math.sin(u * Math.PI);
    e.pulso.scale.setScalar(activo ? 0.6 : 0.3);
    e.linea.material.opacity = activo ? 0.75 : 0.2;
  }

  // El edificio bajo el puntero o seleccionado se eleva un poco.
  for (const [id, lote] of edificios) {
    const meta = id === sobre || id === seleccion ? 1.06 : 1;
    lote.userData.escala += (meta - lote.userData.escala) * 0.18;
    lote.scale.setScalar(lote.userData.escala);
  }

  dibujar();
}

function marcarSeleccion(id) {
  for (const [area, lote] of edificios) lote.userData.anillo.visible = area === id;
  seleccion = id;
  repintar();
}

function areaEn(evento) {
  const rect = canvasRef.getBoundingClientRect();
  const ndc = new THREE.Vector2(((evento.clientX - rect.left) / rect.width) * 2 - 1, -((evento.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camara);
  // El rayo puede tocar primero un aro, un sprite o el anillo invisible de selección:
  // se ignoran los ocultos y se sube por la jerarquía hasta encontrar el lote con su área.
  const hits = raycaster.intersectObjects(escena.children, true).filter((h) => h.object.visible && h.object.userData.area);
  return hits.length ? hits[0].object.userData.area : null;
}

function iniciarRenderer(canvas) {
  canvasRef = canvas;
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  camara = new THREE.PerspectiveCamera(34, 1.6, 0.1, 200);

  // La rueda sola desplaza la página; con Ctrl acerca o aleja la ciudad.
  canvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    acercar(e.deltaY > 0 ? 1.1 : 0.9);
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    arrastre = { x: e.clientX, y: e.clientY, movido: false, desplazar: e.shiftKey || e.button === 2 };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!escena) return;
    if (!arrastre) {
      const area = areaEn(e);
      if (area !== sobre) {
        sobre = area;
        canvas.style.cursor = area ? 'pointer' : 'grab';
        repintar();
      }
      return;
    }
    const dx = e.clientX - arrastre.x;
    const dy = e.clientY - arrastre.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) arrastre.movido = true;
    if (!arrastre.movido) return;
    canvas.style.cursor = 'grabbing';
    if (arrastre.desplazar) {
      // Desplazamiento sobre el plano del suelo, en los ejes de la cámara.
      const escala = (cam.dist * 0.9) / canvas.clientHeight;
      const cosA = Math.cos(cam.azim);
      const sinA = Math.sin(cam.azim);
      objetivo.x = THREE.MathUtils.clamp(objetivo.x - (dx * cosA + dy * sinA) * escala, -6, 6);
      objetivo.z = THREE.MathUtils.clamp(objetivo.z - (-dx * sinA + dy * cosA) * escala, -6, 7);
    } else {
      destino.azim -= dx * 0.006;
      destino.polar = THREE.MathUtils.clamp(destino.polar - dy * 0.005, 0.05, 1.45);
      if (reducida.matches) { cam.azim = destino.azim; cam.polar = destino.polar; }
    }
    arrastre.x = e.clientX;
    arrastre.y = e.clientY;
    if (!cuadro) { ubicarCamara(); dibujar(); }
  });

  canvas.addEventListener('pointerup', (e) => {
    const fueClic = arrastre && !arrastre.movido;
    arrastre = null;
    canvas.style.cursor = sobre ? 'pointer' : 'grab';
    if (!fueClic || !escena) return;
    const area = areaEn(e);
    if (area) {
      if (edificios.has(area)) marcarSeleccion(area);
      onSeleccionCb(area);
    }
  });
  canvas.addEventListener('pointerleave', () => { if (!arrastre) { sobre = null; repintar(); } });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  new ResizeObserver(() => { if (escena) dimensionar(); }).observe(canvas);
}

function liberarEscena() {
  if (!escena) return;
  escena.traverse((o) => {
    o.geometry?.dispose();
    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
    else o.material?.dispose?.();
  });
  for (const t of texturas) t.dispose();
  texturas = new Set();
  cuerpos = new Set();
  aristas = new Set();
  enlaces = new Map();
  escena = null;
}

// Dibuja la ciudad. onSeleccion(id) se llama al hacer clic en un edificio (o en el núcleo: 'orquestador').
export function renderOficina(canvas, resultado, opciones = {}) {
  if (opciones.onSeleccion) onSeleccionCb = opciones.onSeleccion;
  if (cuadro) cancelAnimationFrame(cuadro);
  cuadro = null;
  animados = [];
  edificios = new Map();
  liberarEscena();
  if (!resultado) return;

  iniciarRenderer(canvas);
  escena = new THREE.Scene();
  escena.fog = new THREE.FogExp2(0x07041c, 0.02);
  escena.add(new THREE.HemisphereLight(0xb8c6ff, 0x1a0f45, 1.5));
  const clave = new THREE.DirectionalLight(0xe6ebff, 1.7);
  clave.position.set(6, 10, 5);
  const contra = new THREE.DirectionalLight(MAGENTA, 0.9);
  contra.position.set(-8, 4, -6);
  const relleno = new THREE.DirectionalLight(CIAN, 0.55);
  relleno.position.set(-4, 3, 9);
  escena.add(clave, contra, relleno);

  construirCiudad(resultado);
  aplicarRayosX();
  if (seleccion && !edificios.has(seleccion)) seleccion = null;
  if (seleccion) marcarSeleccion(seleccion);

  dimensionar();
  if (reducida.matches) dibujar();
  else cuadro = requestAnimationFrame(paso);
}

// Selecciona un área desde fuera (por ejemplo, una tarjeta del equipo).
export function seleccionarArea(id) {
  if (!edificios.has(id)) return;
  marcarSeleccion(id);
}

// Cambia la vista de cámara: 'isometrica', 'panoramica' o 'aerea'. Vuelve a centrar la ciudad.
export function vistaCamara(nombre) {
  const v = VISTAS_CAMARA[nombre];
  if (!v) return;
  vistaActual = nombre;
  objetivo.copy(CENTRO);
  // Se llega por el camino corto, sin dar vueltas de más.
  const vueltas = Math.round((cam.azim - v.azim) / (Math.PI * 2));
  destino.azim = v.azim + vueltas * Math.PI * 2;
  destino.polar = v.polar;
  destino.dist = v.dist;
  if (reducida.matches || !cuadro) {
    Object.assign(cam, destino);
    if (camara) { ubicarCamara(); dibujar(); }
  }
}

// Giro continuo alrededor de la ciudad.
export function orbita(activa) {
  modoOrbita = Boolean(activa) && !reducida.matches;
  return modoOrbita;
}

// Rayos X: los edificios se vuelven de cristal y quedan sus aristas, para ver la ciudad completa.
export function rayosX(activo) {
  modoRayosX = Boolean(activo);
  aplicarRayosX();
  repintar();
}

// Acerca (factor < 1) o aleja (factor > 1).
export function acercar(factor) {
  destino.dist = THREE.MathUtils.clamp(destino.dist * factor, 8, 32);
  if (reducida.matches || !cuadro) {
    cam.dist = destino.dist;
    if (camara) { ubicarCamara(); dibujar(); }
  }
}

// Áreas cuyo agente está trabajando ahora: su enlace con el Orquestador se enciende.
export function marcarTrabajando(ids) {
  trabajando = new Set(ids);
  repintar();
}

export function estadoCamara() {
  return { vista: vistaActual, orbita: modoOrbita, rayosX: modoRayosX };
}
