// Creador de piezas para campañas: genera imágenes PNG con los tamaños de cada plataforma, en el navegador.
// No usa IA ni servicios externos: texto, colores y logotipo del negocio sobre un lienzo. Cada pieza se descarga al equipo.

// Tamaños recomendados por plataforma (consultados en noviembre de 2026; conviene confirmar en el centro de ayuda de cada una).
export const PLATAFORMAS = [
  { id: 'meta', nombre: 'Meta (Facebook e Instagram)', piezas: [
    { id: 'ig-cuadrado', nombre: 'Feed cuadrado', ancho: 1080, alto: 1080 },
    { id: 'ig-vertical', nombre: 'Feed vertical 4:5', ancho: 1080, alto: 1350 },
    { id: 'ig-historia', nombre: 'Historias y Reels 9:16', ancho: 1080, alto: 1920, margenSeguro: 0.15 },
    { id: 'fb-enlace', nombre: 'Anuncio con enlace 1.91:1', ancho: 1200, alto: 628 },
  ] },
  { id: 'tiktok', nombre: 'TikTok Ads', piezas: [
    { id: 'tt-infeed', nombre: 'Anuncio in-feed 9:16', ancho: 1080, alto: 1920, margenSeguro: 0.15 },
  ] },
  { id: 'google', nombre: 'Google Ads (Display y YouTube)', piezas: [
    { id: 'gd-horizontal', nombre: 'Display responsivo horizontal', ancho: 1200, alto: 628 },
    { id: 'gd-cuadrado', nombre: 'Display responsivo cuadrado', ancho: 1200, alto: 1200 },
    { id: 'gd-logo', nombre: 'Logotipo horizontal para Display', ancho: 1200, alto: 300, soloLogo: true },
    { id: 'gd-mediano', nombre: 'Banner estándar 300×250', ancho: 300, alto: 250 },
    { id: 'gd-leaderboard', nombre: 'Banner estándar 728×90', ancho: 728, alto: 90, compacto: true },
    { id: 'gd-rascacielos', nombre: 'Banner estándar 300×600', ancho: 300, alto: 600 },
    { id: 'yt-miniatura', nombre: 'Miniatura de YouTube 16:9', ancho: 1280, alto: 720 },
    { id: 'yt-short', nombre: 'YouTube Shorts 9:16', ancho: 1080, alto: 1920, margenSeguro: 0.15 },
  ] },
  { id: 'linkedin', nombre: 'LinkedIn Ads', piezas: [
    { id: 'li-horizontal', nombre: 'Imagen única 1.91:1', ancho: 1200, alto: 627 },
    { id: 'li-cuadrado', nombre: 'Imagen cuadrada', ancho: 1080, alto: 1080 },
  ] },
  { id: 'otros', nombre: 'WhatsApp, X y Pinterest', piezas: [
    { id: 'wa-estado', nombre: 'Estado de WhatsApp 9:16', ancho: 1080, alto: 1920, margenSeguro: 0.12 },
    { id: 'x-imagen', nombre: 'X (Twitter) 16:9', ancho: 1600, alto: 900 },
    { id: 'pin-vertical', nombre: 'Pinterest 2:3', ancho: 1000, alto: 1500 },
  ] },
];

function envolver(ctx, texto, maxAncho) {
  const palabras = String(texto).split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > maxAncho && actual) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function rectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Dibuja una pieza en el lienzo. diseño: { titular, subtitulo, cta, marca, colorFondo, colorFondo2, colorTexto, colorAcento, estilo, logo (Image|null) }
