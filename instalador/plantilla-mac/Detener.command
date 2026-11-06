#!/bin/bash
# Cierra el servidor de aGents iniciado con Iniciar.command.
cd "$(dirname "$0")" || exit 1
if [ ! -f data/servidor.pid ]; then
  echo "aGents no parece estar en ejecución."
else
  PID=$(cat data/servidor.pid)
  if kill "$PID" 2>/dev/null; then
    echo "aGents se cerró."
  else
    echo "No se encontró el proceso $PID. Si la ventana sigue abierta, ciérrala a mano."
  fi
  rm -f data/servidor.pid
fi
sleep 2
