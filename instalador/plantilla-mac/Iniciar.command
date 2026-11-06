#!/bin/bash
# aGents para macOS: inicia el servidor local y abre el navegador.
# Todo corre en este equipo (127.0.0.1). No se envía nada a internet.
cd "$(dirname "$0")" || exit 1

# Elige el Node incluido según el chip (Apple Silicon o Intel).
if [ "$(uname -m)" = "arm64" ]; then NODE="./node/node-arm64"; else NODE="./node/node-x64"; fi
if [ ! -f "$NODE" ]; then
  echo
  echo "  Este paquete no incluye el motor para tu chip ($(uname -m))."
  echo "  Pide la versión para tu Mac o instala Node.js desde nodejs.org y ejecuta: node src/server.js"
  read -r -p "  Pulsa Enter para cerrar."
  exit 1
fi

# Al descargar un ZIP, macOS marca los archivos "en cuarentena" y bloquea el motor.
# Como tú ya abriste este lanzador a propósito, se quita esa marca solo a la carpeta de la aplicación.
xattr -dr com.apple.quarantine . 2>/dev/null
chmod +x "$NODE" 2>/dev/null

export ABRIR_NAVEGADOR=1
echo
echo "  aGents"
echo "  ------------------------------------------------------------"
echo "  Se abrirá tu navegador en http://127.0.0.1:4791"
echo "  Deja esta ventana abierta mientras uses la aplicación."
echo "  Para cerrar: ejecuta Detener.command o cierra esta ventana."
echo
"$NODE" src/server.js
estado=$?
if [ $estado -ne 0 ]; then
  echo
  echo "  No se pudo iniciar (código $estado). Revisa LEEME.txt o abre http://127.0.0.1:4791 a mano."
  read -r -p "  Pulsa Enter para cerrar."
fi