export function dibujarPieza(canvas, pieza, d) {
  const { ancho, alto } = pieza;
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');

  // Fondo
  if (d.estilo === 'degradado') {
    const g = ctx.createLinearGradient(0, 0, ancho, alto);
    g.addColorStop(0, d.colorFondo);
    g.addColorStop(1, d.colorFondo2 || d.colorAcento);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = d.colorFondo;
  }
  ctx.fillRect(0, 0, ancho, alto);

  // Franja de acento
  ctx.fillStyle = d.colorAcento;
  ctx.fillRect(0, 0, ancho, Math.max(6, Math.round(alto * 0.012)));

  const base = Math.min(ancho, alto);
  const margenX = Math.round(ancho * 0.07);
  const seguro = pieza.margenSeguro ? Math.round(alto * pieza.margenSeguro) : Math.round(alto * 0.08);
  const areaAlto = alto - seguro * 2;
  const compacto = pieza.compacto || alto < 200;

  // Logotipo
  let yActual = seguro;
  const logoAlto = pieza.soloLogo ? Math.round(alto * 0.6) : Math.round(base * (compacto ? 0.5 : 0.12));
  if (d.logo) {
    const escala = logoAlto / d.logo.height;
    const lw = Math.round(d.logo.width * escala);
    if (pieza.soloLogo) {
      ctx.drawImage(d.logo, Math.round((ancho - lw) / 2), Math.round((alto - logoAlto) / 2), lw, logoAlto);
      return;
    }
    if (compacto) {
      ctx.drawImage(d.logo, margenX, Math.round((alto - logoAlto) / 2), lw, logoAlto);
    } else {
      ctx.drawImage(d.logo, margenX, yActual, lw, logoAlto);
      yActual += logoAlto + Math.round(base * 0.04);
    }
  } else if (pieza.soloLogo || d.marca) {
    ctx.fillStyle = d.colorTexto;
    ctx.font = `700 ${Math.round(base * (pieza.soloLogo ? 0.18 : compacto ? 0.3 : 0.045))}px system-ui, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';
    if (pieza.soloLogo) {
      ctx.textAlign = 'center';
      ctx.fillText(d.marca || 'Tu marca', ancho / 2, (alto - base * 0.18) / 2);
      return;
    }
    ctx.textAlign = 'left';
    if (compacto) ctx.fillText(d.marca, margenX, (alto - base * 0.3) / 2);
    else { ctx.fillText(d.marca, margenX, yActual); yActual += Math.round(base * 0.045) + Math.round(base * 0.04); }
  }

  const textoX = compacto ? Math.round(ancho * 0.3) : margenX;
  const textoAncho = ancho - textoX - margenX;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  if (compacto) {
    ctx.fillStyle = d.colorTexto;
    ctx.font = `700 ${Math.round(alto * 0.42)}px system-ui, "Segoe UI", sans-serif`;
    const t = envolver(ctx, d.titular, textoAncho - ancho * 0.22)[0] || '';
    ctx.fillText(t, textoX, Math.round(alto * 0.27));
    if (d.cta) {
      ctx.font = `700 ${Math.round(alto * 0.3)}px system-ui, sans-serif`;
      const cw = ctx.measureText(d.cta).width + alto * 0.5;
      rectRedondeado(ctx, ancho - margenX - cw, Math.round(alto * 0.2), cw, Math.round(alto * 0.6), alto * 0.3);
      ctx.fillStyle = d.colorAcento;
      ctx.fill();
      ctx.fillStyle = d.colorFondo;
      ctx.fillText(d.cta, ancho - margenX - cw + alto * 0.25, Math.round(alto * 0.33));
    }
    return;
  }

  // Titular
  const tamTitular = Math.round(base * (alto > ancho ? 0.085 : 0.075));
  ctx.fillStyle = d.colorTexto;
  ctx.font = `800 ${tamTitular}px system-ui, "Segoe UI", sans-serif`;
  const lineasTitular = envolver(ctx, d.titular, textoAncho).slice(0, 4);
  const bloqueTitular = lineasTitular.length * tamTitular * 1.12;

  // Subtítulo
  const tamSub = Math.round(tamTitular * 0.48);
  ctx.font = `400 ${tamSub}px system-ui, "Segoe UI", sans-serif`;
  const lineasSub = d.subtitulo ? envolver(ctx, d.subtitulo, textoAncho).slice(0, 4) : [];
  const bloqueSub = lineasSub.length ? lineasSub.length * tamSub * 1.3 + tamSub : 0;

  const tamCta = Math.round(tamTitular * 0.45);
  const bloqueCta = d.cta ? tamCta * 2.6 : 0;
  const total = bloqueTitular + bloqueSub + bloqueCta;
  let y = Math.max(yActual, seguro + Math.round((areaAlto - (yActual - seguro) - total) / 2));

  ctx.font = `800 ${tamTitular}px system-ui, "Segoe UI", sans-serif`;
  ctx.fillStyle = d.colorTexto;
  for (const l of lineasTitular) { ctx.fillText(l, textoX, y); y += tamTitular * 1.12; }

  if (lineasSub.length) {
    y += tamSub * 0.6;
    ctx.font = `400 ${tamSub}px system-ui, "Segoe UI", sans-serif`;
    ctx.globalAlpha = 0.88;
    for (const l of lineasSub) { ctx.fillText(l, textoX, y); y += tamSub * 1.3; }
    ctx.globalAlpha = 1;
  }

  if (d.cta) {
    y += tamCta * 0.8;
    ctx.font = `700 ${tamCta}px system-ui, "Segoe UI", sans-serif`;
    const cw = ctx.measureText(d.cta).width + tamCta * 2;
    const ch = tamCta * 1.9;
    rectRedondeado(ctx, textoX, y, cw, ch, ch / 2);
    ctx.fillStyle = d.colorAcento;
    ctx.fill();
    ctx.fillStyle = d.colorFondo;
    ctx.fillText(d.cta, textoX + tamCta, y + (ch - tamCta) / 2 - tamCta * 0.05);
  }

  // Pie: marca pequeña abajo si no hubo logotipo arriba
  if (!d.logo && d.marca) {
    ctx.font = `600 ${Math.round(base * 0.028)}px system-ui, sans-serif`;
    ctx.fillStyle = d.colorTexto;
    ctx.globalAlpha = 0.7;
    ctx.fillText(d.marca, margenX, alto - seguro - Math.round(base * 0.028));
    ctx.globalAlpha = 1;
  }
}

export function descargarCanvas(canvas, nombre) {
  return new Promise((resolver) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolver();
    }, 'image/png');
  });
}
